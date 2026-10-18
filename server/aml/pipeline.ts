/**
 * KYC → FalkorDB → AML pipeline.
 *
 * Runs as a background job loop (`kind='aml'`), enqueued when a session is
 * submitted (server/operations.ts) or re-run on demand (`aml.retrySession`):
 *
 *   1. Ingest the session's OCR-extracted identity attributes into FalkorDB
 *      (:Person/:Document/:Identifier/:Account) — deterministic Cypher, no LLM.
 *   2. Embed the ingested nodes (nvidia/nemotron-3-embed-1b via server/ai)
 *      into vector properties + cosine vector indexes — best-effort, powers
 *      the agent's semantic document retrieval.
 *   3. Score the subject with the typed graph algorithms from
 *      @open-kyc/falkordb-aml (cycles, smurfing, scatter-gather, entity
 *      resolution, centrality/PageRank, sanctions tracing, DPRK screening).
 *   4. Attach the structured AmlRiskReport to the session (amlRisk/amlRiskAt)
 *      for operator review.
 *
 * No external service is involved: FalkorDB is spoken to directly over the
 * Redis protocol and the API process owns the loop (mirrors the OCR loop in
 * server/webhooks.ts with at-least-once delivery semantics).
 */

import { and, eq } from 'drizzle-orm'
import { db, pool } from '../db/index.js'
import { entities } from '../db/schema.js'
import { notify } from '../redis.js'
import type { AmlRiskReport } from '@open-kyc/contracts'
import { embedTexts } from '../ai/embeddings.js'
import { getFalkorClient } from './client.js'
import { mergeSessionFields, submittedIdentifiers } from './fields.js'
import { embedSessionGraph } from './graph-vectors.js'
import { ingestOcrIntoGraph } from './ocr-to-graph.js'
import { buildGraphAmlReport } from './risk-processor.js'

export type AmlPipelineStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'unavailable'
  | 'skipped'
  | 'failed'

/** Sentinel error: the OCR job has not settled yet; re-queue without burning a retry. */
export const WAITING_FOR_OCR = 'waiting for OCR job to finish'

export interface AmlPipelineResult {
  graphStatus: AmlPipelineStatus
  graphStage: string
  amlStatus: AmlPipelineStatus
  report: AmlRiskReport | null
}

/** Shallow-merges pipeline status fields into the session (no clobbering). */
async function attach(
  sessionId: string,
  ownerId: string,
  updates: Record<string, unknown>,
) {
  await pool.query(
    'UPDATE entities SET data = data || $2::jsonb, updated_at = now() WHERE id=$1 AND owner_id=$3',
    [sessionId, JSON.stringify(updates), ownerId],
  )
  await notify(ownerId)
}

/** Records a terminal pipeline failure on the session (visible to operators). */
export async function markAmlFailure(
  sessionId: string,
  ownerId: string,
  message: string,
): Promise<void> {
  await attach(sessionId, ownerId, {
    amlStatus: 'failed',
    graphStatus: 'failed',
    graphStage: message,
  })
}

