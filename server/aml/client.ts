/**
 * Shared FalkorDB client for the KYC/AML knowledge graph.
 *
 * FalkorDB speaks the Redis protocol, so the client (ioredis-based, from
 * @open-kyc/falkordb-aml) needs no extra service: the API process talks to
 * FalkorDB directly for graph ingestion, AML algorithms, and agent retrieval.
 *
 * Connection defaults target the local dev FalkorDB container
 * (127.0.0.1:6380); Compose overrides them with the internal service address
 * (falkordb:6379).
 */

import { FalkorDBClient } from '../../packages/falkordb-aml/src/index.js'

let shared: FalkorDBClient | null = null

export function getFalkorClient(): FalkorDBClient {
  if (!shared) {
    shared = new FalkorDBClient({
      host: process.env.FALKORDB_HOST || '127.0.0.1',
      port: Number(process.env.FALKORDB_PORT) || 6380,
      password: process.env.FALKORDB_PASSWORD || undefined,
      graphName: process.env.FALKORDB_GRAPH || 'openkyc_aml',
      retryAttempts: 1,
    })
  }
  return shared
}
