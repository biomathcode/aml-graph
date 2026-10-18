/**
 * Shared end-to-end demo pipeline.
 *
 * Drives the real OpenKYC flow over HTTP — the same route a live operator and
 * subject would take — so the DPRK IT-worker screening is exercised through
 * every stage: workflow → verification session → document upload → OCR
 * (Indra + local ensemble) → graph ingestion → AML algorithms → report.
 *
 * Used by `scripts/seed-demo-data.ts` (sample setup, no assertions) and
 * `tests/nk-screening-e2e.ts` (hard assertions, non-zero exit on failure).
 */
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  DEMO_SUBJECTS,
  fixturePathFor,
  type DemoSubject,
} from './gen-demo-documents.js'

export const DEMO_WORKFLOW_KYC = 'Standard Customer KYC Onboarding'
export const DEMO_WORKFLOW_DPRK = 'Employee & Contractor DPRK Screening'

const EMAIL_DOMAIN = 'demo-subjects.openkyc.dev'

/** Run-unique demo subject email: the graph persists across runs, so every
 * submission needs distinct identity anchors (email incl.). */
export function demoEmail(subjectId: string, runId = RUN_EMAIL_RUN): string {
  return `${subjectId.replace(/_/g, '.')}.${runId}@${EMAIL_DOMAIN}`
}
const RUN_EMAIL_RUN = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 4)}`

/** Run-unique suffix used for addresses too (the graph persists across runs). */
export function demoRunId(): string {
  return RUN_EMAIL_RUN
}

export function defaults() {
  return {
    base:
      process.env.DEMO_BASE_URL ||
      process.env.TEST_BASE_URL ||
      'http://localhost:3000',
    origin: process.env.DEMO_ORIGIN || process.env.TEST_ORIGIN || undefined,
    operatorEmail:
      process.env.DEMO_OPERATOR_EMAIL || 'demo-operator@openkyc.dev',
    operatorPassword: 'DemoOperator-2026-pass!',
  }
}

export async function demoOperator(opts: {
  base: string
  origin?: string
  operatorEmail?: string
  operatorPassword?: string
  email?: string
  password?: string
}) {
  const { base, origin } = opts
  const password = opts.password ?? opts.operatorPassword!
  const email = /@/.test(opts.email ?? opts.operatorEmail ?? '')
    ? (opts.email ?? opts.operatorEmail!)
    : `${(opts.email ?? opts.operatorEmail!).replace('@', `-${Date.now().toString(36)}+@`)}`
  let r = await fetch(base + '/api/auth/sign-up/email', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: origin || base,
    },
    body: JSON.stringify({ email, password, name: 'OpenKYC Demo Operator' }),
  })
  if (r.status !== 200) {
    // Already registered (re-run of the seed) — try sign-in instead.
    r = await fetch(base + '/api/auth/sign-in/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: origin || base },
      body: JSON.stringify({ email, password }),
    })
  }
  const data = await r.json().catch(() => ({}))
  if (r.status !== 200)
    throw new Error(
      `operator auth failed (${r.status}): ${JSON.stringify(data)}`,
    )
  const cookie = r.headers
    .getSetCookie()
    .map((v) => v.split(';')[0])
    .join('; ')
  return { email, password, cookie }
}

export async function rpc(
  base: string,
  name: string,
  args: unknown = {},
  cookie = '',
  token = '',
  extra: Record<string, string> = {},
) {
  const r = await fetch(`${base}/api/rpc/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(cookie ? { Cookie: cookie } : {}),
      ...(token ? { 'X-Session-Token': token } : {}),
      ...extra,
    },
    body: JSON.stringify(args),
  })
  const data = await r.json().catch(() => undefined)
  return { status: r.status, data }
}

