/**
 * RAG retrieval layer contracts.
 *
 * Standard AI engineering shape:
 *   retriever(query) -> ContextChunk[] (grounding evidence with stable ids)
 *   ContextChunk ids double as inline citations in generated answers.
 */

export type RagSource =
  'postgresql' | 'falkordb-graph' | 'kyc-documents' | 'employee-kb'

export interface ContextChunk {
  /** Stable citation id, e.g. `kyc:db:<uuid>` or `aml:graph:cycle-1`. */
  id: string
  /** Provenance of the evidence. */
  source: RagSource
  /** Short human-readable title. */
  title: string
  /** Ground-truth content the model must be constrained to. */
  content: string
  /** Optional relevance weight, 0..1. */
  score?: number
}

export interface RetrieverResult {
  /** Retriever id, reused for SSE tool_start/tool_result events. */
  retriever: string
  durationMs: number
  chunks: ContextChunk[]
  note?: string
}
