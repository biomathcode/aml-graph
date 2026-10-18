import { FalkorDBClient } from '../../packages/falkordb-aml/src/index.js'
import type { IdentifierType } from '../../packages/falkordb-aml/src/types.js'
import { getFalkorClient } from './client.js'
import {
  graphMappingFor,
  OCR_DOCUMENT_META,
  type OcrDocumentType,
} from './ocr-document-map.js'

export interface OcrGraphIngestionInput {
  sessionId: string
  ownerId: string
  documentType?: string
  extractedFields: {
    first_name?: string
    last_name?: string
    full_name?: string
    document_number?: string
    nationality?: string
    dob?: string
    gender?: string
    address?: string
    tax_id?: string
    account_number?: string
    bank_name?: string
    closing_balance?: string | number
    amount_due?: string | number
    email?: string
    phone_number?: string
    device?: string
    ipAddress?: string
    /** Any additional OCR schema keys (see server/aml/ocr-document-map.ts). */
    [key: string]: string | number | undefined | null
  }
}

export interface OcrGraphIngestionResult {
  personId: string
  documentType: string
  documentNumber: string | null
  nodesCreated: number
  identifiersLinked: number
  accountLinked: boolean
  financialAttributes: Record<string, string | number>
  cypherStatements: string[]
}

/**
 * Escapes single quotes for Cypher query strings.
 */