/** Creates the two demo workflows; returns { kycId, dprkId } (idempotent). */
export async function ensureWorkflows(
  cookie: string,
  invite = {} as ReturnType<typeof defaults>,
) {
  const { base } = invite
  const list = await rpc(base, 'workflows.list', {}, cookie)
  assert.equal(list.status, 200, 'workflows.list')
  const existing = (list.data?.data ?? list.data ?? []) as Array<{
    id: string
    name: string
  }>
  const find = (name: string) => existing.find((w) => w.name === name)?.id
  const createWorkflow = async (wf: {
    name: string
    description: string
    type: string
    status: string
    steps: Array<{ type: string; documentType?: string }>
  }) => {
    const steps = wf.steps.map((s, i) => ({
      id: `${wf.type}-step-${i + 1}`,
      label: s.type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      enabled: true,
      type: s.type,
      ...(s.documentType ? { documentType: s.documentType } : {}),
    }))
    const created = (
      await rpc(base, 'workflows.create', { ...wf, steps }, cookie)
    ).data as unknown
    if (typeof created === 'string') return created
    return (created as any)?.id as string
  }

  // Demo collectors ask for passport scans in the identity steps; these land
  // on the operator review checklist as each step's Requested Document Type.
  const IDENTITY_STEP_TYPES = ['id_verification', 'document_validation']
  const withRequestedDocumentTypes = (steps: any[]) =>
    steps.map((s: any) =>
      s.documentType || !IDENTITY_STEP_TYPES.includes(s.type)
        ? s
        : { ...s, documentType: 'passport' },
    )
  const needsDocumentTypes = (steps: any[] | undefined) =>
    Array.isArray(steps) &&
    steps.some(
      (s: any) => IDENTITY_STEP_TYPES.includes(s.type) && !s.documentType,
    )
  let kycId = find(DEMO_WORKFLOW_KYC)
  if (!kycId) {
    kycId = await createWorkflow({
      name: DEMO_WORKFLOW_KYC,
      description:
        'Sample KYC onboarding: passport identity collection for customers.',
      type: 'kyc',
      status: 'active',
      steps: [
        { type: 'id_verification', documentType: 'passport' },
        { type: 'address_check' },
        { type: 'document_validation', documentType: 'passport' },
      ],
    })
  } else {
    // Workflows created before the workflow-driven collector existed lack the
    // newer step types / per-step document types — upgrade in place so new
    // sessions include them.
    const wf = (await rpc(base, 'workflows.get', { id: kycId }, cookie))
      .data as any
    if (
      wf?.steps &&
      Array.isArray(wf.steps) &&
      (!wf.steps.some((s: any) => s.type === 'address_check') ||
        needsDocumentTypes(wf.steps))
    ) {
      await rpc(
        base,
        'workflows.update',
        {
          ...wf,
          documentType: wf.documentType || 'passport',
          steps: withRequestedDocumentTypes(
            wf.steps.some((s: any) => s.type === 'address_check')
              ? wf.steps
              : [
                  ...wf.steps,
                  {
                    id: 'kyc-step-address',
                    label: 'Residential Address',
                    enabled: true,
                    type: 'address_check',
                  },
                ],
          ),
        },
        cookie,
      )
    }
  }
  let dprkId = find(DEMO_WORKFLOW_DPRK)
  if (!dprkId) {
    dprkId = await createWorkflow({
      name: DEMO_WORKFLOW_DPRK,
      description:
        'Employee/contractor onboarding with DPRK remote-worker scheme screening (device + network forensics).',
      type: 'employee_screening',
      status: 'active',
      steps: [
        { type: 'id_verification', documentType: 'passport' },
        { type: 'address_check' },
        { type: 'document_validation', documentType: 'passport' },
        { type: 'ip_analysis' },
      ],
    })
  } else {
    const wf = (await rpc(base, 'workflows.get', { id: dprkId }, cookie))
      .data as any
    if (
      wf?.steps &&
      Array.isArray(wf.steps) &&
      (!wf.steps.some((s: any) => s.type === 'address_check') ||
        needsDocumentTypes(wf.steps))
    ) {
      await rpc(
        base,
        'workflows.update',
        {
          ...wf,
          documentType: wf.documentType || 'passport',
          steps: withRequestedDocumentTypes(
            wf.steps.some((s: any) => s.type === 'address_check')
              ? wf.steps
              : [
                  ...wf.steps,
                  {
                    id: 'dprk-step-address',
                    label: 'Residential Address',
                    enabled: true,
                    type: 'address_check',
                  },
                ],
          ),
        },
        cookie,
      )
    }
  }
  if (!kycId || !dprkId) throw new Error('workflows not found')
  return { kycId, dprkId }
}

export interface SubmittedSubject {
  subject: DemoSubject
  sessionId: string
  publicToken: string
  documentFileId: string
}

/**
 * Per-run residential address, mirroring what the collector's address_check
 * step would save. Operatives share ONE anchor address (the laptop-farm
 * apartment typology) while customers each have their own — values are
 * run-unique because Identifier nodes merge by exact value across runs.
 */
export function addressForSubject(subject: DemoSubject): string {
  const run = demoRunId()
  return subject.kind === 'employee'
    ? `Unit ${run}, 2200 N Central Ave, Litchfield Park, AZ`
    : `Apt ${run}-${subject.id}, 84 Birchwood Lane, Fairview, TX`
}

/**
 * Walks the workflow steps the way the public collector does and records the
 * step-progress keys (`completed_steps`) plus the fields each step collects
 * (identity hints, front image, address). Mirrors `src/routes/sessions/
 * $sessionid.tsx` without a browser.
 */
