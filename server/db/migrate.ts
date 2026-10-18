import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { getMigrations } from 'better-auth/db/migration'
import { db, pool } from './index.js'
import { auth } from '../auth.js'
const client = await pool.connect()
try {
  await client.query('SELECT pg_advisory_lock(789341)')
  await migrate(db, { migrationsFolder: './server/db/migrations' })
  const { runMigrations } = await getMigrations(auth.options)
  await runMigrations()
  console.log('Database migrations applied')
} finally {
  await client.query('SELECT pg_advisory_unlock(789341)')
  client.release()
  await pool.end()
}
