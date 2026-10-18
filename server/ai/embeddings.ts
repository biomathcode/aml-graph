/**
 * NVIDIA NIM text embeddings for the KYC knowledge graph and agent retrieval.
 *
 * Model: nvidia/nemotron-3-embed-1b (2048-dim, multilingual retrieval).
 * Vectors are written onto the FalkorDB :Document/:Person nodes at ingestion
 * (server/aml/graph-vectors.ts) and queried semantically by the agent's
 * document retriever. Every helper degrades to `null` when the provider is not
 * configured or the call fails, so callers fall back to keyword retrieval.
 */

import { embed, embedMany } from 'ai'
import { getEmbeddingModel } from './provider.js'

const EMBED_TIMEOUT_MS = 30_000

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Embeds a single string (query side of semantic search). */
export async function embedText(value: string): Promise<number[] | null> {
  const model = getEmbeddingModel()
  if (!model) return null
  try {
    const { embedding } = await embed({
      model,
      value,
      abortSignal: AbortSignal.timeout(EMBED_TIMEOUT_MS),
    })
    return embedding
  } catch (error) {
    console.warn(`[embeddings] embed failed: ${errorMessage(error)}`)
    return null
  }
}

/** Embeds node texts (ingestion side); null when the provider is unavailable. */
export async function embedTexts(values: string[]): Promise<number[][] | null> {
  if (values.length === 0) return []
  const model = getEmbeddingModel()
  if (!model) return null
  try {
    const { embeddings } = await embedMany({
      model,
      values,
      abortSignal: AbortSignal.timeout(EMBED_TIMEOUT_MS),
    })
    return embeddings
  } catch (error) {
    console.warn(`[embeddings] embedMany failed: ${errorMessage(error)}`)
    return null
  }
}
