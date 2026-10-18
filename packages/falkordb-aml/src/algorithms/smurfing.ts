import { FalkorDBClient } from '../client.js'
import type { FanInPattern, FanOutPattern, SmurfingResult } from '../types.js'

export interface SmurfingOptions {
  reportingThreshold?: number // Default $10,000
  structuringFloor?: number // Default $5,000 (amounts between $5k and $10k)
  minTransactions?: number // Default 3
  timeWindowHours?: number // Default 72 hours
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

export class SmurfingDetector {
  private client: FalkorDBClient

  constructor(client: FalkorDBClient) {
    this.client = client
  }

  /**
   * Detects Fan-In (Structuring/Aggregation) and Fan-Out (Structuring/Dispersion)
   * patterns designed to evade regulatory reporting thresholds.
   */
  async detectSmurfing(options: SmurfingOptions = {}): Promise<SmurfingResult> {
    const threshold = options.reportingThreshold ?? 10000
    const floor = options.structuringFloor ?? 5000
    const minTx = options.minTransactions ?? 3
    const maxWindowHours = options.timeWindowHours ?? 72

    const fanInStructuring: FanInPattern[] = []
    const fanOutStructuring: FanOutPattern[] = []

    // 1. Fan-In Structuring (Many Send -> One Aggregator)
    const fanInCypher = `
      MATCH (src:Account)-[t:TRANSFERRED]->(dest:Account)
      WHERE t.amount >= ${floor} AND t.amount < ${threshold}
      RETURN dest.id AS targetId,
             dest.accountNumber AS targetNum,
             collect(src.id) AS sourceIds,
             collect(t.id) AS txIds,
             collect(t.amount) AS amounts,
             collect(t.timestamp) AS timestamps,
             count(t) AS txCount,
             sum(t.amount) AS totalAmount
    `

    const inRes = await this.client.query<{
      targetId: string
      targetNum: string
      sourceIds: unknown
      txIds: unknown
      amounts: unknown
      timestamps: unknown
      txCount: number
      totalAmount: number
    }>(fanInCypher)

    for (const row of inRes.data) {
      const count = Number(row.txCount)
      if (count < minTx) continue

      const timestamps = toArray<number | string>(row.timestamps).map(Number)
      if (timestamps.length === 0) continue

      const minTs = Math.min(...timestamps)
      const maxTs = Math.max(...timestamps)
      const spanHours = Math.max(0.1, (maxTs - minTs) / (3600 * 1000))

      if (spanHours <= maxWindowHours) {
        const total = Number(row.totalAmount)
        const avg = Math.round(total / count)
        const sourceIds = toArray<string>(row.sourceIds)
        const txIds = toArray<string>(row.txIds)
        const uniqueSources = Array.from(new Set(sourceIds))

        // Structuring risk score: higher for more transactions, tighter window, closer to threshold
        const closenessToThreshold = avg / threshold // e.g. 9500 / 10000 = 0.95
        const riskScore = Math.min(
          0.99,
          Math.round((0.6 + closenessToThreshold * 0.25 + Math.min(count, 10) * 0.02) * 100) / 100,
        )

        fanInStructuring.push({
          targetAccountId: row.targetId,
          targetAccountNumber: row.targetNum || row.targetId,
          sourceAccountIds: uniqueSources,
          transactionCount: count,
          totalAmount: total,
          avgAmount: avg,
          threshold,
          timeWindowHours: Math.round(spanHours * 10) / 10,
          riskScore,
          transactions: txIds,
        })
      }
    }

    // 2. Fan-Out Structuring (One Disperser -> Many Recipient Accounts)
    const fanOutCypher = `
      MATCH (src:Account)-[t:TRANSFERRED]->(dest:Account)
      WHERE t.amount >= ${floor} AND t.amount < ${threshold}
      RETURN src.id AS srcId,
             src.accountNumber AS srcNum,
             collect(dest.id) AS destIds,
             collect(t.id) AS txIds,
             collect(t.amount) AS amounts,
             collect(t.timestamp) AS timestamps,
             count(t) AS txCount,
             sum(t.amount) AS totalAmount
    `

    const outRes = await this.client.query<{
      srcId: string
      srcNum: string
      destIds: unknown
      txIds: unknown
      amounts: unknown
      timestamps: unknown
      txCount: number
      totalAmount: number
    }>(fanOutCypher)

    for (const row of outRes.data) {
      const count = Number(row.txCount)
      if (count < minTx) continue

      const timestamps = toArray<number | string>(row.timestamps).map(Number)
      if (timestamps.length === 0) continue

      const minTs = Math.min(...timestamps)
      const maxTs = Math.max(...timestamps)
      const spanHours = Math.max(0.1, (maxTs - minTs) / (3600 * 1000))

      if (spanHours <= maxWindowHours) {
        const total = Number(row.totalAmount)
        const avg = Math.round(total / count)
        const destIds = toArray<string>(row.destIds)
        const txIds = toArray<string>(row.txIds)
        const uniqueDests = Array.from(new Set(destIds))

        const closenessToThreshold = avg / threshold
        const riskScore = Math.min(
          0.99,
          Math.round((0.6 + closenessToThreshold * 0.25 + Math.min(count, 10) * 0.02) * 100) / 100,
        )

        fanOutStructuring.push({
          sourceAccountId: row.srcId,
          sourceAccountNumber: row.srcNum || row.srcId,
          targetAccountIds: uniqueDests,
          transactionCount: count,
          totalAmount: total,
          avgAmount: avg,
          threshold,
          timeWindowHours: Math.round(spanHours * 10) / 10,
          riskScore,
          transactions: txIds,
        })
      }
    }

    fanInStructuring.sort((a, b) => b.riskScore - a.riskScore || b.totalAmount - a.totalAmount)
    fanOutStructuring.sort((a, b) => b.riskScore - a.riskScore || b.totalAmount - a.totalAmount)

    return {
      fanInStructuring,
      fanOutStructuring,
      totalStructuringAlerts: fanInStructuring.length + fanOutStructuring.length,
    }
  }
}
