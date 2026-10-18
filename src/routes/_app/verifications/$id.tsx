import { useState } from 'react'
import { useMutation, useQuery } from '~/lib/api-client'
import { createFileRoute } from '@tanstack/react-router'
import { apiQuery } from '~/lib/api-client'
import { useSuspenseQuery } from '@tanstack/react-query'
import { format } from 'date-fns'

import { api } from '@open-kyc/contracts'
import type { Doc, Id } from '@open-kyc/contracts'
import { Label } from '~/components/ui/field'

import {
  DescriptionDetails,
  DescriptionList,
  DescriptionTerm,
} from '~/components/ui/description-list'
import { CardContent } from '~/components/ui/card'
import { Button } from '~/components/ui/button'
import {
  CheckCircle2,
  XCircle,
  Download,
  ExternalLink,
  AlertTriangle,
  QrCode,
  FileText,
  Clock,
  UserCheck,
  Cpu,
  Loader2,
  RefreshCw,
  RotateCcw,
  ScanFace,
  ListChecks,
  Mail,
  Send,
} from 'lucide-react'
import { toast } from 'sonner'
import QRCode from 'react-qr-code'
import { Modal, ModalContent, ModalTrigger } from '~/components/ui/modal'
import { AmlRiskPanel, GraphAgentCta } from '~/components/aml/graph-insights'

export const Route = createFileRoute('/_app/verifications/$id')({
  component: RouteComponent,
  loader: async ({ context: { queryClient }, params }) => {
    await queryClient.ensureQueryData(
      apiQuery(api.sessions.getSessionById, {
        sessionId: params.id as Id<'sessions'>,
      }),
    )
  },
  pendingComponent: () => <div>Loading...</div>,
})

function Analytics({
  device,
  browser,
  os,
  ipAddress,
  geolocation,
  userAgent,
  createdAt,
}: {
  device?: string
  browser?: string
  os?: string
  ipAddress?: string
  geolocation?: Doc<'sessions'>['geolocation']
  userAgent?: string
  createdAt: number
}) {
  return (
    <div className="w-full  overflow-hidden border rounded-2xl">
      <div className="py-2 bg-accent z-10 text-md font-semibold px-2 text-neutral-700">
        Analytics
      </div>
      <DescriptionList className="px-4">
        <DescriptionTerm> Device</DescriptionTerm>
        <DescriptionDetails> {device || '-'}</DescriptionDetails>

        <DescriptionTerm> Browser</DescriptionTerm>
        <DescriptionDetails>{browser || '-'}</DescriptionDetails>

        <DescriptionTerm> Operating System</DescriptionTerm>
        <DescriptionDetails>{os || '-'}</DescriptionDetails>

        <DescriptionTerm> IP Address</DescriptionTerm>
        <DescriptionDetails>{ipAddress || '-'}</DescriptionDetails>

        <DescriptionTerm> Geolocation</DescriptionTerm>
        <DescriptionDetails>{geolocation?.country || '-'}</DescriptionDetails>

        <DescriptionTerm> User Agent</DescriptionTerm>
        <DescriptionDetails>{userAgent || '-'}</DescriptionDetails>

        <DescriptionTerm> Created At</DescriptionTerm>
        <DescriptionDetails>
          {format(new Date(createdAt), 'dd MMM yyyy, hh:mm a') || '-'}
        </DescriptionDetails>
      </DescriptionList>
    </div>
  )
}

function PersonInformation({
  first_name,
  last_name,
  nationality,
  issuing_state,
  dob,
  address,
  gender,
  document_number,
}: {
  first_name?: string
  last_name?: string
  nationality?: string
  issuing_state?: string
  dob?: string
  address?: string
  gender?: string
  document_number?: string
}) {
  return (
    <div className="max-w-sm w-full overflow-hidden border rounded-2xl">
      <div className="py-2 bg-accent z-10 text-md font-semibold px-2 text-neutral-700">
        Person Information
      </div>

      <DescriptionList className="px-4 py-2">
        <DescriptionTerm>First Name</DescriptionTerm>
        <DescriptionDetails>{first_name || '-'}</DescriptionDetails>

        <DescriptionTerm>Last Name</DescriptionTerm>
        <DescriptionDetails>{last_name || '-'}</DescriptionDetails>

        <DescriptionTerm>Nationality</DescriptionTerm>
        <DescriptionDetails>{nationality || '-'}</DescriptionDetails>

        <DescriptionTerm>Issuing State</DescriptionTerm>
        <DescriptionDetails>{issuing_state || '-'}</DescriptionDetails>

        <DescriptionTerm>Date of Birth</DescriptionTerm>
        <DescriptionDetails>{dob || '-'}</DescriptionDetails>

        <DescriptionTerm>Address</DescriptionTerm>
        <DescriptionDetails>{address || '-'}</DescriptionDetails>

        <DescriptionTerm>Gender</DescriptionTerm>
        <DescriptionDetails>{gender || '-'}</DescriptionDetails>

        <DescriptionTerm>Document Number</DescriptionTerm>
        <DescriptionDetails>{document_number || '-'}</DescriptionDetails>
      </DescriptionList>
    </div>
  )
}

