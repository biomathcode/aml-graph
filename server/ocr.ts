import Tesseract from 'tesseract.js'
import { and, eq } from 'drizzle-orm'
import { db } from './db/index.js'
import { entities, files } from './db/schema.js'
import { getObject } from './storage.js'
import { notify } from './redis.js'
import { config } from './config.js'
import type {
  OcrDocumentSchema,
  OcrFieldRule,
  OcrExtractedField,
  OcrExtractionResult,
} from '@open-kyc/contracts'
import { sendDocumentVerifiedEmail } from './mailer.js'

export const DEFAULT_OCR_SCHEMAS: Record<string, OcrDocumentSchema> = {
  passport: {
    document_type: 'passport',
    title: 'International Passport',
    description: 'Machine-readable travel documents and national passports.',
    fields: [
      {
        key: 'first_name',
        label: 'Given Name(s)',
        type: 'name',
        description: 'First and middle names',
      },
      {
        key: 'last_name',
        label: 'Surname',
        type: 'name',
        description: 'Family name / surname',
      },
      {
        key: 'document_number',
        label: 'Passport Number',
        type: 'regex',
        pattern: '[A-Z0-9]{8,12}',
        required: true,
      },
      {
        key: 'nationality',
        label: 'Nationality',
        type: 'string',
        description: 'Citizen state / 3-letter country code',
      },
      {
        key: 'dob',
        label: 'Date of Birth',
        type: 'date',
        pattern: '\\d{1,2}[-/\\s][A-Za-z0-9]{2,3}[-/\\s]\\d{2,4}',
      },
      {
        key: 'gender',
        label: 'Sex',
        type: 'string',
        description: 'M / F / Male / Female',
      },
      { key: 'expiry_date', label: 'Date of Expiry', type: 'date' },
      {
        key: 'issuing_state',
        label: 'Issuing Country / Authority',
        type: 'string',
      },
      {
        key: 'mrz',
        label: 'Machine Readable Zone (MRZ)',
        type: 'string',
        description: '2 lines of 44 characters',
      },
    ],
  },
  driving_license: {
    document_type: 'driving_license',
    title: "Driver's License",
    description: 'State or national motor vehicle operator licenses.',
    fields: [
      { key: 'first_name', label: 'First Name', type: 'name' },
      { key: 'last_name', label: 'Last Name', type: 'name' },
      {
        key: 'license_number',
        label: 'License / DL Number',
        type: 'regex',
        pattern: '[A-Z0-9-]{6,16}',
        required: true,
      },
      { key: 'dob', label: 'Date of Birth', type: 'date' },
      { key: 'issue_date', label: 'Issue Date', type: 'date' },
      { key: 'expiry_date', label: 'Expiration Date', type: 'date' },
      { key: 'address', label: 'Residential Address', type: 'address' },
      {
        key: 'vehicle_class',
        label: 'License Class / Endorsements',
        type: 'string',
      },
    ],
  },
  national_id: {
    document_type: 'national_id',
    title: 'National Identity Card',
    description: 'Government-issued citizen identification cards.',
    fields: [
      { key: 'full_name', label: 'Full Name', type: 'name', required: true },
      {
        key: 'id_number',
        label: 'National ID Number',
        type: 'regex',
        pattern: '[A-Z0-9-]{6,18}',
        required: true,
      },
      { key: 'father_name', label: "Father's Name", type: 'name' },
      { key: 'dob', label: 'Date of Birth', type: 'date' },
      { key: 'nationality', label: 'Nationality', type: 'string' },
      { key: 'address', label: 'Residential Address', type: 'address' },
      { key: 'issue_date', label: 'Date of Issue', type: 'date' },
      { key: 'expiry_date', label: 'Date of Expiry', type: 'date' },
    ],
  },
  pan_card: {
    document_type: 'pan_card',
    title: 'PAN Card (Permanent Account Number)',
    description: 'Indian Income Tax Department PAN Card.',
    fields: [
      {
        key: 'pan_number',
        label: 'PAN / Document Number',
        type: 'regex',
        pattern: '[A-Z]{5}[0-9]{4}[A-Z]',
        required: true,
      },
      { key: 'full_name', label: 'Full Name', type: 'name', required: true },
      { key: 'father_name', label: "Father's Name", type: 'name' },
      {
        key: 'dob',
        label: 'Date of Birth',
        type: 'date',
        pattern: '\\d{2}/\\d{2}/\\d{4}',
      },
    ],
  },
  utility_bill: {
    document_type: 'utility_bill',
    title: 'Utility Bill (Proof of Address)',
    description:
      'Electricity, water, gas, or broadband telecommunications bills.',
    fields: [
      {
        key: 'account_holder',
        label: 'Account Holder Name',
        type: 'name',
        required: true,
      },
      {
        key: 'address',
        label: 'Service / Billing Address',
        type: 'address',
        required: true,
      },
      { key: 'billing_date', label: 'Statement Date', type: 'date' },
      { key: 'due_date', label: 'Payment Due Date', type: 'date' },
      {
        key: 'amount_due',
        label: 'Total Amount Due',
        type: 'number',
        pattern: '[\\$€£]?\\s*\\d+[.,]\\d{2}',
      },
      { key: 'provider', label: 'Utility Service Provider', type: 'string' },
      {
        key: 'account_number',
        label: 'Account / Customer Number',
        type: 'string',
      },
    ],
  },
  bank_statement: {
    document_type: 'bank_statement',
    title: 'Bank Statement',
    description:
      'Official account statement from a recognized financial institution.',
    fields: [
      {
        key: 'account_holder',
        label: 'Account Holder Name',
        type: 'name',
        required: true,
      },
      {
        key: 'account_number',
        label: 'Account Number / IBAN',
        type: 'string',
        required: true,
      },
      { key: 'bank_name', label: 'Financial Institution', type: 'string' },
      { key: 'statement_period', label: 'Statement Period', type: 'string' },
      { key: 'closing_balance', label: 'Closing Balance', type: 'number' },
      { key: 'address', label: 'Customer Address', type: 'address' },
    ],
  },
  tax_form: {
    document_type: 'tax_form',
    title: 'Tax Assessment / Return',
    description: 'W-2, 1099, P60, or tax assessment filings.',
    fields: [
      {
        key: 'taxpayer_name',
        label: 'Taxpayer Name',
        type: 'name',
        required: true,
      },
      {
        key: 'tax_id',
        label: 'Tax ID / SSN / EIN',
        type: 'regex',
        pattern: '\\d{3}-?\\d{2}-?\\d{4}|\\d{9}',
        required: true,
      },
      {
        key: 'tax_year',
        label: 'Tax Year',
        type: 'number',
        pattern: '20\\d{2}',
      },
      { key: 'gross_income', label: 'Gross Income', type: 'number' },
      { key: 'filing_status', label: 'Filing Status', type: 'string' },
    ],
  },
  resume: {
    document_type: 'resume',
    title: 'Resume / Curriculum Vitae (CV)',
    description:
      'Professional candidate resume, CV, or employment history document.',
    fields: [
      {
        key: 'candidate_name',
        label: 'Candidate Name',
        type: 'name',
        required: true,
      },
      {
        key: 'email',
        label: 'Email Address',
        type: 'email',
        pattern: '[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}',
        required: true,
      },
      {
        key: 'phone',
        label: 'Phone Number',
        type: 'phone',
        pattern:
          '(?:\\+?\\d{1,3}[-.\\s]?)?\\(?\\d{3}\\)?[-.\\s]?\\d{3}[-.\\s]?\\d{4}',
      },
      { key: 'current_role', label: 'Current / Recent Title', type: 'string' },
      { key: 'skills', label: 'Skills & Competencies', type: 'string' },
      { key: 'education', label: 'Education / Degree', type: 'string' },
      { key: 'location', label: 'Location / City', type: 'address' },
      { key: 'experience_years', label: 'Experience (Years)', type: 'number' },
      {
        key: 'linkedin_url',
        label: 'LinkedIn Profile',
        type: 'string',
        pattern:
          '(?:https?:\\/\\/)?(?:www\\.)?linkedin\\.com\\/in\\/[a-zA-Z0-9_-]+',
      },
      {
        key: 'github_url',
        label: 'GitHub Profile',
        type: 'string',
        pattern: '(?:https?:\\/\\/)?(?:www\\.)?github\\.com\\/[a-zA-Z0-9_-]+',
      },
    ],
  },
  custom: {
    document_type: 'custom',
    title: 'Custom Document Type',
    description: 'User-configured extraction schema.',
    fields: [
      { key: 'document_title', label: 'Document Title', type: 'string' },
      {
        key: 'reference_number',
        label: 'Reference / Identifier',
        type: 'string',
      },
      { key: 'date', label: 'Date', type: 'date' },
      { key: 'parties', label: 'Parties / Signatories', type: 'string' },
    ],
  },
}

