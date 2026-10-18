import { FalkorDBClient } from '../client.js'
import type { RiskTracingResult, SanctionExposure } from '../types.js'

export interface RiskTracingOptions {
  maxHops?: number // default 4
  decayFactor?: number // default 0.65 (each hop reduces exposure)
  baseRisk?: number // default 1.0 for sanctioned entities
}

function parsePathString(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map((item) => String(item))
  }
  if (typeof raw === 'string') {
    // E.g. "[S, M, T]"
    return raw
      .replace(/[\[\]]/g, '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  }
  return []
}

export class RiskTracingDetector {
  private client: FalkorDBClient

  constructor(client: FalkorDBClient) {
    this.client = client
  }

  /**
   * Traces downstream and upstream transaction paths between accounts and OFAC/PEP sanctioned entities.
   * Calculates distance-decayed sanction exposure scores.
   */
  async traceSanctionExposures(
    options: RiskTracingOptions = {},
  ): Promise<RiskTracingResult> {
    const maxHops = options.maxHops ?? 4
    const decayFactor = options.decayFactor ?? 0.65
    const baseRisk = options.baseRisk ?? 1.0

    const exposures: SanctionExposure[] = []
    const seenExposureKeys = new Set<string>()

    // 1. Downstream: Sanctioned Entity -> Target Account (Funds originating from sanctioned source)
    const downstreamQuery = `
      MATCH p = (s:Account {isSanctioned: true})-[:TRANSFERRED*1..${maxHops}]->(t:Account)
      WHERE s.id <> t.id AND (t.isSanctioned IS NULL OR t.isSanctioned = false)
      RETURN s.id AS s_id,
             s.bank AS s_bank,
             t.id AS t_id,
             [n IN nodes(p) | n.id] AS path_nodes,
             length(p) AS hops
      ORDER BY hops ASC
    `

    const downRes = await this.client.query<{
      s_id: string
      s_bank: string
      t_id: string
      path_nodes: unknown
      hops: number
    }>(downstreamQuery)

    for (const row of downRes.data) {
      const key = `${row.s_id}->${row.t_id}`
      if (seenExposureKeys.has(key)) continue
      seenExposureKeys.add(key)

      const hops = Number(row.hops)
      const path = parsePathString(row.path_nodes)
      const decayedScore =
        Math.round(baseRisk * Math.pow(decayFactor, hops - 1) * 100) / 100

      exposures.push({
        targetAccountId: row.t_id,
        sanctionedAccountId: row.s_id,
        sanctionedBank: row.s_bank,
        path,
        hopDistance: hops,
        directTransfer: hops === 1,
        decayedRiskScore: decayedScore,
      })
    }

    // 2. Upstream: Target Account -> Sanctioned Entity (Funds sent to sanctioned target)
    const upstreamQuery = `
      MATCH p = (t:Account)-[:TRANSFERRED*1..${maxHops}]->(s:Account {isSanctioned: true})
      WHERE s.id <> t.id AND (t.isSanctioned IS NULL OR t.isSanctioned = false)
      RETURN s.id AS s_id,
             s.bank AS s_bank,
             t.id AS t_id,
             [n IN nodes(p) | n.id] AS path_nodes,
             length(p) AS hops
      ORDER BY hops ASC
    `

    const upRes = await this.client.query<{
      s_id: string
      s_bank: string
      t_id: string
      path_nodes: unknown
      hops: number
    }>(upstreamQuery)

    for (const row of upRes.data) {
      const key = `${row.t_id}->${row.s_id}`
      if (seenExposureKeys.has(key)) continue
      seenExposureKeys.add(key)

      const hops = Number(row.hops)
      const path = parsePathString(row.path_nodes)
      const decayedScore =
        Math.round(baseRisk * Math.pow(decayFactor, hops - 1) * 100) / 100

      exposures.push({
        targetAccountId: row.t_id,
        sanctionedAccountId: row.s_id,
        sanctionedBank: row.s_bank,
        path,
        hopDistance: hops,
        directTransfer: hops === 1,
        decayedRiskScore: decayedScore,
      })
    }

    exposures.sort((a, b) => b.decayedRiskScore - a.decayedRiskScore || a.hopDistance - b.hopDistance)

    return {
      exposures,
      totalExposuresFound: exposures.length,
    }
  }
}