export async function runAmlPipeline(
  sessionId: string,
  ownerId: string,
): Promise<AmlPipelineResult> {
  const [session] = await db
    .select()
    .from(entities)
    .where(and(eq(entities.id, sessionId), eq(entities.ownerId, ownerId)))
  if (!session) throw new Error(`Session ${sessionId} not found`)
  const data = (session.data ?? {}) as Record<string, unknown>

  // The AML pass consumes OCR output. While the OCR job for this session is
  // still queued/in-flight, wait instead of scoring stale data.
  if (data.ocrStatus !== 'completed' && data.ocrStatus !== 'failed') {
    const pendingOcr = await pool.query(
      "SELECT 1 FROM jobs WHERE kind='ocr' AND entity_id=$1 AND status IN ('pending','delivering') LIMIT 1",
      [sessionId],
    )
    if (pendingOcr.rowCount) throw new Error(WAITING_FOR_OCR)
  }

  const fields = mergeSessionFields(data)
  const documentType =
    (typeof data.ocrDocumentType === 'string' && data.ocrDocumentType) ||
    (typeof data.document_type === 'string' && data.document_type) ||
    'passport'
  const personName =
    fields.full_name ||
    [fields.first_name, fields.last_name].filter(Boolean).join(' ') ||
    (typeof data.username === 'string' && data.username.trim()) ||
    `Applicant_${sessionId.slice(0, 8)}`

  await attach(sessionId, ownerId, {
    amlStatus: 'processing',
    graphStatus: 'processing',
    graphStage: 'running OCR → graph → AML pipeline',
  })

  const falkor = getFalkorClient()
  if (!(await falkor.ping())) {
    const stage = 'FalkorDB unreachable — graph ingestion skipped'
    await attach(sessionId, ownerId, {
      amlStatus: 'unavailable',
      graphStatus: 'unavailable',
      graphStage: stage,
    })
    return {
      graphStatus: 'unavailable',
      graphStage: stage,
      amlStatus: 'unavailable',
      report: null,
    }
  }

  // 1. Deterministic graph ingestion from the merged identity attributes.
  const ingestion = await ingestOcrIntoGraph(
    { sessionId, ownerId, documentType, extractedFields: fields },
    falkor,
  )
  const ingestionStage = `graph ingestion complete (${ingestion.identifiersLinked} identifier(s) linked${
    ingestion.accountLinked ? ', account linked' : ''
  })`
  await attach(sessionId, ownerId, {
    graphStatus: 'completed',
    graphStage: ingestionStage,
  })

  // 2. Semantic vectors on the ingested nodes (best-effort): the agent's
  // document retrieval runs vector search over the graph when vectors exist.
  const embeddings = await embedSessionGraph(falkor, sessionId, embedTexts).catch(
    (error) => {
      console.warn(
        `[aml] embedding step skipped for ${sessionId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
      return null
    },
  )

  // 3. Typed AML graph algorithms → structured report.
  const report = await buildGraphAmlReport(falkor, {
    personId: sessionId,
    personName,
    submittedIdentifiers: submittedIdentifiers(fields),
  })
  if (!report) {
    const stage = 'FalkorDB became unreachable during AML analysis'
    await attach(sessionId, ownerId, {
      amlStatus: 'unavailable',
      graphStatus: 'unavailable',
      graphStage: stage,
    })
    return {
      graphStatus: 'unavailable',
      graphStage: stage,
      amlStatus: 'unavailable',
      report: null,
    }
  }

  // 4. Attach the report for operator review.
  const vectorNote = embeddings?.embedded
    ? ` · ${embeddings.embedded} graph vector(s) embedded`
    : ''
  const stage = `AML algorithms complete: ${report.algorithmsRun.join(', ') || 'none'}${vectorNote}`
  await attach(sessionId, ownerId, {
    amlStatus: 'completed',
    graphStatus: 'completed',
    graphStage: stage,
    amlRisk: report,
    amlRiskAt: Date.now(),
  })
  return { graphStatus: 'completed', graphStage: stage, amlStatus: 'completed', report }
}

// Dedicated loop for background AML jobs — mirrors the OCR loop semantics.
export function startAmlLoop() {
  let running = false,
    stopped = false
  const tick = async () => {
    if (running || stopped) return
    running = true
    try {
      // Claims expire after a crash; re-claimed after 5 minutes of silence.
      const { rows } = await pool.query(
        `UPDATE jobs SET status='delivering',attempts=attempts+1,updated_at=now() WHERE id IN (SELECT id FROM jobs WHERE kind='aml' AND attempts<5 AND available_at<=now() AND (status='pending' OR (status='delivering' AND updated_at<now()-interval '5 minutes')) ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 3) RETURNING *`,
      )
      for (const job of rows) {
        const payload = job.payload as { sessionId: string; ownerId: string }
        try {
          await runAmlPipeline(payload.sessionId, payload.ownerId)
          await pool.query(
            'UPDATE jobs SET status=$2,updated_at=now() WHERE id=$1',
            [job.id, 'delivered'],
          )
        } catch (error) {
          const message =
            error instanceof Error ? error.message : 'AML pipeline failed'
          if (message === WAITING_FOR_OCR) {
            // OCR has not settled yet — re-queue shortly without consuming a retry.
            await pool.query(
              "UPDATE jobs SET status='pending',attempts=GREATEST(attempts-1,0),updated_at=now(),available_at=now()+interval '10 seconds' WHERE id=$1",
              [job.id],
            )
            continue
          }
          if (job.attempts >= 5)
            await markAmlFailure(
              payload.sessionId,
              payload.ownerId,
              message,
            ).catch(() => {})
          await pool.query(
            "UPDATE jobs SET status=$2,last_error=$3,available_at=now()+($4 * interval '1 second'),updated_at=now() WHERE id=$1",
            [
              job.id,
              job.attempts >= 5 ? 'failed' : 'pending',
              message,
              Math.pow(2, job.attempts) * 30,
            ],
          )
        }
      }
    } catch {
      console.error('AML pipeline unavailable')
    } finally {
      running = false
    }
  }
  const timer = setInterval(tick, 5000)
  return () => {
    stopped = true
    clearInterval(timer)
  }
}
