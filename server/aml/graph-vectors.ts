/**
 * Vector embeddings on the FalkorDB knowledge graph.
 *
 * Ingestion writes an `embedding` property (vecf32) on every :Document and
 * :Person node, computed from the node's ground-truth text (NVIDIA NIM —
 * nvidia/nemotron-3-embed-1b via server/ai/embeddings.ts, see the pipeline).
 * One cosine vector index per label makes the graph semantically searchable:
 * the agent's document retriever ranks nodes with
 * `db.idx.vector.queryNodes` instead of keyword matching.
 *
 * The embedding function is injected by the caller (the running API passes
 * server/ai/embeddings.ts, tests pass stubs) — this module only speaks Cypher.
 */

import type { FalkorDBClient } from '../../packages/falkordb-aml/src/index.js'

export const DOCUMENT_LABEL = 'Document'
export const PERSON_LABEL = 'Person'
export const EMBEDDING_PROPERTY = 'embedding'

export type GraphNodeLabel = typeof DOCUMENT_LABEL | typeof PERSON_LABEL
export type EmbedFn = (values: string[]) => Promise<number[][] | null>

export interface EmbeddingEntry {
  label: GraphNodeLabel
  id: string
  text: string
}

export interface SemanticHit {
  id: string
  /** Cosine similarity from FalkorDB (higher is closer). */
  score: number
  props: Record<string, unknown>
}

export interface EmbedSessionResult {
  embedded: number
  dimension: number | null
  note?: string
}

