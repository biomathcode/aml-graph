import { FalkorDBClient } from '../client.js'
import type {
  EntityCluster,
  EntityPairMatch,
  EntityResolutionResult,
  IdentifierType,
} from '../types.js'

export interface EntityResolutionOptions {
  similarityThreshold?: number // Default 0.65
  weights?: Partial<Record<IdentifierType, number>>
  createClusterEdges?: boolean
}

const DEFAULT_WEIGHTS: Record<IdentifierType, number> = {
  documentNumber: 1.0,
  taxId: 0.95,
  deviceId: 0.85,
  phone: 0.8,
  email: 0.75,
  ip: 0.65,
  address: 0.55,
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

export class EntityResolutionDetector {
  private client: FalkorDBClient

  constructor(client: FalkorDBClient) {
    this.client = client
  }

  /**
   * Discovers entities that share identifiers (tax ID, phone, email, device ID, address)
   * and groups them into unified identity clusters using graph connectivity.
   */
  async resolveEntities(
    options: EntityResolutionOptions = {},
  ): Promise<EntityResolutionResult> {
    const threshold = options.similarityThreshold ?? 0.65
    const weights = { ...DEFAULT_WEIGHTS, ...options.weights }

    // Cypher query: Find pairs of Person nodes that share one or more Identifiers
    const findSharedCypher = `
      MATCH (p1:Person)-[:HAS_IDENTIFIER]->(i:Identifier)<-[:HAS_IDENTIFIER]-(p2:Person)
      WHERE p1.id < p2.id
      RETURN p1.id AS p1_id,
             p1.name AS p1_name,
             p2.id AS p2_id,
             p2.name AS p2_name,
             collect(i.type) AS shared_types,
             collect(i.val) AS shared_vals
    `

    const res = await this.client.query<{
      p1_id: string
      p1_name: string
      p2_id: string
      p2_name: string
      shared_types: string[]
      shared_vals: string[]
    }>(findSharedCypher)

    const pairwiseMatches: EntityPairMatch[] = []
    const adjacency = new Map<string, Set<string>>()
    const personNames = new Map<string, string>()

    for (const row of res.data) {
      personNames.set(row.p1_id, row.p1_name)
      personNames.set(row.p2_id, row.p2_name)

      const sharedIdentifiers: Array<{ type: IdentifierType; value: string }> = []
      let totalWeight = 0

      const sharedTypes = toArray<string>(row.shared_types)
      const sharedVals = toArray<string>(row.shared_vals)

      for (let i = 0; i < sharedTypes.length; i++) {
        const type = String(sharedTypes[i]) as IdentifierType
        const val = String(sharedVals[i] ?? '')
        sharedIdentifiers.push({ type, value: val })
        const weight = weights[type] ?? 0.5
        totalWeight += weight
      }

      // Normalized similarity score: 1 - product of (1 - weight)
      // Independent probabilities of being the same person
      let probabilitySame = 1.0
      for (const idf of sharedIdentifiers) {
        const w = weights[idf.type] ?? 0.5
        probabilitySame *= 1.0 - w
      }
      const score = Math.round((1.0 - probabilitySame) * 100) / 100

      if (score >= threshold) {
        pairwiseMatches.push({
          personA: row.p1_id,
          personB: row.p2_id,
          personAName: row.p1_name,
          personBName: row.p2_name,
          sharedIdentifiers,
          similarityScore: score,
        })

        if (!adjacency.has(row.p1_id)) adjacency.set(row.p1_id, new Set())
        if (!adjacency.has(row.p2_id)) adjacency.set(row.p2_id, new Set())
        adjacency.get(row.p1_id)!.add(row.p2_id)
        adjacency.get(row.p2_id)!.add(row.p1_id)

        // Optionally create explicit FalkorDB edge
        if (options.createClusterEdges) {
          const edgeCypher = `
            MATCH (p1:Person {id: '${row.p1_id}'}), (p2:Person {id: '${row.p2_id}'})
            MERGE (p1)-[r:SAME_ENTITY_AS {score: ${score}}]->(p2)
          `
          await this.client.execute(edgeCypher).catch(() => {})
        }
      }
    }

    // Connected Components / Graph Clustering for resolved identities
    const visited = new Set<string>()
    const clusters: EntityCluster[] = []
    let clusterIdx = 1

    for (const personId of adjacency.keys()) {
      if (visited.has(personId)) continue

      const component: string[] = []
      const queue = [personId]
      visited.add(personId)

      while (queue.length > 0) {
        const curr = queue.shift()!
        component.push(curr)
        const neighbors = adjacency.get(curr) || new Set()
        for (const n of neighbors) {
          if (!visited.has(n)) {
            visited.add(n)
            queue.push(n)
          }
        }
      }

      // Collect all shared identifiers across this cluster
      const clusterSharedMap = new Map<string, { type: IdentifierType; value: string }>()
      for (const m of pairwiseMatches) {
        if (component.includes(m.personA) && component.includes(m.personB)) {
          for (const s of m.sharedIdentifiers) {
            clusterSharedMap.set(`${s.type}:${s.value}`, s)
          }
        }
      }

      // Query accounts owned across this cluster
      const accountsCypher = `
        MATCH (p:Person)-[:OWNS]->(a:Account)
        WHERE p.id IN [${component.map((id) => `'${id}'`).join(',')}]
        RETURN DISTINCT a.id AS accountId
      `
      const accRes = await this.client.query<{ accountId: string }>(accountsCypher)
      const associatedAccountIds = accRes.data.map((r) => r.accountId)

      const masterId = component[0]
      const masterName = personNames.get(masterId) || masterId

      clusters.push({
        clusterId: `CLUSTER_ENTITY_${clusterIdx++}`,
        masterPersonId: masterId,
        masterPersonName: masterName,
        memberPersonIds: component,
        sharedIdentifiers: Array.from(clusterSharedMap.values()),
        confidence: Math.min(
          0.99,
          pairwiseMatches
            .filter((m) => component.includes(m.personA) && component.includes(m.personB))
            .reduce((max, m) => Math.max(max, m.similarityScore), 0.7),
        ),
        associatedAccountIds,
      })
    }

    // Synthetic Identity Risk Alerts: distinct names sharing deterministic identifiers
    const syntheticAlerts: Array<{
      personId: string
      personName: string
      reason: string
      riskScore: number
    }> = []

    for (const cluster of clusters) {
      const distinctNames = new Set(
        cluster.memberPersonIds.map((id) => personNames.get(id) || id),
      )
      if (distinctNames.size > 1) {
        for (const pid of cluster.memberPersonIds) {
          syntheticAlerts.push({
            personId: pid,
            personName: personNames.get(pid) || pid,
            reason: `Shares key KYC credentials (${cluster.sharedIdentifiers.map((i) => i.type).join(', ')}) with ${cluster.memberPersonIds.length - 1} other entity profiles: [${Array.from(distinctNames).join(', ')}]`,
            riskScore: 0.85,
          })
        }
      }
    }

    return {
      pairwiseMatches,
      clusters,
      syntheticIdentityRiskAlerts: syntheticAlerts,
    }
  }
}
