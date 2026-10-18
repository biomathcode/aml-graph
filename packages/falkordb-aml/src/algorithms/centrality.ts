import { FalkorDBClient } from '../client.js'
import type { CentralityResult, FlowHubNode, PageRankNode } from '../types.js'

export class CentralityDetector {
  private client: FalkorDBClient

  constructor(client: FalkorDBClient) {
    this.client = client
  }

  /**
   * Executes PageRank and Flow Centrality to identify central financial hubs and conduits.
   */
  async computeCentrality(): Promise<CentralityResult> {
    const pageRankNodes: PageRankNode[] = []

    try {
      const prRes = await this.client.query<{
        node: { id?: string; accountNumber?: string; [key: string]: unknown }
        score: string | number
      }>("CALL algo.pageRank('Account', 'TRANSFERRED')")

      for (const row of prRes.data) {
        const accountId = (row.node?.id as string) || ''
        const accountNumber = (row.node?.accountNumber as string) || accountId
        const score = typeof row.score === 'string' ? parseFloat(row.score) : Number(row.score)
        if (accountId) {
          pageRankNodes.push({
            accountId,
            accountNumber,
            score: Math.round(score * 10000) / 10000,
            rank: 0,
          })
        }
      }
    } catch {
      // Fallback: Degree-weighted centrality if algo.pageRank procedure is unavailable
      const fallbackQuery = `
        MATCH (a:Account)
        OPTIONAL MATCH (src:Account)-[t_in:TRANSFERRED]->(a)
        OPTIONAL MATCH (a)-[t_out:TRANSFERRED]->(dst:Account)
        RETURN a.id AS accountId,
               a.accountNumber AS accountNumber,
               count(DISTINCT t_in) AS in_degree,
               count(DISTINCT t_out) AS out_degree
      `
      const fbRes = await this.client.query<{
        accountId: string
        accountNumber: string
        in_degree: number
        out_degree: number
      }>(fallbackQuery)

      for (const row of fbRes.data) {
        const deg = Number(row.in_degree || 0) + Number(row.out_degree || 0)
        pageRankNodes.push({
          accountId: row.accountId,
          accountNumber: row.accountNumber || row.accountId,
          score: deg / 10,
          rank: 0,
        })
      }
    }

    // Sort and assign ranks
    pageRankNodes.sort((a, b) => b.score - a.score)
    pageRankNodes.forEach((node, idx) => {
      node.rank = idx + 1
    })

    // Compute Flow Hub roles using Cypher aggregations
    const flowQuery = `
      MATCH (a:Account)
      OPTIONAL MATCH (src:Account)-[t_in:TRANSFERRED]->(a)
      OPTIONAL MATCH (a)-[t_out:TRANSFERRED]->(dst:Account)
      RETURN a.id AS accountId,
             count(DISTINCT t_in) AS in_degree,
             count(DISTINCT t_out) AS out_degree,
             coalesce(sum(t_in.amount), 0) AS in_volume,
             coalesce(sum(t_out.amount), 0) AS out_volume
    `
    const flowRes = await this.client.query<{
      accountId: string
      in_degree: number
      out_degree: number
      in_volume: number
      out_volume: number
    }>(flowQuery)

    const flowHubs: FlowHubNode[] = []

    for (const r of flowRes.data) {
      const inDeg = Number(r.in_degree || 0)
      const outDeg = Number(r.out_degree || 0)
      const inVol = Number(r.in_volume || 0)
      const outVol = Number(r.out_volume || 0)

      if (inDeg === 0 && outDeg === 0) continue

      const flowRatio =
        outDeg > 0 ? Math.round((inDeg / outDeg) * 100) / 100 : inDeg > 0 ? 10.0 : 1.0

      let role: FlowHubNode['role'] = 'balanced'
      if (inDeg >= 3 && outDeg <= 1) {
        role = 'funnel_aggregator'
      } else if (outDeg >= 3 && inDeg <= 1) {
        role = 'dispersion_source'
      } else if (inDeg >= 2 && outDeg >= 2) {
        role = 'transit_hub'
      }

      flowHubs.push({
        accountId: r.accountId,
        inDegree: inDeg,
        outDegree: outDeg,
        inVolume: inVol,
        outVolume: outVol,
        flowRatio,
        role,
      })
    }

    flowHubs.sort((a, b) => b.inVolume + b.outVolume - (a.inVolume + a.outVolume))

    return {
      pageRank: pageRankNodes,
      flowHubs,
    }
  }
}
