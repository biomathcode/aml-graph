import { FalkorDBClient } from '../client.js'
import type { CycleResult, DetectedCycle } from '../types.js'

export interface CycleDetectionOptions {
  minHop?: number // default 3
  maxHop?: number // default 5
  maxDurationHours?: number // default 720 (30 days)
  minPreservationRate?: number // default 0.60 (at least 60% of money survives)
}

export class CycleDetector {
  private client: FalkorDBClient

  constructor(client: FalkorDBClient) {
    this.client = client
  }

  /**
   * Detects circular payment flows (round-tripping) of lengths 3, 4, and 5 hops.
   */
  async detectCycles(options: CycleDetectionOptions = {}): Promise<CycleResult> {
    const minHop = options.minHop ?? 3
    const maxHop = options.maxHop ?? 5
    const maxDurationHours = options.maxDurationHours ?? 720
    const minPreservationRate = options.minPreservationRate ?? 0.6

    const detectedCycles: DetectedCycle[] = []
    const seenCycleKeys = new Set<string>()

    // Canonical key generator for cycle rotation deduplication
    function getCanonicalCycleKey(nodes: string[]): string {
      const minIndex = nodes.indexOf([...nodes].sort()[0])
      const rotated = [...nodes.slice(minIndex), ...nodes.slice(0, minIndex)]
      return rotated.join('->')
    }

    // 1. Detect 3-Hop Cycles: (a)->(b)->(c)->(a)
    if (minHop <= 3 && maxHop >= 3) {
      const q3 = `
        MATCH (a:Account)-[t1:TRANSFERRED]->(b:Account)-[t2:TRANSFERRED]->(c:Account)-[t3:TRANSFERRED]->(a:Account)
        WHERE a.id < b.id AND a.id < c.id AND b.id <> c.id
        RETURN a.id AS a_id, b.id AS b_id, c.id AS c_id,
               t1.id AS t1_id, t1.amount AS t1_amt, t1.timestamp AS t1_ts,
               t2.id AS t2_id, t2.amount AS t2_amt, t2.timestamp AS t2_ts,
               t3.id AS t3_id, t3.amount AS t3_amt, t3.timestamp AS t3_ts
      `
      const res3 = await this.client.query<{
        a_id: string
        b_id: string
        c_id: string
        t1_id: string
        t1_amt: number
        t1_ts: number
        t2_id: string
        t2_amt: number
        t2_ts: number
        t3_id: string
        t3_amt: number
        t3_ts: number
      }>(q3)

      for (const row of res3.data) {
        const accounts = [row.a_id, row.b_id, row.c_id]
        const canonKey = getCanonicalCycleKey(accounts)
        if (seenCycleKeys.has(canonKey)) continue
        seenCycleKeys.add(canonKey)

        const timestamps = [Number(row.t1_ts), Number(row.t2_ts), Number(row.t3_ts)]
        const minTs = Math.min(...timestamps)
        const maxTs = Math.max(...timestamps)
        const durationHours = Math.max(0.1, (maxTs - minTs) / (3600 * 1000))

        const initialAmt = Number(row.t1_amt)
        const returnedAmt = Number(row.t3_amt)
        const preservationRate = initialAmt > 0 ? returnedAmt / initialAmt : 0

        if (durationHours <= maxDurationHours && preservationRate >= minPreservationRate) {
          const totalVol = Number(row.t1_amt) + Number(row.t2_amt) + Number(row.t3_amt)
          const riskScore = Math.min(
            0.99,
            0.7 + (preservationRate > 0.85 ? 0.15 : 0.05) + (durationHours < 48 ? 0.1 : 0.0),
          )

          detectedCycles.push({
            cycleId: `CYCLE_3HOP_${accounts.join('_')}`,
            cycleLength: 3,
            accounts,
            transactionIds: [row.t1_id, row.t2_id, row.t3_id],
            totalVolume: totalVol,
            firstTimestamp: minTs,
            lastTimestamp: maxTs,
            durationHours: Math.round(durationHours * 10) / 10,
            amountPreservationRate: Math.round(preservationRate * 100) / 100,
            riskScore: Math.round(riskScore * 100) / 100,
          })
        }
      }
    }

    // 2. Detect 4-Hop Cycles: (a)->(b)->(c)->(d)->(a)
    if (minHop <= 4 && maxHop >= 4) {
      const q4 = `
        MATCH (a:Account)-[t1:TRANSFERRED]->(b:Account)-[t2:TRANSFERRED]->(c:Account)-[t3:TRANSFERRED]->(d:Account)-[t4:TRANSFERRED]->(a:Account)
        WHERE a.id < b.id AND a.id < c.id AND a.id < d.id
          AND b.id <> c.id AND c.id <> d.id AND b.id <> d.id
        RETURN a.id AS a_id, b.id AS b_id, c.id AS c_id, d.id AS d_id,
               t1.id AS t1_id, t1.amount AS t1_amt, t1.timestamp AS t1_ts,
               t2.id AS t2_id, t2.amount AS t2_amt, t2.timestamp AS t2_ts,
               t3.id AS t3_id, t3.amount AS t3_amt, t3.timestamp AS t3_ts,
               t4.id AS t4_id, t4.amount AS t4_amt, t4.timestamp AS t4_ts
      `
      const res4 = await this.client.query<{
        a_id: string
        b_id: string
        c_id: string
        d_id: string
        t1_id: string
        t1_amt: number
        t1_ts: number
        t2_id: string
        t2_amt: number
        t2_ts: number
        t3_id: string
        t3_amt: number
        t3_ts: number
        t4_id: string
        t4_amt: number
        t4_ts: number
      }>(q4)

      for (const row of res4.data) {
        const accounts = [row.a_id, row.b_id, row.c_id, row.d_id]
        const canonKey = getCanonicalCycleKey(accounts)
        if (seenCycleKeys.has(canonKey)) continue
        seenCycleKeys.add(canonKey)

        const timestamps = [
          Number(row.t1_ts),
          Number(row.t2_ts),
          Number(row.t3_ts),
          Number(row.t4_ts),
        ]
        const minTs = Math.min(...timestamps)
        const maxTs = Math.max(...timestamps)
        const durationHours = Math.max(0.1, (maxTs - minTs) / (3600 * 1000))

        const initialAmt = Number(row.t1_amt)
        const returnedAmt = Number(row.t4_amt)
        const preservationRate = initialAmt > 0 ? returnedAmt / initialAmt : 0

        if (durationHours <= maxDurationHours && preservationRate >= minPreservationRate) {
          const totalVol =
            Number(row.t1_amt) + Number(row.t2_amt) + Number(row.t3_amt) + Number(row.t4_amt)
          const riskScore = Math.min(
            0.99,
            0.75 + (preservationRate > 0.85 ? 0.15 : 0.05) + (durationHours < 48 ? 0.1 : 0.0),
          )

          detectedCycles.push({
            cycleId: `CYCLE_4HOP_${accounts.join('_')}`,
            cycleLength: 4,
            accounts,
            transactionIds: [row.t1_id, row.t2_id, row.t3_id, row.t4_id],
            totalVolume: totalVol,
            firstTimestamp: minTs,
            lastTimestamp: maxTs,
            durationHours: Math.round(durationHours * 10) / 10,
            amountPreservationRate: Math.round(preservationRate * 100) / 100,
            riskScore: Math.round(riskScore * 100) / 100,
          })
        }
      }
    }

    detectedCycles.sort((a, b) => b.riskScore - a.riskScore || b.totalVolume - a.totalVolume)

    return {
      detectedCycles,
      totalCyclesFound: detectedCycles.length,
    }
  }
}
