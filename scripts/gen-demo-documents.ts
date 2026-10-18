/**
 * Demo document factory.
 *
 * Renders OCR-able synthetic passport scans (PNG) for sample/demo data using
 * the project's installed Playwright Chromium — no image-processing deps.
 * Each passport carries a valid-position TD3 MRZ (document number, nationality,
 * DOB, gender, expiry) that `parseMRZLines` (server/ocr.ts) and the Indra OCR
 * service both read for field extraction.
 *
 * Subjects modeled after the DPRK remote-worker scheme indicator set
 * (July 2026 joint advisory): the "operatives" share a laptop-farm device and
 * a DPRK-allocated IP captured at submission time; the control subjects are
 * legitimate customers with unique device fingerprints and consumer IPs.
 */
import { chromium } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
export const FIXTURES_DIR = resolve(HERE, '..', 'tests', 'fixtures')

export type DemoSubjectId =
  'michael_torres' | 'nora_larsen' | 'grace_miller' | 'daniel_cooper'

export interface DemoSubject {
  id: DemoSubjectId
  kind: 'customer' | 'employee'
  firstName: string
  lastName: string
  dob: string // d/m/yyyy as submitted on the form
  mrzDob: string // YYMMDD
  gender: 'M' | 'F'
  expiryMrz: string // YYMMDD
  issuingState: string // MRZ nationality/L1 code
  documentNumber: string
  /** Device fingerprint submitted at collection (laptop-farm shared device). */
  device: string
  /** Connection IP captured at the edge; operatives share the DPRK block. */
  ipAddress: string
  mrzName: string // lastName<<firstName ( sirname-first form)
}

/** Shared laptop-farm infrastructure — same as the benchmark graph typology. */
const FARM_DEVICE = 'DEV-LAPTOP-FARM-22'
const FARM_IP = '175.45.176.72' // DPRK-nationally allocated 175.45.176.0/24

/**
 * The knowledge graph persists across runs, so every submission must carry
 * unique identifiers (document number, device fingerprint, connection IP) —
 * otherwise an earlier run of the same subject registers as a *second* person
 * and trips the shared-infrastructure DPRK indicators on re-runs. Only the
 * laptop-farm device/IP affinity (the detection signal) stays stable.
 */
export function buildDemoSubjects(): DemoSubject[] {
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase()
  const farmIp = `175.45.176.${2 + Math.floor(Math.random() * 252)}`
  const documentNumber = (base: string) =>
    `${base[0]}${Array.from({ length: base.length - 1 }, () =>
      Math.floor(Math.random() * 10),
    ).join('')}`
  return DEMO_SUBJECTS.map((s) =>
    s.kind === 'employee'
      ? {
          ...s,
          documentNumber: documentNumber(s.documentNumber),
          device: `${FARM_DEVICE}-${suffix}`,
          // Same DPRK /24 block as the real scheme (I4), shared by the farm.
          ipAddress: farmIp,
        }
      : {
          ...s,
          documentNumber: documentNumber(s.documentNumber),
          device: `${s.device}-${suffix}`,
          ipAddress:
            s.id === 'michael_torres'
              ? `203.0.113.${2 + Math.floor(Math.random() * 252)}`
              : `192.0.2.${2 + Math.floor(Math.random() * 252)}`,
        },
  )
}

export const DEMO_SUBJECTS: DemoSubject[] = [
  {
    id: 'michael_torres',
    kind: 'customer',
    firstName: 'MICHAEL',
    lastName: 'TORRES',
    dob: '24/12/1987',
    mrzDob: '871224',
    gender: 'M',
    expiryMrz: '290309',
    issuingState: 'USA',
    documentNumber: 'P88349124',
    device: 'DEV-IPHONE-TORRES-A1',
    ipAddress: '203.0.113.7',
    mrzName: 'TORRES<<MICHAEL',
  },
  {
    id: 'nora_larsen',
    kind: 'customer',
    firstName: 'NORA',
    lastName: 'LARSEN',
    dob: '21/01/1991',
    mrzDob: '910121',
    gender: 'F',
    expiryMrz: '270824',
    issuingState: 'CAN',
    documentNumber: 'N09173884',
    device: 'DEV-DESKTOP-LARSEN-B2',
    ipAddress: '192.0.2.44',
    mrzName: 'LARSEN<<NORA',
  },
  {
    id: 'grace_miller',
    kind: 'employee',
    firstName: 'GRACE',
    lastName: 'MILLER',
    dob: '09/02/1996',
    mrzDob: '960209',
    gender: 'F',
    expiryMrz: '290612',
    // Falsified identity claim (I1-style realistic case: they do NOT flag
    // themselves as DPRK — the infrastructure exposes them instead).
    issuingState: 'USA',
    documentNumber: 'G84221190',
    device: FARM_DEVICE,
    ipAddress: FARM_IP,
    mrzName: 'MILLER<<GRACE',
  },
  {
    id: 'daniel_cooper',
    kind: 'employee',
    firstName: 'DANIEL',
    lastName: 'COOPER',
    dob: '15/08/1994',
    mrzDob: '940815',
    gender: 'M',
    expiryMrz: '290927',
    issuingState: 'USA',
    documentNumber: 'D75140223',
    device: FARM_DEVICE,
    ipAddress: FARM_IP,
    mrzName: 'COOPER<<DANIEL',
  },
]

