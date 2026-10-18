/**
 * Provider adapter for the agent LLM and the graph embedding model. NVIDIA NIM
 * via its OpenAI-compatible endpoint, abstracted behind the Vercel AI SDK so
 * the pipeline code stays provider-agnostic.
 */

import { createOpenAICompatible } from '@ai-sdk/openai-compatible'

export const NVIDIA_MODEL_ID = 'nvidia/nemotron-3.5-super-vl-120b-a12b'
export const NVIDIA_BASE_URL = 'https://integrate.api.nvidia.com/v1'
/** 1B text-embedding model (2048-dim) used for FalkorDB graph vectors. */
export const NVIDIA_EMBED_MODEL_ID = 'nvidia/nemotron-3-embed-1b'

let cached: ReturnType<typeof createNvidiaProvider> | null = null

function createNvidiaProvider() {
  const apiKey = process.env.NVIDIA_API_KEY
  if (!apiKey) throw new Error('NVIDIA_API_KEY is not configured in .env')
  return createOpenAICompatible({
    name: 'nvidia',
    baseURL: NVIDIA_BASE_URL,
    apiKey,
  })
}

/** Returns the configured language model or null when the key is missing. */
export function getModel() {
  try {
    if (!cached) cached = createNvidiaProvider()
    return cached(NVIDIA_MODEL_ID)
  } catch {
    return null
  }
}

/** Returns the configured text-embedding model or null when the key is missing. */
export function getEmbeddingModel() {
  try {
    if (!cached) cached = createNvidiaProvider()
    return cached.embeddingModel(
      process.env.NVIDIA_EMBED_MODEL || NVIDIA_EMBED_MODEL_ID,
    )
  } catch {
    return null
  }
}
