import { FalkorDBClient } from './client.js'
import type { AMLDataset, IdentifierType } from './types.js'

export interface LoadDatasetResult {
  success: boolean
  graphName: string
  accountsLoaded: number
  personsLoaded: number
  identifiersLoaded: number
  ownershipEdgesLoaded: number
  transactionsLoaded: number
  executionTimeMs: number
}

export class AMLDataLoader {
  private client: FalkorDBClient

  constructor(client: FalkorDBClient) {
    this.client = client
  }

  /**
   * Creates essential schema indexes for high performance query execution.
   */
  async ensureSchema(): Promise<void> {
    const indexQueries = [
      'CREATE INDEX ON :Account(id)',
      'CREATE INDEX ON :Account(accountNumber)',
      'CREATE INDEX ON :Person(id)',
      'CREATE INDEX ON :Identifier(val)',
      'CREATE INDEX ON :Identifier(type)',
    ]

    for (const q of indexQueries) {
      try {
        await this.client.execute(q)
      } catch (err: unknown) {
        // FalkorDB may error if index already exists; safely ignore
        const msg = (err as Error).message
        if (!msg.includes('already exists') && !msg.includes('Index already exists')) {
          // Non-fatal index warning
        }
      }
    }
  }

  /**
   * Ingests a complete AML dataset into FalkorDB.
   */
  async loadDataset(dataset: AMLDataset): Promise<LoadDatasetResult> {
    const startTime = Date.now()

    // 1. Ensure schema indexes
    await this.ensureSchema()

    // 2. Load Persons & their Identifiers
    let identifiersLoaded = 0
    for (const p of dataset.persons) {
      const escape = (str?: string) => (str ? str.replace(/'/g, "\\'") : '')
      const personCypher = `
        MERGE (p:Person {id: '${escape(p.id)}'})
        SET p.name = '${escape(p.name)}',
            p.nationality = '${escape(p.nationality)}',
            p.isPEP = ${Boolean(p.isPEP)},
            p.isSanctioned = ${Boolean(p.isSanctioned)}
      `
      await this.client.execute(personCypher)

      // Identifiers to link
      const identifiers: Array<{ type: IdentifierType; value?: string }> = [
        { type: 'phone', value: p.phone },
        { type: 'email', value: p.email },
        { type: 'address', value: p.address },
        { type: 'taxId', value: p.taxId },
        { type: 'deviceId', value: p.deviceId },
        { type: 'ip', value: p.ipAddress },
      ]

      for (const idf of identifiers) {
        if (!idf.value) continue
        const idfVal = escape(idf.value)
        const idfType = idf.type
        const idfCypher = `
          MERGE (i:Identifier {type: '${idfType}', val: '${idfVal}'})
          WITH i
          MATCH (p:Person {id: '${escape(p.id)}'})
          MERGE (p)-[:HAS_IDENTIFIER {type: '${idfType}'}]->(i)
        `
        await this.client.execute(idfCypher)
        identifiersLoaded++
      }
    }

    // 3. Load Accounts
    for (const acc of dataset.accounts) {
      const escape = (str: string) => str.replace(/'/g, "\\'")
      const accCypher = `
        MERGE (a:Account {id: '${escape(acc.id)}'})
        SET a.accountNumber = '${escape(acc.accountNumber)}',
            a.bank = '${escape(acc.bank)}',
            a.country = '${escape(acc.country)}',
            a.type = '${escape(acc.type)}',
            a.balance = ${acc.balance},
            a.isSanctioned = ${Boolean(acc.isSanctioned)},
            a.isPEP = ${Boolean(acc.isPEP)},
            a.initialRiskScore = ${acc.initialRiskScore ?? 0.0}
      `
      await this.client.execute(accCypher)
    }

    // 4. Load Ownership edges
    let ownershipCount = 0
    for (const own of dataset.ownership) {
      const escape = (str: string) => str.replace(/'/g, "\\'")
      const ownCypher = `
        MATCH (p:Person {id: '${escape(own.personId)}'})
        MATCH (a:Account {id: '${escape(own.accountId)}'})
        MERGE (p)-[:OWNS {role: '${escape(own.role || 'owner')}'}]->(a)
      `
      await this.client.execute(ownCypher)
      ownershipCount++
    }

    // 5. Load Transactions as TRANSFERRED edges
    let txCount = 0
    for (const tx of dataset.transactions) {
      const escape = (str: string) => str.replace(/'/g, "\\'")
      const txCypher = `
        MATCH (src:Account {id: '${escape(tx.sourceAccountId)}'})
        MATCH (dst:Account {id: '${escape(tx.targetAccountId)}'})
        CREATE (src)-[:TRANSFERRED {
          id: '${escape(tx.id)}',
          amount: ${tx.amount},
          currency: '${escape(tx.currency)}',
          timestamp: ${tx.timestamp},
          type: '${escape(tx.type)}',
          groundTruthTypology: '${escape(tx.groundTruthTypology || 'normal')}'
        }]->(dst)
      `
      await this.client.execute(txCypher)
      txCount++
    }

    const duration = Date.now() - startTime

    return {
      success: true,
      graphName: this.client.graphName,
      accountsLoaded: dataset.accounts.length,
      personsLoaded: dataset.persons.length,
      identifiersLoaded,
      ownershipEdgesLoaded: ownershipCount,
      transactionsLoaded: txCount,
      executionTimeMs: duration,
    }
  }

  /**
   * Clears all nodes and edges from the graph without deleting indexes.
   */
  async clearGraph(): Promise<void> {
    await this.client.execute('MATCH (n) DETACH DELETE n')
  }
}
