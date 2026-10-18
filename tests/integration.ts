import assert from 'node:assert/strict'
const base = process.env.TEST_BASE_URL || 'http://localhost:3000'
// Better Auth validates the Origin header against APP_URL; the test server
// may run on a different port, so the origin must be overridden explicitly.
const origin = process.env.TEST_ORIGIN || base
let checks = 0
const check = (value: unknown, message: string) => {
  assert.ok(value, message)
  checks++
  console.log(`✓ ${message}`)
}
async function account() {
  const email = `test-${crypto.randomUUID()}@example.com`
  const r = await fetch(base + '/api/auth/sign-up/email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin },
    body: JSON.stringify({
      email,
      password: 'Testing-long-password-593!',
      name: 'Integration tester',
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
async function rpc(name: string, args: unknown = {}, cookie = '', token = '') {
  const r = await fetch(`${base}/api/rpc/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(cookie ? { Cookie: cookie } : {}),
      ...(token ? { 'X-Session-Token': token } : {}),
    },
    body: JSON.stringify(args),
  })
  return { status: r.status, data: await r.json() }
}
const alice = await account(),
  bob = await account()
const workflow = (
  await rpc(
    'workflows.create',
    {
      name: 'Identity collection',
      type: 'kyc',
      status: 'active',
      steps: [
        {
          id: 'id',
          label: 'ID document',
          enabled: true,
          type: 'id_verification',
          documentType: 'passport',
        },
      ],
    },
    alice.cookie,
  )
).data
check(typeof workflow === 'string', 'create workflow')
check(
  (await rpc('workflows.get', { id: workflow }, alice.cookie)).data?.steps?.[0]
    ?.documentType === 'passport',
  'persist per-step requested document type',
)
check(
  (await rpc('workflows.list', {}, bob.cookie)).data.length === 0,
  'workflow tenant isolation',
)
check(
  (await rpc('workflows.update', { id: workflow, name: 'Stolen' }, bob.cookie))
    .status === 404,
  'reject cross-tenant workflow update',
)
const session = (
  await rpc(
    'sessions.create',
    { workflowId: workflow, email: 'subject@example.com' },
    alice.cookie,
  )
).data
check(!!session.publicToken, 'create secret collection link')
check(
  (
    await rpc('sessions.get', { sessionId: session.sessionId }, alice.cookie)
  ).data?.workflowSnapshot?.steps?.[0]?.documentType === 'passport',
  'session snapshot carries per-step requested document type',
)
check(
  (await rpc('sessions.get', { sessionId: session.sessionId })).status === 404,
  'deny public session access without token',
)
check(
  (await rpc('sessions.get', { sessionId: session.sessionId }, bob.cookie))
    .status === 404,
  'deny another tenant session access',
)
check(
  (
    await rpc(
      'sessions.get',
      { sessionId: session.sessionId },
      '',
      session.publicToken,
    )
  ).status === 200,
  'allow valid public token',
)
check(
  (
    await rpc(
      'sessions.update',
      { sessionId: session.sessionId, updates: { status: 'completed' } },
      '',
      session.publicToken,
    )
  ).status === 400,
  'prevent empty submission',
)
check(
  (
    await rpc(
      'sessions.update',
      { sessionId: session.sessionId, updates: { reviewStatus: 'approved' } },
      '',
      session.publicToken,
    )
  ).status === 400,
  'prevent public approval injection',
)
const ticket = (
  await rpc(
    'documents.uploadUrl',
    { sessionId: session.sessionId },
    '',
    session.publicToken,
  )
).data
const pdf = Buffer.from(
  '%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF',
)
const upload = await fetch(base + ticket, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/pdf',
    'X-File-Name': encodeURIComponent('Identity document.pdf'),
  },
  body: pdf,
})
const file = await upload.json()
check(upload.status === 201, 'collect PDF document')
check(
  (await fetch(base + ticket, { method: 'POST', body: pdf })).status === 410,
  'upload tickets are single use',
)
check(
  (
    await fetch(`${base}/api/files/${file.storageId}`, {
      headers: { Cookie: bob.cookie },
    })
  ).status === 404,
  'deny cross-tenant file downloads',
)
check(
  (await fetch(`${base}/api/files/${file.storageId}`)).status === 401,
  'deny unauthenticated file downloads',
)
const download = await fetch(`${base}/api/files/${file.storageId}`, {
  headers: { Cookie: alice.cookie },
})
check(
  download.status === 200 &&
    Buffer.from(await download.arrayBuffer()).equals(pdf),
  'private PDF download preserves bytes',
)
check(
  (await rpc('documents.list', { term: 'Identity document' }, alice.cookie))
    .data.length === 1,
  'search collected documents by filename',
)
const invalidTicket = (await rpc('documents.uploadUrl', {}, alice.cookie)).data
check(
  (
    await fetch(base + invalidTicket, {
      method: 'POST',
      headers: { 'Content-Type': 'application/pdf' },
      body: '<script>alert(1)</script>',
    })
  ).status === 415,
  'reject spoofed file MIME types',
)
check(
  (
    await rpc(
      'sessions.update',
      { sessionId: session.sessionId, updates: { status: 'completed' } },
      '',
      session.publicToken,
    )
  ).status === 200,
  'submit collected documents',
)
check(
  (
    await rpc(
      'sessions.update',
      { sessionId: session.sessionId, updates: { status: 'in_progress' } },
      '',
      session.publicToken,
    )
  ).status === 409,
  'cannot reopen submitted session',
)
check(
  (
    await rpc(
      'documents.uploadUrl',
      { sessionId: session.sessionId },
      '',
      session.publicToken,
    )
  ).status === 409,
  'cannot add files after submission',
)
check(
  (
    await rpc(
      'sessions.review',
      {
        sessionId: session.sessionId,
        decision: 'approved',
        notes: 'Reviewed original document',
      },
      alice.cookie,
    )
  ).status === 200,
  'manual review records decision',
)
check(
  (await rpc('analytics.get', {}, alice.cookie)).data.approved === 1,
  'analytics reflect approval',
)
await rpc(
  'settings.update',
  { publicName: 'Example Ltd', webhookUrl: 'https://hooks.example.com' },
  alice.cookie,
)
const publicView = (
  await rpc(
    'sessions.get',
    { sessionId: session.sessionId },
    '',
    session.publicToken,
  )
).data
check(
  publicView.branding.publicName === 'Example Ltd' &&
    !('webhookUrl' in publicView.branding) &&
    !('publicToken' in publicView),
  'public view limits sensitive fields',
)
const key = (
  await rpc('developer.createKey', { name: 'Test integration' }, alice.cookie)
).data.key
check(
  (
    await fetch(base + '/api/v1/sessions', {
      headers: { Authorization: `Bearer ${key}` },
    })
  ).status === 200,
  'developer API authenticates with key',
)
const keys = (await rpc('developer.keys', {}, alice.cookie)).data
await rpc('developer.revokeKey', { id: keys[0].id }, alice.cookie)
check(
  (
    await fetch(base + '/api/v1/sessions', {
      headers: { Authorization: `Bearer ${key}` },
    })
  ).status === 401,
  'API key revocation is immediate',
)
const q = (
  await rpc('questionnaires.create', { title: 'Source of funds' }, alice.cookie)
).data
const question = (
  await rpc(
    'questions.create',
    {
      questionnaireId: q,
      text: 'What is your source of funds?',
      required: true,
      order: 0,
    },
    alice.cookie,
  )
).data
await rpc(
  'questionnaires.update',
  { id: q, title: 'Source of funds', isPublished: true },
  alice.cookie,
)
const form = (await rpc('questionnaires.get', { id: q }, alice.cookie)).data
const formUrl = `${base}/api/public/questionnaires/${form.publicToken}`
check(
  (await fetch(formUrl)).status === 200,
  'published questionnaire accessible',
)
check(
  (
    await fetch(formUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answers: {} }),
    })
  ).status === 400,
  'required answers enforced',
)
check(
  (
    await fetch(formUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answers: { [question]: 'Employment' } }),
    })
  ).status === 201,
  'public questionnaire submission',
)
check(
  (await rpc('questionnaires.responses', { id: q }, alice.cookie)).data
    .length === 1,
  'owner can read questionnaire responses',
)
check(
  (await rpc('questionnaires.responses', { id: q }, bob.cookie)).status === 404,
  'questionnaire responses tenant isolation',
)
await rpc(
  'questionnaires.update',
  { id: q, title: 'Source of funds', isPublished: false },
  alice.cookie,
)
check(
  (await fetch(formUrl)).status === 404,
  'unpublishing disables public access',
)
await rpc('questionnaires.delete', { id: q }, alice.cookie)
check(
  (await rpc('sessions.delete', { sessionId: session.sessionId }, alice.cookie))
    .status === 200,
  'delete session and documents',
)
check(
  (
    await fetch(`${base}/api/files/${file.storageId}`, {
      headers: { Cookie: alice.cookie },
    })
  ).status === 404,
  'deleted file no longer available',
)
await rpc('workflows.delete', { id: workflow }, alice.cookie)
console.log(`Integration suite passed: ${checks} checks`)