async function walkWorkflowSteps(opts: {
  base: string
  sessionId: string
  publicToken: string
  documentType: string
  nationality: string
  device: string
  subject: DemoSubject
}): Promise<{ done: string[]; documentStepId?: string }> {
  const {
    base,
    sessionId,
    publicToken,
    documentType,
    nationality,
    device,
    subject,
  } = opts
  const pub = (await rpc(base, 'sessions.get', { sessionId }, '', publicToken))
    .data as any
  const data = pub?.data ?? pub ?? {}
  const steps: Array<{ id: string; type: string; enabled?: boolean }> =
    data.workflowSteps || []
  const done: string[] = []
  let documentStepId: string | undefined
  const advance = async (updates: Record<string, unknown>, stepId?: string) => {
    if (stepId) done.push(stepId)
    const r = await rpc(
      base,
      'sessions.update',
      {
        sessionId,
        updates: {
          status: 'in_progress',
          completed_steps: [...done],
          ...updates,
        },
      },
      '',
      publicToken,
    )
    if (r.status !== 200)
      throw new Error(
        `sessions.update (step ${updates.step ?? ''}) → ${r.status}`,
      )
  }

  for (const step of steps) {
    if (step.enabled === false) continue
    switch (step.type) {
      case 'id_verification':
        await advance(
          {
            document_type: documentType,
            nationality,
            // Biographical hints only — the document OCR stays authoritative
            // (the AML pipeline merges {...identity} UNDER the OCR fields).
            identity: {
              first_name: subject.firstName,
              last_name: subject.lastName,
              dob: subject.dob,
            },
            device,
            step: 'document',
          },
          step.id,
        )
        break
      case 'address_check':
        await advance({ address: addressForSubject(subject) }, step.id)
        break
      case 'document_validation':
        // Marked together with the file upload in submitSubject (post-capture).
        documentStepId = step.id
        break
      default:
        // ip_analysis etc. — confirmed on continue; the IP itself is captured
        // at the edge header level, never from the client.
        await advance({}, step.id)
        break
    }
  }
  return { done, documentStepId }
}

/**
 * Creates the verification session, submits identity details + the rendered
 * passport PNG, and marks it complete — starting the OCR → graph → AML jobs.
 * The connection IP is attributed at the edge via `X-Forwarded-For` (in
 * production the reverse proxy supplies it); the device fingerprint and
 * residential address come from the workflow-driven collection form.
 */
export async function submitSubject(opts: {
  base: string
  cookie: string
  workflowId: string
  subject: DemoSubject
}): Promise<SubmittedSubject> {
  const { base, cookie, workflowId, subject } = opts
  const session = (
    await rpc(
      base,
      'sessions.create',
      {
        workflowId,
        email: demoEmail(subject.id),
        metadata: { demoSubjectId: subject.id, kind: subject.kind },
      },
      cookie,
    )
  ).data as { sessionId: string; publicToken: string }

  // Echo the collector's per-step updates against the actual workflow steps.
  const walked = await walkWorkflowSteps({
    base,
    sessionId: session.sessionId,
    publicToken: session.publicToken,
    documentType: 'passport',
    nationality:
      subject.issuingState === 'USA' ? 'United States of America' : 'Canada',
    device: subject.device,
    subject,
  })

  // Upload the passport scan under the subject's own campaign IP.
  const ticket = (
    await rpc(
      base,
      'documents.uploadUrl',
      { sessionId: session.sessionId },
      '',
      session.publicToken,
    )
  ).data as string
  const png = await readFile(fixturePathFor(subject.id))
  const upload = await fetch(base + ticket, {
    method: 'POST',
    headers: {
      'Content-Type': 'image/png',
      'X-File-Name': `passport_${subject.lastName.toLowerCase()}_${subject.firstName.toLowerCase()}.png`,
      'X-Forwarded-For': subject.ipAddress,
    },
    body: png,
  })
  if (upload.status !== 201)
    throw new Error(`upload failed (${upload.status}) for ${subject.id}`)
  const file = (await upload.json()) as { storageId?: string; id?: string }
  const fileId = file.storageId || file.id || 'unknown'

  // One update per collected artifact, exactly like the live UI: the camera
  // capture sets the front-image slot and closes the document step together.
  const uploadUpdate = await rpc(
    base,
    'sessions.update',
    {
      sessionId: session.sessionId,
      updates: {
        status: 'in_progress',
        front_image: fileId,
        ...(walked.documentStepId
          ? { completed_steps: [...walked.done, walked.documentStepId] }
          : {}),
      },
    },
    '',
    session.publicToken,
    { 'X-Forwarded-For': subject.ipAddress },
  )
  if (uploadUpdate.status !== 200)
    throw new Error(`front image update failed for ${subject.id}`)

  // Final submission — the server captures the subject IP from the edge
  // header, then enqueues the webhook/OCR/AML jobs.
  const submit = await rpc(
    base,
    'sessions.update',
    {
      sessionId: session.sessionId,
      updates: { status: 'completed', step: 'success' },
    },
    '',
    session.publicToken,
    { 'X-Forwarded-For': subject.ipAddress },
  )
  assert.equal(submit.status, 200, `submission for ${subject.id}`)

  return {
    subject,
    sessionId: session.sessionId,
    publicToken: session.publicToken,
    documentFileId: fileId,
  }
}

