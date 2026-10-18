import { useCallback, useEffect, useRef, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import QRCode from 'react-qr-code'
import {
  CheckCircle2,
  FileText,
  ArrowRight,
  ArrowLeft,
  Copy,
  Smartphone,
  ShieldCheck,
  Cpu,
  Loader2,
  MapPin,
  Wifi,
  IdCard,
  ScanFace,
  FileScan,
  Globe,
  Upload,
  Camera,
  FileUp,
  RefreshCw,
} from 'lucide-react'
import { toast } from 'sonner'
import { useMutation, useQuery, api } from '~/lib/api-client'
import { Button } from '~/components/ui/button'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '~/components/ui/card'
import { ProgressBar, ProgressBarTrack } from '~/components/ui/progress-bar'
import { RadioGroup, Radio } from '~/components/ui/radio'
import { Label } from '~/components/ui/field'
import { Input } from '~/components/ui/input'
import { Modal, ModalContent } from '~/components/ui/modal'
import { Avatar } from '~/components/ui/avatar'
import { LiveCamera } from '~/components/session/LiveCamera'
import type { CameraCapture } from '~/components/session/LiveCamera'

export const Route = createFileRoute('/sessions/$sessionid')({
  component: MultiStepSessionFlow,
})

/** Workflow step types the operator can configure (see workflowSchema). */
type WorkflowStepType =
  | 'id_verification'
  | 'face_match'
  | 'ip_analysis'
  | 'address_check'
  | 'document_validation'

const STEP_META: Record<
  WorkflowStepType,
  { label: string; description: string; icon: typeof IdCard }
> = {
  id_verification: {
    label: 'Verify Identity',
    description: 'Confirm your identity details and the ID you will present.',
    icon: IdCard,
  },
  document_validation: {
    label: 'Document Photos',
    description: 'Photograph or upload your ID document.',
    icon: FileScan,
  },
  address_check: {
    label: 'Residential Address',
    description: 'Confirm your residential address.',
    icon: MapPin,
  },
  face_match: {
    label: 'Biometric Selfie',
    description: 'Take a live selfie to match your face against your document.',
    icon: ScanFace,
  },
  ip_analysis: {
    label: 'Network & Device Checks',
    description:
      'Fraud-signal checks on your connection — nothing to install, no downloads.',
    icon: Wifi,
  },
}

type FlowKey = 'welcome' | WorkflowStepType | 'review'

interface FlowStep {
  key: FlowKey
  /** Workflow step id (null for the synthetic welcome/review keys). */
  stepId: string | null
  type: FlowKey
}

const DEFAULT_STEP_TYPES: WorkflowStepType[] = [
  'id_verification',
  'document_validation',
  'face_match',
]

function buildFlow(
  workflowSteps: Array<{ id: string; enabled?: boolean; type: string }>,
): Array<FlowStep> {
  const hasIdVerification = (workflowSteps || []).some(
    (s) => s.type === 'id_verification' && s.enabled !== false,
  )
  const enabled = (workflowSteps || []).filter(
    (s) =>
      s.enabled !== false &&
      !!STEP_META[s.type as WorkflowStepType] &&
      !(hasIdVerification && s.type === 'document_validation'),
  )
  const types = (
    enabled.length
      ? enabled
      : DEFAULT_STEP_TYPES.filter(
          (t) => !(hasIdVerification && t === 'document_validation'),
        ).map((t) => ({ id: t, type: t, enabled: true }))
  ) as Array<{ id: string; type: WorkflowStepType }>
  return [
    { key: 'welcome', stepId: null, type: 'welcome' },
    ...types.map((s) => ({
      key: s.type as WorkflowStepType,
      stepId: s.id,
      type: s.type as WorkflowStepType,
    })),
    { key: 'review', stepId: null, type: 'review' },
  ]
}

/** Round-trips a canvas dataURL into an uploadable Blob. */
async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl)
  return await res.blob()
}

