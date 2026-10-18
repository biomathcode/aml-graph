import { createHash, timingSafeEqual } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import type { Request } from 'express'
import { fromNodeHeaders } from 'better-auth/node'
import { auth } from './auth.js'
import { db } from './db/index.js'
import { apiKeys, entities } from './db/schema.js'
import { HttpError, present } from './repository.js'
export const hash = (s: string) => createHash('sha256').update(s).digest('hex')
export async function identity(req: Request) {
  const bearer = req.headers.authorization?.match(/^Bearer (kyc_[\w-]+)$/)?.[1]
  if (bearer) {
    const [key] = await db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.hash, hash(bearer)))
    if (!key) throw new HttpError(401, 'Invalid API key')
    return { ownerId: key.ownerId, apiKey: true }
  }
  const session = await auth.api.getSession({
    headers: fromNodeHeaders(req.headers),
  })
  return session
    ? { ownerId: session.user.id, user: session.user, apiKey: false }
    : null
}
export async function sessionAccess(
  req: Request,
  id: string,
  ownerId?: string,
) {
  const [row] = await db
    .select()
    .from(entities)
    .where(and(eq(entities.id, id), eq(entities.kind, 'sessions')))
  if (!row) throw new HttpError(404, 'Session not found')
  const isOwner = row.ownerId === ownerId
  if (!isOwner) {
    const token = String(
      req.headers['x-session-token'] || req.query.token || '',
    )
    const expected = String(row.data.tokenHash || '')
    if (
      !token ||
      expected.length !== 64 ||
      !timingSafeEqual(Buffer.from(hash(token)), Buffer.from(expected))
    )
      throw new HttpError(404, 'Session not found')
    if (row.data.expiresAt < Date.now() || row.data.status === 'expired')
      throw new HttpError(410, 'Session expired')
  }
  return { row, session: present(row), isOwner }
}
