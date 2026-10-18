/**
 * End-to-end test: DPRK IT-worker screening through the real pipeline.
 *
 * Requires the full stack running (npm run dev:all or dev server + docker):
 * workflow creation → session submission (sample passport scans) → OCR →
 * graph ingestion → NK indicator algorithms → AML report on the session.
 *
 * Run with: npm run test:e2e-screening
 */
import assert from 'node:assert/strict'
import {
  defaults,
  demoOperator,
  ensureWorkflows,
  retryAmlAndWait,
  rpc,
  submitSubject,
  waitForPipeline,
  workflowForSubject,
} from '../scripts/demo-e2e-lib.js'
import { buildDemoSubjects } from '../scripts/gen-demo-documents.js'

function check(value: unknown, message: string) {
  assert.ok(value, `FAIL: ${message}`)
  console.log(`✓ ${message}`)
}

async function main() {
  const cfg = defaults()
  const base = cfg.base
  console.log(`[e2e] screening test against ${base}`)

  // Stack reachability probe with graceful skip.
  try {
    const probe = await fetch(base + '/api/rpc/workflows.list', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    assert.ok(probe.status === 401 || probe.status === 200, 'rpc reachable')
  } catch (err) {
    console.warn(
      '[e2e] OpenKYC stack unavailable — skipping NK screening e2e test.',
    )
    return
  }

  const operator = await demoOperator(cfg)
  const workflows = await ensureWorkflows(operator.cookie, cfg)
  check(workflows.kycId && workflows.dprkId, 'demo workflows exist')

  // Unique identifiers per run — the graph persists across runs, so a repeat
  // run must not collide with earlier submissions of the same faces.
  const subjects = buildDemoSubjects()
  await (
    await import('../scripts/gen-demo-documents.js')
  ).renderDemoDocuments(subjects)

  const results: Array<{
    name: string
    subject: (typeof subjects)[number]
    sessionId: string
    pipeline: Awaited<ReturnType<typeof waitForPipeline>>
  }> = []

  for (const subject of subjects) {
    const wf = workflowForSubject(subject)
    const submitted = await submitSubject({
      base,
      cookie: operator.cookie,
      workflowId: wf === 'kyc' ? workflows.kycId : workflows.dprkId,
      subject,
    })
    const pipeline = await waitForPipeline({
      base,
      cookie: operator.cookie,
      sessionId: submitted.sessionId,
    })
    assert.equal(pipeline.amlStatus, 'completed', `AML ran for ${subject.id}`)

    // Workflow-driven collection telemetry: the per-step form data the
    // collector captured (address_check, completed step keys, identity
    // hints, front-image slot) must land on the session.
    const detail = (
      await rpc(
        base,
        'sessions.get',
        { sessionId: submitted.sessionId },
        operator.cookie,
      )
    ).data as any
    const d = detail?.data ?? detail ?? {}
    check(d.front_image, `${subject.id}: front image slot set`)
    check(d.address, `${subject.id}: address collected (address_check)`)
    check(
      Array.isArray(d.completed_steps) && d.completed_steps.length > 0,
      `${subject.id}: workflow steps recorded (${(d.completed_steps || []).length})`,
    )
    check(
      String(d.identity?.first_name || '').toUpperCase() ===
        subject.firstName.toUpperCase() &&
        String(d.identity?.last_name || '').toUpperCase() ===
          subject.lastName.toUpperCase(),
      `${subject.id}: identity hints collected`,
    )

    results.push({
      name: `${subject.firstName} ${subject.lastName}`,
      subject,
      sessionId: submitted.sessionId,
      pipeline,
    })
  }

  // Re-score pass: a subject whose shared-infrastructure peer was ingested
  // after its own screening ran needs a second run to see the collision.
  for (const r of results) {
    if (r.subject.kind !== 'employee') continue
    const signals: string[] = (r.pipeline.aml?.signals ?? []).map((s: any) =>
      String(s.type),
    )
    if (signals.includes('dprk_shared_infrastructure')) continue
    console.log(`[e2e] re-scoring ${r.name} after peer ingestion…`)
    r.pipeline = await retryAmlAndWait(base, operator.cookie, r.sessionId)
  }

  for (const r of results) {
    const aml = r.pipeline.aml ?? {}
    const dprkSignals: string[] = (aml.signals ?? [])
      .filter((s: any) => String(s.type).startsWith('dprk_'))
      .map((s: any) => s.type)

    if (r.subject.kind === 'employee') {
      check(r.pipeline.ocrStatus === 'completed', `${r.name}: OCR completed`)
      check(
        r.pipeline.graphStatus === 'completed',
        `${r.name}: ingested into graph`,
      )
      check(
        r.pipeline.extracted.document_number === r.subject.documentNumber,
        `${r.name}: passport number extracted (${r.pipeline.extracted.document_number})`,
      )
      check(
        r.pipeline.extracted.last_name?.toUpperCase() === r.subject.lastName &&
          r.pipeline.extracted.first_name?.toUpperCase() ===
            r.subject.firstName,
        `${r.name}: identity fields extracted`,
      )
      check(
        ['high', 'critical'].includes(aml.level),
        `${r.name}: flagged (${aml.level}, score ${aml.riskScore})`,
      )
      check(
        dprkSignals.includes('dprk_it_worker_indicator'),
        `${r.name}: DPRK IT-worker indicator signal present`,
      )
      check(
        dprkSignals.includes('dprk_shared_infrastructure'),
        `${r.name}: shared device/IP flagged`,
      )
    } else {
      check(
        r.pipeline.amlStatus === 'completed' &&
          (aml.level === 'clean' || aml.level === 'low'),
        `${r.name}: clean customer stays unflagged (${aml.level}, score ${aml.riskScore})`,
      )
      check(dprkSignals.length === 0, `${r.name}: no DPRK signals`)
    }
  }

  console.log('\n[e2e] DPRK screening pipeline: all assertions passed.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