// Helper to update session state in database and notify via Redis
async function updateSessionProgress(
  sessionId: string,
  ownerId: string,
  progress: {
    ocrStatus:
      | 'pending'
      | 'extracting_layout'
      | 'parsing_fields'
      | 'completed'
      | 'failed'
    ocrProgress: number
    ocrStage: string
    ocrExtractedFields?: Record<string, OcrExtractedField>
    ocrDocumentType?: string
    ocrEngine?: string
    ocrError?: string
    extraData?: Record<string, any>
  },
) {
  const [row] = await db
    .select()
    .from(entities)
    .where(and(eq(entities.id, sessionId), eq(entities.ownerId, ownerId)))

  if (!row) return

  const updatedData = {
    ...row.data,
    ocrStatus: progress.ocrStatus,
    ocrProgress: progress.ocrProgress,
    ocrStage: progress.ocrStage,
    ...(progress.ocrExtractedFields
      ? { ocrExtractedFields: progress.ocrExtractedFields }
      : {}),
    ...(progress.ocrDocumentType
      ? { ocrDocumentType: progress.ocrDocumentType }
      : {}),
    ...(progress.ocrEngine ? { ocrEngine: progress.ocrEngine } : {}),
    ...(progress.ocrError ? { ocrError: progress.ocrError } : {}),
    ...(progress.ocrStatus === 'completed'
      ? { ocrProcessedAt: Date.now() }
      : {}),
    ...(progress.extraData || {}),
  }

  await db
    .update(entities)
    .set({
      data: updatedData,
      updatedAt: new Date(),
    })
    .where(eq(entities.id, sessionId))

  await notify(ownerId)
}

