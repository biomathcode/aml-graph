/**
 * RAG compliance agent.
 *
 * Pipeline: retrieve (deterministic, app-routed) → augment (context pack +
 * citation rules) → generate (single grounded stream via the Vercel AI SDK).
 * No autonomous tool loop: the model reasons strictly over retrieved evidence.
 */

import { streamText } from 'ai'
import { getModel, NVIDIA_MODEL_ID } from './provider.js'
import {
  runRetrieval,
  type ActiveFilter,
  type RetrievalProgress,
} from './retrieval/index.js'
import type { StreamEvent } from './stream-events.js'

const GROUNDING_SYSTEM_PROMPT = `You are OpenKYC's Senior Compliance Intelligence Agent. You are running inside a Retrieval-Augmented Generation (RAG) pipeline: before every reply, the system retrieved evidence from our PostgreSQL verification records, the FalkorDB AML knowledge graph algorithms (@open-kyc/falkordb-aml), the internal employee knowledge base, and/or the OCR document records indexed in FalkorDB (keyword + nvidia/nemotron-3-embed-1b embedding search).

CORE RULES
1. GROUNDED ANSWERS ONLY: base every factual claim exclusively on the CONTEXT block. Never invent entities, transactions, scores, or names.
2. CITE EVIDENCE: reference the bracketed citation ids as you use them, e.g. [kyc:bench:CUST-BENCH-1] or [aml:graph:cycle_detection]. An un-cited specific claim is a defect.
3. HANDLE GAPS HONESTLY: if the context does not cover the question, say exactly what is missing and what retrieval should be added. Never fill gaps with speculation.
4. CONFLICTING CONTEXT: when sources disagree, surface the disagreement and identify the more authoritative source.
5. COMPLIANCE REPORTING FORMAT: use markdown headings, structured bullet points, risk badges (CLEAN / LOW / MEDIUM / HIGH / CRITICAL), and finish with actionable recommendations (Approve, Escalate, File SAR, Suspend Access, Suspend Manual Overrides).
6. AUDIT INTEGRITY: always flag potential conflicts of interest between internal personnel and customer accounts when the context supports it.
7. DPRK GOVERNMENT-AFFILIATION SCREENING: when the retrieved context includes the DPRK IT-worker screening algorithm ([aml:graph:nk_worker]) or the DPRK indicator library ([kb:dprk-it-worker-indicators]), apply the July 2026 multi-government alert modus operandi: falsified nationality/identity, third-party identity reuse, shared device/IP "laptop farm" infrastructure, DPRK-allocated IP range (175.45.176.0/24), crypto/USDT remittances, accounts in proxy jurisdictions (PRK/CHN/RUS/LA/OZ), and OFAC-designated DPRK front companies (Korea Osong Shipping Co, Chonsurim Trading Corporation, Liaoning China Trade Industry). If an employee, contractor, or customer is flagged as a possible operative of the North Korean remote-worker scheme earning revenue for the DPRK government or its weapons programs, state it explicitly with the indicator codes/evidence, cite the subject's risk score, and recommend: suspend/terminate the engagement and payment channels, screen all entities sharing the identifier cluster, preserve evidence, and escalate to sanctions compliance (UNSCR 2397 repatriation obligation, FATF blacklist countermeasures, OFAC/FinCEN SAR reporting). Never soften a CRITICAL DPRK verdict into a routine warning.`

interface IncomingMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
  imageUrl?: string
}

function buildContextBlock(
  chunks: Array<{ id: string; source: string; title: string; content: string }>,
): string {
  if (chunks.length === 0) {
    return '---\n[NO CONTEXT RETRIEVED] No evidence matched this inquiry. State explicitly which knowledge gap prevents answering.\n---\n'
  }
  return chunks
    .map(
      (c, i) =>
        `---\n[CITATION ${i + 1}] id=${c.id} source=${c.source}\n${c.title}\n${c.content}\n`,
    )
    .join('')
    .concat('---\n')
}

function toModelMessages(messages: IncomingMessage[]) {
  // Trailing turns only; the system prompt and context pack carry grounding.
  return messages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => {
      if (m.role === 'user' && m.imageUrl) {
        return {
          role: 'user' as const,
          content: [
            {
              type: 'text' as const,
              text:
                m.content ||
                'Please analyze this document image using the retrieved context.',
            },
            { type: 'image' as const, image: new URL(m.imageUrl) },
          ],
        }
      }
      return { role: m.role as 'user' | 'assistant', content: m.content }
    })
}

/**
 * Streaming RAG generation. Yields the same SSE envelope the original
 * agentic endpoint established (status, reasoning, content, tool_start,
 * tool_result, done, error) so the frontend contract is preserved.
 */
