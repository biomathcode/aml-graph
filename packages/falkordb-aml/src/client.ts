import { Redis, type RedisOptions } from 'ioredis'

export interface FalkorDBConfig {
  host?: string
  port?: number
  password?: string
  graphName?: string
  redisUrl?: string
  retryAttempts?: number
}

export interface QueryStats {
  nodesCreated?: number
  nodesDeleted?: number
  relationshipsCreated?: number
  relationshipsDeleted?: number
  propertiesSet?: number
  labelsAdded?: number
  internalExecutionTimeMs?: number
  raw: string[]
}

export interface QueryResult<T = Record<string, unknown>> {
  data: T[]
  stats: QueryStats
}

function parseStringList(str: string): unknown[] {
  const inner = str.slice(1, -1).trim()
  if (!inner) return []
  const parts = inner.split(',').map((s) => s.trim())
  return parts.map((part) => {
    if (
      (part.startsWith('"') && part.endsWith('"')) ||
      (part.startsWith("'") && part.endsWith("'"))
    ) {
      return part.slice(1, -1)
    }
    if (!isNaN(Number(part)) && part !== '') {
      return Number(part)
    }
    return part
  })
}

/**
 * Parses raw FalkorDB cell values into clean JavaScript objects/primitives.
 */
function parseCellValue(val: unknown): unknown {
  if (val === null || val === undefined) return null

  // If scalar (number, string, boolean)
  if (typeof val !== 'object') {
    if (val === 'true') return true
    if (val === 'false') return false
    if (typeof val === 'string' && val.startsWith('[') && val.endsWith(']')) {
      return parseStringList(val)
    }
    return val
  }

  if (Array.isArray(val)) {
    // Check if it's a Node structure: [["id", n], ["labels", [...]], ["properties", [...]]]
    const isNode =
      val.length >= 3 &&
      Array.isArray(val[0]) &&
      val[0][0] === 'id' &&
      Array.isArray(val[1]) &&
      val[1][0] === 'labels'

    if (isNode) {
      const nodeProps: Record<string, unknown> = {
        _id: val[0][1],
        _labels: val[1][1],
      }
      const propsEntry = val.find(
        (entry) => Array.isArray(entry) && entry[0] === 'properties',
      )
      if (propsEntry && Array.isArray(propsEntry[1])) {
        for (const [propKey, propVal] of propsEntry[1]) {
          nodeProps[propKey] = parseCellValue(propVal)
        }
      }
      return nodeProps
    }

    // Check if it's a Relationship structure: [["id", n], ["type", "..."], ["src_node", n], ["dest_node", n], ["properties", [...]]]
    const isRel =
      val.length >= 4 &&
      Array.isArray(val[0]) &&
      val[0][0] === 'id' &&
      Array.isArray(val[1]) &&
      val[1][0] === 'type'

    if (isRel) {
      const relProps: Record<string, unknown> = {
        _id: val[0][1],
        _type: val[1][1],
        _src: val[2][1],
        _dest: val[3][1],
      }
      const propsEntry = val.find(
        (entry) => Array.isArray(entry) && entry[0] === 'properties',
      )
      if (propsEntry && Array.isArray(propsEntry[1])) {
        for (const [propKey, propVal] of propsEntry[1]) {
          relProps[propKey] = parseCellValue(propVal)
        }
      }
      return relProps
    }

    // Check if it's a Path structure
    // Otherwise it's a regular array of items
    return val.map((item) => parseCellValue(item))
  }

  return val
}

function parseStats(statsArray: string[]): QueryStats {
  const stats: QueryStats = { raw: statsArray }
  for (const s of statsArray) {
    if (typeof s !== 'string') continue
    const lower = s.toLowerCase()
    const numMatch = s.match(/(\d+(\.\d+)?)/)
    const num = numMatch ? parseFloat(numMatch[1]) : 0

    if (lower.includes('nodes created')) stats.nodesCreated = num
    else if (lower.includes('nodes deleted')) stats.nodesDeleted = num
    else if (lower.includes('relationships created')) stats.relationshipsCreated = num
    else if (lower.includes('relationships deleted')) stats.relationshipsDeleted = num
    else if (lower.includes('properties set')) stats.propertiesSet = num
    else if (lower.includes('labels added')) stats.labelsAdded = num
    else if (lower.includes('internal execution time')) stats.internalExecutionTimeMs = num
  }
  return stats
}