// Call the Indra OCR microservice (with automatic fallback to local Tesseract + rules)
export async function callIndraOCR(
  buffer: Buffer,
  filename: string,
  mime: string,
  documentType: string = 'passport',
  customRules?: OcrFieldRule[],
): Promise<OcrExtractionResult> {
  const start = Date.now()
  const indraUrl = config.INDRA_OCR_URL.replace(/\/$/, '')

  // Fast probe: check if Indra is reachable before uploading the full document.
  // This avoids a 20-second hang when the service is offline, which would cause
  // tsx watch to restart the server mid-request (socket hang up).
  let indraReachable = false
  try {
    const probeController = new AbortController()
    const probeTimeout = setTimeout(() => probeController.abort(), 1500)
    const probe = await fetch(`${indraUrl}/health`, {
      method: 'GET',
      signal: probeController.signal,
    }).catch(() => null)
    clearTimeout(probeTimeout)
    indraReachable = probe !== null && probe.ok
  } catch {
    indraReachable = false
  }

  if (indraReachable) {
    try {
      const formData = new FormData()
      const blob = new Blob([new Uint8Array(buffer)], { type: mime })
      formData.append('file', blob, filename)
      formData.append('document_type', documentType)
      if (customRules && customRules.length > 0) {
        formData.append('schema', JSON.stringify(customRules))
      }

      const controller = new AbortController()
      // 15s timeout — enough for Tesseract's first-run warm-up, while still
      // letting the local fallback take over when the service has crashed.
      const timeout = setTimeout(() => controller.abort(), 15000)

      const res = await fetch(`${indraUrl}/api/ocr/extract`, {
        method: 'POST',
        body: formData,
        signal: controller.signal,
      })
      clearTimeout(timeout)

      if (res.ok) {
        const data = (await res.json()) as OcrExtractionResult
        // Quality ensemble: a deployment whose Indra model is missing its
        // weights still answers 200 with friendly stub text, and a working
        // one can over-capture free-text spans ("Surname TORRES Given Names
        // MICHAEL..."). Always cross-check the schema-driven local Tesseract
        // pass and keep the higher-quality value per field.
        const fallback = await runLocalFallbackOCR(
          buffer,
          filename,
          documentType,
          customRules,
          start,
        )
        const identifierish = (key: string) =>
          /(number|document|license|id|tax|pan)/.test(key.toLowerCase())
        const merged: Record<string, (typeof data.fields)[string]> = {
          ...data.fields,
        }
        let fallbackContributed = false
        for (const [key, fbField] of Object.entries(fallback.fields)) {
          const current = merged[key]
          const fbHasDigit = /\d/.test(fbField.value || '')
          const curHasDigit = /\d/.test(current?.value || '')
          const currentWins =
            current &&
            current.value &&
            (current.confidence ?? 0) >= (fbField.confidence ?? 0) &&
            !(identifierish(key) && curHasDigit === false && fbHasDigit)
          if (currentWins) continue
          merged[key] = fbField
          if (fbField.value) fallbackContributed = true
        }
        return {
          ...data,
          fields: merged,
          raw_text:
            fallback.raw_text.length > (data.raw_text || '').length
              ? fallback.raw_text
              : data.raw_text,
          markdown:
            fallback.markdown.length > (data.markdown || '').length
              ? fallback.markdown
              : data.markdown,
          ocr_engine: fallbackContributed
            ? 'indra-ocr+local-fallback'
            : data.ocr_engine,
        }
      }
      console.warn(
        `Indra OCR HTTP error ${res.status}: falling back to local extractor`,
      )
    } catch (err) {
      console.warn(
        `Indra OCR service at ${indraUrl} unreachable: falling back to local OCR engine. (${(err as Error).message})`,
      )
    }
  } else {
    console.warn(
      `Indra OCR service at ${indraUrl} is offline — using local Tesseract fallback.`,
    )
  }

  // Graceful fallback using local Tesseract + schema extraction
  return runLocalFallbackOCR(buffer, filename, documentType, customRules, start)
}

// Detect PDF by magic bytes (%PDF header) — Tesseract cannot read PDFs and
// throws an error via process.nextTick that bypasses async try/catch, crashing
// the entire Node process and causing socket hang-ups on all in-flight requests.
function isPDF(buffer: Buffer): boolean {
  return buffer.length >= 4 && buffer.slice(0, 4).toString('ascii') === '%PDF'
}

