import { expect, test, vi } from 'vitest'
import { createHash } from 'node:crypto'
import type { Request } from 'express'
const state = vi.hoisted(() => ({ rows: [] as any[] }))
vi.mock('../server/db/index.js', () => ({
  db: { select: () => ({ from: () => ({ where: async () => state.rows }) }) },
}))
vi.mock('../server/auth.js', () => ({ auth: {} }))
import { sessionAccess } from '../server/access'
const token = 'secure-link-token'
function session() {
  state.rows = [
    {
      id: 'session',
      ownerId: 'alice',
      kind: 'sessions',
      createdAt: new Date(),
      updatedAt: new Date(),
      data: {
        tokenHash: createHash('sha256').update(token).digest('hex'),
        expiresAt: Date.now() + 10000,
        status: 'initiated',
      },
    },
  ]
}
const req = (value?: string) =>
  ({
    headers: value ? { 'x-session-token': value } : {},
    query: {},
  }) as unknown as Request
test('token is required when requester does not own the session', async () => {
  session()
  await expect(sessionAccess(req(), 'session', 'bob')).rejects.toMatchObject({
    status: 404,
  })
})
test('invalid token does not reveal session existence', async () => {
  session()
  await expect(sessionAccess(req('bad'), 'session')).rejects.toMatchObject({
    status: 404,
  })
})
test('expired token cannot collect documents', async () => {
  session()
  state.rows[0].data.expiresAt = Date.now() - 1
  await expect(sessionAccess(req(token), 'session')).rejects.toMatchObject({
    status: 410,
  })
})
test('owner can still review expired sessions', async () => {
  session()
  state.rows[0].data.expiresAt = Date.now() - 1
  expect((await sessionAccess(req(), 'session', 'alice')).isOwner).toBe(true)
})
test('valid public token grants collection access without ownership', async () => {
  session()
  expect((await sessionAccess(req(token), 'session')).isOwner).toBe(false)
})
