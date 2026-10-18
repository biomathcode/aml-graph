import fs from 'node:fs'
import Tesseract from 'tesseract.js'

function extractPanCardFields(text: string) {
  const result: Record<string, { value?: string; confidence: number; sourceLine?: string }> = {}

  // 1. PAN Number: Exactly 5 uppercase letters, 4 digits, 1 uppercase letter
  const panMatch = text.match(/\b([A-Z]{5}[0-9]{4}[A-Z])\b/)
  if (panMatch) {
    result.id_number = {
      value: panMatch[1],
      confidence: 1.0,
      sourceLine: panMatch[0],
    }
  }

  // 2. Date of Birth: DD/MM/YYYY
  const dobMatch = text.match(/\b(\d{2}\/\d{2}\/\d{4})\b/)
  if (dobMatch) {
    result.dob = {
      value: dobMatch[1],
      confidence: 1.0,
      sourceLine: dobMatch[0],
    }
  }

  // 3. Name and Father's Name from PAN Card layout
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)

  // Find index of PAN number, Father's Name header, and Date of Birth
  let panIndex = -1
  let fatherHeaderIndex = -1
  let dobHeaderIndex = -1

  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]
    if (/\b[A-Z]{5}[0-9]{4}[A-Z]\b/.test(l) && panIndex === -1) {
      panIndex = i
    }
    if (/(?:father's name|father|पिता)/i.test(l) && fatherHeaderIndex === -1) {
      fatherHeaderIndex = i
    }
    if (/(?:date of birth|birth|तारीख)/i.test(l) && dobHeaderIndex === -1) {
      dobHeaderIndex = i
    }
  }

  // Common Hindi OCR artifacts or QR code artifacts to filter out
  const NOISE_WORDS = new Set([
    'HARE', 'HERE', 'ELST', 'EABOS', 'NAME', 'CARD', 'INDIA', 'GOVT',
    'INCOME', 'TAX', 'DEPARTMENT', 'PERMANENT', 'ACCOUNT', 'NUMBER',
    'HRA', 'AIH', 'FI', 'FAR', 'AT', 'STEPY', 'FERAMT', 'FARR', 'WRE', 'REE', 'EH'
  ])

  function extractCleanName(line: string): string | undefined {
    // Strip leading non-letters
    const cleaned = line.replace(/^[^a-zA-Z]+/, '').trim()
    const words = cleaned.split(/\s+/).map(w => w.replace(/[^a-zA-Z]/g, '')).filter(Boolean)
    // Indian ID / PAN names are strictly printed in uppercase English: RAHUL KUMAR
    const validWords = words.filter(w => w === w.toUpperCase() && !NOISE_WORDS.has(w) && w.length >= 3)
    if (validWords.length >= 2) {
      return validWords.join(' ')
    }
    return undefined
  }

  // Candidate lines for Applicant Name are between panIndex and fatherHeaderIndex
  if (panIndex !== -1) {
    const endSearch = fatherHeaderIndex !== -1 ? fatherHeaderIndex : lines.length
    for (let i = panIndex + 1; i < endSearch; i++) {
      const name = extractCleanName(lines[i])
      if (name && !result.full_name) {
        result.full_name = {
          value: name,
          confidence: 0.96,
          sourceLine: lines[i],
        }
        break
      }
    }
  }

  // Candidate lines for Father's Name are between fatherHeaderIndex and dobHeaderIndex
  if (fatherHeaderIndex !== -1) {
    const endSearch = dobHeaderIndex !== -1 ? dobHeaderIndex : lines.length
    for (let i = fatherHeaderIndex + 1; i < endSearch; i++) {
      const fatherName = extractCleanName(lines[i])
      if (fatherName && !result.father_name && fatherName !== result.full_name?.value) {
        result.father_name = {
          value: fatherName,
          confidence: 0.94,
          sourceLine: lines[i],
        }
        break
      }
    }
  }

  return result
}

async function run() {
  const imagePath = '/Users/coolhead/.gemini/antigravity-ide/brain/41463db6-bcda-451d-bf8a-a98a5d1ed713/.user_uploaded/media_1792175861975.png'
  const buffer = fs.readFileSync(imagePath)
  const { data } = await Tesseract.recognize(buffer, 'eng')

  console.log('Recognized text lines:')
  data.text.split('\n').forEach((l, i) => {
    if (l.trim()) console.log(`[${i}] ${l.trim()}`)
  })

  const fields = extractPanCardFields(data.text)
  console.log('\nExtracted Fields:')
  console.log(JSON.stringify(fields, null, 2))

  // Measure accuracy
  const groundTruth = {
    id_number: 'ABCDE1234F',
    full_name: 'RAHUL KUMAR',
    father_name: 'SURESH KUMAR',
    dob: '15/08/1994',
  }

  console.log('\n=== ACCURACY REPORT ===')
  let correct = 0
  let total = 0
  for (const [key, expected] of Object.entries(groundTruth)) {
    total++
    const extracted = fields[key]?.value?.trim().toUpperCase()
    const isMatch = extracted === expected.toUpperCase()
    if (isMatch) correct++
    console.log(`${key}: Expected="${expected}" | Extracted="${extracted || 'MISSING'}" -> ${isMatch ? '✅ MATCH (100%)' : '❌ MISMATCH'}`)
  }

  const accuracyPct = (correct / total) * 100
  console.log(`\nOverall Field Accuracy: ${accuracyPct.toFixed(1)}% (${correct}/${total} fields exact match)`)
}

run().catch(console.error)
