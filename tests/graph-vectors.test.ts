import { describe, expect, it, vi } from 'vitest'
import type { FalkorDBClient } from '../packages/falkordb-aml/src/index.js'
import {
  documentEmbeddingText,
  embedSessionGraph,
  personEmbeddingText,
  vectorLiteral,
} from '../server/aml/graph-vectors.js'

type StubClient = Pick<FalkorDBClient, 'query' | 'execute'>

function stubFalkor(options: {
  documents?: Array<Record<string, unknown>>
  subjects?: Array<Record<string, unknown>>
}) {
  const calls: string[] = []
  const client: StubClient = {
    query: (async (cypher: string) => {
      calls.push(cypher)
      if (cypher.includes('MATCH (d:Document)')) {
        return {
          data: (options.documents ?? []).map((d) => ({ d })),
          stats: { raw: [] },
        }
      }
      if (cypher.includes('MATCH (p:Person')) {
        return {
          data: (options.subjects ?? []).map((p) => ({ p })),
          stats: { raw: [] },
        }
      }
      return { data: [], stats: { raw: [] } }
    }) as StubClient['query'],
    execute: (async (cypher: string) => {
      calls.push(cypher)
      return { raw: [] }
    }) as StubClient['execute'],
  }
  return { client, calls }
}

describe('graph vector helpers', () => {
  it('renders vecf32 literals with non-finite values zeroed', () => {
    expect(vectorLiteral([0.5, -1, 2])).toBe('vecf32([0.5,-1,2])')
    expect(vectorLiteral([Number.NaN, Number.POSITIVE_INFINITY, 0])).toBe(
      'vecf32([0,0,0])',
    )
  })

  it('builds deterministic document embedding text from business props', () => {
    const text = documentEmbeddingText({
      id: 'doc_s1_passport',
      documentType: 'passport',
      documentNumber: 'P88349124',
      category: 'identity',
      closingBalance: 0,
      verifiedAt: 1712345678,
      ocrEngine: 'indra-ocr',
      embedding: '<0.1, 0.2>',
      _id: 3,
      _labels: ['Document'],
    })
    expect(text).toBe(
      'KYC document record. category: identity. closing balance: 0. document number: P88349124. document type: passport',
    )
  })

  it('builds deterministic subject embedding text', () => {
    const text = personEmbeddingText({
      id: 'session-1',
      name: 'Alexander Vance',
      firstName: 'Alexander',
      lastName: 'Vance',
      nationality: 'United Kingdom',
      dob: '1985-07-15',
      updatedAt: 123,
      _id: 1,
      _labels: ['Person'],
    })
    expect(text).toBe(
      'KYC subject record. dob: 1985-07-15. first name: Alexander. last name: Vance. name: Alexander Vance. nationality: United Kingdom',
    )
  })

  it('embeds the session nodes and creates both vector indexes', async () => {
    const { client, calls } = stubFalkor({
      documents: [
        {
          id: 'doc_s1_passport',
          documentType: 'passport',
          documentNumber: 'P1',
          _id: 1,
          _labels: ['Document'],
        },
        {
          id: 'doc_s1_bank_statement',
          documentType: 'bank_statement',
          account_number: 'ACCT-71',
          _id: 2,
          _labels: ['Document'],
        },
      ],
      subjects: [
        {
          id: 's1',
          name: 'Grace Miller',
          nationality: 'United States',
          _id: 3,
          _labels: ['Person'],
        },
      ],
    })
    const embed = vi.fn(async (values: string[]) =>
      values.map((_, i) => [i, i + 1, i + 2]),
    )

    const result = await embedSessionGraph(client, 's1', embed)

    expect(result).toEqual({ embedded: 3, dimension: 3 })
    expect(embed).toHaveBeenCalledTimes(1)
    const [texts] = embed.mock.calls[0]
    expect(texts).toHaveLength(3)
    expect(texts[0]).toContain('document type: passport')
    expect(texts[2]).toContain('name: Grace Miller')
    expect(calls.some((c) => c.includes('CREATE VECTOR INDEX FOR (n:Document)'))).toBe(
      true,
    )
    expect(calls.some((c) => c.includes('CREATE VECTOR INDEX FOR (n:Person)'))).toBe(
      true,
    )
    expect(
      calls.some((c) =>
        c.includes(
          "MATCH (n:Document {id: 'doc_s1_passport'}) SET n.embedding = vecf32([0,1,2])",
        ),
      ),
    ).toBe(true)
    expect(
      calls.some((c) => c.includes("SET n.embedding = vecf32([2,3,4])")),
    ).toBe(true)
  })

  it('skips graph writes when the embedding provider is unavailable', async () => {
    const { client, calls } = stubFalkor({
      documents: [{ id: 'doc_s1_passport', documentType: 'passport' }],
      subjects: [{ id: 's1', name: 'Grace Miller' }],
    })
    const result = await embedSessionGraph(client, 's1', async () => null)
    expect(result).toEqual({
      embedded: 0,
      dimension: null,
      note: 'embedding provider unavailable',
    })
    expect(calls.filter((c) => c.includes('CREATE VECTOR INDEX'))).toHaveLength(0)
    expect(calls.filter((c) => c.includes('SET n.embedding'))).toHaveLength(0)
  })

  it('reports nothing to embed on an empty session', async () => {
    const { client } = stubFalkor({})
    const embed = vi.fn(async () => [])
    const result = await embedSessionGraph(client, 'missing', embed)
    expect(result).toEqual({
      embedded: 0,
      dimension: null,
      note: 'no ingested nodes found',
    })
    expect(embed).not.toHaveBeenCalled()
  })

  it('keeps going when storing one vector fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { client, calls } = stubFalkor({
      documents: [
        { id: 'doc_s1_passport', documentType: 'passport' },
        { id: 'doc_s1_invoice', documentType: 'invoice' },
      ],
      subjects: [{ id: 's1', name: 'Grace Miller' }],
    })
    const flaky: StubClient = {
      query: client.query,
      execute: async (cypher: string) => {
        calls.push(cypher)
        if (cypher.includes('doc_s1_passport')) throw new Error('write failed')
        return { raw: [] }
      },
    }

    const result = await embedSessionGraph(flaky, 's1', async (values) =>
      values.map(() => [1, 2]),
    )

    expect(result.embedded).toBe(2)
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})