export interface PipelineResult {
  ocrStatus: string
  graphStatus: string
  graphStage: string
  amlStatus: string
  extracted: Record<string, string>
  aml: any
}

const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms))

/**
 * Re-runs the AML pipeline for a session whose report may have become stale
 * — e.g. when a second subject sharing its device/IP was ingested afterwards.
 * Resolves only when a NEW amlRisk report (timestamped after the call) lands,
 * otherwise the instantly-completed previous report would satisfy polling.
 */
export async function retryAmlAndWait(
  base: string,
  cookie: string,
  sessionId: string,
): Promise<Awaited<ReturnType<typeof waitForPipeline>>> {
  const before = await rpc(base, 'sessions.get', { sessionId }, cookie)
  const beforeData = (before.data as any)?.data ?? before.data ?? ({} as any)
  const previousReportAt = Number(beforeData?.amlRiskAt ?? 0)
  const r = await rpc(base, 'aml.retrySession', { sessionId }, cookie)
  assert.equal(r.status, 200, 'aml.retrySession')
  const deadline = Date.now() + 120_000
  while (Date.now() < deadline) {
    const s = await rpc(base, 'sessions.get', { sessionId }, cookie)
    const data = (s.data as any)?.data ?? s.data ?? {}
    if (
      Number(data?.amlRiskAt ?? 0) > previousReportAt &&
      data?.amlStatus === 'completed'
    ) {
      const extracted: Record<string, string> = {}
      for (const [key, field] of Object.entries(
        (data?.ocrExtractedFields ?? {}) as Record<string, any>,
      )) {
        extracted[key] = (field as any)?.value ?? ''
      }
      return {
        ocrStatus: data?.ocrStatus ?? 'unknown',
        graphStatus: data?.graphStatus ?? 'unknown',
        graphStage: data?.graphStage ?? '',
        amlStatus: data?.amlStatus ?? 'unknown',
        extracted,
        aml: data?.amlRisk ?? null,
      }
    }
    await sleep(2000)
  }
  throw new Error(`AML re-score did not produce a new report for ${sessionId}`)
}

/** Polls `sessions.get` until the OCR → graph → AML pipeline settles. */
export async function waitForPipeline(opts: {
  base: string
  cookie: string
  sessionId: string
  timeoutMs?: number
}): Promise<PipelineResult> {
  const { base, cookie, sessionId } = opts
  const deadline = Date.now() + (opts.timeoutMs ?? 240_000)
  let last = ''
  while (Date.now() < deadline) {
    const s = await rpc(base, 'sessions.get', { sessionId }, cookie)
    if (s.status === 200) {
      const data = s.data?.data ?? s.data ?? {}
      last = JSON.stringify({
        ocr: data?.ocrStatus,
        graph: data?.graphStatus,
        aml: data?.amlStatus,
      })
      process.stdout.write(
        `\r  [${new Date().toLocaleTimeString()}] ${last}   `,
      )
      if (data?.amlStatus === 'completed' || data?.amlStatus === 'failed') {
        process.stdout.write('\n')
        const extracted: Record<string, string> = {}
        for (const [key, field] of Object.entries(
          (data?.ocrExtractedFields ?? {}) as Record<string, any>,
        )) {
          extracted[key] = (field as any)?.value ?? ''
        }
        return {
          ocrStatus: data?.ocrStatus ?? 'unknown',
          graphStatus: data?.graphStatus ?? 'unknown',
          graphStage: data?.graphStage ?? '',
          amlStatus: data?.amlStatus ?? 'unknown',
          extracted,
          aml: data?.amlRisk ?? null,
        }
      }
    }
    await sleep(2000)
  }
  process.stdout.write('\n')
  throw new Error(`pipeline did not settle for ${sessionId} (last: ${last})`)
}

export function workflowForSubject(subject: DemoSubject): 'kyc' | 'dprk' {
  return subject.kind === 'customer' ? 'kyc' : 'dprk'
}

export { DEMO_SUBJECTS }
