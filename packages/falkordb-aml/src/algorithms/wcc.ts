import { FalkorDBClient } from '../client.js'
import type { ComponentData, WCCResult } from '../types.js'

export class WCCDetector {
  private client: FalkorDBClient

  constructor(client: FalkorDBClient) {
    this.client = client
  }

  /**
   * Executes Weakly Connected Components on FalkorDB to isolate disconnected payment rings.
   */
  async findComponents(): Promise<WCCResult> {
    const componentMap = new Map<number, string[]>()

    try {
      // 1. Try native FalkorDB procedure
      const wccRes = await this.client.query<{
        node: { id?: string; _labels?: string[]; [key: string]: unknown }
        componentId: number
      }>('CALL algo.WCC()')

      for (const row of wccRes.data) {
        const compId = Number(row.componentId)
        const accountId = (row.node?.id as string) || (row.node?._id?.toString() as string)
        if (!accountId) continue

        if (!componentMap.has(compId)) {
          componentMap.set(compId, [])
        }
        componentMap.get(compId)!.push(accountId)
      }
    } catch {
      // Fallback: Pure Cypher connected components if algo.WCC is unavailable
      const fallbackQuery = `
        MATCH (a:Account)
        OPTIONAL MATCH (a)-[:TRANSFERRED*1..2]-(b:Account)
        RETURN a.id AS acc_a, b.id AS acc_b
      `
      const fallbackRes = await this.client.query<{ acc_a: string; acc_b?: string }>(fallbackQuery)
      const adj = new Map<string, Set<string>>()

      for (const row of fallbackRes.data) {
        if (!adj.has(row.acc_a)) adj.set(row.acc_a, new Set())
        if (row.acc_b) {
          if (!adj.has(row.acc_b)) adj.set(row.acc_b, new Set())
          adj.get(row.acc_a)!.add(row.acc_b)
          adj.get(row.acc_b)!.add(row.acc_a)
        }
      }

      const visited = new Set<string>()
      let cid = 0
      for (const node of adj.keys()) {
        if (visited.has(node)) continue
        const comp: string[] = []
        const q = [node]
        visited.add(node)
        while (q.length > 0) {
          const curr = q.shift()!
          comp.push(curr)
          for (const neighbor of adj.get(curr) || []) {
            if (!visited.has(neighbor)) {
              visited.add(neighbor)
              q.push(neighbor)
            }
          }
        }
        componentMap.set(cid++, comp)
      }
    }

    const components: ComponentData[] = []
    let largestSize = 0

    for (const [compId, accountIds] of componentMap.entries()) {
      if (accountIds.length > largestSize) {
        largestSize = accountIds.length
      }

      // Query internal transaction volume for this component
      let totalVolume = 0
      let txCount = 0
      let hasHighRisk = false

      if (accountIds.length > 0) {
        const idListStr = accountIds.map((id) => `'${id}'`).join(',')
        const statsQuery = `
          MATCH (src:Account)-[t:TRANSFERRED]->(dst:Account)
          WHERE src.id IN [${idListStr}] AND dst.id IN [${idListStr}]
          RETURN count(t) AS tx_count, sum(t.amount) AS total_vol
        `
        const statsRes = await this.client.query<{ tx_count: number; total_vol: number }>(statsQuery)
        if (statsRes.data.length > 0) {
          txCount = Number(statsRes.data[0].tx_count || 0)
          totalVolume = Number(statsRes.data[0].total_vol || 0)
        }

        const riskCheck = `
          MATCH (a:Account)
          WHERE a.id IN [${idListStr}] AND (a.isSanctioned = true OR a.isPEP = true OR a.initialRiskScore >= 0.7)
          RETURN count(a) AS high_risk_count
        `
        const riskRes = await this.client.query<{ high_risk_count: number }>(riskCheck)
        if (riskRes.data.length > 0 && Number(riskRes.data[0].high_risk_count) > 0) {
          hasHighRisk = true
        }
      }

      const riskRating = hasHighRisk
        ? 'HIGH'
        : totalVolume > 50000 || accountIds.length >= 4
          ? 'MEDIUM'
          : 'LOW'

      components.push({
        componentId: compId,
        nodeCount: accountIds.length,
        accountIds,
        totalVolume,
        transactionCount: txCount,
        riskRating,
      })
    }

    // Sort by risk and size
    components.sort((a, b) => b.totalVolume - a.totalVolume)

    return {
      totalComponents: components.length,
      components,
      largestComponentSize: largestSize,
    }
  }
}
