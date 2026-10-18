import { randomUUID } from 'node:crypto'
import { and, eq, desc } from 'drizzle-orm'
import { db } from './db/index.js'
import { entities } from './db/schema.js'
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}
export const present = (
  r: typeof entities.$inferSelect,
): Record<string, any> & {
  _id: string
  id: string
  createdAt: number
  updatedAt: number
  _creationTime: number
} => ({
  ...r.data,
  _id: r.id,
  id: r.id,
  _creationTime: r.createdAt.getTime(),
  createdAt: r.createdAt.getTime(),
  updatedAt: r.updatedAt.getTime(),
})
export async function list(ownerId: string, kind: string, parentId?: string) {
  return (
    await db
      .select()
      .from(entities)
      .where(
        and(
          eq(entities.ownerId, ownerId),
          eq(entities.kind, kind),
          parentId ? eq(entities.parentId, parentId) : undefined,
        ),
      )
      .orderBy(desc(entities.createdAt))
  ).map(present)
}
export async function get(ownerId: string, kind: string, id: string) {
  const [row] = await db
    .select()
    .from(entities)
    .where(
      and(
        eq(entities.ownerId, ownerId),
        eq(entities.kind, kind),
        eq(entities.id, id),
      ),
    )
  if (!row) throw new HttpError(404, 'Not found')
  return present(row)
}
export async function create(
  ownerId: string,
  kind: string,
  data: Record<string, unknown>,
  parentId?: string,
) {
  const id = randomUUID()
  await db.insert(entities).values({ id, ownerId, kind, data, parentId })
  return id
}
export async function update(
  ownerId: string,
  kind: string,
  id: string,
  data: Record<string, unknown>,
) {
  await get(ownerId, kind, id)
  await db
    .update(entities)
    .set({ data, updatedAt: new Date() })
    .where(
      and(
        eq(entities.ownerId, ownerId),
        eq(entities.kind, kind),
        eq(entities.id, id),
      ),
    )
}
export async function remove(ownerId: string, kind: string, id: string) {
  await get(ownerId, kind, id)
  await db
    .delete(entities)
    .where(
      and(
        eq(entities.ownerId, ownerId),
        eq(entities.kind, kind),
        eq(entities.id, id),
      ),
    )
}
export async function settings(ownerId: string) {
  return (
    (await list(ownerId, 'settings'))[0] || {
      publicName: 'OpenKYC',
      sessionExpiryHours: 168,
    }
  )
}