/** TD3 line-2 with filler check-digit positions aligned to parseMRZLines. */
function mrzLine2(s: DemoSubject): string {
  const head = [
    s.documentNumber, // 0-8 (9 chars)
    '9', // 9: check digit (decorative)
    s.issuingState, // 10-12
    s.mrzDob, // 13-18
    '3', // 19: check digit (decorative)
    s.gender, // 20
    s.expiryMrz, // 21-26
    '6', // 27: check digit (decorative)
  ].join('')
  return head.padEnd(44, '<')
}

function mrzLine1(s: DemoSubject): string {
  return `P<${s.issuingState}${s.mrzName}`.padEnd(44, '<').slice(0, 44)
}

/** Exact-format MRZ guard used by the OCR readers. */
function assertMrzWellFormed(s: DemoSubject) {
  const l1 = mrzLine1(s)
  const l2 = mrzLine2(s)
  for (const line of [l1, l2]) {
    if (line.length !== 44 || !/^[A-Z0-9<]+$/.test(line)) {
      throw new Error(`Malformed MRZ for ${s.id}: "${line}"`)
    }
  }
  if (l2.slice(0, 9) !== s.documentNumber)
    throw new Error(`Document number misaligned for ${s.id}`)
}

function passportSvg(s: DemoSubject): string {
  assertMrzWellFormed(s)
  const nationalityHuman =
    s.issuingState === 'USA'
      ? 'UNITED STATES OF AMERICA'
      : s.issuingState === 'CAN'
        ? 'CANADA'
        : s.issuingState
  return `<!doctype html><html><head><meta charset="utf-8"></head>
<body style="margin:0;background:#fff">
<div style="width:1000px;padding:36px 40px;box-sizing:border-box;font-family:Arial,Helvetica,sans-serif;color:#111;background:#fff">
  <div style="display:flex;justify-content:space-between;border-bottom:3px solid #1a3a6b;padding-bottom:10px">
    <div style="font-size:26px;font-weight:700;letter-spacing:4px">${nationalityHuman}</div>
    <div style="font-size:15px;letter-spacing:2px">PASSPORT — TYPE P</div>
  </div>
  <div style="display:flex;gap:34px;margin-top:24px">
    <div style="width:230px;height:288px;border:2px solid #8899aa;box-sizing:border-box;display:flex;align-items:center;justify-content:center;color:#8899aa;font-size:12px;text-align:center">PASSPORT PHOTO<br/>ZONE</div>
    <div style="flex:1;font-size:19px;line-height:2">
      <div><span style="color:#556">Type&nbsp;&nbsp;&nbsp;&nbsp;</span><span style="font-family:'Courier New',monospace;font-weight:700">P</span></div>
      <div><span style="color:#556">Document No. </span><span style="font-family:'Courier New',monospace;font-weight:700">${s.documentNumber}</span></div>
      <div><span style="color:#556">Surname </span><span style="font-family:'Courier New',monospace;font-weight:700">${s.lastName}</span></div>
      <div><span style="color:#556">Given Names </span><span style="font-family:'Courier New',monospace;font-weight:700">${s.firstName}</span></div>
      <div><span style="color:#556">Nationality </span><span style="font-family:'Courier New',monospace;font-weight:700">${s.issuingState}</span></div>
      <div><span style="color:#556">Date of Birth </span><span style="font-family:'Courier New',monospace;font-weight:700">${s.dob}</span></div>
      <div><span style="color:#556">Sex </span><span style="font-family:'Courier New',monospace;font-weight:700">${s.gender}</span></div>
      <div><span style="color:#556">Date of Expiry </span><span style="font-family:'Courier New',monospace;font-weight:700">${s.expiryMrz.slice(4, 6)}/${s.expiryMrz.slice(2, 4)}/${s.expiryMrz.slice(0, 2)}</span></div>
      <div><span style="color:#556">Issuing Authority </span><span style="font-family:'Courier New',monospace;font-weight:700">MINISTRY OF FOREIGN AFFAIRS</span></div>
    </div>
  </div>
  <div style="margin-top:34px;background:#fff;padding:10px 0;font-family:'Courier New',monospace;font-weight:700;font-size:30px;white-space:pre;color:#000;transform:translateX(-6px)">
${mrzLine1(s)}
${mrzLine2(s)}
  </div>
</div>
</body></html>`
}

export function fixturePathFor(subjectId: DemoSubjectId): string {
  return resolve(FIXTURES_DIR, `passport_${subjectId}.png`)
}

/**
 * Renders the demo passports to PNG files under tests/fixtures/ and returns
 * their absolute paths (dispatched id -> path).
 */
export async function renderDemoDocuments(
  subjects: DemoSubject[] = DEMO_SUBJECTS,
): Promise<Record<DemoSubjectId, string>> {
  await mkdir(FIXTURES_DIR, { recursive: true })
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage({
      viewport: { width: 1080, height: 720 },
      deviceScaleFactor: 2,
    })
    const out = {} as Record<DemoSubjectId, string>
    for (const subject of subjects) {
      await page.setContent(passportSvg(subject), { waitUntil: 'load' })
      const path = fixturePathFor(subject.id)
      await page.locator('body > div').first().screenshot({ path })
      out[subject.id] = path
      console.log(`[demo-documents] rendered ${path}`)
    }
    return out
  } finally {
    await browser.close()
  }
}

// CLI entry: npm run demo:documents
if (
  process.argv[1] &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))
) {
  renderDemoDocuments()
    .then(() => console.log('[demo-documents] done'))
    .catch((err) => {
      console.error('[demo-documents] failed:', err)
      process.exit(1)
    })
}