export async function* runRagAgentStream(params: {
  messages: IncomingMessage[]
  activeFilter?: ActiveFilter
}): AsyncGenerator<StreamEvent> {
  const model = getModel()

  yield {
    event: 'init',
    data: {
      model: NVIDIA_MODEL_ID,
      timestamp: Date.now(),
      status: 'RAG pipeline initialized',
    },
  }

  const lastUser = [...params.messages].reverse().find((m) => m.role === 'user')
  const query = lastUser?.content?.trim() || 'compliance overview'

  yield {
    event: 'status',
    data: {
      stage: 'routing',
      message: 'Searching records…',
      timestamp: Date.now(),
    },
  }

  // Stage 1 — deterministic retrieval fan-out, streamed live per retriever.
  const chunks: Array<{
    id: string
    source: string
    title: string
    content: string
  }> = []

  try {
    for await (const step of runRetrieval({
      query,
      activeFilter: params.activeFilter ?? 'all',
    })) {
      const stepId = `ret_${step.retriever}_${Date.now().toString(36)}`

      yield {
        event: 'tool_start',
        data: {
          id: stepId,
          name: step.retriever,
          arguments: step.args,
          status: 'running',
          startedAt: Date.now() - step.durationMs,
        },
      }

      chunks.push(...step.chunks)

      // Enrich the UI tool result: per-chunk summaries let the chat surface
      // which algorithm findings (cycles, DPRK screening, ...) actually fired.
      const chunkSummaries = step.chunks.map((c) => {
        let algorithm: string | undefined
        let detected: number | string | undefined
        try {
          const parsed = JSON.parse(c.content)
          algorithm = parsed?.algorithm
          detected =
            parsed?.totalCyclesFound ??
            parsed?.totalStructuringAlerts ??
            parsed?.totalExposuresFound ??
            parsed?.totalAlerts ??
            (typeof parsed?.patternsDetected === 'number'
              ? parsed.patternsDetected
              : undefined) ??
            (typeof parsed?.clustersIdentified === 'number'
              ? parsed.clustersIdentified
              : undefined) ??
            (Array.isArray(parsed?.suspectedNkWorkers)
              ? parsed.suspectedNkWorkers.length
              : undefined)
        } catch {
          // Non-JSON chunk content — fall back to title-only summary.
        }
        return { id: c.id, title: c.title, algorithm, detected }
      })

      yield {
        event: 'tool_result',
        data: {
          id: stepId,
          name: step.retriever,
          result: {
            source: step.args.source,
            query: step.args.query ?? query,
            chunksRetrieved: step.chunks.length,
            note: step.note ?? null,
            chunkSummaries,
          },
          status: 'completed',
          durationMs: step.durationMs,
        },
      }
    }
  } catch (err: any) {
    yield {
      event: 'error',
      data: { message: err?.message || 'Retrieval failed' },
    }
    yield {
      event: 'done',
      data: { completedAt: Date.now(), model: NVIDIA_MODEL_ID },
    }
    return
  }

  // Stage 2 — grounded generation via the AI SDK.
  if (!model) {
    yield {
      event: 'error',
      data: {
        message:
          'NVIDIA_API_KEY is not configured — cannot run grounded generation.',
      },
    }
    yield {
      event: 'done',
      data: { completedAt: Date.now(), model: NVIDIA_MODEL_ID },
    }
    return
  }

  const contextBlock =
    chunks.length > 0 ? buildContextBlock(chunks) : buildContextBlock([])

  try {
    const result = streamText({
      model,
      system:
        GROUNDING_SYSTEM_PROMPT +
        `

CONTEXT BLOCK (retrieved evidence; cite by id):
${contextBlock}`,
      messages: toModelMessages(params.messages),
      temperature: 0.5,
      topP: 0.95,
      maxOutputTokens: 3072,
      providerOptions: {
        nvidia: { chat_template_kwargs: { enable_thinking: true } },
      },
    })

    let contentStarted = false
    let reasoningStarted = false
    for await (const part of result.fullStream) {
      if (part.type === 'reasoning-delta') {
        if (!reasoningStarted) {
          reasoningStarted = true
          yield {
            event: 'status',
            data: {
              stage: 'thinking',
              message: 'Reasoning…',
              timestamp: Date.now(),
            },
          }
        }
        yield { event: 'reasoning', data: { delta: part.text } }
      } else if (part.type === 'text-delta') {
        if (!contentStarted) {
          contentStarted = true
          yield {
            event: 'status',
            data: {
              stage: 'generating',
              message: 'Writing…',
              timestamp: Date.now(),
            },
          }
        }
        yield { event: 'content', data: { delta: part.text } }
      } else if (part.type === 'error') {
        const message = (part.error as any)?.message || 'Generation error'
        yield { event: 'error', data: { message } }
      }
    }
  } catch (err: any) {
    yield {
      event: 'error',
      data: {
        message: err?.message || 'Error occurred during grounded generation',
      },
    }
  }

  yield {
    event: 'done',
    data: { completedAt: Date.now(), model: NVIDIA_MODEL_ID },
  }
}

// Re-export the shared shape for the SSE transport layer.
export type { RetrievalProgress }
