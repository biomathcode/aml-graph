import express from 'express'
import helmet from 'helmet'
import { randomUUID, createHash } from 'node:crypto'
import path from 'node:path'
import { fileTypeFromBuffer } from 'file-type'
import { and, eq } from 'drizzle-orm'
import { toNodeHandler } from 'better-auth/node'
import { auth } from './auth.js'
import { config } from './config.js'
import { db, pool } from './db/index.js'
import { files, entities } from './db/schema.js'
import { redis, notify } from './redis.js'
import { identity } from './access.js'
import { operation } from './operations.js'
import { HttpError, present } from './repository.js'
import {
  storageLocation,
  putObject,
  getObject,
  deleteObject,
} from './storage.js'
import { startDeliveryLoop, startOCRLoop } from './webhooks.js'
import { startAmlLoop } from './aml/pipeline.js'
import {
  runRagAgentStream,
  EMPLOYEES_KNOWLEDGE_BASE,
  BENCHMARK_CUSTOMERS,
  NVIDIA_MODEL_ID,
} from './ai/index.js'
import {
  getMailerConfig,
  sendEmail as mailerSendEmail,
  sendKycInvitationEmail,
  sendDocumentsSubmittedEmail,
  sendDocumentVerifiedEmail,
  sendAmlChecksCompletedEmail,
  sendVerificationDecisionEmail,
} from './mailer.js'
export const app = express()
app.disable('x-powered-by')
if (process.env.TRUST_PROXY === '1') app.set('trust proxy', 1)
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        'img-src': ["'self'", 'https:', 'data:', 'blob:'],
        'connect-src': ["'self'"],
        'script-src': ["'self'"],
        'upgrade-insecure-requests': config.APP_URL.startsWith('https:')
          ? []
          : null,
      },
    },
  }),
)
app.use('/api', async (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store')
  if (
    !['GET', 'HEAD', 'OPTIONS'].includes(req.method) &&
    req.headers.origin &&
    req.headers.origin !== new URL(config.APP_URL).origin
  )
    // Exclude health check and session validation from generic API rate limit counter
    if (req.path === '/auth/get-session' || req.path === '/health') {
      return next()
    }
  try {
    const key = `limit:${req.ip}:${Math.floor(Date.now() / 60000)}`
    const count = (await redis.eval(
      "local n=redis.call('INCR',KEYS[1]);if n==1 then redis.call('EXPIRE',KEYS[1],60) end;return n",
      1,
      key,
    )) as number
    if (count > 300) return res.status(429).json({ error: 'Too many requests' })
    next()
  } catch {
    res.status(503).json({ error: 'Service temporarily unavailable' })
  }
})
app.use('/api/auth', (req, _res, next) => {
  req.headers['x-openkyc-client-ip'] = req.ip
  next()
})
app.all('/api/auth/*splat', toNodeHandler(auth))
app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1')
    await redis.ping()
    res.json({ status: 'ok', storage: process.env.STORAGE_PROVIDER || 'local' })
  } catch {
    res.status(503).json({ status: 'unavailable' })
  }
})
app.post(
  '/api/uploads/:ticket',
  express.raw({ type: () => true, limit: '20mb' }),
  async (req, res) => {
    const ticket = await redis.getdel(`upload:${req.params.ticket}`)
    if (!ticket)
      throw new HttpError(410, 'Upload ticket expired or already used')
    const { ownerId, sessionId } = JSON.parse(ticket) as {
      ownerId: string
      sessionId?: string
    }
    const data = req.body as Buffer
    if (!Buffer.isBuffer(data) || !data.length)
      throw new HttpError(400, 'Empty upload')
    const type = await fileTypeFromBuffer(data)
    if (
      !type ||
      !['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(
        type.mime,
      )
    )
      throw new HttpError(415, 'Upload a PDF, JPEG, PNG, or WebP document')
    const id = randomUUID(),
      ref = storageLocation(ownerId, id)
    await putObject(ref, data, type.mime)
    try {
      await db.transaction(async (tx) => {
        if (sessionId) {
          const [session] = await tx
            .select()
            .from(entities)
            .where(
              and(eq(entities.id, sessionId), eq(entities.ownerId, ownerId)),
            )
            .for('update')
          if (
            !session ||
            session.data.expiresAt < Date.now() ||
            !['initiated', 'in_progress'].includes(session.data.status)
          )
            throw new HttpError(409, 'Session is closed')
          const uploaded = await tx
            .select()
            .from(files)
            .where(eq(files.sessionId, sessionId))
          if (uploaded.length >= 20)
            throw new HttpError(400, 'Maximum 20 files per session')
        }
        let name = String(
          req.headers['x-file-name'] || `Document.${type.ext}`,
        ).slice(0, 600)
        try {
          name = decodeURIComponent(name).slice(0, 200)
        } catch {
          throw new HttpError(400, 'Invalid filename')
        }
        await tx.insert(files).values({
          id,
          ownerId,
          sessionId,
          ...ref,
          mime: type.mime,
          size: data.length,
          sha256: createHash('sha256').update(data).digest('hex'),
        })
        await tx.insert(entities).values({
          id: randomUUID(),
          ownerId,
          kind: 'documents',
          parentId: sessionId,
          data: {
            name,
            fileId: id,
            mime: type.mime,
            size: data.length,
            processingStatus: 'collected',
          },
        })
      })
    } catch (error) {
      await deleteObject(ref).catch(() => {})
      throw error
    }
    await notify(ownerId)
    res.status(201).json({ storageId: id })
  },
)
app.get('/api/files/:id', async (req, res) => {
  const who = await identity(req)
  if (!who) throw new HttpError(401, 'Sign in required')
  const [file] = await db
    .select()
    .from(files)
    .where(
      and(eq(files.id, String(req.params.id)), eq(files.ownerId, who.ownerId)),
    )
  if (!file) throw new HttpError(404, 'File not found')
  const content = await getObject(file)
  res.setHeader('Content-Type', file.mime)
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="document-${file.id}.${file.mime === 'application/pdf' ? 'pdf' : file.mime.split('/')[1]}"`,
  )
  res.send(content)
})
app.use(express.json({ limit: '1mb' }))
app.post('/api/rpc/:operation', async (req, res) => {
  if (!req.body || Array.isArray(req.body) || typeof req.body !== 'object')
    throw new HttpError(400, 'Expected JSON object')
  res.json(await operation(req, String(req.params.operation), req.body))
})
app.get('/api/events', async (req, res) => {
  const who = await identity(req)
  if (!who) throw new HttpError(401, 'Sign in required')
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()
  const subscriber = redis.duplicate()
  subscriber.on('error', () => res.end())
  subscriber.on('message', () => res.write('data: changed\n\n'))
  await subscriber.subscribe(`updates:${who.ownerId}`)
  res.write('data: connected\n\n')
  const interval = setInterval(() => res.write(': heartbeat\n\n'), 25000)
  // NOTE: `req.on('close')` fires when the request message is consumed, not
  // on client disconnect — cleanup must key off the response socket close.
  res.on('close', () => {
    clearInterval(interval)
    subscriber.disconnect()
  })
})
app.get('/api/public/questionnaires/:token', async (req, res) => {
  const rows = await pool.query(
    "SELECT * FROM entities WHERE kind='questionnaires' AND data->>'publicToken'=$1 AND data->>'isPublished'='true'",
    [req.params.token],
  )
  const q = rows.rows[0]
  if (!q) throw new HttpError(404, 'Questionnaire not found')
  const questions = await db
    .select()
    .from(entities)
    .where(
      and(
        eq(entities.ownerId, q.owner_id),
        eq(entities.parentId, q.id),
        eq(entities.kind, 'questions'),
      ),
    )
  res.json({
    id: q.id,
    title: q.data.title,
    description: q.data.description,
    questions: questions.map(present).sort((a, b) => a.order - b.order),
  })
})
app.post('/api/public/questionnaires/:token', async (req, res) => {
  await db.transaction(async (tx) => {
    const rows = await pool.query(
      "SELECT * FROM entities WHERE kind='questionnaires' AND data->>'publicToken'=$1 AND data->>'isPublished'='true'",
      [req.params.token],
    )
    const q = rows.rows[0]
    if (!q) throw new HttpError(404, 'Questionnaire not found')
    const questions = await tx
      .select()
      .from(entities)
      .where(
        and(
          eq(entities.ownerId, q.owner_id),
          eq(entities.parentId, q.id),
          eq(entities.kind, 'questions'),
        ),
      )
    const answers = req.body.answers
    if (!answers || typeof answers !== 'object' || Array.isArray(answers))
      throw new HttpError(400, 'Answers required')
    const clean: Record<string, string> = {}
    for (const question of questions) {
      const value = answers[question.id]
      if (
        typeof value !== 'string' ||
        value.length > 4000 ||
        (question.data.required && !value.trim())
      )
        throw new HttpError(400, `Answer required: ${question.data.text}`)
      clean[question.id] = value
    }
    await tx.insert(entities).values({
      id: randomUUID(),
      ownerId: q.owner_id,
      kind: 'responses',
      parentId: q.id,
      data: { answers: clean },
    })
  })
  res.status(201).json({ success: true })
})
app.post('/api/agent/chat', async (req, res) => {
  const body = req.body as {
    messages?: Array<{
      role: 'user' | 'assistant' | 'system'
      content: string
      imageUrl?: string
    }>
    activeFilter?: 'all' | 'customer' | 'employee' | 'graph'
  }
  if (!body || !Array.isArray(body.messages) || body.messages.length === 0) {
    throw new HttpError(400, 'messages array is required')
  }

  // Set up Server-Sent Events headers
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()

  // Send immediate SSE ping so the frontend knows the connection is established
  res.write(': ping\n\n')
  if (typeof (res as any).flush === 'function') {
    ;(res as any).flush()
  }

  let isClosed = false
  // NOTE: `req.on('close')` fires as soon as the request message is consumed
  // (after the JSON body) on keep-alive connections — it is NOT a disconnect
  // signal. The response socket close is the real client-abort signal.
  res.on('close', () => {
    isClosed = true
  })

  try {
    const stream = runRagAgentStream({
      messages: body.messages,
      activeFilter: body.activeFilter || 'all',
    })

    for await (const event of stream) {
      if (isClosed) break
      res.write(
        `event: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`,
      )
      if (typeof (res as any).flush === 'function') {
        ;(res as any).flush()
      }
    }
  } catch (err: any) {
    if (!isClosed) {
      res.write(
        `event: error\ndata: ${JSON.stringify({ message: err.message || 'Stream error' })}\n\n`,
      )
      if (typeof (res as any).flush === 'function') {
        ;(res as any).flush()
      }
    }
  } finally {
    if (!isClosed) {
      res.end()
    }
  }
})
app.get('/api/agent/entities', async (_req, res) => {
  let dbCustomers: any[] = []
  try {
    const rows = await db
      .select()
      .from(entities)
      .where(eq(entities.kind, 'sessions'))
      .limit(30)
    dbCustomers = rows.map((r) => {
      const d = (r.data as Record<string, any>) || {}
      const fullName = [d.first_name, d.last_name].filter(Boolean).join(' ')
      return {
        type: 'customer',
        id: r.id,
        name: fullName || `Subject_${r.id.slice(0, 8)}`,
        status: d.status || 'initiated',
        riskLevel: d.amlRisk?.level || 'clean',
        riskScore: d.amlRisk?.riskScore || 0,
        nationality: d.nationality || 'Unknown',
        documentNumber: d.document_number,
      }
    })
  } catch {}

  const employees = EMPLOYEES_KNOWLEDGE_BASE.map((e) => ({
    type: 'employee',
    id: e.id,
    name: e.name,
    role: e.role,
    department: e.department,
    clearanceLevel: e.clearanceLevel,
    flagsCount: e.complianceFlags.length,
    riskLevel: e.complianceFlags.length > 0 ? 'medium' : 'clean',
  }))

  const benchmarkCustomers = BENCHMARK_CUSTOMERS.map((c) => ({
    type: 'customer',
    id: c.id,
    name: c.name,
    status: c.status,
    riskLevel: c.riskLevel,
    riskScore: c.riskScore,
    nationality: c.nationality,
    documentNumber: c.documentNumber,
  }))

  res.json({
    employees,
    customers: [...dbCustomers, ...benchmarkCustomers],
  })
})
app.get('/api/agent/status', async (_req, res) => {
  res.json({
    status: 'ok',
    model: NVIDIA_MODEL_ID,
    hasNvidiaKey: Boolean(process.env.NVIDIA_API_KEY),
    graph: process.env.FALKORDB_GRAPH || 'openkyc_aml',
    timestamp: Date.now(),
  })
})
app.get('/api/mailer/status', async (_req, res) => {
  res.json(getMailerConfig())
})
app.post('/api/mailer/send-invitation', async (req, res) => {
  const who = await identity(req)
  if (!who) throw new HttpError(401, 'Sign in required')
  const {
    to,
    recipientName,
    recipientType,
    sessionId,
    role,
    department,
    customMessage,
  } = (req.body as any) || {}
  if (!to || typeof to !== 'string')
    throw new HttpError(400, 'to email is required')

  let publicToken: string | undefined
  let workflowName = 'Identity Verification'
  if (sessionId) {
    try {
      const [session] = await db
        .select()
        .from(entities)
        .where(
          and(eq(entities.id, sessionId), eq(entities.ownerId, who.ownerId)),
        )
      if (session) {
        publicToken = session.data.publicToken
        workflowName = session.data.workflowSnapshot?.name || workflowName
      }
    } catch {}
  }

  const result = await sendKycInvitationEmail({
    to,
    recipientName: recipientName || 'Valued Subject',
    recipientType: recipientType || 'customer',
    sessionId,
    publicToken,
    workflowName,
    role,
    department,
    customMessage,
  })

  res.json(result)
})
app.post('/api/mailer/test', async (req, res) => {
  const who = await identity(req)
  if (!who) throw new HttpError(401, 'Sign in required')
  const to = (req.body as any)?.to || who?.user?.email
  if (!to) throw new HttpError(400, 'Destination email is required')

  const result = await mailerSendEmail({
    to,
    subject: 'OpenKYC Mailer Live Test Verification',
    text: `This is a test verification email sent from OpenKYC via Resend API at ${new Date().toISOString()}.`,
  })

  res.json(result)
})
app.post('/api/mailer/send-progress', async (req, res) => {
  const who = await identity(req)
  if (!who) throw new HttpError(401, 'Sign in required')
  const { sessionId, stage, targetEmail } = (req.body as any) || {}
  if (!sessionId) throw new HttpError(400, 'sessionId is required')

  const [session] = await db
    .select()
    .from(entities)
    .where(and(eq(entities.id, sessionId), eq(entities.ownerId, who.ownerId)))
  if (!session) throw new HttpError(404, 'Session not found')

  const d = (session.data as Record<string, any>) || {}
  const to = targetEmail || d.email
  if (!to)
    throw new HttpError(
      400,
      'No email address associated with this session. Please specify targetEmail.',
    )

  const name =
    d.username ||
    [d.first_name, d.last_name].filter(Boolean).join(' ') ||
    'Valued Subject'
  let result: any

  switch (stage) {
    case 'invitation':
      result = await sendKycInvitationEmail({
        to,
        recipientName: name,
        recipientType: d.recipientType || 'customer',
        sessionId,
        publicToken: d.publicToken,
        workflowName: d.workflowSnapshot?.name || 'Identity Verification',
        role: d.role,
        department: d.department,
      })
      break
    case 'documents_submitted':
      result = await sendDocumentsSubmittedEmail({
        to,
        recipientName: name,
        recipientType: d.recipientType || 'customer',
        sessionId,
        publicToken: d.publicToken,
      })
      break
    case 'document_verified':
      result = await sendDocumentVerifiedEmail({
        to,
        recipientName: name,
        recipientType: d.recipientType || 'customer',
        sessionId,
        publicToken: d.publicToken,
        documentType: d.document_type || 'Government ID',
        extractedFields: d.ocrExtractedFields
          ? Object.fromEntries(
              Object.entries(d.ocrExtractedFields).map(
                ([k, v]: [string, any]) => [k, v?.value || v],
              ),
            )
          : {},
        ocrEngine: d.ocrEngine || 'Indra OCR Engine',
      })
      break
    case 'aml_completed':
      result = await sendAmlChecksCompletedEmail({
        to,
        recipientName: name,
        recipientType: d.recipientType || 'customer',
        sessionId,
        publicToken: d.publicToken,
        riskLevel: d.amlRisk?.level || 'clean',
        riskScore: d.amlRisk?.riskScore ?? 0,
        sanctionsStatus: d.amlRisk?.signals?.some(
          (s: any) => s.type === 'sanctions' || s.severity === 'high',
        )
          ? 'flagged'
          : 'clean',
        pepStatus: d.amlRisk?.signals?.some((s: any) => s.type === 'pep')
          ? 'flagged'
          : 'clear',
      })
      break
    case 'decision':
      result = await sendVerificationDecisionEmail({
        to,
        recipientName: name,
        recipientType: d.recipientType || 'customer',
        sessionId,
        publicToken: d.publicToken,
        decision: d.reviewStatus === 'approved' ? 'approved' : 'rejected',
        notes: d.reviewNotes || 'Verification status updated',
        reviewerName:
          who?.user?.name || who?.user?.email || 'Compliance Officer',
      })
      break
    default:
      throw new HttpError(
        400,
        'Invalid stage. Supported: invitation, documents_submitted, document_verified, aml_completed, decision',
      )
  }

  res.json(result)
})
app.get('/api/v1/sessions', async (req, res) =>
  res.json(await operation(req, 'sessions.list', req.query)),
)
app.post('/api/v1/sessions', async (req, res) =>
  res.status(201).json(await operation(req, 'sessions.create', req.body)),
)
app.get('/api/v1/sessions/:id', async (req, res) =>
  res.json(await operation(req, 'sessions.get', { sessionId: req.params.id })),
)
app.post('/api/v1/sessions/:id/review', async (req, res) =>
  res.json(
    await operation(req, 'sessions.review', {
      ...req.body,
      sessionId: req.params.id,
    }),
  ),
)
app.get('/api/v1/documents', async (req, res) =>
  res.json(await operation(req, 'documents.list', req.query)),
)
app.post('/api/v1/uploads', async (req, res) =>
  res.json({ url: await operation(req, 'documents.uploadUrl', req.body) }),
)
app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }))
app.use(express.static(path.resolve('build'), { index: false }))
app.get('/{*path}', (_req, res) =>
  res.sendFile(path.resolve('build/index.html')),
)
app.use(
  (
    error: any,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    if (res.headersSent) return res.end()
    const status =
      error instanceof HttpError
        ? error.status
        : error.name === 'ZodError'
          ? 400
          : error.status === 413
            ? 413
            : 500
    if (status === 500) console.error('Request failed', error.name)
    res.status(status).json({
      error:
        status === 500
          ? 'Internal server error'
          : status === 400
            ? 'Invalid request: ' + error.message
            : error.message,
    })
  },
)
const server = app.listen(config.PORT, '0.0.0.0', () =>
  console.log(`OpenKYC listening on port ${config.PORT}`),
)
const stopDeliveries = startDeliveryLoop()
const stopOCR = startOCRLoop()
const stopAml = startAmlLoop()
async function shutdown() {
  stopDeliveries()
  stopOCR()
  stopAml()
  server.close()
  server.closeAllConnections()
  await redis.quit()
  await pool.end()
  process.exit(0)
}
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
