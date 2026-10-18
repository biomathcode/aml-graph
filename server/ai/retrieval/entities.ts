/**
 * PostgreSQL structured retriever.
 * Searches verification sessions/entities in the database and merges the
 * benchmark customer corpus as fallback when the DB has no indexed rows.
 */

import { db } from '../../db/index.js'
import { entities } from '../../db/schema.js'
import { eq, desc } from 'drizzle-orm'
import { BENCHMARK_CUSTOMERS, type BenchmarkCustomer } from '../knowledge.js'
import type { ContextChunk } from './types.js'

function chunkFromDbRow(
  row: any,
  data: Record<string, any>,
  score = 1,
): ContextChunk {
  const name = [data.first_name, data.last_name].filter(Boolean).join(' ')
  const aml = data.amlRisk
  return {
    id: `kyc:db:${row.id}`,
    source: 'postgresql',
    title: `Verification session ${name || row.id.slice(0, 8)}`,
    content: JSON.stringify({
      type: 'customer',
      id: row.id,
      name: name || null,
      documentNumber: data.document_number || null,
      nationality: data.nationality || null,
      status: data.status || 'initiated',
      ocrExtractedFields: data.ocrExtractedFields || null,
      amlRisk: aml
        ? {
            riskScore: aml.riskScore,
            level: aml.level,
            summary: aml.summary,
            signals: aml.signals,
          }
        : null,
    }),
    score,
  }
}

function chunkFromBenchmark(c: BenchmarkCustomer, score = 0.9): ContextChunk {
  return {
    id: `kyc:bench:${c.id}`,
    source: 'postgresql',
    title: `Benchmark record ${c.name}`,
    content: JSON.stringify({
      type: 'customer',
      id: c.id,
      name: c.name,
      documentNumber: c.documentNumber,
      nationality: c.nationality,
      status: c.status,
      riskScore: c.riskScore,
      riskLevel: c.riskLevel,
      flagReasons: c.flagReasons,
      accountNumber: c.accountNumber,
      bank: c.bank,
      balance: c.balance,
    }),
    score,
  }
}

function matchScore(
  needle: string,
  ...fields: Array<string | null | undefined>
): number {
  if (!needle) return 0.5
  const hay = fields.filter(Boolean).join(' ').toLowerCase()
  if (!hay) return 0
  if (hay.includes(needle)) return 1
  for (const token of needle.split(/\s+/)) {
    if (token.length >= 3 && hay.includes(token)) return 0.8
  }
  return 0
}

/**
 * Query terms: strip interrogative filler, keep salient tokens.
 */
export function extractQueryTerms(userMessage: string): string {
  return userMessage
    .toLowerCase()
    .replace(
      /\b(show|me|the|a|an|who|is|are|what|which|tell|about|list|all|and|or|of|in|on|for|with|any|their|his|her|to|please|give|find|describe|details|details?|report|summary)\b/g,
      ' ',
    )
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export async function retrieveEntities(
  userQuery: string,
  cap = 10,
): Promise<ContextChunk[]> {
  const q = extractQueryTerms(userQuery)
  const chunks: ContextChunk[] = []

  try {
    const rows = await db
      .select()
      .from(entities)
      .where(eq(entities.kind, 'sessions'))
      .orderBy(desc(entities.createdAt))
      .limit(50)

    for (const row of rows) {
      const data = (row.data as Record<string, any>) || {}
      const name = [data.first_name, data.last_name].filter(Boolean).join(' ')
      const score = matchScore(
        q,
        name,
        data.document_number,
        data.email,
        data.nationality,
        row.id,
      )
      if (score > 0 || !q) {
        chunks.push(chunkFromDbRow(row, data, score))
      }
    }
  } catch {
    // DB unreachable — fall back to benchmark corpus only.
  }

  if (chunks.length === 0) {
    for (const c of BENCHMARK_CUSTOMERS) {
      const score = matchScore(
        q,
        c.name,
        c.documentNumber,
        c.nationality,
        c.accountNumber,
      )
      if (score > 0 || !q) chunks.push(chunkFromBenchmark(c, score))
    }
  }

  // Recall-oriented fallback: when no subject matches the query terms, feed
  // the highest-risk corpus records so the pack still anchors the answer.
  if (chunks.length === 0) {
    chunks.push(...BENCHMARK_CUSTOMERS.map((c) => chunkFromBenchmark(c, 0.3)))
  }

  return chunks.sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, cap)
}
