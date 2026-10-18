import { z } from 'zod'
export type Id<T extends string> = string & { readonly __table?: T }
export type Base = {
  _id: string
  _creationTime: number
  createdAt: number
  updatedAt: number
}
export type Workflow = Base & {
  name: string
  description?: string
  type: string
  status: 'active' | 'pending' | 'archived'
  documentType?: string
  allowedDocumentTypes?: string[]
  steps: Array<{
    id: string
    label: string
    enabled: boolean
    type: string
    /** Per-step Requested Document Type (falls back to the workflow-level
     * `documentType` when unset). */
    documentType?: string
  }>
}
export type FaceMesh = {
  /** Normalized [x, y, z] landmark triples in 0-1 image space. */
  landmarks?: Array<[number, number, number]>
  source?: 'camera' | 'upload'
  capturedAt?: number
}
export type IdentityFields = {
  first_name?: string
  last_name?: string
  dob?: string
}
export type Session = Base & {
  workflowId: string
  username?: string
  email?: string
  status: 'initiated' | 'in_progress' | 'completed' | 'failed' | 'expired'
  step?: string
  first_name?: string
  last_name?: string
  dob?: string
  gender?: string
  nationality?: string
  issuing_state?: string
  address?: string
  /** Self-reported biographical fields from the id_verification step (OCR
   * readings of the document remain the authoritative source). */
  identity?: IdentityFields
  /** Face landmark telemetry captured at the face_match step. */
  face_mesh?: FaceMesh
  /** Workflow step keys the subject has completed (drives collector resume). */
  completed_steps?: Array<string>
  document_number?: string
  document_type?: string
  phone_number?: string
  front_image?: string
  back_image?: string
  person_image?: string
  device?: string
  browser?: string
  os?: string
  ipAddress?: string
  ip?: string
  userAgent?: string
  geolocation?: {
    latitude: number
    longitude: number
    country?: string
    city?: string
  }
  news_results?: Array<{
    url: string
    title: string
    description: string
    position: number
  }>
  processingStatus?: string
  reviewStatus?: string
  reviewNotes?: string
  amlRisk?: AmlRiskReport | null
  amlRiskAt?: number
  /** OCR → FalkorDB → AML pipeline telemetry (server/aml/pipeline.ts). */
  graphStatus?:
    | 'pending'
    | 'processing'
    | 'completed'
    | 'unavailable'
    | 'skipped'
    | 'failed'
  graphStage?: string
  amlStatus?:
    | 'pending'
    | 'processing'
    | 'completed'
    | 'unavailable'
    | 'skipped'
    | 'failed'
  expiresAt?: number
  extraction?: Record<string, unknown>
  checks?: Array<{ type: string; status: string; reason: string }>
  publicToken?: string
  branding?: Settings
  ocrStatus?:
    'pending' | 'extracting_layout' | 'parsing_fields' | 'completed' | 'failed'
  ocrProgress?: number
  ocrStage?: string
  ocrExtractedFields?: Record<string, OcrExtractedField>
  ocrDocumentType?: string
  ocrEngine?: string
  ocrProcessedAt?: number
  ocrError?: string
}
export type Document = Base & {
  name: string
  fileId: string
  url: string
  processingStatus: string
  extraction?: Record<string, unknown>
  error?: string
}
export type Questionnaire = Base & {
  id: string
  title: string
  description?: string
  isPublished: boolean
  publicToken?: string
}
export type Question = Base & {
  id: string
  questionnaireId: string
  text: string
  required: boolean
  order: number
}
export type Settings = {
  publicName?: string
  privacyPolicyUrl?: string
  logoUrl?: string
  accentColor?: string
  sessionExpiryHours?: number
  webhookUrl?: string
  emailNotifications?: boolean
}
export type Doc<T extends string> = T extends 'sessions'
  ? Session
  : T extends 'workflows'
    ? Workflow
    : T extends 'documents'
      ? Document
      : T extends 'questionnaires'
        ? Questionnaire
        : T extends 'questions'
          ? Question
          : Base & Record<string, any>
