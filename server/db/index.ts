import pg from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import { config } from '../config.js'
import * as schema from './schema.js'
export const pool = new pg.Pool({
  connectionString: config.DATABASE_URL,
  max: 15,
})
// An idle pool client can emit 'error' (e.g. 57P01 when Postgres restarts or
// Docker recreates the container). Without this handler Node treats it as an
// unhandled 'error' event and crashes the whole API; the pool reconnects on
// the next pool.connect(), so logging and surviving is the right behavior.
pool.on('error', (err) => {
  console.error('[OpenKYC DB] idle client connection error (pool stays up):', err.message)
})
export const db = drizzle(pool, { schema })