function MultiStepSessionFlow() {
  const { sessionid } = Route.useParams()
  const session = useQuery(api.sessions.getSessionById, {
    sessionId: sessionid,
  }) as any

  const uploadUrl = useMutation(api.documents.generateUploadUrl)
  const update = useMutation(api.sessions.updateSession)
  const [busy, setBusy] = useState(false)

  const flow: Array<FlowStep> = buildFlow(session?.workflowSteps || [])
  const completedSteps: string[] = session?.completed_steps || []

  const [currentIdx, setCurrentIdx] = useState<number | null>(null)
  const hasInitialized = useRef(false)
  useEffect(() => {
    if (!session || hasInitialized.current) return
    hasInitialized.current = true
    if (session.status === 'completed') {
      setCurrentIdx(flow.length - 1)
      return
    }
    // Resume at the first unfinished workflow step (persisted step keys).
    const midFlow = flow.slice(1, -1)
    const nextIdx = midFlow.findIndex(
      (s) => !(s.stepId && completedSteps.includes(s.stepId)),
    )
    setCurrentIdx(nextIdx === -1 ? flow.length - 1 : nextIdx + 1)
    // flow/completedSteps are stable for the initialization tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session])

  const isStepDone = useCallback(
    (step: FlowStep): boolean => {
      if (!step.stepId)
        return step.type === 'review'
          ? false
          : Boolean(session?.step || session?.completed_steps?.length)
      if (step.type === 'document_validation')
        return (
          completedSteps.includes(step.stepId) ||
          (session?.uploaded?.length ?? 0) > 0
        )
      if (step.type === 'address_check')
        return completedSteps.includes(step.stepId) || Boolean(session?.address)
      if (step.type === 'face_match')
        return (
          completedSteps.includes(step.stepId) || Boolean(session?.person_image)
        )
      return completedSteps.includes(step.stepId)
    },
    [completedSteps, session],
  )

  const unfinished = flow
    .slice(1, -1)
    .filter((s) => s.stepId && !completedSteps.includes(s.stepId))

  function goTo(idx: number) {
    const step = flow[idx]
    if (!step) return
    if (step.stepId === null) {
      if (step.type === 'review' && unfinished.length) {
        toast.error('Complete the open sections first')
        return
      }
      setCurrentIdx(idx)
      return
    }
    // Completed workflow steps are freely navigable; unfinished steps stay
    // sequential so evidence is collected in workflow order.
    const done = completedSteps.includes(step.stepId)
    if (!done && idx > (currentIdx ?? 0)) return
    setCurrentIdx(idx)
  }

  // Real-time status toast tracking
  const prevStatusRef = useRef<string | undefined>(undefined)
  useEffect(() => {
    if (!session) return
    const prev = prevStatusRef.current
    const next = session.status as string
    if (prev !== undefined && prev !== next) {
      if (next === 'completed') toast.success('Session verified and submitted!')
      else if (next === 'in_progress') toast.info('Session is now in progress')
    }
    prevStatusRef.current = next
  }, [session?.status])

  const sessionUrl =
    typeof window !== 'undefined'
      ? window.location.href
      : `/sessions/${sessionid}`

  /** Persist a workflow-step key plus any fields collected in that step. */
  async function markStepComplete(
    stepId: string,
    updates: Record<string, unknown> = {},
  ) {
    const merged = Array.from(new Set([...completedSteps, stepId]))
    await update({
      sessionId: sessionid,
      updates: { status: 'in_progress', completed_steps: merged, ...updates },
    })
  }

  /** Save session-level fields without touching the step-derivation keys. */
  async function saveFields(updates: Record<string, unknown>) {
    await update({
      sessionId: sessionid,
      updates: { status: 'in_progress', ...updates },
    })
  }

  /** Upload any blob into the session's storage; returns the file id. */
  async function uploadBlob(blob: Blob, name: string): Promise<string> {
    const url = await uploadUrl({ sessionId: sessionid })
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': blob.type,
        'X-File-Name': encodeURIComponent(name),
      },
      body: blob,
    })
    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      throw new Error(errText || `Upload failed with status ${res.status}`)
    }
    const { storageId } = await res.json()
    return storageId
  }

  async function handleFinalSubmit() {
    setBusy(true)
    try {
      await update({
        sessionId: sessionid,
        updates: {
          status: 'completed',
          step: 'success',
          completed_steps: completedSteps,
        },
      })
      toast.success('Verification submitted — automated checks are running')
      setCurrentIdx(flow.length - 1)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Submission failed')
    } finally {
      setBusy(false)
    }
  }

  if (!session) {
    return (
      <main className="min-h-screen bg-neutral-50 flex items-center justify-center p-6">
        <div className="flex flex-col items-center gap-3 text-neutral-500">
          <div className="size-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm font-medium">Loading verification session…</p>
        </div>
      </main>
    )
  }

  const branding = session.branding || {}
  const currentFlow = flow[Math.min(currentIdx ?? 0, flow.length - 1)]
  const progress = Math.round(((currentIdx ?? 0) / (flow.length - 1)) * 100)

  const stepProps = {
    session,
    busy,
    markStepComplete,
    saveFields,
    uploadBlob,
    advance: () =>
      setCurrentIdx((i) => Math.min((i ?? 0) + 1, flow.length - 1)),
    back: () => setCurrentIdx((i) => Math.max((i ?? 0) - 1, 0)),
  } as const

  return (
    <main className="min-h-screen bg-neutral-50 text-foreground py-8 px-4 sm:px-6">
      <div className="mx-auto max-w-3xl space-y-6">
        {/* Top Header Card */}
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-white border rounded-2xl shadow-xs">
          <div className="flex items-center gap-3">
            <Avatar
              isSquare
              size="md"
              src={branding.logoUrl || '/logo.svg'}
              alt="Logo"
              className="border"
            />
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-lg">
                  {branding.publicName || 'OpenKYC'}
                </span>
                <span className="text-xs px-2 py-0.5 rounded-full font-mono bg-neutral-100 text-neutral-600 border">
                  Verification
                </span>
              </div>
              <p className="text-xs text-muted-fg font-mono truncate max-w-[200px] sm:max-w-xs">
                ID: {sessionid}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${
                session.status === 'completed'
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  : session.status === 'in_progress'
                    ? 'bg-blue-50 text-blue-800 border-blue-200'
                    : 'bg-neutral-100 text-neutral-700 border-neutral-200'
              }`}
            >
              <span
                className={`size-2 rounded-full ${
                  session.status === 'completed'
                    ? 'bg-emerald-500'
                    : session.status === 'in_progress'
                      ? 'bg-blue-500 animate-pulse'
                      : 'bg-neutral-400'
                }`}
              />
              <span className="capitalize">
                {session.status?.replace('_', ' ')}
              </span>
            </span>

            <Modal>
              <Button
                intent="outline"
                size="sm"
                className="flex items-center gap-1.5"
              >
                <Smartphone className="size-3.5" />
                <span className="hidden sm:inline">Open on Phone</span>
              </Button>
              <ModalContent className="p-6 text-center space-y-4 max-w-sm">
                <div>
                  <h3 className="text-lg font-semibold flex items-center justify-center gap-2">
                    <Smartphone className="size-5 text-primary" />
                    Continue on Mobile
                  </h3>
                  <p className="text-xs text-muted-fg mt-1">
                    Scanning keeps your progress — the camera steps are easier
                    on a phone.
                  </p>
                </div>
                <div className="flex justify-center p-4 bg-white rounded-xl border">
                  <QRCode value={sessionUrl} size={180} />
                </div>
                <p className="font-mono text-[11px] text-neutral-500 break-all bg-neutral-100 p-2 rounded">
                  {sessionUrl}
                </p>
                <Button
                  intent="secondary"
                  className="w-full flex items-center justify-center gap-1.5"
                  onClick={() => {
                    navigator.clipboard.writeText(sessionUrl)
                    toast.success('Link copied to clipboard!')
                  }}
                >
                  <Copy className="size-4" />
                  <span>Copy Session Link</span>
                </Button>
              </ModalContent>
            </Modal>
          </div>
        </header>

        {/* Progress */}
        <div className="bg-white border rounded-2xl p-4 shadow-xs space-y-3">
          <div className="flex items-center justify-between text-xs text-muted-fg font-medium">
            <span>
              Step {(currentIdx ?? 0) + 1} of {flow.length}:{' '}
              {currentFlow.type === 'welcome'
                ? 'Welcome'
                : currentFlow.type === 'review'
                  ? 'Review & Submit'
                  : STEP_META[currentFlow.type as WorkflowStepType].label}
            </span>
            <span>
              {progress}% complete
              {unfinished.length
                ? ` · ${unfinished.length} section${unfinished.length > 1 ? 's' : ''} open`
                : ''}
            </span>
          </div>
          <ProgressBar value={progress}>
            <ProgressBarTrack />
          </ProgressBar>
          <div
            className="grid gap-1 pt-1"
            style={{
              gridTemplateColumns: `repeat(${flow.length}, minmax(0, 1fr))`,
            }}
          >
            {flow.map((step, idx) => {
              const done = isStepDone(step)
              const isCurrent = idx === currentIdx
              const label =
                step.type === 'welcome'
                  ? 'Start'
                  : step.type === 'review'
                    ? 'Review'
                    : STEP_META[step.type as WorkflowStepType].label.split(
                        ' ',
                      )[0]
              return (
                <button
                  key={`${step.type}-${idx}`}
                  type="button"
                  onClick={() => goTo(idx)}
                  className={`text-center py-1 text-[11px] font-medium border-t-2 transition ${
                    isCurrent
                      ? 'border-primary text-primary font-semibold'
                      : done
                        ? 'border-emerald-500 text-emerald-700'
                        : 'border-transparent text-neutral-400 hover:text-neutral-600'
                  }`}
                >
                  {label}
                </button>
              )
            })}
          </div>
        </div>

        {/* WELCOME */}
        {currentFlow.type === 'welcome' && (
          <WelcomeStep
            session={session}
            sessionUrl={sessionUrl}
            steps={flow.slice(1, -1)}
            onContinue={() => {
              setCurrentIdx(1)
              void saveFields({ step: 'start' })
            }}
          />
        )}

        {/* WORKFLOW STEPS */}
        {currentFlow.type === 'id_verification' && (
          <IdVerificationStep {...stepProps} stepId={currentFlow.stepId!} />
        )}
        {currentFlow.type === 'document_validation' && (
          <DocumentValidationStep {...stepProps} stepId={currentFlow.stepId!} />
        )}
        {currentFlow.type === 'address_check' && (
          <AddressCheckStep {...stepProps} stepId={currentFlow.stepId!} />
        )}
        {currentFlow.type === 'face_match' && (
          <FaceMatchStep {...stepProps} stepId={currentFlow.stepId!} />
        )}
        {currentFlow.type === 'ip_analysis' && (
          <IpAnalysisStep {...stepProps} stepId={currentFlow.stepId!} />
        )}

        {/* REVIEW / SUBMIT */}
        {currentFlow.type === 'review' && (
          <ReviewStep
            session={session}
            flow={flow.slice(1, -1)}
            completedSteps={completedSteps}
            busy={busy}
            isStepDone={isStepDone}
            onSubmit={handleFinalSubmit}
            onBack={() => {
              const lastUndone = flow
                .slice(1, -1)
                .map((s, i) => ({ s, idx: i + 1 }))
                .filter(
                  ({ s }) => s.stepId && !completedSteps.includes(s.stepId),
                )
                .pop()
              setCurrentIdx(lastUndone?.idx ?? flow.length - 2)
            }}
          />
        )}
      </div>
    </main>
  )
}

/* ------------------------------------------------------------------ */
/* Shared step shell                                                   */
/* ------------------------------------------------------------------ */

interface WorkflowStepProps {
  session: any
  busy: boolean
  stepId: string
  markStepComplete: (
    stepId: string,
    updates?: Record<string, unknown>,
  ) => Promise<void>
  saveFields: (updates: Record<string, unknown>) => Promise<void>
  uploadBlob: (blob: Blob, name: string) => Promise<string>
  advance: () => void
  back: () => void
}

interface StepShellProps extends WorkflowStepProps {
  footer: React.ReactNode
  type: WorkflowStepType
  children: React.ReactNode
}

function StepShell({ type, children, footer, back }: StepShellProps) {
  const meta = STEP_META[type]
  const Icon = meta.icon
  return (
    <Card className="bg-white shadow-xs">
      <CardHeader className="flex items-start gap-3">
        <div className="size-10 rounded-full bg-primary/10 grid place-items-center text-primary shrink-0">
          <Icon className="size-5" />
        </div>
        <div>
          <CardTitle className="text-lg">{meta.label}</CardTitle>
          <CardDescription>{meta.description}</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">{children}</CardContent>
      <CardFooter className="justify-between gap-3">
        <Button
          intent="secondary"
          onClick={back}
          className="flex items-center gap-1.5"
        >
          <ArrowLeft className="size-4" /> Back
        </Button>
        {footer}
      </CardFooter>
    </Card>
  )
}

/* ------------------------------------------------------------------ */
/* Welcome                                                             */
/* ------------------------------------------------------------------ */

function WelcomeStep({
  sessionUrl,
  steps,
  onContinue,
}: {
  session: any
  sessionUrl: string
  steps: Array<FlowStep>
  onContinue: () => void
}) {
  const [consent, setConsent] = useState(false)
  return (
    <Card className="bg-white shadow-xs">
      <CardHeader
        title="Identity Verification"
        description="Complete the sections below to prove who you are. Every save is automatic — you can resume on another device."
      />
      <CardContent className="space-y-4">
        <div className="p-4 rounded-xl bg-blue-50/60 border border-blue-200 text-blue-950 space-y-2">
          <div className="flex items-center gap-2 font-semibold text-sm">
            <ShieldCheck className="size-4 text-blue-600" />
            <span>Encrypted & processed automatically</span>
          </div>
          <p className="text-xs text-blue-800 leading-relaxed">
            Your documents and biometrics are processed by an automated
            compliance pipeline: OCR reads your IDs and a financial-crime graph
            screens your session signals.
          </p>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-fg">
            Required from you ({steps.length} sections):
          </p>
          <ul className="text-sm space-y-2 text-neutral-700">
            {steps.map((step, i) => {
              const meta = STEP_META[step.type as WorkflowStepType]
              const Icon = meta.icon
              return (
                <li
                  key={`${step.stepId}-${i}`}
                  className="flex items-start gap-2"
                >
                  <span className="size-7 rounded-full bg-primary/10 text-primary grid place-items-center shrink-0">
                    <Icon className="size-3.5" />
                  </span>
                  <span>
                    <span className="font-medium">{meta.label}</span>
                    <span className="text-xs text-muted-fg block">
                      {meta.description}
                    </span>
                  </span>
                </li>
              )
            })}
          </ul>
        </div>

        <label className="flex items-start gap-3 p-3 rounded-xl border bg-neutral-50/70 cursor-pointer">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            className="mt-0.5 rounded border-neutral-300"
          />
          <span className="text-xs text-neutral-600">
            I consent to the collection and automated processing of my identity
            documents, live selfie, and device/network signals for verification
            purposes.
          </span>
        </label>

        <details className="text-xs text-muted-fg">
          <summary className="cursor-pointer hover:text-foreground">
            Continue on another device instead
          </summary>
          <div className="mt-3 flex items-center gap-4 max-w-sm">
            <div className="p-2 bg-white rounded-xl border">
              <QRCode value={sessionUrl} size={110} />
            </div>
            <div className="space-y-1.5">
              <p>Scan this QR to open the same session on your phone.</p>
              <Button
                intent="secondary"
                size="xs"
                onClick={() => {
                  navigator.clipboard.writeText(sessionUrl)
                  toast.success('Session link copied!')
                }}
                className="flex items-center gap-1"
              >
                <Copy className="size-3" /> Copy link
              </Button>
            </div>
          </div>
        </details>
      </CardContent>
      <CardFooter className="justify-end">
        <Button
          intent="primary"
          isDisabled={!consent}
          onClick={onContinue}
          className="flex items-center gap-2"
        >
          Begin verification <ArrowRight className="size-4" />
        </Button>
      </CardFooter>
    </Card>
  )
}

/* ------------------------------------------------------------------ */
/* id_verification — Verify Identity & Upload Document                */
/* ------------------------------------------------------------------ */

function formatDocType(docType?: string) {
  if (!docType || docType === 'any') return 'Government ID'
  return docType.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

const DOC_SIDE_META = {
  front: {
    label: 'Document front',
    key: 'front_image' as const,
    guidance: [
      'Place the document on a flat, dark surface.',
      'Fill the frame with the whole document.',
      'Avoid glare — tilt slightly if the light reflects on the text.',
    ],
  },
  back: {
    label: 'Document back',
    key: 'back_image' as const,
    guidance: [
      'Flip the document over carefully.',
      'Keep all text inside the frame and in focus.',
    ],
  },
} as const

function IdVerificationStep(props: WorkflowStepProps) {
  const {
    session,
    busy,
    stepId,
    markStepComplete,
    saveFields,
    uploadBlob,
    advance,
  } = props
  const requestedDocType =
    session?.workflowDocumentType && session.workflowDocumentType !== 'any'
      ? session.workflowDocumentType
      : null

  const [docType, setDocType] = useState<string>(
    session?.document_type || requestedDocType || 'national_id',
  )
  const needBack = docType !== 'passport'

  const [activeSide, setActiveSide] = useState<'front' | 'back'>('front')
  const [method, setMethod] = useState<'upload' | 'camera'>('upload')
  const [frontCapture, setFrontCapture] = useState<{
    dataUrl: string
    name?: string
  } | null>(null)
  const [backCapture, setBackCapture] = useState<{
    dataUrl: string
    name?: string
  } | null>(null)
  const [frontId, setFrontId] = useState<string | null>(
    session?.front_image || null,
  )
  const [backId, setBackId] = useState<string | null>(
    session?.back_image || null,
  )
  const [uploading, setUploading] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const prevFront = Boolean(frontId || session?.front_image)
  const prevBack = Boolean(backId || session?.back_image)
  const frontSaved = Boolean(frontId || frontCapture || prevFront)
  const backSaved = Boolean(backId || backCapture || prevBack)
  const stepDone = needBack ? frontSaved && backSaved : frontSaved
  const pending = uploading || busy

  async function handleFile(file: File) {
    if (!file) return
    setUploading(true)
    try {
      const reader = new FileReader()
      const dataUrlPromise = new Promise<string>((resolve) => {
        reader.onload = () => resolve(reader.result as string)
        reader.readAsDataURL(file)
      })
      const dataUrl = await dataUrlPromise
      if (activeSide === 'front') {
        setFrontCapture({ dataUrl, name: file.name })
      } else {
        setBackCapture({ dataUrl, name: file.name })
      }

      const id = await uploadBlob(file, `${docType}_${activeSide}_${file.name}`)
      if (activeSide === 'front') setFrontId(id)
      else setBackId(id)

      const updates: Record<string, unknown> = {
        document_type: docType,
        ...(activeSide === 'front' ? { front_image: id } : { back_image: id }),
      }
      await saveFields(updates)

      if (activeSide === 'front' && needBack && !backSaved) {
        setActiveSide('back')
        toast.info('Front saved — now upload or capture the back side')
      } else {
        toast.success(
          `${activeSide === 'front' ? 'Front' : 'Back'} side saved successfully`,
        )
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  async function handleCameraCapture(capture: CameraCapture) {
    if (activeSide === 'front') setFrontCapture({ dataUrl: capture.dataUrl })
    else setBackCapture({ dataUrl: capture.dataUrl })

    setUploading(true)
    try {
      const blob = await dataUrlToBlob(capture.dataUrl)
      const id = await uploadBlob(blob, `${docType}_${activeSide}.png`)
      if (activeSide === 'front') setFrontId(id)
      else setBackId(id)

      const updates: Record<string, unknown> = {
        document_type: docType,
        ...(activeSide === 'front' ? { front_image: id } : { back_image: id }),
      }
      await saveFields(updates)

      if (activeSide === 'front' && needBack && !backSaved) {
        setActiveSide('back')
        toast.info('Front photo saved — now capture the back side')
      } else {
        toast.success(
          `${activeSide === 'front' ? 'Front' : 'Back'} photo captured successfully`,
        )
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Capture upload failed')
    } finally {
      setUploading(false)
    }
  }

  async function handleContinue() {
    setUploading(true)
    try {
      const docValStep = (session?.workflowSteps || []).find(
        (s: any) => s.type === 'document_validation',
      )
      await markStepComplete(stepId, {
        document_type: docType,
        ...(frontId ? { front_image: frontId } : {}),
        ...(backId ? { back_image: backId } : {}),
      })
      if (docValStep?.id) {
        await markStepComplete(docValStep.id)
      }
      toast.success('Identity document uploaded and saved')
      advance()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not proceed')
    } finally {
      setUploading(false)
    }
  }

  const currentPreview = activeSide === 'front' ? frontCapture : backCapture

  return (
    <StepShell
      {...props}
      type="id_verification"
      footer={
        <Button
          intent="primary"
          isDisabled={!stepDone || pending}
          onClick={handleContinue}
          className="flex items-center gap-2"
        >
          {pending ? <Loader2 className="size-4 animate-spin" /> : null}
          Continue <ArrowRight className="size-4" />
        </Button>
      }
    >
      {/* Workflow Requested Banner if mandated */}
      {requestedDocType && (
        <div className="flex items-center gap-2.5 p-3 rounded-xl bg-blue-50/70 border border-blue-200 text-xs text-blue-900 font-medium">
          <IdCard className="size-4 text-blue-600 shrink-0" />
          <span>
            Requested by organization:{' '}
            <strong>{formatDocType(requestedDocType)}</strong>
          </span>
        </div>
      )}

      {/* Document Type Selection */}
      <div className="space-y-2">
        <Label className="font-semibold text-sm">
          Select identity document type
        </Label>
        <RadioGroup
          value={docType}
          onChange={(val) => {
            setDocType(val)
            void saveFields({ document_type: val })
          }}
          className="grid grid-cols-1 sm:grid-cols-3 gap-3"
        >
          <Radio
            value="national_id"
            className="border rounded-xl p-3.5 cursor-pointer data-[selected=true]:border-primary data-[selected=true]:bg-primary/5 transition"
          >
            <div className="flex items-center gap-2">
              <IdCard className="size-4 text-primary" />
              <Label className="font-semibold text-xs">National ID</Label>
            </div>
            <p className="text-[11px] text-muted-fg mt-1">
              Government card (front & back)
            </p>
          </Radio>
          <Radio
            value="passport"
            className="border rounded-xl p-3.5 cursor-pointer data-[selected=true]:border-primary data-[selected=true]:bg-primary/5 transition"
          >
            <div className="flex items-center gap-2">
              <Globe className="size-4 text-primary" />
              <Label className="font-semibold text-xs">Passport</Label>
            </div>
            <p className="text-[11px] text-muted-fg mt-1">
              Official photo page
            </p>
          </Radio>
          <Radio
            value="driver_license"
            className="border rounded-xl p-3.5 cursor-pointer data-[selected=true]:border-primary data-[selected=true]:bg-primary/5 transition"
          >
            <div className="flex items-center gap-2">
              <FileText className="size-4 text-primary" />
              <Label className="font-semibold text-xs">Driver's License</Label>
            </div>
            <p className="text-[11px] text-muted-fg mt-1">
              Front & back of license
            </p>
          </Radio>
        </RadioGroup>
      </div>

      {/* Document Upload Area */}
      <div className="space-y-4 pt-1">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveSide('front')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition ${
                activeSide === 'front'
                  ? 'bg-primary/10 text-primary border-primary'
                  : frontSaved
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-neutral-100 text-neutral-500 border-neutral-200'
              }`}
            >
              <CheckCircle2 className="size-3.5" /> Front{' '}
              {frontSaved ? '(Saved)' : '(Required)'}
            </button>
            {needBack && (
              <button
                type="button"
                onClick={() => setActiveSide('back')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition ${
                  activeSide === 'back'
                    ? 'bg-primary/10 text-primary border-primary'
                    : backSaved
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : 'bg-neutral-100 text-neutral-500 border-neutral-200'
                }`}
              >
                <CheckCircle2 className="size-3.5" /> Back{' '}
                {backSaved ? '(Saved)' : '(Required)'}
              </button>
            )}
            {!needBack && (
              <span className="text-xs text-muted-fg italic">
                Passports only need the photo page
              </span>
            )}
          </div>

          {/* Mode Switcher */}
          <div className="inline-flex rounded-lg border border-border/80 bg-muted/40 p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setMethod('upload')}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md font-medium transition ${
                method === 'upload'
                  ? 'bg-card shadow-2xs text-fg'
                  : 'text-muted-fg hover:text-fg'
              }`}
            >
              <FileUp className="size-3.5" />
              <span>Upload File</span>
            </button>
            <button
              type="button"
              onClick={() => setMethod('camera')}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md font-medium transition ${
                method === 'camera'
                  ? 'bg-card shadow-2xs text-fg'
                  : 'text-muted-fg hover:text-fg'
              }`}
            >
              <Camera className="size-3.5" />
              <span>Use Camera</span>
            </button>
          </div>
        </div>

        {/* Preview of current side or capture/upload inputs */}
        {currentPreview?.dataUrl ? (
          <div className="p-4 border rounded-2xl bg-muted/20 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="size-2 rounded-full bg-emerald-500" />
                <span className="text-xs font-semibold text-fg">
                  {DOC_SIDE_META[activeSide].label} Uploaded
                </span>
                {currentPreview.name && (
                  <span className="text-xs text-muted-fg truncate max-w-[200px]">
                    ({currentPreview.name})
                  </span>
                )}
              </div>
              <Button
                intent="outline"
                size="xs"
                onClick={() => {
                  if (activeSide === 'front') {
                    setFrontCapture(null)
                    setFrontId(null)
                  } else {
                    setBackCapture(null)
                    setBackId(null)
                  }
                }}
                className="flex items-center gap-1 text-xs"
              >
                <RefreshCw className="size-3" />
                Replace / Retake
              </Button>
            </div>
            <div className="relative rounded-xl overflow-hidden border border-border/70 bg-card max-h-72 flex items-center justify-center">
              <img
                src={currentPreview.dataUrl}
                alt={DOC_SIDE_META[activeSide].label}
                className="max-h-72 w-auto object-contain rounded-lg"
              />
            </div>
          </div>
        ) : method === 'upload' ? (
          <div
            onDragOver={(e) => {
              e.preventDefault()
              setDragActive(true)
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragActive(false)
              const file = e.dataTransfer.files?.[0]
              if (file) void handleFile(file)
            }}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition ${
              dragActive
                ? 'border-primary bg-primary/5'
                : 'border-border/80 hover:border-primary/60 bg-muted/10'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void handleFile(f)
                e.target.value = ''
              }}
            />
            <div className="size-12 mx-auto rounded-full bg-primary/10 text-primary grid place-items-center mb-3">
              <Upload className="size-6" />
            </div>
            <p className="font-semibold text-sm text-fg">
              Upload {DOC_SIDE_META[activeSide].label}
            </p>
            <p className="text-xs text-muted-fg mt-1">
              Drag & drop document image or PDF, or click to browse
            </p>
            <p className="text-[11px] text-muted-fg/80 mt-2">
              Supports JPEG, PNG, WebP, or PDF up to 20MB
            </p>
          </div>
        ) : (
          <LiveCamera
            mode="document"
            title={`Capture ${DOC_SIDE_META[activeSide].label}`}
            guidance={[...DOC_SIDE_META[activeSide].guidance]}
            preview={
              currentPreview
                ? {
                    dataUrl: currentPreview.dataUrl,
                    label: DOC_SIDE_META[activeSide].label,
                  }
                : null
            }
            uploading={pending}
            onCapture={handleCameraCapture}
            onReset={() => {
              if (activeSide === 'front') {
                setFrontCapture(null)
                setFrontId(null)
              } else {
                setBackCapture(null)
                setBackId(null)
              }
            }}
          />
        )}

        {/* Guidance and Automated OCR extraction callout */}
        <div className="p-3.5 rounded-xl bg-blue-50/70 border border-blue-200/60 dark:bg-blue-950/30 dark:border-blue-900/40 flex items-start gap-3">
          <ShieldCheck className="size-4 text-blue-600 shrink-0 mt-0.5" />
          <div className="text-xs text-blue-950 dark:text-blue-200 leading-relaxed">
            <strong className="font-semibold">
              Automated Document Intelligence:
            </strong>{' '}
            No manual form entry is required. Your legal name, date of birth,
            nationality, and ID number will be extracted automatically via
            high-precision OCR during verification.
          </div>
        </div>

        {stepDone && (
          <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2">
            <CheckCircle2 className="size-4 text-emerald-600 shrink-0" />
            <span>
              {needBack
                ? 'Both document front and back captured.'
                : 'Passport photo page captured.'}{' '}
              Click Continue to proceed to biometric verification.
            </span>
          </div>
        )}
      </div>
    </StepShell>
  )
}

/* ------------------------------------------------------------------ */
/* document_validation — camera-first                                  */
/* ------------------------------------------------------------------ */

function DocumentValidationStep(props: WorkflowStepProps) {
  const {
    session,
    busy,
    stepId,
    markStepComplete,
    saveFields,
    uploadBlob,
    advance,
  } = props
  const docType = session?.document_type || 'national_id'
  const needBack = docType !== 'passport'
  // Image documents already collected in this session (e.g. captured before a
  // page reload) count as satisfied sides — the public view doesn't expose the
  // front/back image slots, only the uploaded document list.
  const prevImages = Math.max(
    0,
    (session?.uploaded || []).filter((d: any) => d.mime?.startsWith('image/'))
      .length,
  )
  const [front, setFront] = useState<CameraCapture | null>(null)
  const [back, setBack] = useState<CameraCapture | null>(null)
  const [frontId, setFrontId] = useState<string | null>(null)
  const [backId, setBackId] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [active, setActive] = useState<'front' | 'back'>(
    prevImages >= 1 ? 'back' : 'front',
  )

  async function handleCapture(capture: CameraCapture) {
    if (active === 'front') setFront(capture)
    else setBack(capture)
    setUploading(true)
    try {
      const blob = await dataUrlToBlob(capture.dataUrl)
      const id = await uploadBlob(blob, `${docType}_${active}.png`)
      if (active === 'front') setFrontId(id)
      else setBackId(id)
      const updates: Record<string, unknown> =
        active === 'front' ? { front_image: id } : { back_image: id }
      const effectiveFront =
        active === 'front' ? id : frontId || prevImages >= 1
      const effectiveBack = active === 'back' ? id : backId
      const complete = needBack
        ? Boolean(effectiveFront && effectiveBack)
        : Boolean(effectiveFront)
      if (complete) {
        await markStepComplete(stepId, updates)
        toast.success('Document photos complete')
        advance()
      } else {
        // Persist this side but keep the step open until both sides exist.
        await saveFields(updates)
        if (active === 'front' && needBack) {
          setActive('back')
          toast.info('Front saved — now capture the back side')
        }
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  const frontSaved = Boolean(frontId || prevImages >= 1)
  const backSaved = Boolean(backId)
  const stepDone = needBack ? frontSaved && backSaved : frontSaved
  const pending = uploading || busy

  return (
    <StepShell
      {...props}
      type="document_validation"
      footer={
        <Button
          intent="primary"
          isDisabled={!stepDone || pending}
          onClick={advance}
          className="flex items-center gap-2"
        >
          Continue <ArrowRight className="size-4" />
        </Button>
      }
    >
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <button
          type="button"
          onClick={() => setActive('front')}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border font-semibold transition ${
            active === 'front'
              ? 'bg-primary/10 text-primary border-primary'
              : frontSaved
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-neutral-100 text-neutral-500 border-neutral-200'
          }`}
        >
          <CheckCircle2 className="size-3.5" /> Front{' '}
          {frontSaved ? 'saved' : 'pending'}
        </button>
        {needBack && (
          <button
            type="button"
            onClick={() => setActive('back')}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border font-semibold transition ${
              active === 'back'
                ? 'bg-primary/10 text-primary border-primary'
                : backSaved
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-neutral-100 text-neutral-500 border-neutral-200'
            }`}
          >
            <CheckCircle2 className="size-3.5" /> Back{' '}
            {backSaved ? 'saved' : 'pending'}
          </button>
        )}
        {docType === 'passport' && (
          <span className="text-muted-fg italic">
            passports only need the photo page
          </span>
        )}
      </div>

      {active === 'front' ? (
        <LiveCamera
          mode="document"
          title={`Capture ${DOC_SIDE_META.front.label}`}
          guidance={[...DOC_SIDE_META.front.guidance]}
          preview={
            front
              ? { dataUrl: front.dataUrl, label: DOC_SIDE_META.front.label }
              : null
          }
          uploading={pending}
          onCapture={handleCapture}
          onReset={() => setFront(null)}
        />
      ) : (
        <LiveCamera
          mode="document"
          title={`Capture ${DOC_SIDE_META.back.label}`}
          guidance={[...DOC_SIDE_META.back.guidance]}
          preview={
            back
              ? { dataUrl: back.dataUrl, label: DOC_SIDE_META.back.label }
              : null
          }
          uploading={pending}
          onCapture={handleCapture}
          onReset={() => setBack(null)}
        />
      )}

      {stepDone && (
        <Button
          intent="outline"
          onClick={advance}
          className="w-full justify-center flex items-center gap-2"
        >
          {needBack ? 'Both sides captured' : 'Document captured'} — continue{' '}
          <ArrowRight className="size-4" />
        </Button>
      )}
      {needBack && frontSaved && !backSaved && active === 'back' && (
        <p className="text-xs italic text-muted-fg text-center">
          Front is saved. Capture the back to finish this section.
        </p>
      )}
    </StepShell>
  )
}

/* ------------------------------------------------------------------ */
/* address_check                                                       */
/* ------------------------------------------------------------------ */

function AddressCheckStep(props: WorkflowStepProps) {
  const { session, busy, stepId, markStepComplete, advance } = props
  const [mode, setMode] = useState<'form' | 'saved'>(
    session?.address ? 'saved' : 'form',
  )
  const [fields, setFields] = useState({
    street: '',
    city: '',
    state: '',
    postal: '',
    country: '',
  })
  const [saving, setSaving] = useState(false)
  const pending = saving || busy

  async function submit() {
    const address = [
      fields.street,
      fields.city,
      [fields.state, fields.postal].filter(Boolean).join(' '),
      fields.country,
    ]
      .filter(Boolean)
      .join(', ')
    if (!address.trim()) {
      toast.error('Enter your address')
      return
    }
    setSaving(true)
    try {
      await markStepComplete(stepId, { address })
      toast.success('Address saved')
      advance()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <StepShell
      {...props}
      type="address_check"
      footer={
        mode === 'saved' ? (
          <Button
            intent="primary"
            onClick={advance}
            className="flex items-center gap-2"
          >
            Continue <ArrowRight className="size-4" />
          </Button>
        ) : (
          <Button
            intent="primary"
            isDisabled={!fields.street.trim() || pending}
            onClick={submit}
            className="flex items-center gap-2"
          >
            {pending ? <Loader2 className="size-4 animate-spin" /> : null}
            Confirm address <ArrowRight className="size-4" />
          </Button>
        )
      }
    >
      {mode === 'saved' ? (
        <div className="space-y-3">
          <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700 flex items-center gap-1.5">
              <CheckCircle2 className="size-4" /> Address on file
            </p>
            <p className="text-sm font-medium">{session?.address}</p>
          </div>
          <Button intent="outline" size="sm" onClick={() => setMode('form')}>
            Update address
          </Button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1 sm:col-span-2">
              <Label className="text-xs font-semibold">Street address</Label>
              <Input
                placeholder="Street and house/apt number"
                value={fields.street}
                onChange={(e) =>
                  setFields({ ...fields, street: e.target.value })
                }
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold">City</Label>
              <Input
                value={fields.city}
                onChange={(e) => setFields({ ...fields, city: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold">State / province</Label>
              <Input
                value={fields.state}
                onChange={(e) =>
                  setFields({ ...fields, state: e.target.value })
                }
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Postal code</Label>
              <Input
                value={fields.postal}
                onChange={(e) =>
                  setFields({ ...fields, postal: e.target.value })
                }
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Country</Label>
              <Input
                placeholder="e.g. United States"
                value={fields.country}
                onChange={(e) =>
                  setFields({ ...fields, country: e.target.value })
                }
              />
            </div>
          </div>
          <p className="text-xs text-muted-fg">
            Used for sanctions / adverse-media screening and address-linked
            graph checks.
          </p>
        </>
      )}
    </StepShell>
  )
}

/* ------------------------------------------------------------------ */
/* face_match                                                          */
/* ------------------------------------------------------------------ */

function FaceMatchStep(props: WorkflowStepProps) {
  const { busy, stepId, markStepComplete, uploadBlob, advance } = props
  const [capture, setCapture] = useState<CameraCapture | null>(null)
  const [saving, setSaving] = useState(false)
  const pending = saving || busy

  async function handleCapture(captured: CameraCapture) {
    setCapture(captured)
    setSaving(true)
    try {
      const blob = await dataUrlToBlob(captured.dataUrl)
      const id = await uploadBlob(blob, 'selfie.png')
      await markStepComplete(stepId, {
        person_image: id,
        face_mesh: captured.faceMesh
          ? {
              landmarks: captured.faceMesh,
              source: 'camera',
              capturedAt: Date.now(),
            }
          : undefined,
      })
      toast.success(
        captured.faceMesh ? 'Selfie saved with face mesh' : 'Selfie saved',
      )
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Upload failed')
      setCapture(null)
    } finally {
      setSaving(false)
    }
  }

  return (
    <StepShell
      {...props}
      type="face_match"
      footer={
        <Button
          intent="primary"
          isDisabled={!capture || pending}
          onClick={advance}
          className="flex items-center gap-2"
        >
          Continue <ArrowRight className="size-4" />
        </Button>
      }
    >
      <LiveCamera
        mode="selfie"
        title="Capture selfie"
        guidance={[
          'Face the camera in a well-lit spot.',
          'Remove glasses, hats or face coverings.',
          'Keep your face inside the oval — a 478-point face mesh is captured for matching.',
        ]}
        preview={
          capture ? { dataUrl: capture.dataUrl, label: 'Live selfie' } : null
        }
        uploading={pending}
        onCapture={handleCapture}
        onReset={() => setCapture(null)}
      />
      <p className="text-xs text-muted-fg">
        This live photo is matched against the portrait in your document —
        screen photos or printed images are rejected.
      </p>
    </StepShell>
  )
}

/* ------------------------------------------------------------------ */
/* ip_analysis                                                         */
/* ------------------------------------------------------------------ */

function IpAnalysisStep(props: WorkflowStepProps) {
  const { session, busy, stepId, markStepComplete, advance } = props
  const [geo, setGeo] = useState<GeolocationPosition | null>(null)
  const [geoBusy, setGeoBusy] = useState(false)
  const [captured, setCaptured] = useState(Boolean(session?.geolocation))
  const pending = busy

  function captureGeo() {
    if (!navigator.geolocation) {
      toast.error('Geolocation is not available on this device')
      return
    }
    setGeoBusy(true)
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        setGeo(pos)
        setCaptured(true)
        try {
          await markStepComplete(stepId, {
            geolocation: {
              latitude: Math.round(pos.coords.latitude * 10000) / 10000,
              longitude: Math.round(pos.coords.longitude * 10000) / 10000,
            },
          })
          toast.success('Location captured')
        } catch (e) {
          toast.error(e instanceof Error ? e.message : 'Could not save')
        } finally {
          setGeoBusy(false)
        }
      },
      (err) => {
        setGeoBusy(false)
        toast.error(err.message || 'Location permission denied')
      },
      { enableHighAccuracy: false, timeout: 10000 },
    )
  }

  return (
    <StepShell
      {...props}
      type="ip_analysis"
      footer={
        <Button
          intent="primary"
          isDisabled={pending}
          onClick={() => {
            if (!captured && !geo) void markStepComplete(stepId)
            advance()
          }}
          className="flex items-center gap-2"
        >
          Continue <ArrowRight className="size-4" />
        </Button>
      }
    >
      <div className="p-4 rounded-xl border space-y-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-fg flex items-center gap-1.5">
            <Globe className="size-3.5" /> Connection observed by the server
          </p>
          {session?.ipAddress ? (
            <p className="mt-1 font-mono text-sm font-semibold">
              {session.ipAddress}
            </p>
          ) : (
            <p className="mt-1 text-sm text-muted-fg italic">
              Captured automatically on submission from your network (local
              connections aren't recorded).
            </p>
          )}
          <p className="text-[11px] text-muted-fg mt-1">
            Your provider runs fraud checks on shared devices, proxies and
            flagged IP ranges.
          </p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-fg flex items-center gap-1.5">
            <MapPin className="size-3.5" /> Device location (optional)
          </p>
          {captured || geo ? (
            <p className="mt-1 text-sm text-emerald-700 font-medium flex items-center gap-1.5">
              <CheckCircle2 className="size-4" />
              {geo
                ? `${geo.coords.latitude.toFixed(3)}, ${geo.coords.longitude.toFixed(3)}`
                : 'Saved'}
            </p>
          ) : (
            <Button
              intent="outline"
              size="sm"
              isDisabled={geoBusy}
              onClick={captureGeo}
              className="mt-1.5 flex items-center gap-1.5"
            >
              {geoBusy ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <MapPin className="size-3.5" />
              )}
              Share approximate location
            </Button>
          )}
        </div>
      </div>
    </StepShell>
  )
}

/* ------------------------------------------------------------------ */
/* Review / submit                                                     */
/* ------------------------------------------------------------------ */

function ReviewStep({
  session,
  flow,
  completedSteps,
  busy,
  isStepDone,
  onSubmit,
  onBack,
}: {
  session: any
  flow: Array<FlowStep>
  completedSteps: string[]
  busy: boolean
  isStepDone: (step: FlowStep) => boolean
  onSubmit: () => void
  onBack: () => void
}) {
  const isCompleted = session.status === 'completed'
  const docs = (session.uploaded || []) as Array<{
    name?: string
    fileId?: string
    mime?: string
  }>
  const allNeededDone = flow.every(
    (s) => s.stepId && completedSteps.includes(s.stepId),
  )

  return (
    <Card className="bg-white shadow-xs">
      <CardHeader className="border-b pb-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <CardTitle className="text-xl">Review & Submit</CardTitle>
            <span
              className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                isCompleted
                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                  : 'bg-amber-100 text-amber-800 border border-amber-300'
              }`}
            >
              <CheckCircle2 className="size-3.5" />{' '}
              {isCompleted ? 'Submitted' : 'Pending submission'}
            </span>
          </div>
          {!isCompleted && (
            <Button
              intent="outline"
              size="sm"
              onClick={onBack}
              className="flex items-center gap-1.5"
            >
              <ArrowLeft className="size-3.5" /> Edit steps
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-5 pt-4">
        {/* Step checklist */}
        <div className="space-y-2">
          {flow.map((step, i) => {
            const meta = STEP_META[step.type as WorkflowStepType]
            const Icon = meta.icon
            return (
              <div
                key={`${step.stepId}-${i}`}
                className={`flex items-center justify-between p-3 rounded-xl border ${
                  isStepDone(step)
                    ? 'bg-emerald-50/60 border-emerald-200'
                    : 'bg-amber-50/60 border-amber-200'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Icon className="size-4 text-primary" />
                  <span className="text-xs font-medium">{meta.label}</span>
                </div>
                {isStepDone(step) ? (
                  <span className="text-[11px] font-semibold text-emerald-700">
                    Collected
                  </span>
                ) : (
                  <span className="text-[11px] font-semibold text-amber-700">
                    Missing
                  </span>
                )}
              </div>
            )
          })}
        </div>

        {/* Collected session info */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          {[
            [
              'Document Type',
              session.document_type
                ? session.document_type.replace('_', ' ').toUpperCase()
                : 'ID Document',
            ],
            [
              'Document Photos',
              session.front_image
                ? session.back_image
                  ? 'Front & Back Uploaded'
                  : 'Photo Page Uploaded'
                : session.uploaded?.length
                  ? `${session.uploaded.length} Uploaded`
                  : 'Uploaded',
            ],
            ['Data Extraction', 'Automated OCR & Watchlist Screening'],
            ['Address', session.address],
            ['Selfie', session.person_image ? 'Captured' : null],
            [
              'Face mesh',
              session.face_mesh?.landmarks?.length
                ? `${session.face_mesh.landmarks.length} pts`
                : null,
            ],
            [
              'Location',
              session.geolocation
                ? `${session.geolocation.latitude}, ${session.geolocation.longitude}`
                : null,
            ],
            ['Connection IP', session.ipAddress],
          ].map(([label, value]) =>
            value ? (
              <div
                key={String(label)}
                className="p-2.5 rounded-lg border bg-muted/20"
              >
                <p className="text-[10px] uppercase tracking-wider text-muted-fg font-semibold">
                  {label}
                </p>
                <p className="font-semibold break-words">{String(value)}</p>
              </div>
            ) : null,
          )}
        </div>

        {/* Indra OCR live banner */}
        {['pending', 'extracting_layout', 'parsing_fields'].includes(
          session.ocrStatus,
        ) && (
          <div className="p-4 rounded-xl bg-indigo-50/90 border border-indigo-200 text-indigo-950 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Loader2 className="size-4 text-indigo-600 animate-spin" />
                <span className="font-semibold text-sm">
                  Indra OCR Engine Active
                </span>
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-indigo-200/70 text-indigo-800 font-mono font-medium">
                  {session.ocrProgress || 35}%
                </span>
              </div>
              <span className="text-xs text-indigo-600 flex items-center gap-1 font-mono">
                <Cpu className="size-3" />
                1M-param CPU Model
              </span>
            </div>
            <div className="w-full bg-indigo-200/50 rounded-full h-2 overflow-hidden">
              <div
                className="bg-indigo-600 h-2 rounded-full transition-all duration-500 ease-out"
                style={{ width: `${Math.max(session.ocrProgress || 35, 15)}%` }}
              />
            </div>
          </div>
        )}

        {/* OCR done */}
        {(session.ocrStatus === 'completed' || session.ocrProcessedAt) && (
          <div className="p-4 rounded-xl bg-card border border-border/80 shadow-2xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-fg font-semibold text-sm">
                <CheckCircle2 className="size-4 text-emerald-600" />
                <span>Automated Indra OCR Verification</span>
              </div>
              <span className="inline-flex items-center gap-1 text-[10px] font-medium text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200/50">
                <Cpu className="size-2.5" />
                {session.ocrEngine || 'indra-ocr'}
              </span>
            </div>
          </div>
        )}

        {/* Documents */}
        <div className="space-y-3">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-fg">
            Collected photos ({docs.length})
          </h4>
          {docs.length === 0 ? (
            <p className="text-xs text-neutral-400 italic">
              Nothing uploaded yet.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {docs.map((d, i) => (
                <div
                  key={d.fileId || i}
                  className="p-3 border rounded-xl bg-neutral-50/50 flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 truncate">
                    {d.mime?.startsWith('image/') && d.fileId ? (
                      <img
                        src={`/api/files/${d.fileId}`}
                        alt={d.name}
                        className="size-10 rounded object-cover border bg-white"
                        onError={(e) => (e.currentTarget.style.opacity = '0.2')}
                      />
                    ) : (
                      <FileText className="size-8 text-primary/70 shrink-0" />
                    )}
                    <div className="truncate">
                      <p className="text-xs font-semibold truncate">{d.name}</p>
                      <span className="text-[10px] text-muted-fg uppercase font-mono">
                        {d.mime?.split('/')[1] || 'file'}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Submit / done state */}
        {!isCompleted ? (
          allNeededDone ? (
            <Button
              intent="primary"
              isDisabled={busy}
              onClick={onSubmit}
              className="w-full justify-center flex items-center gap-2"
            >
              {busy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <ShieldCheck className="size-4" />
              )}
              Submit verification & run automated checks
            </Button>
          ) : (
            <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-sm flex items-center justify-between gap-3">
              <span>Some sections are still open — finish them first.</span>
              <Button intent="outline" size="sm" onClick={onBack}>
                Continue collection
              </Button>
            </div>
          )
        ) : (
          <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-sm space-y-2">
            <p className="flex items-center gap-2 font-medium">
              <ShieldCheck className="size-4" /> Submitted — automated checks
              (OCR + graph screening) have started.
            </p>
            <p className="text-xs text-emerald-800">
              Nothing else is needed from you. You can close this page.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
