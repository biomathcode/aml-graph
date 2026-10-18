import { useState, useMemo } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { api, useMutation, useQuery } from '~/lib/api-client'
import type { OcrFieldRule, OcrExtractionResult } from '@open-kyc/contracts'
import {
  FileText,
  Search,
  Upload,
  Trash2,
  ExternalLink,
  FileCheck2,
  FileCode,
  Image as ImageIcon,
  Loader2,
  Sparkles,
  Plus,
  RotateCcw,
  CheckCircle2,
  Cpu,
  Play,
  Copy,
  Check,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '~/components/ui/button'

export const Route = createFileRoute('/_app/documents')({
  component: Documents,
})

function getFileIcon(name: string) {
  const ext = name.split('.').pop()?.toLowerCase() || ''
  if (['png', 'jpg', 'jpeg', 'webp', 'svg'].includes(ext)) {
    return <ImageIcon className="size-4 text-emerald-500" />
  }
  if (ext === 'pdf') {
    return <FileText className="size-4 text-rose-500" />
  }
  return <FileCode className="size-4 text-indigo-500" />
}

const DOC_TYPE_META: Record<string, { label: string; icon: string; tag: string }> = {
  passport: { label: 'Passport', icon: '🛂', tag: 'Travel Document' },
  driving_license: { label: "Driver's License", icon: '🪪', tag: 'Identity & Driving' },
  national_id: { label: 'National ID Card', icon: '💳', tag: 'Citizen ID' },
  pan_card: { label: 'PAN Card', icon: '🪪', tag: 'Tax Identity (India)' },
  resume: { label: 'Resume / CV', icon: '💼', tag: 'Employment & Career' },
  utility_bill: { label: 'Utility Bill', icon: '📄', tag: 'Proof of Address' },
  bank_statement: { label: 'Bank Statement', icon: '🏦', tag: 'Financial Statement' },
  tax_form: { label: 'Tax Assessment', icon: '📑', tag: 'Tax Filing' },
  custom: { label: 'Custom Document', icon: '⚙️', tag: 'User-Defined' },
}

function Documents() {
  const [activeTab, setActiveTab] = useState<'vault' | 'schemas'>('vault')
  const [term, setTerm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // Vault data
  const documents = useQuery(api.documents.listDocuments, { term })
  const ticket = useMutation(api.documents.generateUploadUrl)
  const save = useMutation(api.documents.saveDocument)
  const remove = useMutation(api.documents.deleteDocument)

  // OCR Schema data
  const schemas = useQuery(api.ocr.getSchemas, {})
  const saveSchema = useMutation(api.ocr.saveSchema)
  const resetSchema = useMutation(api.ocr.resetSchema)
  const extractOcr = useMutation(api.ocr.extract)

  const [selectedDocType, setSelectedDocType] = useState<string>('passport')
  const [isAddingField, setIsAddingField] = useState(false)
  const [newFieldKey, setNewFieldKey] = useState('')
  const [newFieldLabel, setNewFieldLabel] = useState('')
  const [newFieldType, setNewFieldType] = useState<OcrFieldRule['type']>('string')
  const [newFieldPattern, setNewFieldPattern] = useState('')
  const [newFieldDesc, setNewFieldDesc] = useState('')
  const [newFieldRequired, setNewFieldRequired] = useState(false)

  // Live test extraction state
  const [testFileId, setTestFileId] = useState<string>('')
  const [testResult, setTestResult] = useState<OcrExtractionResult | null>(null)
  const [testRunning, setTestRunning] = useState(false)
  const [copiedJson, setCopiedJson] = useState(false)

  const activeSchema = useMemo(() => {
    if (!schemas) return null
    return schemas[selectedDocType] || schemas.passport || null
  }, [schemas, selectedDocType])

  async function upload(file: File) {
    setBusy(true)
    setError('')
    try {
      const url = await ticket({})
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': file.type },
        body: file,
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Upload failed')
      await save({ fileId: result.storageId, name: file.name })
      toast.success(`Uploaded ${file.name}`)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Upload failed'
      setError(msg)
      toast.error(msg)
    } finally {
      setBusy(false)
    }
  }

  async function handleAddField() {
    if (!activeSchema) return
    const key = newFieldKey.trim().toLowerCase().replace(/\s+/g, '_')
    const label = newFieldLabel.trim()
    if (!key || !label) {
      toast.error('Field key and label are required')
      return
    }

    if (activeSchema.fields.some((f) => f.key === key)) {
      toast.error('A field with this key already exists')
      return
    }

    const updatedFields: OcrFieldRule[] = [
      ...activeSchema.fields,
      {
        key,
        label,
        type: newFieldType,
        pattern: newFieldPattern.trim() || undefined,
        description: newFieldDesc.trim() || undefined,
        required: newFieldRequired,
      },
    ]

    try {
      await saveSchema({
        document_type: activeSchema.document_type,
        title: activeSchema.title,
        description: activeSchema.description,
        fields: updatedFields,
      })
      toast.success(`Field "${label}" added to ${activeSchema.title} schema`)
      setIsAddingField(false)
      setNewFieldKey('')
      setNewFieldLabel('')
      setNewFieldPattern('')
      setNewFieldDesc('')
      setNewFieldRequired(false)
    } catch (e) {
      toast.error('Failed to update schema')
    }
  }

  async function handleRemoveField(fieldKey: string) {
    if (!activeSchema) return
    const updatedFields = activeSchema.fields.filter((f) => f.key !== fieldKey)
    try {
      await saveSchema({
        document_type: activeSchema.document_type,
        title: activeSchema.title,
        description: activeSchema.description,
        fields: updatedFields,
      })
      toast.success('Field removed from schema')
    } catch (e) {
      toast.error('Failed to update schema')
    }
  }

  async function handleResetSchema() {
    if (!activeSchema) return
    if (!confirm(`Reset ${activeSchema.title} schema to standard default fields?`)) return
    try {
      await resetSchema({ document_type: activeSchema.document_type })
      toast.success('Schema reset to defaults')
    } catch (e) {
      toast.error('Failed to reset schema')
    }
  }

  async function handleRunTestExtraction() {
    if (!testFileId) {
      toast.error('Please select an uploaded document to test')
      return
    }
    setTestRunning(true)
    setTestResult(null)
    try {
      const res = await extractOcr({
        fileId: testFileId,
        document_type: selectedDocType,
        customFields: activeSchema?.fields,
      })
      setTestResult(res)
      toast.success('Indra OCR extraction completed')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Extraction test failed')
    } finally {
      setTestRunning(false)
    }
  }

  function copyResultJson() {
    if (!testResult) return
    navigator.clipboard.writeText(JSON.stringify(testResult, null, 2))
    setCopiedJson(true)
    setTimeout(() => setCopiedJson(false), 2000)
    toast.success('Extraction JSON copied to clipboard')
  }

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      {/* Header with Navigation Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-border/50">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-fg flex items-center gap-2.5">
            <span>Documents & Extraction</span>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-indigo-50 text-indigo-700 border border-indigo-200/80 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800/80">
              <Cpu className="size-3 text-indigo-600 dark:text-indigo-400" />
              Indra OCR Engine
            </span>
          </h1>
          <p className="text-sm text-muted-fg mt-0.5">
            Encrypted document vault and customizable schema-guided extraction using Indra OCR (datalab-to/indra).
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center p-1 bg-muted/60 rounded-xl border border-border/50">
          <button
            type="button"
            onClick={() => setActiveTab('vault')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
              activeTab === 'vault'
                ? 'bg-card text-fg shadow-2xs'
                : 'text-muted-fg hover:text-fg'
            }`}
          >
            Document Vault ({documents?.length ?? 0})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('schemas')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all flex items-center gap-1.5 ${
              activeTab === 'schemas'
                ? 'bg-card text-fg shadow-2xs'
                : 'text-muted-fg hover:text-fg'
            }`}
          >
            <Sparkles className="size-3 text-indigo-500" />
            <span>OCR Extraction Schemas</span>
          </button>
        </div>
      </div>

      {/* TAB 1: DOCUMENT VAULT */}
      {activeTab === 'vault' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-fg" />
              <input
                type="text"
                className="w-full text-xs bg-card border border-border/70 rounded-lg pl-9 pr-3 py-2 text-fg placeholder:text-muted-fg focus:outline-none focus:ring-1 focus:ring-primary shadow-2xs"
                placeholder="Search documents by filename…"
                value={term}
                onChange={(e) => setTerm(e.target.value)}
              />
            </div>

            <label className="inline-flex items-center gap-1.5 text-xs font-medium px-3.5 py-2 rounded-lg bg-primary text-primary-fg hover:opacity-90 transition-opacity cursor-pointer shadow-2xs">
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
              <span>{busy ? 'Uploading…' : 'Upload Document'}</span>
              <input
                type="file"
                className="hidden"
                accept="application/pdf,image/jpeg,image/png,image/webp"
                disabled={busy}
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) void upload(file)
                  e.target.value = ''
                }}
              />
            </label>
          </div>

          {error && (
            <div className="p-3 rounded-lg border border-destructive/30 bg-destructive/10 text-destructive text-xs">
              {error}
            </div>
          )}

          <div className="rounded-xl border border-border/60 bg-card/60 shadow-2xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-border/60 text-muted-fg bg-muted/20">
                    <th className="py-3 px-4 font-medium">Filename</th>
                    <th className="py-3 px-4 font-medium">Collected Date</th>
                    <th className="py-3 px-4 font-medium">Storage Status</th>
                    <th className="py-3 px-4 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {documents?.map((d) => {
                    const dateFormatted = new Date(d.createdAt).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })

                    return (
                      <tr key={d._id} className="hover:bg-muted/30 transition-colors group">
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2.5">
                            <div className="p-1.5 rounded-md bg-muted/50 border border-border/40">
                              {getFileIcon(d.name)}
                            </div>
                            <div className="flex flex-col">
                              <a
                                href={d.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="font-medium text-fg hover:text-primary hover:underline flex items-center gap-1"
                              >
                                <span>{d.name}</span>
                                <ExternalLink className="size-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                              </a>
                              <span className="font-mono text-[10px] text-muted-fg">{d._id}</span>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-muted-fg tabular-nums">{dateFormatted}</td>
                        <td className="py-3 px-4">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200/60 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/60">
                            <FileCheck2 className="size-3" />
                            Encrypted
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                setTestFileId(d.fileId)
                                setActiveTab('schemas')
                                toast.info(`Selected ${d.name} for OCR schema testing`)
                              }}
                              className="px-2 py-1 text-xs text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 rounded transition-colors flex items-center gap-1"
                            >
                              <Sparkles className="size-3" />
                              <span>Test OCR</span>
                            </button>
                            <a
                              href={d.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-2 py-1 text-xs text-muted-fg hover:text-fg hover:bg-muted/50 rounded transition-colors"
                            >
                              View
                            </a>
                            <button
                              type="button"
                              className="p-1 text-muted-fg hover:text-destructive hover:bg-destructive/10 rounded transition-colors"
                              title="Delete document"
                              onClick={async () => {
                                if (confirm(`Delete ${d.name}?`)) {
                                  await remove({ id: d._id })
                                  toast.success('Document deleted')
                                }
                              }}
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {documents?.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <FileText className="size-8 text-muted-fg/50 mb-2" />
                <p className="text-sm font-medium text-fg">No documents found</p>
                <p className="text-xs text-muted-fg mt-1 max-w-sm">
                  {term
                    ? 'No documents matched your search filter.'
                    : 'Upload a file or collect identity documents via verification workflows.'}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: OCR EXTRACTION SCHEMAS (USER DEFINED EXTRACTION) */}
      {activeTab === 'schemas' && (
        <div className="space-y-8">
          {/* Document Type Selector Carousel / Grid */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-fg tracking-wide uppercase">
                Select Document Type Schema
              </label>
              <span className="text-xs text-muted-fg">
                Configure extraction parameters per document format
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
              {Object.entries(DOC_TYPE_META).map(([typeKey, meta]) => {
                const isSelected = selectedDocType === typeKey
                const isCustomized = schemas?.[typeKey]?.isCustom

                return (
                  <button
                    key={typeKey}
                    type="button"
                    onClick={() => {
                      setSelectedDocType(typeKey)
                      setIsAddingField(false)
                    }}
                    className={`flex flex-col items-start p-3 rounded-xl border text-left transition-all ${
                      isSelected
                        ? 'border-primary bg-primary/5 shadow-2xs ring-1 ring-primary'
                        : 'border-border/60 bg-card hover:border-border hover:bg-muted/30'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className="text-xl mb-1">{meta.icon}</span>
                      {isCustomized && (
                        <span className="size-2 rounded-full bg-indigo-500" title="Customized schema" />
                      )}
                    </div>
                    <span className="text-xs font-semibold text-fg truncate w-full">{meta.label}</span>
                    <span className="text-[10px] text-muted-fg truncate w-full">{meta.tag}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Active Schema Editor Card */}
          {activeSchema && (
            <div className="rounded-xl border border-border/70 bg-card shadow-2xs overflow-hidden">
              <div className="p-5 border-b border-border/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-muted/10">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-semibold text-fg">{activeSchema.title}</h2>
                    {activeSchema.isCustom ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300">
                        Custom Schema
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
                        Default System Schema
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-fg mt-1">{activeSchema.description}</p>
                </div>

                <div className="flex items-center gap-2">
                  {activeSchema.isCustom && (
                    <Button
                      intent="secondary"
                      size="sm"
                      onClick={handleResetSchema}
                      className="text-xs flex items-center gap-1.5"
                    >
                      <RotateCcw className="size-3" />
                      <span>Reset to Defaults</span>
                    </Button>
                  )}
                  <Button
                    intent="primary"
                    size="sm"
                    onClick={() => setIsAddingField(!isAddingField)}
                    className="text-xs flex items-center gap-1.5"
                  >
                    <Plus className="size-3" />
                    <span>{isAddingField ? 'Cancel' : 'Add Custom Field'}</span>
                  </Button>
                </div>
              </div>

              {/* Add Custom Field Inline Card */}
              {isAddingField && (
                <div className="p-5 bg-indigo-50/50 dark:bg-indigo-950/20 border-b border-indigo-200/50 space-y-4">
                  <h3 className="text-xs font-semibold text-indigo-950 dark:text-indigo-200 flex items-center gap-1.5">
                    <Plus className="size-3.5 text-indigo-600" />
                    Define New Extraction Field for {activeSchema.title}
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="text-[11px] font-medium text-muted-fg block mb-1">
                        Field Key (API identifier) *
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. tax_id, employer_name"
                        value={newFieldKey}
                        onChange={(e) => setNewFieldKey(e.target.value)}
                        className="w-full text-xs bg-card border rounded-lg px-2.5 py-1.5 font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-medium text-muted-fg block mb-1">
                        Field Label (Display title) *
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Taxpayer ID Number"
                        value={newFieldLabel}
                        onChange={(e) => setNewFieldLabel(e.target.value)}
                        className="w-full text-xs bg-card border rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-medium text-muted-fg block mb-1">
                        Data Type
                      </label>
                      <select
                        value={newFieldType}
                        onChange={(e) => setNewFieldType(e.target.value as any)}
                        className="w-full text-xs bg-card border rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary"
                      >
                        <option value="string">String / Text</option>
                        <option value="date">Date (DOB, Expiry, Issue)</option>
                        <option value="number">Numeric / Monetary</option>
                        <option value="regex">Regex Pattern</option>
                        <option value="address">Postal Address</option>
                        <option value="name">Personal Name</option>
                        <option value="email">Email</option>
                        <option value="phone">Phone Number</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] font-medium text-muted-fg block mb-1">
                        Regex Pattern (Optional)
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. [A-Z0-9]{8,12} or \d{3}-\d{2}-\d{4}"
                        value={newFieldPattern}
                        onChange={(e) => setNewFieldPattern(e.target.value)}
                        className="w-full text-xs bg-card border rounded-lg px-2.5 py-1.5 font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-medium text-muted-fg block mb-1">
                        Keywords / Context Description (Optional)
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. TIN, Social Security, Employer Identification"
                        value={newFieldDesc}
                        onChange={(e) => setNewFieldDesc(e.target.value)}
                        className="w-full text-xs bg-card border rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2">
                    <label className="flex items-center gap-2 cursor-pointer text-xs text-muted-fg">
                      <input
                        type="checkbox"
                        checked={newFieldRequired}
                        onChange={(e) => setNewFieldRequired(e.target.checked)}
                        className="rounded border-border text-primary focus:ring-primary"
                      />
                      <span>Mark as mandatory / required field for verification</span>
                    </label>

                    <div className="flex items-center gap-2">
                      <Button intent="secondary" size="xs" onClick={() => setIsAddingField(false)}>
                        Cancel
                      </Button>
                      <Button intent="primary" size="xs" onClick={handleAddField}>
                        Save Field to Schema
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* Fields Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-border/50 text-muted-fg bg-muted/20">
                      <th className="py-2.5 px-4 font-medium">Field Key</th>
                      <th className="py-2.5 px-4 font-medium">Label</th>
                      <th className="py-2.5 px-4 font-medium">Data Type</th>
                      <th className="py-2.5 px-4 font-medium">Pattern / Keywords</th>
                      <th className="py-2.5 px-4 font-medium">Required</th>
                      <th className="py-2.5 px-4 font-medium text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/30">
                    {activeSchema.fields.map((field) => (
                      <tr key={field.key} className="hover:bg-muted/20 transition-colors">
                        <td className="py-2.5 px-4 font-mono font-medium text-fg">
                          {field.key}
                        </td>
                        <td className="py-2.5 px-4 font-medium text-fg">
                          {field.label}
                        </td>
                        <td className="py-2.5 px-4">
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300 capitalize">
                            {field.type}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 text-muted-fg max-w-xs truncate">
                          {field.pattern ? (
                            <code className="text-[11px] bg-muted/60 px-1 py-0.5 rounded">
                              {field.pattern}
                            </code>
                          ) : field.description ? (
                            <span className="text-[11px]">{field.description}</span>
                          ) : (
                            <span className="text-muted-fg/40">—</span>
                          )}
                        </td>
                        <td className="py-2.5 px-4">
                          {field.required ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-600 dark:text-rose-400">
                              Yes
                            </span>
                          ) : (
                            <span className="text-muted-fg/60">Optional</span>
                          )}
                        </td>
                        <td className="py-2.5 px-4 text-right">
                          <button
                            type="button"
                            onClick={() => handleRemoveField(field.key)}
                            className="p-1 text-muted-fg hover:text-destructive hover:bg-destructive/10 rounded transition-colors"
                            title="Remove field from schema"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Interactive Live OCR Playground */}
          <div className="rounded-xl border border-indigo-200/80 bg-gradient-to-b from-indigo-50/40 to-transparent dark:border-indigo-900/60 dark:from-indigo-950/20 p-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-semibold text-fg flex items-center gap-2">
                  <Cpu className="size-4 text-indigo-600 dark:text-indigo-400" />
                  <span>Test Indra OCR Extraction Live</span>
                </h3>
                <p className="text-xs text-muted-fg mt-0.5">
                  Select an uploaded document to execute the active {activeSchema?.title} extraction schema.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <select
                  value={testFileId}
                  onChange={(e) => setTestFileId(e.target.value)}
                  className="text-xs bg-card border border-border/80 rounded-lg px-3 py-2 text-fg focus:outline-none focus:ring-1 focus:ring-primary min-w-[220px]"
                >
                  <option value="">— Select a vault document —</option>
                  {documents?.map((d) => (
                    <option key={d._id} value={d.fileId}>
                      {d.name}
                    </option>
                  ))}
                </select>

                <Button
                  intent="primary"
                  size="sm"
                  isDisabled={!testFileId || testRunning}
                  onClick={handleRunTestExtraction}
                  className="text-xs flex items-center gap-1.5 shrink-0"
                >
                  {testRunning ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Play className="size-3.5 fill-current" />
                  )}
                  <span>{testRunning ? 'Extracting…' : 'Run Indra OCR'}</span>
                </Button>
              </div>
            </div>

            {/* Test Results Display */}
            {testResult && (
              <div className="space-y-4 pt-2">
                <div className="flex items-center justify-between p-3 rounded-lg bg-emerald-50 border border-emerald-200 dark:bg-emerald-950/40 dark:border-emerald-800/80 text-xs text-emerald-900 dark:text-emerald-200">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <span className="font-medium">
                      Extraction complete in{' '}
                      <strong className="font-mono">{testResult.execution_time_ms} ms</strong> using{' '}
                      <strong className="font-mono">{testResult.ocr_engine}</strong>
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={copyResultJson}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-white dark:bg-neutral-900 border text-fg hover:bg-neutral-50 text-[11px] font-medium transition"
                  >
                    {copiedJson ? <Check className="size-3 text-emerald-600" /> : <Copy className="size-3" />}
                    <span>{copiedJson ? 'Copied' : 'Copy JSON'}</span>
                  </button>
                </div>

                {/* Parsed Fields Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {Object.entries(testResult.fields).map(([key, field]) => (
                    <div
                      key={key}
                      className="p-3.5 rounded-xl border bg-card/90 shadow-2xs space-y-1.5"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-medium text-muted-fg">{field.label}</span>
                        {field.value ? (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
                            {Math.round(field.confidence * 100)}% match
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-neutral-100 text-neutral-500 dark:bg-neutral-800">
                            Not found
                          </span>
                        )}
                      </div>
                      <div className="text-sm font-semibold text-fg break-words font-mono">
                        {field.value || <span className="text-muted-fg/50 font-sans italic">None</span>}
                      </div>
                      {field.source_line && (
                        <div className="text-[10px] text-muted-fg truncate" title={field.source_line}>
                          Source: {field.source_line}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
