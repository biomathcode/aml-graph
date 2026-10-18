/** Offline migration. Never reads production Convex credentials. Dry-run by default. */
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { randomBytes, createHash } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { fileTypeFromBuffer } from 'file-type'
import { db, pool } from '../server/db/index.js'
import { entities, files } from '../server/db/schema.js'
import { storageLocation, putObject, deleteObject } from '../server/storage.js'
const directory = process.argv[2],
  mappingPath = process.argv[3]
if (!directory || !mappingPath)
  throw new Error(
    'Usage: tsx scripts/import-convex.ts <unpacked-export> <ownership-map.json> [--apply]',
  )
const mapping = JSON.parse(await readFile(mappingPath, 'utf8')) as {
  users: Record<string, string>
  records: Record<string, string>
  files: Record<string, string>
}
const records: Array<{
  id: string
  kind: string
  ownerId: string
  parentId?: string
  data: Record<string, any>
  createdAt: Date
}> = []
const kinds = [
  'workflows',
  'sessions',
  'documents',
  'questionnaires',
  'questions',
  'feedback',
  'siteAnalysis',
]
for (const kind of kinds) {
  const filename = path.join(directory, kind, 'documents.jsonl')
  let content: string
  try {
    content = await readFile(filename, 'utf8')
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') continue
    throw e
  }
  for (const line of content.split('\n').filter(Boolean)) {
    const { _id, _creationTime, ...data } = JSON.parse(line)
    const ownerId =
      mapping.records?.[_id] || mapping.users?.[data.betterAuthUserId]
    if (!ownerId)
      throw new Error(
        `Explicit ownership missing for ${kind}/${_id}; add records mapping`,
      )
    if (kind === 'sessions') {
      const token = randomBytes(32).toString('base64url')
      data.publicToken = token
      data.tokenHash = createHash('sha256').update(token).digest('hex')
      data.expiresAt = Date.now() + 168 * 3600000
      data.processingStatus = 'not_requested'
      data.reviewStatus = 'pending'
    }
    if (kind === 'questionnaires')
      data.publicToken = randomBytes(32).toString('base64url')
    if (kind === 'documents') data.processingStatus = 'collected'
    delete data.betterAuthUserId
    records.push({
      id: _id,
      kind:
        kind === 'siteAnalysis'
          ? 'analysis'
          : kind === 'feedback'
            ? 'legacy_feedback'
            : kind,
      ownerId,
      parentId: data.questionnaireId || data.workflowId,
      data,
      createdAt: new Date(_creationTime || data.createdAt || Date.now()),
    })
  }
}
const uploaded: Array<{
  id: string
  ownerId: string
  sessionId?: string
  localPath: string
}> = []
for (const record of records) {
  for (const fileId of [
    record.data.fileId,
    record.data.front_image,
    record.data.back_image,
    record.data.person_image,
  ].filter(Boolean)) {
    const previous = uploaded.find((f) => f.id === fileId)
    if (previous && previous.ownerId !== record.ownerId)
      throw new Error(`File ${fileId} has conflicting owners`)
    if (previous) continue
    const relative = mapping.files?.[fileId]
    if (!relative) throw new Error(`Missing files mapping for ${fileId}`)
    const full = path.resolve(directory, relative),
      root = path.resolve(directory) + path.sep
    if (!full.startsWith(root))
      throw new Error('File paths must stay inside export directory')
    await readFile(full)
    uploaded.push({
      id: fileId,
      ownerId: record.ownerId,
      sessionId: record.kind === 'sessions' ? record.id : undefined,
      localPath: full,
    })
  }
}
for (const owner of new Set(records.map((r) => r.ownerId))) {
  const user = await pool.query('SELECT id FROM "user" WHERE id=$1', [owner])
  if (!user.rowCount)
    throw new Error(`Destination user does not exist: ${owner}`)
}
console.log(
  `Validated ${records.length} records and ${uploaded.length} files. ${process.argv.includes('--apply') ? 'Applying import.' : 'Dry-run only; use --apply to import.'}`,
)
const written: Array<ReturnType<typeof storageLocation>> = []
try {
  if (process.argv.includes('--apply'))
    await db.transaction(async (tx) => {
      for (const f of uploaded) {
        const [exists] = await tx.select().from(files).where(eq(files.id, f.id))
        if (exists) {
          if (exists.ownerId !== f.ownerId)
            throw new Error('Existing file ownership conflict')
          continue
        }
        const data = await readFile(f.localPath),
          type = await fileTypeFromBuffer(data)
        if (
          !type ||
          ![
            'application/pdf',
            'image/jpeg',
            'image/png',
            'image/webp',
          ].includes(type.mime)
        )
          throw new Error(`Unsupported file ${f.id}`)
        const ref = storageLocation(f.ownerId, encodeURIComponent(f.id))
        await putObject(ref, data, type.mime)
        written.push(ref)
        await tx
          .insert(files)
          .values({
            id: f.id,
            ownerId: f.ownerId,
            sessionId: f.sessionId,
            ...ref,
            mime: type.mime,
            size: data.length,
            sha256: createHash('sha256').update(data).digest('hex'),
          })
      }
      for (const record of records) {
        const [exists] = await tx
          .select()
          .from(entities)
          .where(eq(entities.id, record.id))
        if (exists) {
          if (exists.ownerId !== record.ownerId)
            throw new Error('Existing record ownership conflict')
          continue
        }
        await tx.insert(entities).values(record)
      }
    })
} catch (error) {
  for (const ref of written) await deleteObject(ref).catch(() => {})
  throw error
} finally {
  await pool.end()
}