function escapeCypher(str?: string | number | null): string {
  if (str === undefined || str === null) return ''
  return String(str).replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

function firstPresent(
  fields: Record<string, any>,
  keys?: string[],
): string | null {
  for (const key of keys || []) {
    const val = fields[key]
    if (typeof val === 'string' && val.trim()) return val.trim()
    if (typeof val === 'number' && !Number.isNaN(val)) return String(val)
  }
  return null
}

/**
 * Converts OCR extracted fields into FalkorDB Graph nodes and edges.
 * Creates :Person, :Document, :Identifier, and :Account nodes and establishes
 * relationships. Field-resolution is driven by the per-type registry in
 * server/aml/ocr-document-map.ts so every supported OCR document type lands in
 * the graph (passport, driving_license, national_id, pan_card, utility_bill,
 * bank_statement, tax_form, resume, custom).
 */
export async function ingestOcrIntoGraph(
  input: OcrGraphIngestionInput,
  client?: FalkorDBClient,
): Promise<OcrGraphIngestionResult> {
  const falkor = client || getFalkorClient()

  const f = input.extractedFields
  const documentTypeRaw = input.documentType || 'passport'
  const mapping = graphMappingFor(documentTypeRaw)
  const documentType = OCR_DOCUMENT_META[documentTypeRaw as OcrDocumentType]
    ? documentTypeRaw
    : 'custom'
  const category =
    OCR_DOCUMENT_META[documentTypeRaw as OcrDocumentType]?.category || 'other'
  const cypherStatements: string[] = []

  // --- Subject resolution -------------------------------------------------
  const firstName = firstPresent(f, ['first_name'])
  const lastName = firstPresent(f, ['last_name'])
  const fullName =
    firstPresent(f, ['full_name']) ||
    [firstName, lastName].filter(Boolean).join(' ').trim() ||
    (mapping.nameKeys.length ? firstPresent(f, mapping.nameKeys) : null)
  const displayName = fullName || `Applicant_${input.sessionId.slice(0, 8)}`

  // --- Document number & tax id per document type -------------------------
  const documentNumber = firstPresent(f, mapping.documentNumberKeys)
  const taxId =
    firstPresent(f, mapping.taxIdKeys) || firstPresent(f, ['tax_id'])

  // 1. MERGE Person Node
  const personCypher = `
    MERGE (p:Person {id: '${escapeCypher(input.sessionId)}'})
    SET p.name = '${escapeCypher(displayName)}',
        p.firstName = '${escapeCypher(firstName)}',
        p.lastName = '${escapeCypher(lastName)}',
        p.dob = '${escapeCypher(firstPresent(f, ['dob']))}',
        p.gender = '${escapeCypher(firstPresent(f, ['gender']))}',
        p.nationality = '${escapeCypher(firstPresent(f, ['nationality']))}',
        p.updatedAt = timestamp()
  `
  cypherStatements.push(personCypher)
  await falkor.execute(personCypher).catch(() => {})

  // 2. MERGE Document Node & Link to Person (per-type number resolution)
  const docId = `doc_${input.sessionId}_${documentType}`
  const docCypher = `
    MERGE (d:Document {id: '${escapeCypher(docId)}'})
    SET d.documentType = '${escapeCypher(documentType)}',
        d.category = '${escapeCypher(category)}',
        d.documentNumber = '${escapeCypher(documentNumber)}',
        d.ocrEngine = 'indra-ocr',
        d.verifiedAt = timestamp()
    WITH d
    MATCH (p:Person {id: '${escapeCypher(input.sessionId)}'})
    MERGE (p)-[:SUBMITTED_DOCUMENT]->(d)
  `
  cypherStatements.push(docCypher)
  await falkor.execute(docCypher).catch(() => {})

  // 3. Financial & documentary attributes onto the Document node
  const financialAttributes: Record<string, string | number> = {}
  for (const key of mapping.financialAttributes) {
    const val = firstPresent(f, [key])
    if (val != null && val !== '') financialAttributes[key] = val
  }
  if (Object.keys(financialAttributes).length > 0) {
    const setClause = Object.entries(financialAttributes)
      .map(([key, val]) => `d.${key} = '${escapeCypher(val)}'`)
      .join(', ')
    const attrCypher = `
      MATCH (d:Document {id: '${escapeCypher(docId)}'})
      SET ${setClause}
    `
    cypherStatements.push(attrCypher)
    await falkor.execute(attrCypher).catch(() => {})
  }

  // 4. Extract & Link Identifiers (Deterministic & Probabilistic Identity Anchors)
  const identifiers: Array<{ type: IdentifierType; val?: string | null }> = [
    {
      type: 'documentNumber',
      val: documentNumber || firstPresent(f, mapping.documentNumberKeys),
    },
    { type: 'taxId', val: taxId },
    { type: 'address', val: firstPresent(f, ['address']) },
    { type: 'email', val: firstPresent(f, mapping.emailKeys || ['email']) },
    {
      type: 'phone',
      val: firstPresent(f, mapping.phoneKeys || ['phone_number']),
    },
    { type: 'ip', val: firstPresent(f, ['ipAddress']) },
    { type: 'deviceId', val: firstPresent(f, ['device']) },
  ]

  let identifiersLinked = 0
  for (const idf of identifiers) {
    if (!idf.val) continue
    const cleanVal = String(idf.val).trim().toLowerCase()
    if (!cleanVal) continue

    const idfCypher = `
      MERGE (i:Identifier {type: '${escapeCypher(idf.type)}', val: '${escapeCypher(cleanVal)}'})
      WITH i
      MATCH (p:Person {id: '${escapeCypher(input.sessionId)}'})
      MERGE (p)-[:HAS_IDENTIFIER {type: '${escapeCypher(idf.type)}'}]->(i)
    `
    cypherStatements.push(idfCypher)
    await falkor.execute(idfCypher).catch(() => {})
    identifiersLinked++
  }

  // 5. Extract Financial Accounts (from Bank Statements, Utility Bills, Invoices)
  let accountLinked = false
  const accountNumber = firstPresent(f, ['account_number'])
  if (accountNumber) {
    const accId = `acc_${accountNumber}`
    const bankName = firstPresent(f, mapping.bankKeys) || 'Extracted Bank'
    const balanceRaw = f.closing_balance ?? f.amount_due
    const balanceNum =
      typeof balanceRaw === 'number'
        ? balanceRaw
        : parseFloat(String(balanceRaw || '0').replace(/[^0-9.-]+/g, '')) || 0

    const accCypher = `
      MERGE (a:Account {id: '${escapeCypher(accId)}'})
      SET a.accountNumber = '${escapeCypher(accountNumber)}',
          a.bank = '${escapeCypher(bankName)}',
          a.balance = ${balanceNum},
          a.country = '${escapeCypher(firstPresent(f, ['nationality']) || 'US')}',
          a.type = 'checking'
      WITH a
      MATCH (p:Person {id: '${escapeCypher(input.sessionId)}'})
      MERGE (p)-[:OWNS {role: 'owner'}]->(a)
    `
    cypherStatements.push(accCypher)
    await falkor.execute(accCypher).catch(() => {})
    accountLinked = true
  }

  return {
    personId: input.sessionId,
    documentType,
    documentNumber,
    nodesCreated: 1 + (accountLinked ? 1 : 0) + 1 + identifiersLinked,
    identifiersLinked,
    accountLinked,
    financialAttributes,
    cypherStatements,
  }
}
