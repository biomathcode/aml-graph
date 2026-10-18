import { FalkorDBClient } from '../client.js'
import type { ScatterGatherPattern, ScatterGatherResult } from '../types.js'

export interface ScatterGatherOptions {
  minMules?: number // default 2
  maxTransitHours?: number // default 168 (7 days)
  minGatherRatio?: number // default 0.70 (at least 70% gathered)
}

function toArray<T>(val: unknown): T[] {
  if (Array.isArray(val)) return val as T[]
  if (typeof val === 'string') {
    const trimmed = val.trim()
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      const inner = trimmed.slice(1, -1).trim()
      if (!inner) return []
      return inner.split(',').map((s) => s.trim()) as unknown as T[]
    }
    if (trimmed) return [trimmed as unknown as T]
  }
  return []
}

export class ScatterGatherDetector {
  private client: FalkorDBClient

  constructor(client: FalkorDBClient) {
    this.client = client
  }

  /**
   * Detects multi-mule layering where funds are scattered from an origin
   * across multiple intermediary accounts and gathered at a common beneficiary.
   */
  async detectScatterGather(
    options: ScatterGatherOptions = {},
  ): Promise<ScatterGatherResult> {
    const minMules = options.minMules ?? 2
    const maxTransitHours = options.maxTransitHours ?? 168
    const minGatherRatio = options.minGatherRatio ?? 0.7

    const cypher = `
      MATCH (src:Account)-[t1:TRANSFERRED]->(mule:Account)-[t2:TRANSFERRED]->(dest:Account)
      WHERE src.id <> dest.id AND src.id <> mule.id AND dest.id <> mule.id
        AND t1.timestamp <= t2.timestamp
      RETURN src.id AS srcId,
             dest.id AS destId,
             collect(DISTINCT mule.id) AS muleIds,
             collect(t1.id) AS inboundTxIds,
             collect(t2.id) AS outboundTxIds,
             collect(t1.amount) AS inboundAmounts,
             collect(t2.amount) AS outboundAmounts,
             min(t1.timestamp) AS minInTs,
             max(t2.timestamp) AS maxOutTs
    `

    const res = await this.client.query<{
      srcId: string
      destId: string
      muleIds: unknown
      inboundTxIds: unknown
      outboundTxIds: unknown
      inboundAmounts: unknown
      outboundAmounts: unknown
      minInTs: number
      maxOutTs: number
    }>(cypher)

    const patterns: ScatterGatherPattern[] = []

    for (const row of res.data) {
      const mules = toArray<string>(row.muleIds)
      if (mules.length < minMules) continue

      const minInTs = Number(row.minInTs)
      const maxOutTs = Number(row.maxOutTs)
      const transitVelocityHours = Math.max(0.1, (maxOutTs - minInTs) / (3600 * 1000))

      if (transitVelocityHours > maxTransitHours) continue

      // Calculate amounts
      const inboundAmounts = toArray<number | string>(row.inboundAmounts).map(Number)
      const outboundAmounts = toArray<number | string>(row.outboundAmounts).map(Number)
      const sourceAmount = inboundAmounts.reduce((a, b) => a + b, 0)
      const gatheredAmount = outboundAmounts.reduce((a, b) => a + b, 0)

      if (sourceAmount <= 0) continue

      const gatherRatio = gatheredAmount / sourceAmount
      if (gatherRatio < minGatherRatio) continue

      const leakageRate = Math.max(0, 1.0 - gatherRatio)

      // Risk score: more mules and fast transit increase confidence
      const riskScore = Math.min(
        0.99,
        Math.round(
          (0.7 +
            Math.min(mules.length, 5) * 0.05 +
            (transitVelocityHours < 48 ? 0.1 : 0.0) +
            (leakageRate < 0.1 ? 0.05 : 0.0)) *
            100,
        ) / 100,
      )

      const inTx = toArray<string>(row.inboundTxIds)
      const outTx = toArray<string>(row.outboundTxIds)

      patterns.push({
        patternId: `SCATTER_GATHER_${row.srcId}_TO_${row.destId}`,
        sourceAccountId: row.srcId,
        destinationAccountId: row.destId,
        muleAccountIds: mules,
        sourceAmount,
        gatheredAmount,
        leakageRate: Math.round(leakageRate * 100) / 100,
        transitVelocityHours: Math.round(transitVelocityHours * 10) / 10,
        riskScore,
        inboundTxIds: Array.from(new Set(inTx)),
        outboundTxIds: Array.from(new Set(outTx)),
      })
    }

    patterns.sort((a, b) => b.riskScore - a.riskScore || b.sourceAmount - a.sourceAmount)

    return {
      patterns,
      totalPatternsFound: patterns.length,
    }
  }
}