// Fallback OCR engine
async function runLocalFallbackOCR(
  buffer: Buffer,
  filename: string,
  documentType: string,
  customRules: OcrFieldRule[] | undefined,
  startTime: number,
): Promise<OcrExtractionResult> {
  // PDFs require a dedicated renderer (e.g. Poppler/Ghostscript) to convert to
  // images before Tesseract can read them. Attempting to pass a PDF buffer
  // directly crashes the Node process via an unhandled process.nextTick throw.
  if (isPDF(buffer)) {
    console.warn(
      `Local OCR: ${filename} is a PDF — Tesseract cannot read PDFs without a renderer. Returning partial result.`,
    )
    const schema =
      customRules ||
      DEFAULT_OCR_SCHEMAS[documentType]?.fields ||
      DEFAULT_OCR_SCHEMAS.passport.fields
    const extractedFields: Record<string, OcrExtractedField> = {}
    for (const rule of schema) {
      extractedFields[rule.key] = {
        key: rule.key,
        label: rule.label,
        value: undefined,
        confidence: 0.0,
        source_line: undefined,
        valid: !rule.required,
      }
    }
    return {
      status: 'completed',
      document_type: documentType,
      raw_text: '',
      markdown: `# Document: ${filename}\n\n_PDF text extraction requires the Indra OCR service. Start it to enable full PDF analysis._`,
      fields: extractedFields,
      execution_time_ms: Date.now() - startTime,
      ocr_engine: 'indra-ocr-local-fallback',
    }
  }

  let recognizedText = ''
  try {
    const { data } = await Tesseract.recognize(buffer, 'eng', {
      logger: () => {},
    })
    recognizedText = data.text || ''
  } catch (err) {
    console.error('Local Tesseract recognition error:', err)
  }

  const schema =
    customRules ||
    DEFAULT_OCR_SCHEMAS[documentType]?.fields ||
    DEFAULT_OCR_SCHEMAS.passport.fields
  const extractedFields: Record<string, OcrExtractedField> = {}

  // Parse lines
  const lines = recognizedText
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)

  // MRZ detection for passport/travel documents
  const mrzLines = lines.filter((l) => /^[A-Z0-9<]{30,}$/.test(l))
  // A lone "P<"-prefixed line is a truncated line 1 — too little to parse.
  const mrzData =
    mrzLines.length >= 2 ||
    (mrzLines.length === 1 && !mrzLines[0].startsWith('P<'))
      ? parseMRZLines(mrzLines)
      : {}

  for (const rule of schema) {
    let value: string | undefined
    let confidence = 0.8
    let sourceLine: string | undefined

    if (mrzData[rule.key]) {
      value = mrzData[rule.key]
      confidence = 0.98
      sourceLine = 'MRZ Zone'
    }

    if (!value && rule.pattern) {
      try {
        const rx = new RegExp(rule.pattern, 'i')
        const m = rx.exec(recognizedText)
        if (m) {
          const candidate = (m[1] || m[0]).trim()
          // Identifier-ish rules must contain a digit — bare words such as
          // "PASSPORT" (from the header block) are not document numbers.
          const identifierish = /(number|document|license|id|tax|pan)/.test(
            rule.key.toLowerCase(),
          )
          if (!identifierish || /\d/.test(candidate)) {
            value = candidate
            confidence = 0.92
            sourceLine = lines.find((l) => l.includes(value!))
          }
        }
      } catch {}
    }

    if (!value) {
      const semantic = extractFieldBySemanticRule(rule, recognizedText, lines)
      if (semantic.value) {
        value = semantic.value
        confidence = semantic.confidence
        sourceLine = semantic.sourceLine
      }
    }

    extractedFields[rule.key] = {
      key: rule.key,
      label: rule.label,
      value: value?.trim(),
      confidence: value ? confidence : 0.0,
      source_line: sourceLine,
      valid: Boolean(value) || !rule.required,
    }
  }

  return {
    status: 'completed',
    document_type: documentType,
    raw_text: recognizedText,
    markdown: `# Document: ${filename}\n\n${recognizedText}`,
    fields: extractedFields,
    execution_time_ms: Date.now() - startTime,
    ocr_engine: 'indra-ocr-local-fallback',
  }
}