export type Ref<A, R> = { name: string; args?: A; result?: R }
export type AmlRiskLevel = 'clean' | 'low' | 'medium' | 'high' | 'critical'
export type AmlSignalSeverity = 'informational' | 'low' | 'medium' | 'high'
export type AmlSignal = {
  type: string
  severity: AmlSignalSeverity
  detail: string
  entities: string[]
}
export type AmlCommunity = {
  id: number
  size: number
  members: string[]
}
export type AmlRiskReport = {
  subject: string
  documentNumber?: string
  riskScore: number
  level: AmlRiskLevel
  summary: string
  algorithmsRun: string[]
  signals: AmlSignal[]
  communities?: AmlCommunity[]
}
export type ChatMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}
export type OcrFieldRule = {
  key: string
  label: string
  type:
    | 'string'
    | 'date'
    | 'number'
    | 'regex'
    | 'address'
    | 'name'
    | 'email'
    | 'phone'
  pattern?: string
  description?: string
  required?: boolean
}
export type OcrDocumentSchema = {
  document_type: string
  title: string
  description: string
  fields: OcrFieldRule[]
  isCustom?: boolean
}
export type OcrExtractedField = {
  key: string
  label: string
  value?: string
  confidence: number
  source_line?: string
  valid?: boolean
}
export type OcrExtractionResult = {
  status: 'completed' | 'failed'
  document_type: string
  raw_text: string
  markdown: string
  fields: Record<string, OcrExtractedField>
  layout?: any[]
  execution_time_ms: number
  ocr_engine: string
}
const ref = <A, R>(name: string): Ref<A, R> => ({ name })
type Empty = Record<string, never>
export const api = {
  auth: {
    getCurrentUser: ref<
      Empty,
      { id: string; name: string; email: string; image?: string }
    >('auth.getCurrentUser'),
  },
  functions: {
    workflows: {
      getWorkflows: ref<{ status?: string }, Workflow[]>('workflows.list'),
      getWorkflowById: ref<{ id: string }, Workflow>('workflows.get'),
      createWorkflow: ref<Omit<Workflow, keyof Base>, string>(
        'workflows.create',
      ),
      updateWorkflow: ref<Partial<Workflow> & { id: string }, void>(
        'workflows.update',
      ),
      deleteWorkflow: ref<{ id: string }, void>('workflows.delete'),
    },
  },
  sessions: {
    createSession: ref<
      {
        workflowId: string
        username?: string
        email?: string
        expiresInHours?: number
        recipientType?: 'employee' | 'customer' | 'individual'
        role?: string
        department?: string
        sendEmail?: boolean
      },
      { sessionId: string; publicToken: string; emailSent?: boolean }
    >('sessions.create'),
    sendInvitation: ref<
      {
        sessionId: string
        email?: string
        recipientName?: string
        recipientType?: 'employee' | 'customer' | 'individual'
        role?: string
        department?: string
        customMessage?: string
      },
      { success: boolean; id?: string; error?: string }
    >('sessions.sendInvitation'),
    getSessions: ref<{ workflowId?: string; status?: string }, Session[]>(
      'sessions.list',
    ),
    getSessionById: ref<{ sessionId: string }, Session>('sessions.get'),
    updateSession: ref<
      { sessionId: string; updates: Partial<Session> },
      { success: boolean }
    >('sessions.update'),
    deleteSession: ref<{ sessionId: string }, { success: boolean }>(
      'sessions.delete',
    ),
    review: ref<
      { sessionId: string; decision: 'approved' | 'rejected'; notes: string },
      void
    >('sessions.review'),
  },
  documents: {
    listDocuments: ref<{ term?: string }, Document[]>('documents.list'),
    generateUploadUrl: ref<{ sessionId?: string }, string>(
      'documents.uploadUrl',
    ),
    saveDocument: ref<{ name: string; fileId: string }, string>(
      'documents.save',
    ),
    deleteDocument: ref<{ id: string; fileId?: string }, void>(
      'documents.delete',
    ),
    searchDocuments: ref<{ term: string }, Document[]>('documents.list'),
    getDocumentUrl: ref<{ fileId: string }, string>('documents.url'),
    retry: ref<{ id: string }, void>('documents.retry'),
  },
  questionnaires: {
    responses: ref<
      { id: string },
      Array<
        Base & {
          answers: Record<string, string>
          questions: Record<string, string>
        }
      >
    >('questionnaires.responses'),
    create: ref<{ title: string; description?: string }, string>(
      'questionnaires.create',
    ),
    list: ref<Empty, Questionnaire[]>('questionnaires.list'),
    get: ref<{ id: string }, Questionnaire>('questionnaires.get'),
    update: ref<
      {
        id: string
        title: string
        description?: string
        isPublished?: boolean
      },
      void
    >('questionnaires.update'),
    remove: ref<{ id: string }, void>('questionnaires.delete'),
  },
  questions: {
    add: ref<
      {
        questionnaireId: string
        text: string
        required: boolean
        order: number
      },
      string
    >('questions.create'),
    update: ref<{ id: string; text: string; required: boolean }, void>(
      'questions.update',
    ),
    remove: ref<{ id: string }, void>('questions.delete'),
    listByQuestionnaire: ref<{ questionnaireId: string }, Question[]>(
      'questions.list',
    ),
  },
  settings: {
    get: ref<Empty, Settings>('settings.get'),
    update: ref<Settings, void>('settings.update'),
  },
  blocklist: {
    list: ref<
      Empty,
      Array<Base & { value: string; reason: string; kind: string }>
    >('blocklist.list'),
    add: ref<{ value: string; reason: string; kind: string }, string>(
      'blocklist.add',
    ),
    remove: ref<{ id: string }, void>('blocklist.delete'),
  },
  analytics: {
    get: ref<
      Empty,
      {
        total: number
        completed: number
        pending: number
        failed: number
        documents: number
        approved: number
        daily: Array<{ date: string; count: number }>
      }
    >('analytics.get'),
  },
  developer: {
    keys: ref<
      Empty,
      Array<{ id: string; name: string; prefix: string; createdAt: string }>
    >('developer.keys'),
    createKey: ref<{ name: string }, { key: string }>('developer.createKey'),
    revokeKey: ref<{ id: string }, void>('developer.revokeKey'),
    webhooks: ref<
      Empty,
      Array<{
        id: string
        status: string
        attempts: number
        created_at: string
        last_error?: string
      }>
    >('developer.webhooks'),
    rotateWebhookSecret: ref<Empty, { secret: string }>(
      'developer.rotateWebhookSecret',
    ),
  },
  index: {
    kickoffWorkflow: ref<{ siteUrl: string }, string>('analysis.create'),
    getActiveWorkflowIds: ref<Empty, string[]>('analysis.active'),
    getWorkflowStatus: ref<{ workflowId: string }, any>('analysis.status'),
  },
  helpers: {
    getScrapeResult: ref<Empty, Array<Base & Record<string, any>>>(
      'analysis.list',
    ),
    getScrapeResultById: ref<{ id: string }, any>('analysis.get'),
    deleteAnalysis: ref<{ id: string }, void>('analysis.delete'),
  },
  search: { publicSearch: ref<{ name: string }, any>('search.run') },
  ocr: {
    getSchemas: ref<Empty, Record<string, OcrDocumentSchema>>('ocr.getSchemas'),
    saveSchema: ref<
      {
        document_type: string
        title: string
        description: string
        fields: OcrFieldRule[]
      },
      { success: boolean }
    >('ocr.saveSchema'),
    resetSchema: ref<{ document_type: string }, { success: boolean }>(
      'ocr.resetSchema',
    ),
    extract: ref<
      { fileId: string; document_type: string; customFields?: OcrFieldRule[] },
      OcrExtractionResult
    >('ocr.extract'),
    retrySession: ref<{ sessionId: string }, { success: boolean }>(
      'ocr.retrySession',
    ),
  },
  aml: {
    /** Re-runs the graph ingestion + AML pipeline after new evidence (e.g. a
     * second session sharing the subject's device/IP) lands in the graph. */
    retry: ref<{ sessionId: string }, { success: boolean }>('aml.retrySession'),
  },
}
export const workflowSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().max(2000).optional(),
  type: z.string().max(80),
  status: z.enum(['active', 'pending', 'archived']),
  documentType: z.string().max(80).optional(),
  allowedDocumentTypes: z.array(z.string().max(80)).optional(),
  steps: z
    .array(
      z.object({
        id: z.string(),
        label: z.string().max(100),
        enabled: z.boolean(),
        type: z.enum([
          'id_verification',
          'face_match',
          'ip_analysis',
          'address_check',
          'document_validation',
        ]),
        documentType: z.string().max(80).optional(),
      }),
    )
    .max(20),
})
export const settingsSchema = z.object({
  publicName: z.string().trim().min(1).max(120).optional(),
  privacyPolicyUrl: z.union([z.string().url(), z.literal('')]).optional(),
  logoUrl: z.union([z.string().url(), z.literal('')]).optional(),
  accentColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  sessionExpiryHours: z.number().int().min(1).max(8760).optional(),
  webhookUrl: z.union([z.string().url(), z.literal('')]).optional(),
  emailNotifications: z.boolean().optional(),
})
export const sessionUpdateSchema = z
  .object({
    status: z.enum(['initiated', 'in_progress', 'completed']).optional(),
    step: z
      .enum([
        'start',
        'document',
        'camera',
        'frontSide',
        'backSide',
        'liveliness',
        'success',
      ])
      .optional(),
    document_type: z
      .enum(['national_id', 'passport', 'driver_license', 'residence_permit'])
      .optional(),
    nationality: z.string().max(100).optional(),
    front_image: z.string().uuid().optional(),
    back_image: z.string().uuid().optional(),
    person_image: z.string().uuid().optional(),
    // Self-reported biographical fields — stored as hints; OCR reads of the
    // submitted document override them during graph ingestion.
    identity: z
      .object({
        first_name: z.string().trim().max(100).optional(),
        last_name: z.string().trim().max(100).optional(),
        dob: z.string().max(20).optional(),
      })
      .optional(),
    // Residential address collected at the address_check step.
    address: z.string().trim().min(1).max(500).optional(),
    // Face landmark telemetry (normalized 0-1 coordinates) captured from the
    // live selfie camera at the face_match step.
    face_mesh: z
      .object({
        landmarks: z
          .array(z.tuple([z.number(), z.number(), z.number()]))
          .max(500)
          .optional(),
        source: z.enum(['camera', 'upload']).optional(),
        capturedAt: z.number().int().nonnegative().optional(),
      })
      .optional(),
    // Workflow step keys already completed — lets the public collector resume
    // where the subject left off after a page reload or device handoff.
    completed_steps: z.array(z.string().max(64)).max(20).optional(),
    userAgent: z.string().max(1000).optional(),
    browser: z.string().max(200).nullish(),
    device: z.string().max(200).nullish(),
    os: z.string().max(200).optional(),
    geolocation: z
      .object({
        latitude: z.number().min(-90).max(90),
        longitude: z.number().min(-180).max(180),
      })
      .optional(),
    // Server-supplied: client IPs are captured from the edge (see
    // operations.ts sessions.update) and never trusted from the client body.
    ipAddress: z.string().max(64).nullish(),
  })
  .strict()
