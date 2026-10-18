import { randomBytes, randomUUID } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import type { Request } from 'express'
import { apiKeys, entities, files, jobs } from './db/schema.js'
import { db, pool } from './db/index.js'
import { redis, notify } from './redis.js'
import { identity, sessionAccess, hash } from './access.js'
import {
  create,
  get,
  list,
  remove,
  settings,
  update,
  HttpError,
} from './repository.js'
import {
  sessionUpdateSchema,
  settingsSchema,
  workflowSchema,
} from '../packages/contracts/index.js'
import { deleteObject } from './storage.js'
import {
  getCustomSchemas,
  saveCustomSchema,
  resetCustomSchema,
  extractVaultDocument,
  runSessionOCR,
} from './ocr.js'
import {
  sendKycInvitationEmail,
  sendDocumentsSubmittedEmail,
  sendVerificationDecisionEmail,
} from './mailer.js'
const id = z.string().min(1).max(200)
const title = z.string().trim().min(1).max(200)
const description = z.string().max(4000)
const publicOps = new Set([
  'sessions.get',
  'sessions.update',
  'documents.uploadUrl',
])
export async function operation(
  req: Request,
  name: string,
  args: Record<string, any>,
) {
  const who = await identity(req)
  if (!who && !publicOps.has(name)) throw new HttpError(401, 'Sign in required')
  const owner = who?.ownerId || ''
  const entityId = () => id.parse(args.id)
  let result: unknown
  switch (name) {
    case 'auth.getCurrentUser':
      result = who?.user || null
      break
    case 'workflows.list':
      result = (await list(owner, 'workflows')).filter(
        (r) => !args.status || r.status === args.status,
      )
      break
    case 'workflows.get':
      result = await get(owner, 'workflows', entityId())
      break
    case 'workflows.create':
      result = await create(owner, 'workflows', workflowSchema.parse(args))
      break
    case 'workflows.update': {
      const current = await get(owner, 'workflows', entityId())
      result = await update(
        owner,
        'workflows',
        entityId(),
        workflowSchema.parse({ ...current, ...args }),
      )
      break
    }
    case 'workflows.delete': {
      if (
        (await list(owner, 'sessions')).some((r) => r.workflowId === entityId())
      )
        throw new HttpError(
          409,
          'Archive workflows that have verification sessions',
        )
      await remove(owner, 'workflows', entityId())
      break
    }
    case 'sessions.create': {
      const a = z
        .object({
          workflowId: id,
          username: z.string().max(200).optional(),
          email: z.union([z.string().email(), z.literal('')]).optional(),
          expiresInHours: z.number().int().min(1).max(8760).optional(),
          recipientType: z.enum(['employee', 'customer', 'individual']).optional(),
          role: z.string().max(200).optional(),
          department: z.string().max(200).optional(),
          sendEmail: z.boolean().optional(),
        })
        .parse(args)
      const workflow = await get(owner, 'workflows', a.workflowId)
      if (workflow.status !== 'active')
        throw new HttpError(409, 'Choose an active workflow')
      const prefs = await settings(owner),
        token = randomBytes(32).toString('base64url')
      const sid = await create(
        owner,
        'sessions',
        {
          ...a,
          document_type: (workflow.documentType && workflow.documentType !== 'any') ? workflow.documentType : undefined,
          workflowSnapshot: workflow,
          status: 'initiated',
          step: 'start',
          processingStatus: 'not_requested',
          reviewStatus: 'pending',
          tokenHash: hash(token),
          publicToken: token,
          expiresAt:
            Date.now() +
            (a.expiresInHours || prefs.sessionExpiryHours || 168) * 3600000,
        },
        a.workflowId,
      )

      // Automatically send KYC invitation email via Resend if email is provided
      let emailResult: any = null
      if (a.email && a.sendEmail !== false) {
        emailResult = await sendKycInvitationEmail({
          to: a.email,
          recipientName: a.username || 'Partner',
          recipientType: a.recipientType || 'customer',
          sessionId: sid,
          publicToken: token,
          workflowName: workflow.name,
          role: a.role,
          department: a.department,
          expiresInHours: a.expiresInHours || prefs.sessionExpiryHours || 168,
        }).catch((err) => {
          console.error('[OpenKYC] Error sending invitation email on session creation:', err)
          return { success: false, error: (err as Error).message }
        })
      }

      result = { sessionId: sid, publicToken: token, emailSent: emailResult?.success ?? false }
      break
    }
    case 'sessions.sendInvitation': {
      const a = z
        .object({
          sessionId: id,
          email: z.string().email().optional(),
          recipientName: z.string().optional(),
          recipientType: z.enum(['employee', 'customer', 'individual']).optional(),
          role: z.string().optional(),
          department: z.string().optional(),
          customMessage: z.string().optional(),
        })
        .parse(args)
      const session = await get(owner, 'sessions', a.sessionId)
      const targetEmail = a.email || session.email
      if (!targetEmail) {
        throw new HttpError(400, 'No email address provided for this session')
      }
      const res = await sendKycInvitationEmail({
        to: targetEmail,
        recipientName:
          a.recipientName ||
          session.username ||
          [session.first_name, session.last_name].filter(Boolean).join(' ') ||
          'Partner',
        recipientType:
          a.recipientType ||
          (session.recipientType as 'employee' | 'customer' | 'individual') ||
          'customer',
        sessionId: a.sessionId,
        publicToken: session.publicToken,
        workflowName: session.workflowSnapshot?.name || 'Identity Verification',
        role: a.role || session.role,
        department: a.department || session.department,
        customMessage: a.customMessage,
      })
      result = res
      break
    }
    case 'sessions.list':
      result = (await list(owner, 'sessions'))
        .map((s): typeof s => ({
          ...s,
          status:
            s.expiresAt < Date.now() &&
            ['initiated', 'in_progress'].includes(s.status)
              ? 'expired'
              : s.status,
        }))
        .filter(
          (s) =>
            (!args.workflowId || s.workflowId === args.workflowId) &&
            (!args.status || s.status === args.status),
        )
      break
    case 'sessions.get': {
      const {
        session: s,
        isOwner,
        row,
      } = await sessionAccess(req, id.parse(args.sessionId), owner)
      if (!isOwner) {
        result = {
          _id: s._id,
          createdAt: s.createdAt,
          status: s.status,
          step: s.step,
          document_type: s.document_type || (s.workflowSnapshot?.documentType && s.workflowSnapshot.documentType !== 'any' ? s.workflowSnapshot.documentType : undefined),
          workflowDocumentType: s.workflowSnapshot?.documentType,
          allowedDocumentTypes: s.workflowSnapshot?.allowedDocumentTypes,
          nationality: s.nationality,
          // Collection state — the public collector uses these to resume the
          // workflow-driven flow and to render per-step summaries.
          identity: s.identity,
          address: s.address,
          face_mesh: s.face_mesh,
          completed_steps: s.completed_steps,
          device: s.device,
          geolocation: s.geolocation,
          // The subject's own connection IP, captured server-side (ip_analysis
          // step). Never supplied by the client.
          ipAddress: s.ipAddress,
          expiresAt: s.expiresAt,
          branding: brandingSettings(await settings(row.ownerId)),
          uploaded: await publicFiles(row.ownerId, s._id),
          workflowSteps: s.workflowSnapshot?.steps || [],
        }
        break
      }
      const out = { ...s }
      delete out.tokenHash
      for (const field of ['front_image', 'back_image', 'person_image'])
        if (out[field]) out[field] = `/api/files/${out[field]}`
      out.documents = await list(owner, 'documents', s._id)
      out.audit = await list(owner, 'audit', s._id)
      result = out
      break
    }
    case 'sessions.update': {
      const { session: s, row } = await sessionAccess(
        req,
        id.parse(args.sessionId),
        owner,
      )
      if (
        s.expiresAt < Date.now() ||
        !['initiated', 'in_progress'].includes(s.status)
      )
        throw new HttpError(409, 'Session is closed')
      // Source-IP capture: prefer the edge proxy header, then Express req.ip.
      // Localhost/dev traffic is ignored so graph identity signals stay clean.
      const rawForwarded = req.headers['x-forwarded-for']
      const forwardedFirst = (
        Array.isArray(rawForwarded)
          ? rawForwarded[0]
          : String(rawForwarded ?? '')
      )
        .split(',')[0]
        .trim()
      const clientIp = (
        forwardedFirst ||
        (typeof req.ip === 'string' ? req.ip : '') ||
        ''
      )
        .replace(/^::ffff:/, '')
        .trim()
      const capturedIp =
        clientIp && !['::1', '127.0.0.1', 'localhost'].includes(clientIp)
          ? clientIp
          : undefined
      const changes = sessionUpdateSchema.parse({
        ...args.updates,
        ...(capturedIp ? { ipAddress: capturedIp } : {}),
      })
      for (const field of [
        'front_image',
        'back_image',
        'person_image',
      ] as const) {
        if (changes[field]) {
          const [file] = await db
            .select()
            .from(files)
            .where(
              and(
                eq(files.id, changes[field]!),
                eq(files.ownerId, row.ownerId),
                eq(files.sessionId, s._id),
              ),
            )
          if (!file)
            throw new HttpError(400, 'File does not belong to this session')
        }
      }
      if (changes.status === 'completed') {
        const uploaded = await publicFiles(row.ownerId, s._id)
        if (!uploaded.length)
          throw new HttpError(
            400,
            'Upload at least one document before submitting',
          )
        changes.step = 'success'
      }
      await db.transaction(async (tx) => {
        const [locked] = await tx
          .select()
          .from(entities)
          .where(eq(entities.id, s._id))
          .for('update')
        if (
          !locked ||
          locked.data.expiresAt < Date.now() ||
          !['initiated', 'in_progress'].includes(locked.data.status)
        )
          throw new HttpError(409, 'Session is closed')
        await tx
          .update(entities)
          .set({ data: { ...locked.data, ...changes }, updatedAt: new Date() })
          .where(eq(entities.id, s._id))
        if (changes.status === 'completed') {
          await tx.insert(jobs).values({
            id: randomUUID(),
            ownerId: row.ownerId,
            entityId: s._id,
            kind: 'webhook',
            payload: { event: 'session.submitted', sessionId: s._id },
          })
          await tx.insert(jobs).values({
            id: randomUUID(),
            ownerId: row.ownerId,
            entityId: s._id,
            kind: 'ocr',
            payload: { sessionId: s._id, ownerId: row.ownerId },
          })
          await tx.insert(jobs).values({
            id: randomUUID(),
            ownerId: row.ownerId,
            entityId: s._id,
            kind: 'aml',
            payload: { sessionId: s._id, ownerId: row.ownerId },
          })

          // Send transactional email: Documents submitted
          const targetEmail = locked.data.email || s.email
          if (targetEmail) {
            sendDocumentsSubmittedEmail({
              to: targetEmail,
              recipientName:
                locked.data.username ||
                [locked.data.first_name, locked.data.last_name].filter(Boolean).join(' ') ||
                'Customer',
              recipientType: locked.data.recipientType || 'customer',
              sessionId: s._id,
              publicToken: locked.data.publicToken || s.publicToken,
              documentCount: (await publicFiles(row.ownerId, s._id)).length || 1,
            }).catch((err) =>
              console.error('[OpenKYC] Error sending documents submitted email:', err),
            )
          }
        }
      })
      await notify(row.ownerId)
      result = { success: true }
      break
    }
    case 'sessions.delete': {
      const sid = id.parse(args.sessionId)
      await get(owner, 'sessions', sid)
      for (const f of await db
        .select()
        .from(files)
        .where(and(eq(files.ownerId, owner), eq(files.sessionId, sid)))) {
        await deleteObject(f)
        await db.delete(files).where(eq(files.id, f.id))
      }
      await db
        .delete(entities)
        .where(and(eq(entities.ownerId, owner), eq(entities.parentId, sid)))
      await remove(owner, 'sessions', sid)
      result = { success: true }
      break
    }
    case 'sessions.review': {
      const a = z
        .object({
          sessionId: id,
          decision: z.enum(['approved', 'rejected']),
          notes: z.string().trim().min(1).max(4000),
        })
        .parse(args)
      const s = await get(owner, 'sessions', a.sessionId)
      if (s.status !== 'completed')
        throw new HttpError(409, 'Only submitted sessions can be reviewed')
      await db.transaction(async (tx) => {
        const [row] = await tx
          .select()
          .from(entities)
          .where(and(eq(entities.id, a.sessionId), eq(entities.ownerId, owner)))
          .for('update')
        if (!row) throw new HttpError(404, 'Not found')
        await tx
          .update(entities)
          .set({
            data: {
              ...row.data,
              reviewStatus: a.decision,
              reviewNotes: a.notes,
              reviewedAt: Date.now(),
            },
            updatedAt: new Date(),
          })
          .where(eq(entities.id, a.sessionId))
        await tx.insert(entities).values({
          id: randomUUID(),
          ownerId: owner,
          kind: 'audit',
          parentId: a.sessionId,
          data: { decision: a.decision, notes: a.notes, actor: owner },
        })
        await tx.insert(jobs).values({
          id: randomUUID(),
          ownerId: owner,
          entityId: a.sessionId,
          kind: 'webhook',
          payload: {
            event: 'session.reviewed',
            sessionId: a.sessionId,
            decision: a.decision,
          },
        })

        // Send transactional email: Final verification review decision
        if (row.data.email) {
          sendVerificationDecisionEmail({
            to: row.data.email,
            recipientName:
              row.data.username ||
              [row.data.first_name, row.data.last_name].filter(Boolean).join(' ') ||
              'Customer',
            recipientType: row.data.recipientType || 'customer',
            sessionId: a.sessionId,
            publicToken: row.data.publicToken,
            decision: a.decision,
            notes: a.notes,
            reviewerName: who?.user?.name || who?.user?.email || 'Compliance Officer',
          }).catch((err) =>
            console.error('[OpenKYC] Error sending verification decision email:', err),
          )
        }
      })
      result = { success: true }
      break
    }
    case 'documents.uploadUrl': {
      let tenant = owner,
        sid: string | undefined
      if (args.sessionId) {
        sid = id.parse(args.sessionId)
        const a = await sessionAccess(req, sid, owner)
        tenant = a.row.ownerId
        if (
          !['initiated', 'in_progress'].includes(a.session.status) ||
          a.session.expiresAt < Date.now()
        )
          throw new HttpError(409, 'Session is closed')
      }
      if (!tenant) throw new HttpError(401, 'Sign in required')
      const ticket = randomBytes(32).toString('base64url')
      await redis.set(
        `upload:${ticket}`,
        JSON.stringify({ ownerId: tenant, sessionId: sid }),
        'EX',
        300,
      )
      result = `/api/uploads/${ticket}`
      break
    }
    case 'documents.save': {
      const a = z.object({ fileId: z.string().uuid(), name: title }).parse(args)
      const [file] = await db
        .select()
        .from(files)
        .where(and(eq(files.id, a.fileId), eq(files.ownerId, owner)))
      if (!file) throw new HttpError(404, 'File not found')
      const doc = (await list(owner, 'documents')).find(
        (d) => d.fileId === a.fileId,
      )
      if (!doc) throw new HttpError(404, 'Document not found')
      await update(owner, 'documents', doc._id, { ...doc, name: a.name })
      result = doc._id
      break
    }
    case 'documents.list': {
      const term = z
        .string()
        .max(200)
        .parse(args.term || '')
        .toLowerCase()
      result = (await list(owner, 'documents'))
        .filter((d) => d.name.toLowerCase().includes(term))
        .map((d) => ({ ...d, url: `/api/files/${d.fileId}` }))
      break
    }
    case 'documents.url': {
      const [file] = await db
        .select()
        .from(files)
        .where(
          and(eq(files.ownerId, owner), eq(files.id, id.parse(args.fileId))),
        )
      if (!file) throw new HttpError(404, 'File not found')
      result = `/api/files/${file.id}`
      break
    }
    case 'documents.delete': {
      const d = await get(owner, 'documents', entityId())
      const [file] = await db
        .select()
        .from(files)
        .where(and(eq(files.id, d.fileId), eq(files.ownerId, owner)))
      if (file) {
        await deleteObject(file)
        await db.delete(files).where(eq(files.id, file.id))
      }
      await remove(owner, 'documents', d._id)
      break
    }
    case 'questionnaires.responses': {
      const qid = entityId()
      await get(owner, 'questionnaires', qid)
      const questions = Object.fromEntries(
        (await list(owner, 'questions', qid)).map((q) => [q._id, q.text]),
      )
      result = (await list(owner, 'responses', qid)).map((r) => ({
        ...r,
        questions,
      }))
      break
    }
    case 'questionnaires.list':
      result = await list(owner, 'questionnaires')
      break
    case 'questionnaires.get':
      result = await get(owner, 'questionnaires', entityId())
      break
    case 'questionnaires.create':
      result = await create(owner, 'questionnaires', {
        ...z.object({ title, description: description.optional() }).parse(args),
        isPublished: false,
        publicToken: randomBytes(32).toString('base64url'),
      })
      break
    case 'questionnaires.update': {
      const q = await get(owner, 'questionnaires', entityId())
      await update(owner, 'questionnaires', q._id, {
        ...q,
        ...z
          .object({
            title,
            description: description.optional(),
            isPublished: z.boolean().optional(),
          })
          .parse(args),
      })
      break
    }
    case 'questionnaires.delete': {
      await get(owner, 'questionnaires', entityId())
      await db
        .delete(entities)
        .where(
          and(eq(entities.ownerId, owner), eq(entities.parentId, entityId())),
        )
      await remove(owner, 'questionnaires', entityId())
      break
    }
    case 'questions.list': {
      const qid = id.parse(args.questionnaireId)
      await get(owner, 'questionnaires', qid)
      result = (await list(owner, 'questions', qid)).sort(
        (a, b) => a.order - b.order,
      )
      break
    }
    case 'questions.create': {
      const a = z
        .object({
          questionnaireId: id,
          text: title,
          required: z.boolean(),
          order: z.number().int().min(0),
        })
        .parse(args)
      await get(owner, 'questionnaires', a.questionnaireId)
      result = await create(owner, 'questions', a, a.questionnaireId)
      break
    }
    case 'questions.update': {
      const q = await get(owner, 'questions', entityId())
      await update(owner, 'questions', q._id, {
        ...q,
        ...z.object({ text: title, required: z.boolean() }).parse(args),
      })
      break
    }
    case 'questions.delete':
      await remove(owner, 'questions', entityId())
      break
    case 'settings.get':
      result = publicSettings(await settings(owner))
      break
    case 'settings.update': {
      const a = settingsSchema.parse(args)
      for (const url of [a.logoUrl, a.privacyPolicyUrl])
        if (url && !/^https?:\/\//.test(url))
          throw new HttpError(400, 'Use HTTP or HTTPS URLs')
      if (a.webhookUrl && !a.webhookUrl.startsWith('https://'))
        throw new HttpError(400, 'Webhooks require HTTPS')
      await pool.query(
        `INSERT INTO entities (id,owner_id,kind,data) VALUES ($1,$2,'settings',$3) ON CONFLICT(id) DO UPDATE SET data=entities.data || EXCLUDED.data,updated_at=now()`,
        [`settings:${owner}`, owner, JSON.stringify(a)],
      )
      break
    }
    case 'blocklist.list':
      result = await list(owner, 'blocklist')
      break
    case 'blocklist.add':
      result = await create(
        owner,
        'blocklist',
        z
          .object({
            value: title,
            reason: description.min(1),
            kind: z.enum(['email', 'document_number', 'name']),
          })
          .parse(args),
      )
      break
    case 'blocklist.delete':
      await remove(owner, 'blocklist', entityId())
      break
    case 'analytics.get': {
      const sessions = await list(owner, 'sessions'),
        documents = await list(owner, 'documents')
      const days = new Map<string, number>()
      for (const s of sessions) {
        const day = new Date(s.createdAt).toISOString().slice(0, 10)
        days.set(day, (days.get(day) || 0) + 1)
      }
      result = {
        total: sessions.length,
        completed: sessions.filter((s) => s.status === 'completed').length,
        pending: sessions.filter(
          (s) =>
            ['initiated', 'in_progress'].includes(s.status) &&
            s.expiresAt > Date.now(),
        ).length,
        failed: sessions.filter(
          (s) => s.status === 'failed' || s.reviewStatus === 'rejected',
        ).length,
        approved: sessions.filter((s) => s.reviewStatus === 'approved').length,
        documents: documents.length,
        daily: [...days].sort().map(([date, count]) => ({ date, count })),
      }
      break
    }
    case 'developer.keys':
      result = await db
        .select({
          id: apiKeys.id,
          name: apiKeys.name,
          prefix: apiKeys.prefix,
          createdAt: apiKeys.createdAt,
        })
        .from(apiKeys)
        .where(eq(apiKeys.ownerId, owner))
      break
    case 'developer.createKey': {
      if (who?.apiKey)
        throw new HttpError(403, 'Use the dashboard to manage API keys')
      const key = `kyc_${randomBytes(32).toString('base64url')}`
      await db.insert(apiKeys).values({
        id: randomUUID(),
        ownerId: owner,
        name: title.parse(args.name),
        prefix: key.slice(0, 12),
        hash: hash(key),
      })
      result = { key }
      break
    }
    case 'developer.revokeKey': {
      if (who?.apiKey)
        throw new HttpError(403, 'Use the dashboard to manage API keys')
      await db
        .delete(apiKeys)
        .where(and(eq(apiKeys.id, entityId()), eq(apiKeys.ownerId, owner)))
      break
    }
    case 'developer.rotateWebhookSecret': {
      if (who?.apiKey) throw new HttpError(403, 'Use the dashboard')
      const secret = randomBytes(32).toString('hex')
      await pool.query(
        `INSERT INTO entities(id,owner_id,kind,data) VALUES($1,$2,'settings',$3) ON CONFLICT(id) DO UPDATE SET data=entities.data || EXCLUDED.data`,
        [`settings:${owner}`, owner, JSON.stringify({ webhookSecret: secret })],
      )
      result = { secret }
      break
    }
    case 'developer.webhooks':
      result = (
        await pool.query(
          'SELECT id,status,attempts,created_at,last_error FROM jobs WHERE owner_id=$1 AND kind=$2 ORDER BY created_at DESC LIMIT 100',
          [owner, 'webhook'],
        )
      ).rows
      break
    case 'search.run': {
      const name = title.parse(args.name)
      if (!process.env.FIRECRAWL_API_KEY)
        throw new HttpError(
          503,
          'Configure FIRECRAWL_API_KEY to enable background search',
        )
      const response = await fetch('https://api.firecrawl.dev/v2/search', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.FIRECRAWL_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: name, limit: 5 }),
        signal: AbortSignal.timeout(30000),
      })
      if (!response.ok) throw new HttpError(502, 'Search provider failed')
      const payload = (await response.json()) as { data?: unknown }
      result = payload.data || payload
      await create(owner, 'searches', { query: name, result })
      break
    }
    case 'analysis.list':
      result = await list(owner, 'analysis')
      break
    case 'analysis.get':
      result = await get(owner, 'analysis', entityId())
      break
    case 'analysis.delete':
      await remove(owner, 'analysis', entityId())
      break
    case 'analysis.active':
      result = []
      break
    case 'analysis.create':
      throw new HttpError(
        409,
        'Automated analysis is deferred. Collect documents and use manual review.',
      )
    case 'ocr.getSchemas':
      result = await getCustomSchemas(owner)
      break
    case 'ocr.saveSchema': {
      const s = z
        .object({
          document_type: z.string().min(1),
          title: z.string().min(1),
          description: z.string().default(''),
          fields: z.array(
            z.object({
              key: z.string().min(1),
              label: z.string().min(1),
              type: z
                .enum([
                  'string',
                  'date',
                  'number',
                  'regex',
                  'address',
                  'name',
                  'email',
                  'phone',
                ])
                .default('string'),
              pattern: z.string().optional(),
              description: z.string().optional(),
              required: z.boolean().optional(),
            }),
          ),
        })
        .parse(args)
      result = await saveCustomSchema(owner, s)
      break
    }
    case 'ocr.resetSchema': {
      const docType = z.string().parse(args.document_type)
      result = await resetCustomSchema(owner, docType)
      break
    }
    case 'ocr.extract': {
      const fId = z.string().parse(args.fileId)
      const dType = z.string().default('passport').parse(args.document_type)
      result = await extractVaultDocument(owner, fId, dType, args.customFields)
      break
    }
    case 'ocr.retrySession': {
      const sid = z.string().parse(args.sessionId)
      void runSessionOCR(sid, owner)
      result = { success: true }
      break
    }
    case 'aml.retrySession': {
      const sid = z.string().parse(args.sessionId)
      const [row] = await db
        .select({ ownerId: entities.ownerId })
        .from(entities)
        .where(and(eq(entities.id, sid), eq(entities.ownerId, owner)))
      if (!row) throw new HttpError(404, 'Session not found')
      // Re-run the OCR → graph → AML pipeline (re-ingest + re-score), useful
      // when another subject's identifiers landed in the graph after this
      // session was already scored.
      await db.insert(jobs).values({
        id: randomUUID(),
        ownerId: row.ownerId,
        entityId: sid,
        kind: 'aml',
        payload: { sessionId: sid, ownerId: row.ownerId },
      })
      result = { success: true }
      break
    }
    default:
      throw new HttpError(404, 'Unknown operation')
  }
  if (
    owner &&
    /\.(create|update|delete|save|review|add|createKey|revokeKey|rotateWebhookSecret|saveSchema|resetSchema|retrySession)$/.test(
      name,
    )
  )
    await notify(owner)
  return result ?? null
}
function publicSettings(p: Record<string, any>) {
  const { webhookSecret, tokenHash, ...rest } = p
  return rest
}
async function publicFiles(owner: string, sid: string) {
  return (await list(owner, 'documents', sid)).map((d) => ({
    id: d._id,
    name: d.name,
    fileId: d.fileId,
    mime: d.mime,
  }))
}

function brandingSettings(p: Record<string, any>) {
  return {
    publicName: p.publicName,
    privacyPolicyUrl: p.privacyPolicyUrl,
    logoUrl: p.logoUrl,
    accentColor: p.accentColor,
  }
}
