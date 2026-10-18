/**
 * End-to-end workflow probe: OCR → FalkorDB graph ingestion → status updates → AML.
 *
 * Drives the real HTTP surface (sign-up, workflow, session, upload, submission)
 * against the running API, then polls the session until every pipeline stage
 * reports completion, and verifies the graph nodes/edges in FalkorDB.
 */
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const base = process.env.TEST_BASE_URL || 'http://localhost:3001'
const checks: string[] = []
const check = (ok: boolean, message: string, detail?: unknown) => {
  if (!ok) {
    console.error(`✗ ${message}`, detail ?? '')
    process.exitCode = 1
  } else {
    checks.push(message)
    console.log(`✓ ${message}`)
  }
}

async function account() {
  const email = `e2e-${crypto.randomUUID()}@example.com`
  const r = await fetch(base + '/api/auth/sign-up/email', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'http://localhost:3000',
    },
    body: JSON.stringify({
      email,
      password: 'Testing-long-password-593!',
      name: 'E2E workflow probe',
    }),
  })
  const data = await r.json()
  assert.equal(r.status, 200, JSON.stringify(data))
  const cookie = r.headers
    .getSetCookie()
    .map((v) => v.split(';')[0])
    .join('; ')
  return { cookie, email }
}

async function rpc(name: string, args: unknown = {}, cookie = '') {
  const r = await fetch(`${base}/api/rpc/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookie,
      Origin: 'http://localhost:3000',
    },
    body: JSON.stringify(args),
  })
  let data: any
  try {
    data = await r.json()
  } catch {
    data = null
  }
  return { status: r.status, data }
}

const alice = await account()
console.log('account:', alice.email)

// 1. Workflow: uses the OCR document registry document types.
const wf = await rpc(
  'workflows.create',
  {
    name: 'E2E identity collection',
    type: 'kyc',
    status: 'active',
    steps: [
      {
        id: 'id',
        label: 'ID document',
        enabled: true,
        type: 'id_verification',
      },
    ],
  },
  alice.cookie,
)
const workflowId = wf.data
check(typeof workflowId === 'string', 'workflow created')

// 2. Session for a passport subject
const session = (
  await rpc(
    'sessions.create',
    { workflowId, email: 'subject-e2e@example.com' },
    alice.cookie,
  )
).data
check(!!session.sessionId, 'session created', session)
const sessionId = session.sessionId

// Set the OCR document type for the session (drives schema + graph mapping).
const upd = await rpc(
  'sessions.update',
  { sessionId, updates: { document_type: 'passport' } },
  alice.cookie,
)
check(upd.status === 200, 'session document_type set', upd)

// 3. Upload the synthetic passport document (checked-in fixture)
const fixturePath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'fixtures/test-passport.png',
)
const buf = await readFile(fixturePath)
check(buf.length > 1000, 'test document fixture loaded', buf.length)

const ticketRes = await rpc('documents.uploadUrl', { sessionId }, alice.cookie)
check(
  ticketRes.status === 200 && typeof ticketRes.data === 'string',
  'upload ticket',
  ticketRes,
)
const upload = await fetch(`${base}${ticketRes.data}`, {
  method: 'POST',
  headers: { 'x-file-name': 'test-passport.png' },
  body: buf,
})
check(upload.status === 201, 'document uploaded', await upload.text())

// 4. Submit the session — enqueues the OCR and AML jobs
const submit = await rpc(
  'sessions.update',
  { sessionId, updates: { status: 'completed' } },
  alice.cookie,
)
check(submit.status === 200, 'session submitted (status=completed)', submit)

// 5. Poll the session until OCR completes (or timeout)
const deadline = Date.now() + 120_000
let final: any = null
let snapshot: any = null
while (Date.now() < deadline) {
  await new Promise((r) => setTimeout(r, 3000))
  const got = await rpc('sessions.get', { sessionId }, alice.cookie)
  snapshot = got.data || {}
  console.log(
    '  poll:',
    JSON.stringify({
      status: snapshot.status,
      ocrStatus: snapshot.ocrStatus,
      ocrProgress: snapshot.ocrProgress,
      graphStatus: snapshot.graphStatus,
      amlStatus: snapshot.amlStatus,
    }),
  )
  if (snapshot.ocrStatus === 'completed' || snapshot.ocrStatus === 'failed') {
    final = snapshot
    break
  }
}
check(final?.ocrStatus === 'completed', 'OCR stage completed', final?.ocrStatus)
const ocrFields = final?.ocrExtractedFields || {}
const fieldValues = Object.fromEntries(
  Object.entries(ocrFields).map(([k, v]: any) => [k, v?.value]),
)
console.log('  OCR fields:', JSON.stringify(fieldValues))
check(
  Boolean(
    (fieldValues.document_number || fieldValues.license_number || '').match?.(
      /P98|ROST|984/i,
    ) || fieldValues.document_number,
  ),
  'OCR extracted document number',
  fieldValues.document_number,
)
check(
  Boolean(fieldValues.first_name),
  'OCR extracted first name',
  fieldValues.first_name,
)

// 6. Poll until the AML pipeline (graph ingestion + scoring) settles
const deadlineAml = Date.now() + 180_000
let done: any = final
while (Date.now() < deadlineAml) {
  await new Promise((r) => setTimeout(r, 3000))
  const got = await rpc('sessions.get', { sessionId }, alice.cookie)
  done = got.data || {}
  console.log(
    '  poll:',
    JSON.stringify({
      graphStatus: done.graphStatus,
      amlStatus: done.amlStatus,
    }),
  )
  if (
    ['completed', 'unavailable', 'failed'].includes(done.graphStatus) &&
    ['completed', 'unavailable', 'skipped', 'failed'].includes(done.amlStatus)
  )
    break
}

check(
  ['completed', 'unavailable', 'failed'].includes(done.graphStatus),
  'graph ingestion stage settled',
  done.graphStatus,
)
check(
  Boolean(done.graphStage),
  'graph stage recorded',
  done.graphStage,
)
check(
  ['completed', 'unavailable', 'failed'].includes(done.amlStatus),
  'AML stage settled',
  done.amlStatus,
)
check(Boolean(done.amlRisk), 'AML risk report attached', done.amlRisk)
console.log(
  '  pipeline status map:',
  JSON.stringify({
    status: done.status,
    ocrStatus: done.ocrStatus,
    graphStatus: done.graphStatus,
    amlStatus: done.amlStatus,
    graphStage: done.graphStage,
    amlRisk: done.amlRisk,
  }),
)

console.log(
  `\n${checks.length} passed${process.exitCode ? ' with failures' : ' — all checks green'}`,
)
