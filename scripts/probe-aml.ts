import { db } from '../server/db/index.js'
import { entities } from '../server/db/schema.js'
import { desc } from 'drizzle-orm'

const rows = await db.select().from(entities).orderBy(desc(entities.createdAt)).limit(5)
for (const row of rows) {
  const d: any = row.data
  if (!d?.amlRisk) continue
  console.log('== session', row.id.slice(0, 8), d.email)
  console.log('level', d.amlRisk.level, 'score', d.amlRisk.riskScore)
  for (const s of d.amlRisk.signals ?? [])
    console.log(`  ${s.type} (${s.severity}): ${String(s.detail).slice(0, 160)}`)
}
process.exit(0)