function ContactDetails({
  email,
  phone,
  issuing_state,
}: {
  email?: string
  phone?: string
  issuing_state?: string
}) {
  return (
    <div className="max-w-sm w-full overflow-hidden border rounded-2xl">
      <div className="py-2 bg-accent z-10 text-md font-semibold px-2 text-neutral-700">
        Contact Details
      </div>

      <DescriptionList className="px-4 py-2">
        <DescriptionTerm>Issuing State</DescriptionTerm>
        <DescriptionDetails>{issuing_state || '-'}</DescriptionDetails>

        <DescriptionTerm>Email</DescriptionTerm>
        <DescriptionDetails>{email || '-'}</DescriptionDetails>

        <DescriptionTerm>Phone Number</DescriptionTerm>
        <DescriptionDetails>{phone || '-'}</DescriptionDetails>
      </DescriptionList>
    </div>
  )
}

function IdVerification({
  front_image,
  back_image,
  person_image,
  documents,
  face_mesh,
}: {
  front_image?: string | null
  back_image?: string | null
  person_image?: string | null
  documents?: Array<{
    _id: string
    fileId: string
    name: string
    mime?: string
    size?: number
  }>
  face_mesh?: {
    landmarks?: Array<[number, number, number]>
    source?: string
    capturedAt?: number
  }
}) {
  // If dedicated image fields aren't populated, find image documents from uploaded documents
  const docImages = documents?.filter((d) => d.mime?.startsWith('image/')) || []
  const resolvedFront =
    front_image || (docImages[0] ? `/api/files/${docImages[0].fileId}` : null)
  const resolvedBack =
    back_image || (docImages[1] ? `/api/files/${docImages[1].fileId}` : null)

  return (
    <div className="overflow-hidden border rounded-2xl w-full bg-card shadow-sm">
      <div className="py-2.5 bg-accent/60 z-10 text-md font-semibold px-4 text-neutral-800 flex items-center justify-between">
        <span className="flex items-center gap-2">
          <UserCheck className="size-4 text-primary" />
          ID & Biometric Verification
        </span>
        <span className="text-xs font-normal text-muted-fg">
          {docImages.length > 0
            ? `${docImages.length} image(s) available`
            : 'Awaiting image uploads'}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4">
        {/* Front Image */}
        <div className="flex flex-col gap-2 p-3 border rounded-xl bg-neutral-50/50">
          <div className="flex items-center justify-between">
            <Label className="font-medium text-xs uppercase tracking-wider text-muted-fg">
              Document Front
            </Label>
            {resolvedFront && (
              <a
                href={resolvedFront}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-primary hover:underline flex items-center gap-1"
              >
                <span>View Full</span>
                <ExternalLink className="size-3" />
              </a>
            )}
          </div>
          {resolvedFront ? (
            <div className="relative aspect-[4/3] rounded-lg overflow-hidden border bg-black/5 group">
              <img
                src={resolvedFront}
                className="w-full h-full object-contain bg-white transition group-hover:scale-105"
                alt="Front ID"
              />
            </div>
          ) : (
            <div className="aspect-[4/3] rounded-lg border-2 border-dashed flex flex-col items-center justify-center text-xs text-neutral-400 p-4 text-center">
              <FileText className="size-8 text-neutral-300 mb-1" />
              No front ID image collected
            </div>
          )}
        </div>

        {/* Back Image */}
        <div className="flex flex-col gap-2 p-3 border rounded-xl bg-neutral-50/50">
          <div className="flex items-center justify-between">
            <Label className="font-medium text-xs uppercase tracking-wider text-muted-fg">
              Document Back
            </Label>
            {resolvedBack && (
              <a
                href={resolvedBack}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-primary hover:underline flex items-center gap-1"
              >
                <span>View Full</span>
                <ExternalLink className="size-3" />
              </a>
            )}
          </div>
          {resolvedBack ? (
            <div className="relative aspect-[4/3] rounded-lg overflow-hidden border bg-black/5 group">
              <img
                src={resolvedBack}
                className="w-full h-full object-contain bg-white transition group-hover:scale-105"
                alt="Back ID"
              />
            </div>
          ) : (
            <div className="aspect-[4/3] rounded-lg border-2 border-dashed flex flex-col items-center justify-center text-xs text-neutral-400 p-4 text-center">
              <FileText className="size-8 text-neutral-300 mb-1" />
              No back ID image collected
            </div>
          )}
        </div>

        {/* Person Image */}
        <div className="flex flex-col gap-2 p-3 border rounded-xl bg-neutral-50/50">
          <div className="flex items-center justify-between">
            <Label className="font-medium text-xs uppercase tracking-wider text-muted-fg">
              Live Selfie / Face
            </Label>
            <span className="flex items-center gap-2">
              {person_image && (
                <a
                  href={person_image}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-primary hover:underline flex items-center gap-1"
                >
                  <span>View Full</span>
                  <ExternalLink className="size-3" />
                </a>
              )}
            </span>
          </div>
          {person_image ? (
            <div className="relative aspect-[4/3] rounded-lg overflow-hidden border bg-black/5 group">
              <img
                src={person_image}
                className="w-full h-full object-contain bg-white transition group-hover:scale-105"
                alt="Person selfie"
              />
              {/* The live capture bakes the 478-point MediaPipe mesh into the
                  uploaded image; telemetry is kept on the session as well. */}
              {face_mesh?.landmarks?.length ? (
                <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-sky-600/85 text-white text-[10px] font-semibold font-mono">
                  <ScanFace className="size-3" />
                  face mesh · {face_mesh.landmarks.length} pts
                  {face_mesh.source ? ` · ${face_mesh.source}` : ''}
                </span>
              ) : null}
            </div>
          ) : (
            <div className="aspect-[4/3] rounded-lg border-2 border-dashed flex flex-col items-center justify-center text-xs text-neutral-400 p-4 text-center">
              <UserCheck className="size-8 text-neutral-300 mb-1" />
              No selfie photo collected
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function DocumentGallery({
  documents,
}: {
  documents?: Array<{
    _id: string
    fileId: string
    name: string
    mime?: string
    size?: number
  }>
}) {
  if (!documents?.length) return null

  return (
    <div className="border rounded-2xl overflow-hidden bg-card shadow-sm">
      <div className="py-2.5 bg-accent/60 px-4 text-md font-semibold text-neutral-800 flex items-center justify-between">
        <span className="flex items-center gap-2">
          <FileText className="size-4 text-primary" />
          Collected Documents ({documents.length})
        </span>
      </div>
      <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {documents.map((d) => {
          const isImg = d.mime?.startsWith('image/')
          const fileUrl = `/api/files/${d.fileId}`
          const sizeKb = d.size ? (d.size / 1024).toFixed(1) + ' KB' : null

          return (
            <div
              key={d._id}
              className="border rounded-xl p-3 bg-neutral-50/50 flex flex-col justify-between gap-3 hover:border-primary/50 transition shadow-xs"
            >
              {isImg ? (
                <div className="aspect-[16/9] w-full bg-white rounded-lg border overflow-hidden relative group">
                  <img
                    src={fileUrl}
                    alt={d.name}
                    className="w-full h-full object-contain transition group-hover:scale-105"
                  />
                  <a
                    href={fileUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-xs font-medium transition gap-1"
                  >
                    <ExternalLink className="size-4" /> Open Full
                  </a>
                </div>
              ) : (
                <div className="aspect-[16/9] w-full bg-neutral-100 rounded-lg border flex flex-col items-center justify-center text-neutral-500">
                  <FileText className="size-10 text-neutral-400 mb-1" />
                  <span className="text-xs font-mono uppercase">
                    {d.mime?.split('/')[1] || 'PDF'}
                  </span>
                </div>
              )}

              <div>
                <p className="font-medium text-sm truncate" title={d.name}>
                  {d.name}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[11px] px-1.5 py-0.5 bg-neutral-200 text-neutral-700 rounded font-mono">
                    {d.mime?.split('/')[1] || 'doc'}
                  </span>
                  {sizeKb && (
                    <span className="text-[11px] text-muted-fg">{sizeKb}</span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1 border-t">
                <a
                  href={fileUrl}
                  download={d.name}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-medium bg-neutral-200/80 hover:bg-neutral-300 text-neutral-800 transition"
                >
                  <Download className="size-3.5" />
                  Download
                </a>
                <a
                  href={fileUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center p-1.5 rounded-lg text-xs font-medium bg-neutral-200/80 hover:bg-neutral-300 text-neutral-800 transition"
                  title="Open in new tab"
                >
                  <ExternalLink className="size-3.5" />
                </a>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  any: 'Any Government ID',
  national_id: 'National ID',
  passport: 'Passport',
  driver_license: "Driver's License",
  residence_permit: 'Residence Permit',
  pan_card: 'PAN / Tax Card',
}

function docTypeLabel(value?: string): string {
  if (!value) return 'Any Government ID'
  return (
    DOCUMENT_TYPE_LABELS[value] ||
    value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  )
}

function CollectionSteps({
  steps,
  completed,
  defaultDocumentType,
  face_mesh,
  geolocation,
  ipAddress,
  address,
}: {
  steps?: Array<{
    id: string
    label: string
    enabled: boolean
    type: string
    documentType?: string
  }>
  completed?: string[]
  defaultDocumentType?: string
  face_mesh?: {
    landmarks?: Array<[number, number, number]>
    source?: string
    capturedAt?: number
  }
  geolocation?: { latitude: number; longitude: number }
  ipAddress?: string
  address?: string
}) {
  if (!steps?.length && !completed?.length) return null
  return (
    <div className="border rounded-2xl overflow-hidden bg-card shadow-sm">
      <div className="py-2.5 bg-accent/60 px-4 text-md font-semibold text-neutral-800 flex items-center justify-between">
        <span className="flex items-center gap-2">
          <ListChecks className="size-4 text-primary" />
          Workflow Collection
        </span>
        <span className="text-xs font-normal text-muted-fg">
          {completed?.length ?? 0}/{steps?.length ?? 0} sections captured
        </span>
      </div>
      <div className="p-4 space-y-3">
        <div className="space-y-2">
          {(steps || []).map((s) => {
            const done = completed?.includes(s.id) || false
            const requested = s.documentType || defaultDocumentType || 'any'
            return (
              <div
                key={s.id}
                title={`${s.label} (${s.type})`}
                className={`flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-xl border ${
                  done
                    ? 'bg-emerald-50/60 border-emerald-200'
                    : s.enabled === false
                      ? 'bg-neutral-50 border-neutral-200'
                      : 'bg-amber-50/60 border-amber-200'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  {done ? (
                    <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />
                  ) : (
                    <Clock
                      className={`size-4 shrink-0 ${
                        s.enabled === false ? 'text-neutral-400' : 'text-amber-600'
                      }`}
                    />
                  )}
                  <span className="text-xs font-semibold text-neutral-800 truncate">
                    {s.label.replace(/_/g, ' ')}
                  </span>
                  {s.enabled === false && (
                    <span className="text-[10px] uppercase tracking-wider font-semibold text-neutral-400">
                      Optional
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-fg">
                    Requested Document Type
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold border bg-white/80 border-border/60 text-neutral-700">
                    {docTypeLabel(requested)}
                  </span>
                  <span
                    className={`text-[11px] font-semibold ${
                      done
                        ? 'text-emerald-700'
                        : s.enabled === false
                          ? 'text-neutral-400'
                          : 'text-amber-700'
                    }`}
                  >
                    {done ? 'Collected' : 'Pending'}
                  </span>
                </div>
              </div>
            )
          })}
          {completed?.some((k) => !(steps || []).some((s) => s.id === k)) && (
            <span className="text-[11px] text-muted-fg italic">
              + keys from an older workflow version
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          {ipAddress && (
            <div className="p-2.5 rounded-lg border bg-muted/20">
              <p className="text-[10px] uppercase tracking-wider text-muted-fg font-semibold">
                Connection IP
              </p>
              <p className="font-mono font-semibold">{ipAddress}</p>
            </div>
          )}
          {geolocation && (
            <div className="p-2.5 rounded-lg border bg-muted/20">
              <p className="text-[10px] uppercase tracking-wider text-muted-fg font-semibold">
                Device Location
              </p>
              <p className="font-mono font-semibold">
                {geolocation.latitude.toFixed(3)},{' '}
                {geolocation.longitude.toFixed(3)}
              </p>
            </div>
          )}
          {address && (
            <div className="p-2.5 rounded-lg border bg-muted/20">
              <p className="text-[10px] uppercase tracking-wider text-muted-fg font-semibold">
                Address on File
              </p>
              <p className="font-semibold break-words">{address}</p>
            </div>
          )}
          {face_mesh?.landmarks?.length ? (
            <div className="p-2.5 rounded-lg border bg-muted/20">
              <p className="text-[10px] uppercase tracking-wider text-muted-fg font-semibold">
                Face Mesh Telemetry
              </p>
              <p className="font-semibold">
                {face_mesh.landmarks.length} landmarks
                {face_mesh.source ? ` (${face_mesh.source})` : ''}
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function SessionEmailModal({
  sessionId,
  initialEmail,
  recipientName,
  status,
  ocrStatus,
  amlStatus,
  reviewStatus,
}: {
  sessionId: string
  initialEmail?: string
  recipientName?: string
  status?: string
  ocrStatus?: string
  amlStatus?: string
  reviewStatus?: string
}) {
  const [targetEmail, setTargetEmail] = useState(initialEmail || '')
  const [sendingStage, setSendingStage] = useState<string | null>(null)

  async function handleSend(stage: string, stageLabel: string) {
    if (!targetEmail.trim()) {
      toast.error('Please enter a recipient email address')
      return
    }
    setSendingStage(stage)
    try {
      const res = await fetch('/api/mailer/send-progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          stage,
          targetEmail: targetEmail.trim(),
        }),
      })
      const data = await res.json()
      if (res.ok && data?.success) {
        toast.success(`${stageLabel} sent to ${targetEmail.trim()} via Resend!`)
      } else {
        toast.error(data?.error || `Failed to send ${stageLabel}`)
      }
    } catch (err: any) {
      toast.error(err?.message || `Error dispatching ${stageLabel}`)
    } finally {
      setSendingStage(null)
    }
  }

  const stages = [
    {
      id: 'invitation',
      label: 'KYC Invitation Link',
      desc: 'Send private access link to initiate verification',
      icon: Send,
      color: 'text-blue-600 bg-blue-50 border-blue-200',
    },
    {
      id: 'documents_submitted',
      label: 'Documents Submitted',
      desc: 'Confirm document receipt & processing status',
      icon: FileText,
      color: 'text-amber-600 bg-amber-50 border-amber-200',
    },
    {
      id: 'document_verified',
      label: 'Document Verified (OCR)',
      desc: 'Notify subject of successful ID extraction',
      icon: UserCheck,
      color: 'text-emerald-600 bg-emerald-50 border-emerald-200',
    },
    {
      id: 'aml_completed',
      label: 'AML Screening Complete',
      desc: 'Notify subject of background & sanctions screening results',
      icon: Cpu,
      color: 'text-purple-600 bg-purple-50 border-purple-200',
    },
    {
      id: 'decision',
      label: 'Final Review Decision',
      desc: 'Send Approved or Action Required determination',
      icon: CheckCircle2,
      color: 'text-emerald-700 bg-emerald-50 border-emerald-200',
    },
  ]

  return (
    <Modal>
      <ModalTrigger>
        <Button intent="secondary" size="sm" className="flex items-center gap-1.5">
          <Mail className="size-4 text-emerald-600" />
          <span>Email Updates</span>
        </Button>
      </ModalTrigger>
      <ModalContent className="p-6 space-y-4 max-w-lg">
        <div>
          <div className="flex items-center gap-2">
            <Mail className="size-5 text-emerald-600" />
            <h3 className="text-lg font-bold">Dispatch Transactional Email</h3>
          </div>
          <p className="text-xs text-muted-fg mt-1">
            Send real-time verification progress emails powered by Resend directly to the subject or employee.
          </p>
        </div>

        {/* Live Stage Status Strip */}
        <div className="flex flex-wrap items-center gap-1.5 p-2 bg-neutral-100 rounded-lg text-[11px] text-neutral-600">
          <span className="font-semibold text-neutral-700">Stages:</span>
          <span className="px-1.5 py-0.5 rounded bg-white font-mono font-medium text-neutral-800 border">Session: {status || 'initiated'}</span>
          <span className="px-1.5 py-0.5 rounded bg-white font-mono font-medium text-neutral-800 border">OCR: {ocrStatus || 'pending'}</span>
          <span className="px-1.5 py-0.5 rounded bg-white font-mono font-medium text-neutral-800 border">AML: {amlStatus || 'pending'}</span>
          <span className="px-1.5 py-0.5 rounded bg-white font-mono font-medium text-neutral-800 border">Review: {reviewStatus || 'pending'}</span>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-neutral-700 uppercase tracking-wider">
            Recipient Email Address
          </label>
          <input
            type="email"
            className="w-full border rounded-lg p-2.5 text-sm bg-white focus:ring-2 focus:ring-primary"
            placeholder="recipient@example.com"
            value={targetEmail}
            onChange={(e) => setTargetEmail(e.target.value)}
          />
          {recipientName && (
            <p className="text-[11px] text-muted-fg">
              Subject Name: <strong>{recipientName}</strong>
            </p>
          )}
        </div>

        <div className="space-y-2 pt-2">
          <label className="text-xs font-semibold text-neutral-500 uppercase tracking-wider block">
            Select Notification Stage to Dispatch
          </label>

          <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
            {stages.map((s) => {
              const Icon = s.icon
              const isSending = sendingStage === s.id
              return (
                <div
                  key={s.id}
                  className="flex items-center justify-between p-3 border rounded-xl hover:border-neutral-400/80 bg-neutral-50/50 transition gap-3"
                >
                  <div className="flex items-start gap-2.5">
                    <div className={`p-2 rounded-lg border ${s.color}`}>
                      <Icon className="size-4" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-neutral-900">{s.label}</div>
                      <div className="text-xs text-neutral-500">{s.desc}</div>
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={Boolean(sendingStage) || !targetEmail.trim()}
                    onClick={() => handleSend(s.id, s.label)}
                    className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold bg-neutral-900 hover:bg-black text-white disabled:opacity-40 transition flex items-center gap-1.5"
                  >
                    {isSending ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Send className="size-3.5" />
                    )}
                    <span>{isSending ? 'Sending…' : 'Send'}</span>
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      </ModalContent>
    </Modal>
  )
}

function RouteComponent() {
  const review = useMutation(api.sessions.review)
  const retryOcr = useMutation(api.ocr.retrySession)
  const [retryingOcr, setRetryingOcr] = useState(false)
  const blocked = useQuery(api.blocklist.list, {})
  const [notes, setNotes] = useState('')
  const { id } = Route.useParams()

  const { data: session } = useSuspenseQuery(
    apiQuery(api.sessions.getSessionById, { sessionId: id as Id<'sessions'> }),
  )

  const sessionUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/sessions/${session._id}?token=${(session as any).publicToken}`
      : `/sessions/${session._id}`

  const isCompleted = session.status === 'completed'
  const isApproved = session.reviewStatus === 'approved'
  const isRejected = session.reviewStatus === 'rejected'
  const ocrProcessed = Boolean((session as any).ocrProcessedAt)
  const ocrStatus =
    ((session as any).ocrStatus as string) ||
    (ocrProcessed ? 'completed' : 'none')
  const ocrProgress =
    ((session as any).ocrProgress as number) ?? (ocrProcessed ? 100 : 0)
  const ocrStage = ((session as any).ocrStage as string) || ''
  const ocrFields = (session as any).ocrExtractedFields as
    Record<string, any> | undefined
  const isOcrRunning =
    ocrStatus === 'pending' ||
    ocrStatus === 'extracting_layout' ||
    ocrStatus === 'parsing_fields'
  const isOcrFailed = ocrStatus === 'failed'

  async function handleRetryOcr() {
    setRetryingOcr(true)
    try {
      await retryOcr({ sessionId: session._id })
      toast.success('Indra OCR extraction re-triggered')
    } catch (e) {
      toast.error('Failed to trigger OCR')
    } finally {
      setRetryingOcr(false)
    }
  }

  return (
    <div className="w-full h-full flex flex-col gap-6 max-w-[1500px]">
      {/* Review Command Header */}
      <section className="border rounded-2xl p-6 bg-card shadow-sm space-y-5">
        <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 border-b pb-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight">
                Verification Review
              </h1>
              {isApproved && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300">
                  <CheckCircle2 className="size-3.5" /> Approved
                </span>
              )}
              {isRejected && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-100 text-rose-800 border border-rose-300">
                  <XCircle className="size-3.5" /> Rejected
                </span>
              )}
              {!isApproved && !isRejected && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-300">
                  <Clock className="size-3.5" /> Pending Decision
                </span>
              )}
            </div>
            <p className="text-sm text-muted-fg mt-1">
              Session ID: <span className="font-mono">{session._id}</span> ·
              Status:{' '}
              <span className="font-semibold capitalize text-neutral-800">
                {session.status}
              </span>
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* Mobile QR Modal */}
            <Modal>
              <ModalTrigger>
                <Button
                  intent="secondary"
                  size="sm"
                  className="flex items-center gap-1.5"
                >
                  <QrCode className="size-4" />
                  <span>Open on Mobile</span>
                </Button>
              </ModalTrigger>
              <ModalContent className="p-6 text-center space-y-4 max-w-sm">
                <div>
                  <h3 className="text-lg font-semibold">Live Session QR</h3>
                  <p className="text-xs text-muted-fg mt-1">
                    Scan with your mobile phone to experience this verification
                    session
                  </p>
                </div>
                <div className="flex justify-center p-4 bg-white rounded-xl border">
                  <QRCode value={sessionUrl} size={180} />
                </div>
                <p className="font-mono text-[11px] text-neutral-500 break-all bg-neutral-100 p-2 rounded">
                  {sessionUrl}
                </p>
              </ModalContent>
            </Modal>

            {/* Email Dispatch Modal */}
            <SessionEmailModal
              sessionId={session._id}
              initialEmail={session.email || ''}
              recipientName={
                session.username ||
                [session.first_name, session.last_name].filter(Boolean).join(' ') ||
                ''
              }
              status={session.status}
              ocrStatus={ocrStatus}
              amlStatus={session.amlStatus}
              reviewStatus={session.reviewStatus}
            />

            <a
              href={sessionUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-muted-fg hover:text-foreground px-3 py-1.5 rounded-lg border bg-neutral-50 hover:bg-neutral-100 transition"
            >
              <span>User Link</span>
              <ExternalLink className="size-3" />
            </a>
          </div>
        </div>

        {/* Indra OCR Live Progress Card */}
        {isOcrRunning && (
          <div className="p-4 rounded-xl bg-indigo-50/90 border border-indigo-200 text-indigo-950 space-y-3 dark:bg-indigo-950/40 dark:border-indigo-800">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Loader2 className="size-4 text-indigo-600 animate-spin" />
                <span className="font-semibold text-sm">
                  Indra OCR Engine Active
                </span>
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-indigo-200/70 text-indigo-800 font-mono font-medium">
                  {ocrProgress}%
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
                style={{ width: `${Math.max(ocrProgress, 12)}%` }}
              />
            </div>

            <p className="text-xs text-indigo-700 dark:text-indigo-300">
              {ocrStage || 'Extracting structured fields and reading order...'}
            </p>
          </div>
        )}

        {/* Indra OCR Error State */}
        {isOcrFailed && (
          <div className="flex items-start justify-between p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 dark:bg-rose-950/40 dark:border-rose-800">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="size-4 text-rose-600 mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold text-sm">
                  Indra OCR Extraction Encountered an Issue
                </p>
                <p className="text-xs text-rose-700 mt-0.5">
                  {(session as any).ocrError ||
                    'Unable to process document with OCR engine.'}
                </p>
              </div>
            </div>
            <Button
              intent="secondary"
              size="xs"
              isDisabled={retryingOcr}
              onClick={handleRetryOcr}
              className="flex items-center gap-1 shrink-0"
            >
              <RotateCcw className="size-3" />
              <span>Retry OCR</span>
            </Button>
          </div>
        )}

        {/* Indra OCR Completed Hub */}
        {!isOcrRunning && (ocrStatus === 'completed' || ocrProcessed) && (
          <div className="p-4 rounded-xl bg-card border border-border/80 shadow-2xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/40 pb-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="size-4 text-emerald-600" />
                <h3 className="font-semibold text-sm text-fg">
                  Indra OCR Automated Extraction
                </h3>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                  Completed (100%)
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-indigo-50 text-indigo-700 border border-indigo-200/60 dark:bg-indigo-950/40 dark:text-indigo-300">
                  <Cpu className="size-2.5" />
                  {(session as any).ocrEngine || 'indra-ocr'}
                </span>
              </div>

              <Button
                intent="secondary"
                size="xs"
                isDisabled={retryingOcr}
                onClick={handleRetryOcr}
                className="flex items-center gap-1 text-xs self-start sm:self-auto"
              >
                {retryingOcr ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <RefreshCw className="size-3" />
                )}
                <span>Re-run Indra OCR</span>
              </Button>
            </div>

            {/* Extracted Schema Fields */}
            {ocrFields && Object.keys(ocrFields).length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {Object.entries(ocrFields).map(([key, f]) => (
                  <div
                    key={key}
                    className="p-2.5 rounded-lg border bg-muted/20 space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-medium text-muted-fg uppercase tracking-wider">
                        {f.label || key}
                      </span>
                      {f.confidence > 0 && (
                        <span className="text-[9px] font-semibold text-emerald-600 dark:text-emerald-400">
                          {Math.round(f.confidence * 100)}%
                        </span>
                      )}
                    </div>
                    <div className="text-xs font-semibold text-fg font-mono break-words">
                      {f.value || (
                        <span className="text-muted-fg/40 font-sans italic">
                          Not found
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                {session.first_name && (
                  <div className="p-2 rounded-lg border bg-muted/20">
                    <span className="text-muted-fg block text-[10px]">
                      Name
                    </span>
                    <span className="font-semibold">
                      {session.first_name} {session.last_name}
                    </span>
                  </div>
                )}
                {session.dob && (
                  <div className="p-2 rounded-lg border bg-muted/20">
                    <span className="text-muted-fg block text-[10px]">
                      Date of Birth
                    </span>
                    <span className="font-semibold">{session.dob}</span>
                  </div>
                )}
                {session.nationality && (
                  <div className="p-2 rounded-lg border bg-muted/20">
                    <span className="text-muted-fg block text-[10px]">
                      Nationality
                    </span>
                    <span className="font-semibold">{session.nationality}</span>
                  </div>
                )}
                {session.document_number && (
                  <div className="p-2 rounded-lg border bg-muted/20">
                    <span className="text-muted-fg block text-[10px]">
                      Document #
                    </span>
                    <span className="font-mono font-semibold">
                      {session.document_number}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Blocklist Match Warning */}
        {blocked
          ?.filter((b) =>
            [session.email, session.username, session.document_number]
              .filter(Boolean)
              .some((v) => v!.toLowerCase() === b.value.toLowerCase()),
          )
          .map((b) => (
            <div
              key={b._id}
              className="flex items-center gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm"
            >
              <AlertTriangle className="size-4 text-red-600 shrink-0" />
              <span>
                <strong>Blocklist match:</strong> {b.value} — {b.reason}
              </span>
            </div>
          ))}

        {session.reviewNotes && (
          <div className="p-3 bg-neutral-50 border rounded-xl text-sm">
            <span className="font-semibold text-neutral-700">
              Previous Review Notes:
            </span>{' '}
            <span className="text-neutral-600">{session.reviewNotes}</span>
          </div>
        )}

        {/* Decision Controls */}
        <div className="space-y-3 pt-2">
          <label className="block text-sm font-medium text-neutral-700">
            Decision Notes
            <textarea
              className="mt-1 border rounded-xl p-3 block w-full text-sm bg-neutral-50/50 focus:bg-white focus:outline-primary transition"
              rows={3}
              placeholder="Enter compliance and verification notes for audit trail..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              intent="primary"
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold flex items-center gap-2 px-5 py-2.5 rounded-xl shadow-xs"
              isDisabled={!isCompleted || !notes.trim()}
              onClick={() =>
                void review({ sessionId: id, decision: 'approved', notes })
              }
            >
              <CheckCircle2 className="size-4" />
              Approve Verification
            </Button>
            <Button
              intent="danger"
              className="font-semibold flex items-center gap-2 px-5 py-2.5 rounded-xl shadow-xs"
              isDisabled={!isCompleted || !notes.trim()}
              onClick={() =>
                void review({ sessionId: id, decision: 'rejected', notes })
              }
            >
              <XCircle className="size-4" />
              Reject Verification
            </Button>
            {!isCompleted && (
              <span className="text-xs text-muted-fg">
                * Review decision can be recorded once documents are submitted
                (current status: {session.status}).
              </span>
            )}
            {isCompleted && !notes.trim() && (
              <span className="text-xs text-amber-600">
                * Please write notes above to approve or reject this
                verification.
              </span>
            )}
          </div>
        </div>
      </section>

      {/* Review history collapsible */}
      {(session as any).audit?.length > 0 && (
        <details className="border rounded-xl p-4 bg-card shadow-sm">
          <summary className="font-semibold text-sm cursor-pointer text-neutral-800">
            Audit Trail & Review History ({(session as any).audit.length}{' '}
            events)
          </summary>
          <div className="mt-3 space-y-2 border-t pt-3">
            {(session as any).audit?.map((entry: any) => (
              <p key={entry._id} className="text-xs text-neutral-600">
                <span className="font-mono text-neutral-400">
                  {new Date(entry.createdAt).toLocaleString()}
                </span>{' '}
                · <strong className="capitalize">{entry.decision}</strong>:{' '}
                {entry.notes}
              </p>
            ))}
          </div>
        </details>
      )}

      {/* Visual Identity & Document Gallery */}
      <IdVerification
        front_image={session.front_image}
        back_image={session.back_image}
        person_image={session.person_image}
        documents={(session as any).documents}
        face_mesh={(session as any).face_mesh}
      />

      {/* Document Gallery */}
      <DocumentGallery documents={(session as any).documents} />

      {/* Workflow-driven collection telemetry */}
      <CollectionSteps
        steps={(session as any).workflowSnapshot?.steps}
        completed={(session as any).completed_steps}
        defaultDocumentType={(session as any).workflowSnapshot?.documentType}
        face_mesh={(session as any).face_mesh}
        geolocation={session.geolocation}
        ipAddress={session.ipAddress}
        address={session.address}
      />

      {/* Profile & Telemetry Data Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <ContactDetails
          email={session.email}
          phone={session.phone_number}
          issuing_state={session.issuing_state}
        />

        <PersonInformation
          first_name={
            session.first_name || (session as any).identity?.first_name
          }
          last_name={session.last_name || (session as any).identity?.last_name}
          nationality={session.nationality}
          issuing_state={session.issuing_state}
          dob={session.dob || (session as any).identity?.dob}
          address={session.address}
          gender={session.gender}
          document_number={session.document_number}
        />

        <Analytics
          device={session.device}
          browser={session.browser}
          os={session.os}
          ipAddress={session.ipAddress}
          geolocation={session.geolocation}
          userAgent={session.userAgent}
          createdAt={session.createdAt}
        />
      </div>

      {/* Background News / AML Search section */}
      {session.news_results && session.news_results.length > 0 && (
        <div className="overflow-hidden border rounded-2xl w-full bg-card shadow-sm">
          <div className="py-2.5 bg-accent/60 z-10 text-md font-semibold px-4 text-neutral-800">
            Background Search & News Hits
          </div>

          <CardContent className="space-y-4 p-4">
            {session.news_results.map((item) => (
              <div key={item.url} className="border-b last:border-b-0 pb-3">
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-sm hover:underline text-primary flex items-center gap-1.5"
                >
                  <span>{item.title}</span>
                  <ExternalLink className="size-3.5" />
                </a>
                <p className="text-xs text-muted-foreground mt-1">
                  {item.description}
                </p>
              </div>
            ))}
          </CardContent>
        </div>
      )}

      {/* Graph-based AML risk analysis */}
      {session.amlRisk && <AmlRiskPanel risk={session.amlRisk} />}

      {/* Agentic chat over the graph + verification records */}
      <GraphAgentCta
        subjectName={
          session.username ||
          [session.first_name, session.last_name].filter(Boolean).join(' ') ||
          undefined
        }
      />
    </div>
  )
}