function escapeCypher(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

/** Renders a vector as a FalkorDB `vecf32([...])` literal. */
export function vectorLiteral(values: number[]): string {
  return `vecf32([${values.map((v) => (Number.isFinite(v) ? v : 0)).join(',')}])`
}

/** Bookkeeping props that only add noise to an embedding text. */
const INTERNAL_PROPERTIES = new Set([
  'id',
  'embedding',
  'updatedAt',
  'verifiedAt',
  'ocrEngine',
])

function humanizeKey(key: string): string {
  return key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase()
}

/**
 * Renders a graph node's business properties as deterministic embedding text:
 * sorted `key: value` pairs, internal bookkeeping props skipped.
 */
export function embeddingTextFromProps(
  kind: string,
  props: Record<string, unknown>,
): string {
  const parts = Object.keys(props)
    .filter((key) => !INTERNAL_PROPERTIES.has(key) && !key.startsWith('_'))
    .sort()
    .map((key) => {
      const value = props[key]
      const text =
        typeof value === 'number' ? String(value) : String(value ?? '').trim()
      return text ? `${humanizeKey(key)}: ${text}` : null
    })
    .filter((part): part is string => part !== null)
  return parts.length ? `${kind}. ${parts.join('. ')}` : kind
}

export function documentEmbeddingText(
  props: Record<string, unknown>,
): string {
  return embeddingTextFromProps('KYC document record', props)
}

export function personEmbeddingText(props: Record<string, unknown>): string {
  return embeddingTextFromProps('KYC subject record', props)
}

/**
 * Loads the business text of the session's graph nodes: its :Document nodes
 * (id prefix `doc_<sessionId>_`) and its :Person node (id = sessionId).
 */
export async function fetchSessionEmbeddingEntries(
  falkor: Pick<FalkorDBClient, 'query'>,
  sessionId: string,
): Promise<EmbeddingEntry[]> {
  const documentPrefix = escapeCypher(`doc_${sessionId}_`)
  const personId = escapeCypher(sessionId)
  const [documents, subjects] = await Promise.all([
    falkor.query<{ d?: Record<string, unknown> }>(
      `MATCH (d:${DOCUMENT_LABEL}) WHERE d.id STARTS WITH '${documentPrefix}' RETURN d`,
    ),
    falkor.query<{ p?: Record<string, unknown> }>(
      `MATCH (p:${PERSON_LABEL} {id: '${personId}'}) RETURN p`,
    ),
  ])

  const entries: EmbeddingEntry[] = []
  for (const row of documents.data) {
    const props = row.d
    if (!props || typeof props.id !== 'string') continue
    entries.push({
      label: DOCUMENT_LABEL,
      id: props.id,
      text: documentEmbeddingText(props),
    })
  }
  for (const row of subjects.data) {
    const props = row.p
    if (!props || typeof props.id !== 'string') continue
    entries.push({
      label: PERSON_LABEL,
      id: props.id,
      text: personEmbeddingText(props),
    })
  }
  return entries
}

/**
 * Creates the cosine vector indexes for :Document/:Person when missing.
 * FalkorDB has no `CREATE VECTOR INDEX IF NOT EXISTS`, so an "already
 * indexed" error is expected on every run after the first.
 */
export async function ensureVectorIndexes(
  falkor: Pick<FalkorDBClient, 'execute'>,
  dimension: number,
): Promise<void> {
  for (const label of [DOCUMENT_LABEL, PERSON_LABEL] as const) {
    const cypher = `CREATE VECTOR INDEX FOR (n:${label}) ON (n.${EMBEDDING_PROPERTY}) OPTIONS {dimension: ${Math.floor(dimension)}, similarityFunction: 'cosine'}`
    try {
      await falkor.execute(cypher)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (!message.includes('already indexed')) {
        console.warn(`[aml] vector index for :${label} unavailable: ${message}`)
      }
    }
  }
}

async function storeEmbedding(
  falkor: Pick<FalkorDBClient, 'execute'>,
  entry: EmbeddingEntry,
  vector: number[],
): Promise<void> {
  await falkor.execute(
    `MATCH (n:${entry.label} {id: '${escapeCypher(entry.id)}'}) SET n.${EMBEDDING_PROPERTY} = ${vectorLiteral(vector)}`,
  )
}

/**
 * Embeds and stores the session's ingested nodes. Best-effort by design: the
 * caller logs a warning and continues when the embedding provider is down —
 * graph ingestion and AML scoring do not depend on vectors.
 */
export async function embedSessionGraph(
  falkor: Pick<FalkorDBClient, 'query' | 'execute'>,
  sessionId: string,
  embed: EmbedFn,
): Promise<EmbedSessionResult> {
  const entries = await fetchSessionEmbeddingEntries(falkor, sessionId)
  if (entries.length === 0) {
    return { embedded: 0, dimension: null, note: 'no ingested nodes found' }
  }

  const vectors = await embed(entries.map((entry) => entry.text))
  if (!vectors) {
    return { embedded: 0, dimension: null, note: 'embedding provider unavailable' }
  }
  const dimension = vectors.find((vector) => vector?.length)?.length ?? 0
  if (!dimension) {
    return { embedded: 0, dimension: null, note: 'empty embedding response' }
  }

  await ensureVectorIndexes(falkor, dimension)
  let embedded = 0
  for (let i = 0; i < entries.length; i++) {
    const vector = vectors[i]
    if (!vector || vector.length !== dimension) continue
    try {
      await storeEmbedding(falkor, entries[i], vector)
      embedded++
    } catch (error) {
      console.warn(
        `[aml] embedding store failed for ${entries[i].id}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
    }
  }
  return { embedded, dimension }
}

/**
 * Vector search over one label. Requires the label's vector index to exist
 * (created by ensureVectorIndexes) — callers treat errors as "no vectors yet".
 */
export async function semanticSearch(
  falkor: Pick<FalkorDBClient, 'query'>,
  label: GraphNodeLabel,
  queryVector: number[],
  limit: number,
): Promise<SemanticHit[]> {
  const k = Math.max(1, Math.min(50, Math.floor(limit)))
  const { data } = await falkor.query<{
    node?: Record<string, unknown>
    score?: number | string
  }>(
    `CALL db.idx.vector.queryNodes('${label}', '${EMBEDDING_PROPERTY}', ${k}, ${vectorLiteral(queryVector)}) YIELD node, score WITH node, score ORDER BY score DESC RETURN node, score`,
  )
  return data
    .map((row) => {
      const props = row.node ?? {}
      return {
        id: typeof props.id === 'string' ? props.id : '',
        score: Number(row.score ?? 0),
        props,
      }
    })
    .filter((hit) => hit.id)
}

/** Resolves the submitting :Person name for a batch of document ids. */
export async function documentSubjectNames(
  falkor: Pick<FalkorDBClient, 'query'>,
  documentIds: string[],
): Promise<Map<string, string>> {
  const names = new Map<string, string>()
  if (documentIds.length === 0) return names
  const list = documentIds.map((id) => `'${escapeCypher(id)}'`).join(', ')
  const { data } = await falkor.query<{ docId?: string; personName?: string }>(
    `MATCH (p:${PERSON_LABEL})-[:SUBMITTED_DOCUMENT]->(d:${DOCUMENT_LABEL}) WHERE d.id IN [${list}] RETURN d.id AS docId, p.name AS personName`,
  )
  for (const row of data) {
    if (row.docId && row.personName) names.set(row.docId, row.personName)
  }
  return names
}

/** True when at least one :Document node carries a vector (semantic ready). */
export async function hasGraphEmbeddings(
  falkor: Pick<FalkorDBClient, 'query'>,
): Promise<boolean> {
  const { data } = await falkor.query<{ c?: number | string }>(
    `MATCH (d:${DOCUMENT_LABEL}) WHERE d.${EMBEDDING_PROPERTY} IS NOT NULL RETURN count(d) AS c`,
  )
  return Number(data[0]?.c ?? 0) > 0
}
