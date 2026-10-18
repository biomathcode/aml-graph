import { describe, it, expect } from 'vitest'
import { DEFAULT_OCR_SCHEMAS } from '../server/ocr.js'
import { ingestOcrIntoGraph } from '../server/aml/ocr-to-graph.js'

describe('Indra OCR Schemas & Extraction Engine', () => {
  it('defines comprehensive extraction schemas for all required document types', () => {
    expect(DEFAULT_OCR_SCHEMAS.passport).toBeDefined()
    expect(DEFAULT_OCR_SCHEMAS.driving_license).toBeDefined()
    expect(DEFAULT_OCR_SCHEMAS.national_id).toBeDefined()
    expect(DEFAULT_OCR_SCHEMAS.utility_bill).toBeDefined()
    expect(DEFAULT_OCR_SCHEMAS.bank_statement).toBeDefined()
    expect(DEFAULT_OCR_SCHEMAS.tax_form).toBeDefined()
    expect(DEFAULT_OCR_SCHEMAS.pan_card).toBeDefined()
    expect(DEFAULT_OCR_SCHEMAS.resume).toBeDefined()
    expect(DEFAULT_OCR_SCHEMAS.custom).toBeDefined()
  })

  it('contains expected fields for resume documents', () => {
    const resumeFields = DEFAULT_OCR_SCHEMAS.resume.fields.map((f) => f.key)
    expect(resumeFields).toContain('candidate_name')
    expect(resumeFields).toContain('email')
    expect(resumeFields).toContain('phone')
    expect(resumeFields).toContain('skills')
    expect(resumeFields).toContain('education')
    expect(resumeFields).toContain('current_role')
    expect(resumeFields).toContain('experience_years')
    expect(resumeFields).toContain('linkedin_url')
    expect(resumeFields).toContain('github_url')
  })

  it('contains expected fields for pan card documents', () => {
    const panFields = DEFAULT_OCR_SCHEMAS.pan_card.fields.map((f) => f.key)
    expect(panFields).toContain('pan_number')
    expect(panFields).toContain('full_name')
    expect(panFields).toContain('father_name')
    expect(panFields).toContain('dob')
  })

  it('contains expected fields for passport documents', () => {
    const passportFields = DEFAULT_OCR_SCHEMAS.passport.fields.map((f) => f.key)
    expect(passportFields).toContain('first_name')
    expect(passportFields).toContain('last_name')
    expect(passportFields).toContain('document_number')
    expect(passportFields).toContain('nationality')
    expect(passportFields).toContain('dob')
    expect(passportFields).toContain('expiry_date')
    expect(passportFields).toContain('gender')
    expect(passportFields).toContain('mrz')
  })

  it('contains expected fields for utility bills and proof of address', () => {
    const billFields = DEFAULT_OCR_SCHEMAS.utility_bill.fields.map((f) => f.key)
    expect(billFields).toContain('account_holder')
    expect(billFields).toContain('address')
    expect(billFields).toContain('amount_due')
    expect(billFields).toContain('provider')
  })

  it('contains expected fields for driver licenses', () => {
    const dlFields = DEFAULT_OCR_SCHEMAS.driving_license.fields.map((f) => f.key)
    expect(dlFields).toContain('license_number')
    expect(dlFields).toContain('address')
    expect(dlFields).toContain('dob')
    expect(dlFields).toContain('expiry_date')
  })

  it('correctly maps OCR extracted fields to FalkorDB AML Graph schema', async () => {
    // Mock client to intercept Cypher statements without needing a live FalkorDB instance
    const executedCyphers: string[] = []
    const mockClient = {
      execute: async (query: string) => {
        executedCyphers.push(query)
        return { data: [] }
      },
    } as any

    const result = await ingestOcrIntoGraph(
      {
        sessionId: 'session_test_123',
        ownerId: 'owner_test_123',
        documentType: 'passport',
        extractedFields: {
          first_name: 'Alexander',
          last_name: 'Vance',
          document_number: 'P88349124',
          nationality: 'United Kingdom',
          dob: '14/05/1984',
          address: '42 Baker Street, London, UK',
          account_number: 'GB98BARC20000012345678',
          bank_name: 'Barclays Bank',
          closing_balance: 45000,
        },
      },
      mockClient,
    )

    expect(result.personId).toBe('session_test_123')
    expect(result.accountLinked).toBe(true)
    expect(result.identifiersLinked).toBeGreaterThanOrEqual(2)

    // Check Cypher content
    const allCypher = executedCyphers.join('\n')
    expect(allCypher).toContain(':Person')
    expect(allCypher).toContain('Alexander')
    expect(allCypher).toContain('Vance')
    expect(allCypher).toContain(':Document')
    expect(allCypher).toContain('SUBMITTED_DOCUMENT')
    expect(allCypher).toContain(':Identifier')
    expect(allCypher).toContain('p88349124')
    expect(allCypher).toContain('HAS_IDENTIFIER')
    expect(allCypher).toContain(':Account')
    expect(allCypher).toContain('OWNS')
  })
})