function extractFieldBySemanticRule(
  rule: OcrFieldRule,
  text: string,
  lines: string[],
): { value?: string; confidence: number; sourceLine?: string } {
  const k = rule.key.toLowerCase()

  if (k.includes('dob') || k.includes('birth')) {
    const dobExact = text.match(/\b(\d{2}\/\d{2}\/\d{4})\b/)
    if (dobExact)
      return { value: dobExact[1], confidence: 0.98, sourceLine: dobExact[0] }

    const m = text.match(
      /(?:dob|date of birth|born|birth date)[:\s]+([\d]{1,2}[\s/.-][\w]{2,3}[\s/.-][\d]{2,4})/i,
    )
    if (m) return { value: m[1].trim(), confidence: 0.9, sourceLine: m[0] }
  }
  if (
    k.includes('expiry') ||
    k.includes('expires') ||
    k.includes('valid_until')
  ) {
    const m = text.match(
      /(?:expiry|expires?|valid until|exp date)[:\s]+([\d]{1,2}[\s/.-][\w]{2,3}[\s/.-][\d]{2,4})/i,
    )
    if (m) return { value: m[1].trim(), confidence: 0.9, sourceLine: m[0] }
  }
  if (k.includes('issue')) {
    const m = text.match(
      /(?:issue date|issued|date of issue)[:\s]+([\d]{1,2}[\s/.-][\w]{2,3}[\s/.-][\d]{2,4})/i,
    )
    if (m) return { value: m[1].trim(), confidence: 0.9, sourceLine: m[0] }
  }
  if (
    [
      'document_number',
      'license_number',
      'id_number',
      'tax_id',
      'pan_number',
    ].includes(k)
  ) {
    // PAN card pattern (5 uppercase letters, 4 digits, 1 uppercase letter)
    const panMatch = text.match(/\b([A-Z]{5}[0-9]{4}[A-Z])\b/)
    if (panMatch)
      return { value: panMatch[1], confidence: 0.99, sourceLine: panMatch[0] }

    const m = text.match(
      /(?:passport\s*no|passport\s*number|document\s*no|license\s*no|id\s*no|ssn|number)[:.\s#-]*([A-Z0-9-]{6,16})/i,
    )
    if (m) return { value: m[1].trim(), confidence: 0.92, sourceLine: m[0] }
  }
  if (k.includes('father')) {
    let fatherIdx = -1
    for (let i = 0; i < lines.length; i++) {
      if (/(?:father's name|father|पिता)/i.test(lines[i])) {
        fatherIdx = i
        break
      }
    }
    if (fatherIdx !== -1) {
      const NOISE = new Set([
        'HARE',
        'HERE',
        'ELST',
        'EABOS',
        'NAME',
        'CARD',
        'INDIA',
        'GOVT',
        'INCOME',
        'TAX',
        'DEPARTMENT',
        'FATHER',
        'DATE',
        'BIRTH',
        'NUMBER',
      ])
      for (
        let i = fatherIdx + 1;
        i < Math.min(lines.length, fatherIdx + 4);
        i++
      ) {
        const cleaned = lines[i].replace(/^[^a-zA-Z]+/, '').trim()
        const words = cleaned
          .split(/\s+/)
          .map((w) => w.replace(/[^a-zA-Z]/g, ''))
          .filter(
            (w) => w === w.toUpperCase() && !NOISE.has(w) && w.length >= 3,
          )
        if (words.length >= 2) {
          return {
            value: words.join(' '),
            confidence: 0.95,
            sourceLine: lines[i],
          }
        }
      }
    }
  }
  if (['full_name', 'name', 'applicant_name'].includes(k)) {
    const panIdx = lines.findIndex((l) => /\b[A-Z]{5}[0-9]{4}[A-Z]\b/.test(l))
    const fatherIdx = lines.findIndex((l) =>
      /(?:father's name|father|पिता)/i.test(l),
    )
    if (panIdx !== -1) {
      const limit = fatherIdx !== -1 ? fatherIdx : lines.length
      const NOISE = new Set([
        'HARE',
        'HERE',
        'ELST',
        'EABOS',
        'NAME',
        'CARD',
        'INDIA',
        'GOVT',
        'INCOME',
        'TAX',
        'DEPARTMENT',
        'ACCOUNT',
        'NUMBER',
      ])
      for (let i = panIdx + 1; i < limit; i++) {
        const cleaned = lines[i].replace(/^[^a-zA-Z]+/, '').trim()
        const words = cleaned
          .split(/\s+/)
          .map((w) => w.replace(/[^a-zA-Z]/g, ''))
          .filter(
            (w) => w === w.toUpperCase() && !NOISE.has(w) && w.length >= 3,
          )
        if (words.length >= 2) {
          return {
            value: words.join(' '),
            confidence: 0.96,
            sourceLine: lines[i],
          }
        }
      }
    }
  }
  if (k.includes('nationality') || k.includes('citizen')) {
    // Label-anchored single token — free-text spans swallow the next field
    // ("Nationality USA Date of Birth…") when lines blur together.
    for (const line of lines) {
      const m = line.match(
        /(?:nationality|citizenship|citizen)[:\s]+([A-Za-z]{3,30})/i,
      )
      if (m)
        return {
          value: m[1].trim().toUpperCase(),
          confidence: 0.95,
          sourceLine: line,
        }
    }
  }
  // Printed passport/national-ID name labels — many scans lose the MRZ name
  // line (torn corner, glare, synthetic clean renders), so fall back to the
  // human-readable "Surname"/"Given Names" fields.
  if (k.includes('last_name') || k.includes('surname')) {
    for (const line of lines) {
      const m = line.match(
        /(?:surname|family\s*name|last\s*name)\b[^\p{L}\d]*([A-Z][\p{L}'’-]+)/iu,
      )
      if (m) return { value: m[1].trim(), confidence: 0.9, sourceLine: line }
    }
  }
  if (k.includes('first_name') || k.includes('given')) {
    for (const line of lines) {
      const m = line.match(
        /(?:given\s*names?|first\s*names?|forenames?)\b[^\p{L}\d]*([A-Z][\p{L}'’-]+(?:\s[A-Z][\p{L}'’-]+)*)/iu,
      )
      if (m) return { value: m[1].trim(), confidence: 0.9, sourceLine: line }
    }
  }
  if (k === 'gender' || k === 'sex') {
    // Allow the typical OCR merge where "Sex" and the value run together
    // ("SexM") as well as the spaced form.
    const m = text.match(/(?:sex|gender)[:\s]*([MFX]|male|female)\b/i)
    if (m) {
      const g = m[1].toUpperCase()
      return {
        value:
          g === 'M' || g === 'MALE'
            ? 'Male'
            : g === 'F' || g === 'FEMALE'
              ? 'Female'
              : g,
        confidence: 0.95,
        sourceLine: m[0],
      }
    }
  }
  if (rule.type === 'email' || k.includes('email')) {
    const m = text.match(/\b([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\b/)
    if (m) return { value: m[1].trim(), confidence: 0.98, sourceLine: m[0] }
  }
  if (
    rule.type === 'phone' ||
    k.includes('phone') ||
    k.includes('mobile') ||
    k.includes('tel')
  ) {
    const m = text.match(
      /(?:(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}|\+?\d{10,14})/,
    )
    if (m) return { value: m[0].trim(), confidence: 0.94, sourceLine: m[0] }
  }
  if (k.includes('linkedin')) {
    const m = text.match(
      /(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/[a-zA-Z0-9_-]+/i,
    )
    if (m) return { value: m[0].trim(), confidence: 0.98, sourceLine: m[0] }
  }
  if (k.includes('github')) {
    const m = text.match(
      /(?:https?:\/\/)?(?:www\.)?github\.com\/[a-zA-Z0-9_-]+/i,
    )
    if (m) return { value: m[0].trim(), confidence: 0.98, sourceLine: m[0] }
  }
  if (k.includes('skill')) {
    const m = text.match(
      /(?:technical\s*skills?|core\s*competencies|skills?)[:\s]+([^\n\r]+)/i,
    )
    if (m) return { value: m[1].trim(), confidence: 0.9, sourceLine: m[0] }
  }
  if (k.includes('education') || k.includes('degree')) {
    for (const line of lines) {
      if (
        /(?:bachelor|master|ph\.?d|b\.?s\.?|m\.?s\.?|b\.?tech|m\.?tech|degree|university|college|institute)\b/i.test(
          line,
        )
      ) {
        return { value: line.trim(), confidence: 0.88, sourceLine: line }
      }
    }
  }
  if (k.includes('experience') || k.includes('exp')) {
    const m = text.match(/(\d+(?:\.\d+)?)\+?\s*years?(?:\s+of)?\s+experience/i)
    if (m) return { value: m[1].trim(), confidence: 0.92, sourceLine: m[0] }
  }
  if (k.includes('role') || k.includes('title') || k.includes('position')) {
    for (const line of lines.slice(0, 8)) {
      if (
        /(?:software|developer|engineer|scientist|analyst|manager|director|lead|consultant|architect|designer|specialist)/i.test(
          line,
        )
      ) {
        return { value: line.trim(), confidence: 0.85, sourceLine: line }
      }
    }
  }
  if (k === 'candidate_name') {
    for (const line of lines.slice(0, 5)) {
      const words = line.trim().split(/\s+/)
      if (
        words.length >= 2 &&
        words.length <= 4 &&
        !/(?:resume|cv|curriculum|vitae|page|email|phone|contact)/i.test(line)
      ) {
        if (!/[@\d]/.test(line)) {
          return { value: line.trim(), confidence: 0.92, sourceLine: line }
        }
      }
    }
  }
  if (rule.type === 'number' || k.includes('amount') || k.includes('balance')) {
    const m = text.match(
      /(?:amount due|total|balance|closing balance)[:\s]*([\$€£]?\s*[\d,]+\.\d{2})/i,
    )
    if (m) return { value: m[1].trim(), confidence: 0.88, sourceLine: m[0] }
  }

  // Check lines matching Label: Value
  const labelRegex = new RegExp(
    `^${rule.label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[:\\s-]+(.+)$`,
    'i',
  )
  for (const line of lines) {
    const m = line.match(labelRegex)
    if (m && m[1])
      return { value: m[1].trim(), confidence: 0.85, sourceLine: line }
  }

  return { confidence: 0 }
}

function parseMRZLines(lines: string[]): Record<string, string> {
  const out: Record<string, string> = {}
  try {
    // TD3 layout: line 1 starts "P<" and carries names; line 2 carries the
    // document number, nationality, DOB, gender and expiry at fixed offsets.
    // Scans (especially clean synthetic renders) can lose line 1 to Tesseract,
    // so we reorder robustly and fall back to a line-2-only mode.
    const p1 = lines.findIndex((l) => l.startsWith('P<'))
    let line1 = p1 !== -1 ? lines[p1].padEnd(44, '<') : undefined
    let rest = lines.filter((l) => l !== (p1 !== -1 ? lines[p1] : null))
    let line2 = rest[rest.length - 1]?.padEnd(44, '<')

    if (!line2 && line1) {
      line2 = line1
      line1 = undefined
    }
    if (!line2) return out

    out.mrz = line1 ? `${line1}\n${line2}` : line2

    // Only extract names when a real line 1 exists — a padded line-2 would
    // otherwise produce garbage names.
    if (line1) {
      const namePart = line1.slice(5).replace(/</g, ' ').trim()
      const [lastName, ...firstParts] = namePart.split('  ')
      if (lastName) out.last_name = lastName.trim()
      if (firstParts.length) out.first_name = firstParts.join(' ').trim()
      if (out.first_name && out.last_name)
        out.full_name = `${out.first_name} ${out.last_name}`
    }

    out.document_number = line2.slice(0, 9).replace(/</g, '').trim()
    out.nationality = line2.slice(10, 13).replace(/</g, '').trim()

    const dobRaw = line2.slice(13, 19)
    if (dobRaw && /^\d+$/.test(dobRaw)) {
      const y = parseInt(dobRaw.slice(0, 2))
      const m = dobRaw.slice(2, 4)
      const d = dobRaw.slice(4, 6)
      const fullYear = y > 30 ? 1900 + y : 2000 + y
      out.dob = `${d}/${m}/${fullYear}`
    }

    const genderChar = line2[20]?.toUpperCase()
    if (genderChar === 'M') out.gender = 'Male'
    else if (genderChar === 'F') out.gender = 'Female'

    const expRaw = line2.slice(21, 27)
    if (expRaw && /^\d+$/.test(expRaw)) {
      const y = parseInt(expRaw.slice(0, 2))
      const m = expRaw.slice(2, 4)
      const d = expRaw.slice(4, 6)
      out.expiry_date = `${d}/${m}/${2000 + y}`
    }
  } catch {}
  return out
}

// Main Session OCR Runner with multi-stage progress reporting
export async function runSessionOCR(sessionId: string, ownerId: string) {
  try {
    // Stage 1: Queued
    await updateSessionProgress(sessionId, ownerId, {
      ocrStatus: 'pending',
      ocrProgress: 15,
      ocrStage: 'Queued for Indra OCR recognition & layout analysis...',
      ocrEngine: 'indra-ocr',
    })

    // Get all files for this session
    const sessionFiles = await db
      .select()
      .from(files)
      .where(and(eq(files.ownerId, ownerId), eq(files.sessionId, sessionId)))

    if (!sessionFiles.length) {
      await updateSessionProgress(sessionId, ownerId, {
        ocrStatus: 'completed',
        ocrProgress: 100,
        ocrStage: 'No document files attached to session',
      })
      return
    }

    // Get session to determine document type
    const [sessionRow] = await db
      .select()
      .from(entities)
      .where(and(eq(entities.id, sessionId), eq(entities.ownerId, ownerId)))

    const docType = (sessionRow?.data?.document_type as string) || 'passport'

    // Retrieve custom schema if saved by user
    const schemas = await getCustomSchemas(ownerId)
    const activeSchema = schemas[docType] || schemas.passport

    // Stage 2: Extracting layout
    await updateSessionProgress(sessionId, ownerId, {
      ocrStatus: 'extracting_layout',
      ocrProgress: 45,
      ocrStage: `Running Indra OCR on ${sessionFiles.length} file(s)...`,
      ocrDocumentType: docType,
    })

    const accumulatedFields: Record<string, OcrExtractedField> = {}
    const simpleFieldMerge: Record<string, string> = {}

    for (const file of sessionFiles) {
      if (
        !['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(
          file.mime,
        )
      ) {
        continue
      }
      try {
        const buf = await getObject(file)
        const extraction = await callIndraOCR(
          buf,
          file.objectKey,
          file.mime,
          docType,
          activeSchema.fields,
        )

        for (const [key, field] of Object.entries(extraction.fields)) {
          if (
            field.value &&
            (!accumulatedFields[key]?.value ||
              (field.confidence || 0) >
                (accumulatedFields[key]?.confidence || 0))
          ) {
            accumulatedFields[key] = field
            simpleFieldMerge[key] = field.value
          }
        }
      } catch (fileErr) {
        console.error(`OCR processing failed for file ${file.id}:`, fileErr)
      }
    }

    // Stage 3: Parsing fields
    await updateSessionProgress(sessionId, ownerId, {
      ocrStatus: 'parsing_fields',
      ocrProgress: 80,
      ocrStage: `Parsing ${Object.keys(accumulatedFields).length} extracted fields according to ${activeSchema.title} schema...`,
      ocrExtractedFields: accumulatedFields,
    })

    // Stage 4: Completed
    await updateSessionProgress(sessionId, ownerId, {
      ocrStatus: 'completed',
      ocrProgress: 100,
      ocrStage: `Indra OCR completed: ${Object.keys(accumulatedFields).length} field(s) extracted`,
      ocrExtractedFields: accumulatedFields,
      ocrDocumentType: docType,
      ocrEngine: 'indra-ocr',
      extraData: {
        ...simpleFieldMerge,
        ocrProcessedAt: Date.now(),
      },
    })

    console.log(
      `Indra OCR completed for session ${sessionId}:`,
      Object.keys(simpleFieldMerge),
    )

    // Transactional Email: Document Verified / OCR Done
    const targetEmail = sessionRow?.data?.email
    if (targetEmail) {
      sendDocumentVerifiedEmail({
        to: targetEmail,
        recipientName:
          sessionRow?.data?.username ||
          [
            sessionRow?.data?.first_name,
            sessionRow?.data?.last_name,
            simpleFieldMerge.first_name,
            simpleFieldMerge.last_name,
          ]
            .filter(Boolean)
            .join(' ') ||
          'Customer',
        recipientType: sessionRow?.data?.recipientType || 'customer',
        sessionId,
        publicToken: sessionRow?.data?.publicToken,
        documentType: docType,
        extractedFields: simpleFieldMerge,
        ocrEngine: 'Indra OCR Engine',
      }).catch((err) =>
        console.error('[OpenKYC] Error sending document verified email:', err),
      )
    }
  } catch (error) {
    console.error(`Indra OCR failed for session ${sessionId}:`, error)
    await updateSessionProgress(sessionId, ownerId, {
      ocrStatus: 'failed',
      ocrProgress: 0,
      ocrStage: 'Indra OCR processing failed',
      ocrError: error instanceof Error ? error.message : 'OCR failed',
    })
  }
}

// Schema Management in DB
export async function getCustomSchemas(
  ownerId: string,
): Promise<Record<string, OcrDocumentSchema>> {
  const result: Record<string, OcrDocumentSchema> = { ...DEFAULT_OCR_SCHEMAS }
  try {
    const customRows = await db
      .select()
      .from(entities)
      .where(
        and(eq(entities.ownerId, ownerId), eq(entities.kind, 'ocr_schemas')),
      )

    for (const row of customRows) {
      const docType = row.data.document_type as string
      if (docType) {
        result[docType] = {
          document_type: docType,
          title: (row.data.title as string) || docType,
          description: (row.data.description as string) || '',
          fields: (row.data.fields as OcrFieldRule[]) || [],
          isCustom: true,
        }
      }
    }
  } catch (err) {
    console.error('Error fetching custom OCR schemas:', err)
  }
  return result
}

export async function saveCustomSchema(
  ownerId: string,
  schema: {
    document_type: string
    title: string
    description: string
    fields: OcrFieldRule[]
  },
) {
  const existing = await db
    .select()
    .from(entities)
    .where(
      and(
        eq(entities.ownerId, ownerId),
        eq(entities.kind, 'ocr_schemas'),
        eq(entities.parentId, schema.document_type),
      ),
    )

  if (existing.length > 0) {
    await db
      .update(entities)
      .set({
        data: { ...schema, isCustom: true },
        updatedAt: new Date(),
      })
      .where(eq(entities.id, existing[0].id))
  } else {
    await db.insert(entities).values({
      id: `schema_${schema.document_type}_${Date.now()}`,
      ownerId,
      kind: 'ocr_schemas',
      parentId: schema.document_type,
      data: { ...schema, isCustom: true },
      createdAt: new Date(),
      updatedAt: new Date(),
    })
  }

  await notify(ownerId)
  return { success: true }
}

export async function resetCustomSchema(ownerId: string, documentType: string) {
  await db
    .delete(entities)
    .where(
      and(
        eq(entities.ownerId, ownerId),
        eq(entities.kind, 'ocr_schemas'),
        eq(entities.parentId, documentType),
      ),
    )
  await notify(ownerId)
  return { success: true }
}

// On-demand extraction for a single file
export async function extractVaultDocument(
  ownerId: string,
  fileId: string,
  documentType: string = 'passport',
  customFields?: OcrFieldRule[],
): Promise<OcrExtractionResult> {
  const [file] = await db
    .select()
    .from(files)
    .where(and(eq(files.ownerId, ownerId), eq(files.id, fileId)))

  if (!file) {
    throw new Error('Document not found in storage')
  }

  const buf = await getObject(file)
  const schemas = await getCustomSchemas(ownerId)
  const activeFields =
    customFields ||
    schemas[documentType]?.fields ||
    DEFAULT_OCR_SCHEMAS.passport.fields

  return await callIndraOCR(
    buf,
    file.objectKey,
    file.mime,
    documentType,
    activeFields,
  )
}
