/**
 * KYC document retriever backed by the FalkorDB knowledge graph.
 *
 * The OCR → graph → AML pipeline ingests every submitted document into
 * FalkorDB as a :Document node (type, extracted number, financial attributes)
 * linked to its :Person subject, and stores an embedding on both node types
 * (nvidia/nemotron-3-embed-1b). This retriever therefore runs two modes:
 *
 *   1. Semantic — embed the query and rank :Document/:Person nodes with the
 *      graph vector indexes (`db.idx.vector.queryNodes`).
 *   2. Keyword — deterministic containment match over document metadata, used
 *      when the graph has no vectors or the embedding provider is unavailable.
 */

import type { FalkorDBClient } from '../../../packages/falkordb-aml/src/index.js'
import { getFalkorClient } from '../../aml/client.js'
import {
  DOCUMENT_LABEL,
  PERSON_LABEL,
  documentSubjectNames,
  hasGraphEmbeddings,
  semanticSearch,
} from '../../aml/graph-vectors.js'
import { embedText } from '../embeddings.js'
import type { ContextChunk } from './types.js'

const STOP_WORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'what',
  'which',
  'about',
  'from',
  'show',
  'list',
  'are',
  'was',
  'has',
  'have',
  'all',
  'its',
  'this',
  'that',
  'documents',
  'document',
  'records',
  'customer',
  'customers',
  'subject',
  'subjects',
  'any',
  'does',
  'were',
  'their',
])

function queryTerms(userQuery: string): string[] {
  return Array.from(
    new Set(
      (userQuery.toLowerCase().match(/[a-z0-9][a-z0-9_-]{2,}/g) || []).filter(
        (term) => !STOP_WORDS.has(term),
      ),
    ),
  ).slice(0, 4)
}

function escapeCypher(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

interface DocumentRow {
  id?: string
  documentType?: string
  documentNumber?: string
  category?: string
  personId?: string
  personName?: string
}

interface TypeCountRow {
  type?: string
  count?: number | string
}

function prop(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

/**
 * Semantic chunk: documents and subjects ranked by query-embedding cosine
 * similarity. Returns null when the provider/graph cannot serve vectors.
 */
async function semanticChunk(
  falkor: FalkorDBClient,
  userQuery: string,
): Promise<ContextChunk | null> {
  if (!(await hasGraphEmbeddings(falkor))) return null
  const queryVector = await embedText(userQuery)
  if (!queryVector) return null

  const [documents, subjects] = await Promise.all([
    semanticSearch(falkor, DOCUMENT_LABEL, queryVector, 12),
    semanticSearch(falkor, PERSON_LABEL, queryVector, 6),
  ])
  if (documents.length === 0 && subjects.length === 0) return null
  const subjectNames = await documentSubjectNames(
    falkor,
    documents.map((hit) => hit.id),
  )

  const lines: string[] = []
  if (documents.length) {
    lines.push(`Documents (${documents.length}):`)
    for (const hit of documents) {
      const parts = [
        prop(hit.props.documentType) ? `type=${prop(hit.props.documentType)}` : null,
        prop(hit.props.documentNumber)
          ? `number=${prop(hit.props.documentNumber)}`
          : null,
        prop(hit.props.category) ? `category=${prop(hit.props.category)}` : null,
        subjectNames.has(hit.id) ? `subject="${subjectNames.get(hit.id)}"` : null,
      ].filter(Boolean)
      lines.push(
        `- ${hit.id}: ${parts.join(' | ')} | similarity=${hit.score.toFixed(3)}`,
      )
    }
  }
  if (subjects.length) {
    lines.push(`Subjects (${subjects.length}):`)
    for (const hit of subjects) {
      const parts = [
        prop(hit.props.name) ? `name=${prop(hit.props.name)}` : null,
        prop(hit.props.nationality)
          ? `nationality=${prop(hit.props.nationality)}`
          : null,
        prop(hit.props.dob) ? `dob=${prop(hit.props.dob)}` : null,
        prop(hit.props.gender) ? `gender=${prop(hit.props.gender)}` : null,
      ].filter(Boolean)
      lines.push(
        `- ${hit.id}: ${parts.join(' | ')} | similarity=${hit.score.toFixed(3)}`,
      )
    }
  }

  return {
    id: 'doc:graph:semantic',
    source: 'kyc-documents',
    title: 'KYC semantic graph matches (embedding search)',
    content: [
      'Semantic matches from the FalkorDB knowledge graph (nvidia/nemotron-3-embed-1b vectors).',
      ...lines,
    ].join('\n'),
    score: 0.8,
  }
}

export async function retrieveDocuments(
  userQuery: string,
): Promise<ContextChunk[] | null> {
  const falkor = getFalkorClient()
  if (!(await falkor.ping())) return null

  try {
    const semantic = await semanticChunk(falkor, userQuery)
    if (semantic) return [semantic]
  } catch (error) {
    // Keyword fallback below keeps the retriever useful without vectors.
    console.warn(
      `[retrieval] semantic document search unavailable: ${
        error instanceof Error ? error.message : String(error)
      }`,
    )
  }

  const terms = queryTerms(userQuery)
  const termFilter = terms
    .map(
      (term) =>
        `toLower(d.documentType) CONTAINS '${escapeCypher(term)}' OR toLower(d.documentNumber) CONTAINS '${escapeCypher(term)}' OR toLower(p.name) CONTAINS '${escapeCypher(term)}'`,
    )
    .join(' OR ')

  const [documents, typeCounts] = await Promise.all([
    falkor.query<DocumentRow>(
      `MATCH (d:Document) OPTIONAL MATCH (p:Person)-[:SUBMITTED_DOCUMENT]->(d) ${
        termFilter ? `WHERE ${termFilter}` : ''
      } RETURN d.id AS id, d.documentType AS documentType, d.documentNumber AS documentNumber, d.category AS category, p.id AS personId, p.name AS personName LIMIT 20`,
    ),
    falkor.query<TypeCountRow>(
      'MATCH (d:Document) RETURN d.documentType AS type, count(*) AS count',
    ),
  ])

  const overview = typeCounts.data
    .filter((row) => row.type)
    .map((row) => `${row.type}: ${Number(row.count ?? 0)}`)
    .join(', ')

  const lines = documents.data.map((row) => {
    const parts = [
      `type=${row.documentType || 'unknown'}`,
      row.documentNumber ? `number=${row.documentNumber}` : null,
      row.category ? `category=${row.category}` : null,
      row.personName
        ? `subject="${row.personName}" (${row.personId})`
        : 'subject=unlinked',
    ].filter(Boolean)
    return `- ${row.id}: ${parts.join(' | ')}`
  })

  const content = [
    `OCR document records in the FalkorDB knowledge graph (total by type: ${overview || 'none indexed'}).`,
    terms.length
      ? `Matches for ${terms.map((t) => `"${t}"`).join(', ')} (${documents.data.length}):`
      : `Most recently indexed documents (${documents.data.length}):`,
    ...(lines.length ? lines : ['- no matching document records']),
  ].join('\n')

  return [
    {
      id: 'doc:graph:records',
      source: 'kyc-documents',
      title: 'KYC document records (FalkorDB)',
      content,
      score: 0.75,
    },
  ]
}
