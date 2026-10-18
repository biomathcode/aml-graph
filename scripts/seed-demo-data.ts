/**
 * Sample-data seeding through the real verification pipeline.
 *
 * `npm run demo:seed` (server + Postgres + FalkorDB + OCR service running):
 *   1. Renders the OCR-able synthetic passport scans (see gen-demo-documents).
 *   2. Signs up / signs in a demo operator.
 *   3. Creates the two sample workflows (KYC + DPRK employee screening).
 *   4. Submits 4 subjects through the live flow — two legitimate customers
 *      and two DPRK-scheme "contractors" sharing the laptop-farm device and
 *      DPRK-allocated IP (identifiers captured server-side).
 *   5. Waits for each OCR → graph → AML run and prints the extracted fields
 *      plus the AML report, mentioning the review URLs.
 */
import {
  defaults,
  demoOperator,
  ensureWorkflows,
  retryAmlAndWait,
  submitSubject,
  waitForPipeline,
  workflowForSubject,
} from './demo-e2e-lib.js'
import { buildDemoSubjects } from './gen-demo-documents.js'

async function main() {
  const cfg = defaults()
  console.log(`[demo] OpenKYC sample-data seed against ${cfg.base}`)

  // Unique identifiers per run — the graph persists across runs.
  const subjects = buildDemoSubjects()

  console.log('[demo] rendering sample passport documents…')
  const { renderDemoDocuments } = await import('./gen-demo-documents.js')
  await renderDemoDocuments(subjects)

  const operator = await demoOperator(cfg)
  console.log(`[demo] operator authenticated: ${operator.email}`)

  const workflows = await ensureWorkflows(operator.cookie, cfg)
  console.log(
    `[demo] workflows ready: ${workflows.kycId} (kyc) / ${workflows.dprkId} (dprk)`,
  )

  const results: Array<{
    id: string
    name: string
    workflow: string
    sessionId: string
    pipeline: Awaited<ReturnType<typeof waitForPipeline>>
  }> = []

  for (const subject of subjects) {
    const wf = workflowForSubject(subject)
    console.log(
      `\n[run] ${subject.firstName} ${subject.lastName} → ${wf} workflow`,
    )
    const s = await submitSubject({
      base: cfg.base,
      cookie: operator.cookie,
      workflowId: wf === 'kyc' ? workflows.kycId : workflows.dprkId,
      subject,
    })
    console.log(`      session ${s.sessionId}`)
    const pipeline = await waitForPipeline({
      base: cfg.base,
      cookie: operator.cookie,
      sessionId: s.sessionId,
    })
    results.push({
      id: subject.id,
      name: `${subject.firstName} ${subject.lastName}`,
      workflow: wf,
      sessionId: s.sessionId,
      pipeline,
    })
  }

  // Catch-up pass: a subject whose shared-infrastructure peers were ingested
  // after its own screening ran gets a re-score so the collision evidence
  // (shared device/IP identifier) is reflected in both reports.
  for (const r of results) {
    if (r.workflow !== 'dprk') continue
    if (['high', 'critical'].includes(r.pipeline?.aml?.level)) continue
    console.log(
      `\n[re-score] ${r.name}: new shared-infrastructure evidence landed — re-running AML`,
    )
    r.pipeline = await retryAmlAndWait(cfg.base, operator.cookie, r.sessionId)
  }

  console.log('\n================ SAMPLE DATA REPORT ================')
  for (const r of results) {
    const aml = r.pipeline.aml ?? {}
    const signals = (aml.signals ?? [])
      .map((sig: any) => `${sig.type}(${sig.severity})`)
      .join(', ')
    const extracted = Object.entries(r.pipeline.extracted)
      .filter(([, v]) => v)
      .map(([k, v]) => `${k}=${v}`)
      .join(' | ')
    console.log(`\n● ${r.name} — ${r.workflow} — ${r.sessionId}`)
    console.log(`  review: /verifications/${r.sessionId}`)
    console.log(
      `  pipeline: ocr=${r.pipeline.ocrStatus} graph=${r.pipeline.graphStatus} aml=${r.pipeline.amlStatus}`,
    )
    if (extracted) console.log(`  extracted: ${extracted}`)
    console.log(
      `  aml: level=${aml.level} score=${aml.riskScore} signals: ${signals || 'none'}`,
    )
  }
  console.log('\n[demo] done — open /verifications in the app to review.')
}

main().catch((err) => {
  console.error('[demo] failed:', err)
  process.exit(1)
})
