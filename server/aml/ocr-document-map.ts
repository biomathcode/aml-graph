/**
 * Canonical registry of supported OCR document types.
 *
 * Every type in DEFAULT_OCR_SCHEMAS (server/ocr.ts) must appear here with the
 * field aliases needed by downstream consumers:
 *   - graph ingestion (server/aml/ocr-to-graph.ts)
 *   - the OCR → graph → AML pipeline (server/aml/pipeline.ts)
 *
 * Field keys reference the OCR schema keys of the matching document_type.
 */

export interface OcrDocumentGraphMapping {
  /** Schema keys that carry the primary document/credential number. */
  documentNumberKeys: string[]
  /** Schema keys that may carry a national tax identifier. */
  taxIdKeys?: string[]
  /** Schema keys carrying the subject name (checked in order). */
  nameKeys: string[]
  /** Schema keys aliasing `phone_number`. */
  phoneKeys?: string[]
  /** Schema keys aliasing `email`. */
  emailKeys?: string[]
  /** Schema keys carrying a bank/custodian name (falls back to `bank_name`). */
  bankKeys?: string[]
  /** Free-form document attributes pulled onto the :Document node, if present. */
  financialAttributes: string[]
}

export const OCR_DOCUMENT_TYPES = [
  'passport',
  'driving_license',
  'national_id',
  'pan_card',
  'utility_bill',
  'bank_statement',
  'tax_form',
  'resume',
  'custom',
] as const

export type OcrDocumentType = (typeof OCR_DOCUMENT_TYPES)[number]

export const OCR_DOCUMENT_META: Record<
  OcrDocumentType,
  {
    title: string
    category: 'identity' | 'financial' | 'address' | 'employment' | 'other'
    graph?: OcrDocumentGraphMapping
  }
> = {
  passport: {
    title: 'International Passport',
    category: 'identity',
    graph: {
      documentNumberKeys: ['document_number'],
      nameKeys: ['first_name', 'last_name'],
      financialAttributes: ['expiry_date', 'issuing_state', 'mrz'],
    },
  },
  driving_license: {
    title: "Driver's License",
    category: 'identity',
    graph: {
      documentNumberKeys: ['license_number'],
      nameKeys: ['first_name', 'last_name'],
      financialAttributes: ['vehicle_class', 'issue_date', 'expiry_date'],
    },
  },
  national_id: {
    title: 'National Identity Card',
    category: 'identity',
    graph: {
      documentNumberKeys: ['id_number'],
      nameKeys: ['full_name'],
      financialAttributes: ['issue_date', 'expiry_date'],
    },
  },
  pan_card: {
    title: 'PAN Card (Permanent Account Number)',
    category: 'identity',
    graph: {
      // A PAN is simultaneously the credential number and a tax identifier.
      documentNumberKeys: ['pan_number'],
      taxIdKeys: ['pan_number'],
      nameKeys: ['full_name'],
      financialAttributes: ['father_name'],
    },
  },
  utility_bill: {
    title: 'Utility Bill (Proof of Address)',
    category: 'address',
    graph: {
      documentNumberKeys: ['account_number'],
      nameKeys: ['account_holder'],
      bankKeys: ['provider'],
      financialAttributes: ['amount_due', 'billing_date', 'due_date'],
    },
  },
  bank_statement: {
    title: 'Bank Statement',
    category: 'financial',
    graph: {
      documentNumberKeys: ['account_number'],
      nameKeys: ['account_holder'],
      bankKeys: ['bank_name'],
      financialAttributes: ['closing_balance', 'statement_period'],
    },
  },
  tax_form: {
    title: 'Tax Assessment / Return',
    category: 'financial',
    graph: {
      documentNumberKeys: ['tax_id'],
      taxIdKeys: ['tax_id'],
      nameKeys: ['taxpayer_name'],
      financialAttributes: ['gross_income', 'tax_year', 'filing_status'],
    },
  },
  resume: {
    title: 'Resume / Curriculum Vitae (CV)',
    category: 'employment',
    graph: {
      documentNumberKeys: [],
      nameKeys: ['candidate_name'],
      phoneKeys: ['phone'],
      emailKeys: ['email'],
      financialAttributes: [
        'current_role',
        'experience_years',
        'skills',
        'education',
      ],
    },
  },
  custom: {
    title: 'Custom Document Type',
    category: 'other',
    graph: {
      documentNumberKeys: ['reference_number'],
      nameKeys: [],
      financialAttributes: ['document_title', 'date', 'parties'],
    },
  },
}

/** Generic fallbacks shared by all document types. */
export const COMMON_FIELD_ALIASES: OcrDocumentGraphMapping = {
  documentNumberKeys: ['document_number'],
  taxIdKeys: ['tax_id'],
  nameKeys: ['first_name', 'last_name', 'full_name'],
  phoneKeys: ['phone_number', 'phone'],
  emailKeys: ['email'],
  bankKeys: ['bank_name'],
  financialAttributes: ['address', 'nationality', 'dob', 'gender'],
}

/**
 * Resolves the effective graph mapping for a document type, merging the
 * type-specific aliases with the common ones, in deterministic precedence:
 * type-specific keys first, common aliases as fallback.
 */
export function graphMappingFor(
  documentType?: string,
): OcrDocumentGraphMapping {
  const specific =
    OCR_DOCUMENT_META[(documentType as OcrDocumentType) || 'passport']?.graph
  const merge = (a?: string[], b?: string[]): string[] =>
    Array.from(new Set([...(a || []), ...(b || [])]))
  return {
    documentNumberKeys: merge(
      specific?.documentNumberKeys,
      COMMON_FIELD_ALIASES.documentNumberKeys,
    ),
    taxIdKeys: merge(specific?.taxIdKeys, COMMON_FIELD_ALIASES.taxIdKeys),
    nameKeys: merge(specific?.nameKeys, COMMON_FIELD_ALIASES.nameKeys),
    phoneKeys: merge(specific?.phoneKeys, COMMON_FIELD_ALIASES.phoneKeys),
    emailKeys: merge(specific?.emailKeys, COMMON_FIELD_ALIASES.emailKeys),
    bankKeys: merge(specific?.bankKeys, COMMON_FIELD_ALIASES.bankKeys),
    financialAttributes: Array.from(
      new Set([
        ...(specific?.financialAttributes || []),
        ...COMMON_FIELD_ALIASES.financialAttributes,
      ]),
    ),
  }
}