export class FalkorDBClient {
  public redis: Redis
  public graphName: string
  private isExternalRedis: boolean

  constructor(config: FalkorDBConfig = {}, existingRedis?: Redis) {
    this.graphName = config.graphName || process.env.FALKORDB_GRAPH || 'openkyc_aml'

    if (existingRedis) {
      this.redis = existingRedis
      this.isExternalRedis = true
    } else if (config.redisUrl) {
      this.redis = new Redis(config.redisUrl, { maxRetriesPerRequest: 3 })
      this.isExternalRedis = false
    } else {
      const host = config.host || process.env.FALKORDB_HOST || '127.0.0.1'
      const port = config.port || parseInt(process.env.FALKORDB_PORT || '6380', 10)
      const password = config.password || process.env.FALKORDB_PASSWORD || undefined

      const redisOptions: RedisOptions = {
        host,
        port,
        password,
        maxRetriesPerRequest: config.retryAttempts ?? 3,
        enableReadyCheck: true,
      }
      this.redis = new Redis(redisOptions)
      this.isExternalRedis = false
    }

    this.redis.on('error', (err) => {
      // Avoid unhandled crash if redis disconnects temporarily
      console.warn(`[FalkorDBClient] Redis connection warning: ${err.message}`)
    })
  }

  async ping(): Promise<boolean> {
    try {
      const pong = await this.redis.ping()
      return pong === 'PONG'
    } catch {
      return false
    }
  }

  /**
   * Executes a Cypher query on FalkorDB using GRAPH.QUERY.
   */
  async query<T = Record<string, unknown>>(
    cypher: string,
    params?: Record<string, unknown>,
  ): Promise<QueryResult<T>> {
    let formattedCypher = cypher

    // If query has parameters, prepend Cypher parameter statements if needed,
    // or string-substitute numeric/string literals safely.
    if (params && Object.keys(params).length > 0) {
      // Cypher parameter prefix
      const paramAssignments = Object.entries(params)
        .map(([k, v]) => `CYPHER ${k}=${JSON.stringify(v)}`)
        .join(' ')
      formattedCypher = `${paramAssignments} ${cypher}`
    }

    try {
      const rawRes = (await this.redis.call(
        'GRAPH.QUERY',
        this.graphName,
        formattedCypher,
      )) as [string[], unknown[][], string[]]

      if (!Array.isArray(rawRes) || rawRes.length < 2) {
        return { data: [], stats: { raw: [] } }
      }

      const headers = rawRes[0] || []
      const rows = rawRes[1] || []
      const statsRaw = rawRes[2] || []

      const data: T[] = rows.map((row) => {
        const obj: Record<string, unknown> = {}
        headers.forEach((header, idx) => {
          obj[header] = parseCellValue(row[idx])
        })
        return obj as T
      })

      return {
        data,
        stats: parseStats(statsRaw),
      }
    } catch (error: unknown) {
      const err = error as Error
      throw new Error(`[FalkorDB] Query failed for graph '${this.graphName}': ${err.message}\nQuery: ${cypher}`)
    }
  }

  /**
   * Executes a query without returning data (e.g. schema index creation, deletions).
   */
  async execute(cypher: string): Promise<QueryStats> {
    const res = await this.query(cypher)
    return res.stats
  }

  /**
   * Deletes the active graph from FalkorDB.
   */
  async deleteGraph(): Promise<boolean> {
    try {
      await this.redis.call('GRAPH.DELETE', this.graphName)
      return true
    } catch (err: unknown) {
      const msg = (err as Error).message
      // If graph doesn't exist, treat as success
      if (
        msg.includes("doesn't exist") ||
        msg.includes('not found') ||
        msg.includes('empty key') ||
        msg.includes('Invalid graph operation on empty key')
      ) {
        return true
      }
      throw err
    }
  }

  /**
   * Disconnects underlying Redis client if owned by this instance.
   */
  async close(): Promise<void> {
    if (!this.isExternalRedis) {
      await this.redis.quit().catch(() => this.redis.disconnect())
    }
  }
}
