/**
 * Vercel AI SDK–powered compliance RAG system.
 *
 * Layers:
 *   provider.ts            — LLM + embedding adapter (NVIDIA NIM, OpenAI-compatible)
 *   embeddings.ts          — nvidia/nemotron-3-embed-1b helpers for graph vectors
 *   knowledge.ts           — indexed corpora (employees, benchmark customers)
 *   retrieval/             — retrievers (PostgreSQL, FalkorDB graph, KYC documents) + orchestrator
 *   agent.ts               — RAG pipeline: retrieve → augment → grounded generate (streamText)
 *   stream-events.ts       — shared SSE envelope
 */

export * from './provider.js'
export * from './knowledge.js'
export * from './stream-events.js'
export { runRagAgentStream } from './agent.js'
export {
  retrieveContextPack,
  runRetrieval,
  type ActiveFilter,
  type RetrievalProgress,
} from './retrieval/index.js'
