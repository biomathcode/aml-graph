/**
 * Pure field-shaping helpers for the OCR → graph → AML pipeline
 * (server/aml/pipeline.ts). Kept dependency-free so they can be unit tested
 * without a database or graph connection.
 */

/**
 * Merges the session's self-reported identity hints with the OCR document
 * readings; OCR values are authoritative and override the hints (see the
 * sessionUpdateSchema contract in packages/contracts).
 */
export function mergeSessionFields(
  sessionData: Record<string, unknown>,
): Record<string, string> {
  const merged: Record<string, string> = {}
  const put = (key: string, value: unknown) => {
    if (typeof value === 'string' && value.trim()) merged[key] = value.trim()
  }
  const identity = (sessionData.identity ?? {}) as Record<string, unknown>
  put('first_name', sessionData.first_name ?? identity.first_name)
  put('last_name', sessionData.last_name ?? identity.last_name)
  put('dob', sessionData.dob ?? identity.dob)
  put('document_number', sessionData.document_number)
  put('nationality', sessionData.nationality)
  put('gender', sessionData.gender)
  put('address', sessionData.address)
  put('email', sessionData.email)
  put('phone_number', sessionData.phone_number)
  put('device', sessionData.device)
  put('ipAddress', sessionData.ipAddress ?? sessionData.ip)

  const ocrFields = (sessionData.ocrExtractedFields ?? {}) as Record<
    string,
    { value?: string } | string | undefined
  >
  for (const [key, field] of Object.entries(ocrFields)) {
    const value = typeof field === 'string' ? field : field?.value
    if (typeof value === 'string' && value.trim()) merged[key] = value.trim()
  }
  return merged
}

const IDENTIFIER_TYPES: Array<{ type: string; keys: string[] }> = [
  {
    type: 'documentNumber',
    keys: [
      'document_number',
      'id_number',
      'license_number',
      'pan_number',
      'reference_number',
    ],
  },
  { type: 'taxId', keys: ['tax_id', 'pan_number'] },
  { type: 'email', keys: ['email'] },
  { type: 'phone', keys: ['phone_number', 'phone'] },
  { type: 'address', keys: ['address'] },
  { type: 'ip', keys: ['ipAddress', 'ip'] },
  { type: 'deviceId', keys: ['device'] },
]

/** Maps merged session fields onto the graph Identifier taxonomy. */
export function submittedIdentifiers(
  fields: Record<string, string>,
): Array<{ type: string; value: string }> {
  const identifiers: Array<{ type: string; value: string }> = []
  const seen = new Set<string>()
  for (const { type, keys } of IDENTIFIER_TYPES) {
    for (const key of keys) {
      const value = fields[key]
      if (!value) continue
      const dedupeKey = `${type}:${value.toLowerCase()}`
      if (seen.has(dedupeKey)) break
      seen.add(dedupeKey)
      identifiers.push({ type, value })
      break
    }
  }
  return identifiers
}
