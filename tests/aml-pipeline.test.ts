import { describe, it, expect } from 'vitest'
import {
  mergeSessionFields,
  submittedIdentifiers,
} from '../server/aml/fields.js'

describe('AML pipeline field merging', () => {
  it('merges self-reported identity hints with session fields', () => {
    const fields = mergeSessionFields({
      first_name: ' Grace ',
      last_name: 'Miller',
      document_number: 'P1234567',
      nationality: 'United States',
      address: '1 Laptop Farm Ave',
      email: 'grace@example.com',
      phone_number: '+1 555 0100',
      device: 'DEV-LAPTOP-FARM-22',
      ipAddress: '175.45.176.10',
      identity: { first_name: 'IGNORED', dob: '1990-04-02' },
    })
    // Top-level session fields win over the identity hints.
    expect(fields.first_name).toBe('Grace')
    expect(fields.dob).toBe('1990-04-02')
    expect(fields.document_number).toBe('P1234567')
    expect(fields.ipAddress).toBe('175.45.176.10')
  })

  it('lets OCR document readings override the hints', () => {
    const fields = mergeSessionFields({
      first_name: 'Hint',
      document_number: 'HINTED',
      identity: { last_name: 'Hintson' },
      ocrExtractedFields: {
        first_name: { value: 'Michael', confidence: 0.95 },
        last_name: { value: 'Torres', confidence: 0.93 },
        document_number: { value: 'P88349124', confidence: 0.9 },
        // OCR rows without a value never override.
        expiry_date: { value: undefined, confidence: 0 },
      },
    })
    expect(fields.first_name).toBe('Michael')
    expect(fields.last_name).toBe('Torres')
    expect(fields.document_number).toBe('P88349124')
    expect(fields.expiry_date).toBeUndefined()
  })

  it('maps merged fields onto the graph identifier taxonomy', () => {
    const identifiers = submittedIdentifiers({
      document_number: 'P88349124',
      email: 'alex@example.com',
      phone_number: '+44 20 7946 0958',
      address: '42 Baker Street, London',
      ipAddress: '203.0.113.7',
      device: 'DEV-9',
    })
    expect(identifiers).toEqual([
      { type: 'documentNumber', value: 'P88349124' },
      { type: 'email', value: 'alex@example.com' },
      { type: 'phone', value: '+44 20 7946 0958' },
      { type: 'address', value: '42 Baker Street, London' },
      { type: 'ip', value: '203.0.113.7' },
      { type: 'deviceId', value: 'DEV-9' },
    ])
  })

  it('deduplicates identifiers and skips missing ones', () => {
    const identifiers = submittedIdentifiers({ pan_number: 'ABCDE1234F' })
    expect(identifiers).toEqual([
      { type: 'documentNumber', value: 'ABCDE1234F' },
      { type: 'taxId', value: 'ABCDE1234F' },
    ])
  })
})
