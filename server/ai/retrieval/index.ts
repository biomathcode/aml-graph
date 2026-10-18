/**
 * Retrieval orchestrator: intent routing + retriever fan-out.
 * Deterministic routing in application code — the LLM never chooses tools,
 * it only sees the assembled context pack (RAG, not an agentic tool loop).
 */

import { retrieveEntities, extractQueryTerms } from './entities.js'
import { retrieveEmployees } from './employees.js'
import { retrieveGraph } from './graph.js'
import { retrieveDocuments } from './documents.js'
import type { ContextChunk } from './types.js'

export type ActiveFilter = 'all' | 'customer' | 'employee' | 'graph'

export interface RetrievalProgress {
  retriever: string
  args: Record<string, unknown>
  chunks: ContextChunk[]
  durationMs: number
  note?: string
}

const EMPLOYEE_HINTS =
  /\b(employee|staff|officer|advisor|underwriter|internal|audit|clearance|conflict)\b/i
const DOCUMENT_HINTS =
  /\b(document|passport|id card|driver|mrz|ocr|upload|submitted|authentic|forgery|tamper)\b/i
const GRAPH_HINTS =
  /\b(aml|laundry|launder|typolog|network|cycle|smurf|structur|scatter|layer|centrality|pagerank|sanction|ofac|transaction|money flow|algo|dprk|north korea|pyongyang|laptop farm|remote worker|it worker)\b/i

export interface PendingRetrieval {
  retriever: string
  args: Record<string, unknown>
  run: () => Promise<ContextChunk[] | null>
}

/**
 * Fan out retrievers sequentially, yielding each step's result as it lands so
 * SSE consumers can stream tool_start → tool_result events live.
 */
export async function* runRetrieval(input: {
  query: string
  activeFilter: ActiveFilter
}): AsyncGenerator<RetrievalProgress> {
  const { query, activeFilter } = input
  const steps: PendingRetrieval[] = []

  // Entity retrieval always runs — it anchors subjects in the pack.
  steps.push({
    retriever: 'search_entities',
    args: {
      source: 'postgresql+benchmark',
      query: extractQueryTerms(query) || '(recent)',
    },
    run: () => retrieveEntities(query),
  })

  if (
    activeFilter === 'employee' ||
    (activeFilter === 'all' && EMPLOYEE_HINTS.test(query))
  ) {
    steps.push({
      retriever: 'analyze_employee_compliance',
      args: { source: 'employee-kb', query },
      run: () => Promise.resolve(retrieveEmployees(query)),
    })
  }

  if (
    activeFilter === 'graph' ||
    (activeFilter !== 'employee' &&
      (GRAPH_HINTS.test(query) || activeFilter === 'all'))
  ) {
    steps.push({
      retriever: 'run_aml_algorithms',
      args: { source: 'falkordb-graph', overview: activeFilter === 'graph' },
      run: () =>
        retrieveGraph(query, { fullOverview: activeFilter === 'graph' }),
    })
  }

  if (
    activeFilter !== 'graph' &&
    (DOCUMENT_HINTS.test(query) || activeFilter === 'all')
  ) {
    steps.push({
      retriever: 'search_documents',
      args: { source: 'kyc-documents', query },
      run: () => retrieveDocuments(query),
    })
  }

  for (const step of steps) {
    const t0 = Date.now()
    let chunks: ContextChunk[] = []
    let note: string | undefined
    try {
      chunks = (await step.run()) ?? []
    } catch (err: any) {
      note = `retrieval skipped: ${err?.message || 'error'}`
    }
    yield {
      retriever: step.retriever,
      args: step.args,
      durationMs: Date.now() - t0,
      note,
      chunks,
    }
  }
}

/** Collects the full pack for non-streaming callers. */
export async function retrieveContextPack(
  input: Parameters<typeof runRetrieval>[0],
): Promise<{ chunks: ContextChunk[]; steps: RetrievalProgress[] }> {
  const chunks: ContextChunk[] = []
  const steps: RetrievalProgress[] = []
  for await (const step of runRetrieval(input)) {
    chunks.push(...step.chunks)
    steps.push(step)
  }

  // De-duplicate chunk ids (retrievers can overlap).
  const seen = new Set<string>()
  return {
    chunks: chunks.filter((c) => {
      if (seen.has(c.id)) return false
      seen.add(c.id)
      return true
    }),
    steps,
  }
}
