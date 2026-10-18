import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { api, useQuery, useMutation } from '~/lib/api-client'
import type { Workflow } from '@open-kyc/contracts'
import {
  Workflow as WorkflowIcon,
  Plus,
  Trash2,
  Edit3,
  Archive,
  X,
  ListChecks,
} from 'lucide-react'
import { toast } from 'sonner'

export const Route = createFileRoute('/_app/workflow')({ component: Workflows })

const blank = {
  name: '',
  description: '',
  type: 'kyc',
  status: 'active' as Workflow['status'],
  documentType: 'any',
  steps: [] as Workflow['steps'],
}

const DOCUMENT_TYPE_OPTIONS = [
  { value: 'any', label: 'Any Government ID (Customer / Employee Choice)' },
  { value: 'national_id', label: 'National Identity Card (Front & Back)' },
  { value: 'passport', label: 'International Passport (Photo Page)' },
  { value: 'driver_license', label: "Driver's License (Front & Back)" },
  { value: 'residence_permit', label: 'Residence Permit / Work Authorization' },
  { value: 'pan_card', label: 'PAN / Tax Card' },
]

const STEP_TYPES = [
  { value: 'id_verification', label: 'ID Verification' },
  { value: 'face_match', label: 'Face Match' },
  { value: 'ip_analysis', label: 'IP Analysis' },
  { value: 'address_check', label: 'Address Check' },
  { value: 'document_validation', label: 'Document Validation' },
]

function Workflows() {
  const rows = useQuery(api.functions.workflows.getWorkflows, {})
  const create = useMutation(api.functions.workflows.createWorkflow)
  const update = useMutation(api.functions.workflows.updateWorkflow)
  const remove = useMutation(api.functions.workflows.deleteWorkflow)

  const [form, setForm] = useState(blank)
  const [editing, setEditing] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [busy, setBusy] = useState(false)

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim() || busy) return
    setBusy(true)
    try {
      if (editing) {
        await update({ ...form, id: editing })
        toast.success('Workflow updated')
      } else {
        await create(form)
        toast.success('Workflow created')
      }
      setForm(blank)
      setEditing(null)
      setShowForm(false)
    } catch (err) {
      toast.error('Failed to save workflow')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-border/50">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-fg">
            Workflows
          </h1>
          <p className="text-sm text-muted-fg mt-0.5">
            Configure document requirements and manual operator checklists.
          </p>
        </div>

        {!showForm && !editing && (
          <button
            type="button"
            onClick={() => {
              setForm(blank)
              setEditing(null)
              setShowForm(true)
            }}
            className="inline-flex items-center gap-1.5 text-xs font-medium px-3.5 py-2 rounded-lg bg-primary text-primary-fg hover:opacity-90 transition-opacity shadow-2xs"
          >
            <Plus className="size-3.5" />
            <span>New Workflow</span>
          </button>
        )}
      </div>

      {/* Workflow Builder Form */}
      {(showForm || editing) && (
        <form
          onSubmit={handleSave}
          className="p-6 rounded-xl border border-border/70 bg-card/60 shadow-2xs space-y-6"
        >
          <div className="flex items-center justify-between pb-3 border-b border-border/40">
            <h2 className="text-sm font-semibold text-fg">
              {editing ? 'Edit Workflow' : 'Create New Workflow'}
            </h2>
            <button
              type="button"
              onClick={() => {
                setEditing(null)
                setShowForm(false)
                setForm(blank)
              }}
              className="text-xs text-muted-fg hover:text-fg p-1"
            >
              <X className="size-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-fg mb-1">
                Workflow Name
              </label>
              <input
                required
                type="text"
                placeholder="e.g. Standard KYC Onboarding"
                className="w-full text-xs bg-card border border-border/70 rounded-lg px-3 py-2 text-fg placeholder:text-muted-fg focus:outline-none focus:ring-1 focus:ring-primary shadow-2xs"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-fg mb-1">
                Status
              </label>
              <select
                className="w-full text-xs bg-card border border-border/70 rounded-lg px-3 py-2 text-fg focus:outline-none focus:ring-1 focus:ring-primary shadow-2xs"
                value={form.status}
                onChange={(e) =>
                  setForm({
                    ...form,
                    status: e.target.value as Workflow['status'],
                  })
                }
              >
                <option value="active">Active (Available for sessions)</option>
                <option value="pending">Pending</option>
                <option value="archived">Archived</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-fg mb-1">
                Requested Document Type
              </label>
              <select
                className="w-full text-xs bg-card border border-border/70 rounded-lg px-3 py-2 text-fg focus:outline-none focus:ring-1 focus:ring-primary shadow-2xs"
                value={form.documentType || 'any'}
                onChange={(e) =>
                  setForm({
                    ...form,
                    documentType: e.target.value,
                  })
                }
              >
                {DOCUMENT_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-muted-fg mt-1">
                Identity document type asked from the customer/employee.
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-fg mb-1">
                Description
              </label>
              <input
                type="text"
                placeholder="e.g. Requires national ID or passport plus proof of residence"
                className="w-full text-xs bg-card border border-border/70 rounded-lg px-3 py-2 text-fg placeholder:text-muted-fg focus:outline-none focus:ring-1 focus:ring-primary shadow-2xs"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
          </div>

          {/* Checklist steps */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-fg">
                Manual Review Checklist Steps
              </span>
              <button
                type="button"
                onClick={() =>
                  setForm({
                    ...form,
                    steps: [
                      ...form.steps,
                      {
                        id: crypto.randomUUID(),
                        label: 'Document verification',
                        type: 'document_validation',
                        enabled: true,
                      },
                    ],
                  })
                }
                className="text-xs text-primary hover:underline font-medium inline-flex items-center gap-1"
              >
                <Plus className="size-3" />
                Add Step
              </button>
            </div>

            {form.steps.length === 0 ? (
              <p className="text-xs text-muted-fg italic py-2">
                No checklist steps added yet. Click "Add Step" above.
              </p>
            ) : (
              <div className="space-y-2">
                {form.steps.map((step, i) => (
                  <div
                    key={step.id}
                    className="flex flex-wrap items-center gap-2.5 p-2.5 rounded-lg border border-border/50 bg-muted/20 text-xs"
                  >
                    <input
                      type="text"
                      aria-label="Step label"
                      required
                      placeholder="Step name"
                      className="flex-1 min-w-[180px] bg-card border border-border/70 rounded px-2.5 py-1.5 text-xs text-fg focus:outline-none focus:ring-1 focus:ring-primary"
                      value={step.label}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          steps: form.steps.map((s, n) =>
                            n === i ? { ...s, label: e.target.value } : s,
                          ),
                        })
                      }
                    />

                    <select
                      aria-label="Step type"
                      className="bg-card border border-border/70 rounded px-2.5 py-1.5 text-xs text-fg focus:outline-none focus:ring-1 focus:ring-primary"
                      value={step.type}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          steps: form.steps.map((s, n) =>
                            n === i ? { ...s, type: e.target.value } : s,
                          ),
                        })
                      }
                    >
                      {STEP_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                    </select>

                    <select
                      aria-label="Step requested document type"
                      title="Requested Document Type for this checklist step"
                      className="bg-card border border-border/70 rounded px-2.5 py-1.5 text-xs text-fg focus:outline-none focus:ring-1 focus:ring-primary"
                      value={step.documentType || ''}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          steps: form.steps.map((s, n) =>
                            n === i
                              ? { ...s, documentType: e.target.value || undefined }
                              : s,
                          ),
                        })
                      }
                    >
                      <option value="">Requested document type: workflow default</option>
                      {DOCUMENT_TYPE_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>

                    <label className="flex items-center gap-1.5 cursor-pointer text-muted-fg select-none px-2">
                      <input
                        type="checkbox"
                        checked={step.enabled}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            steps: form.steps.map((s, n) =>
                              n === i ? { ...s, enabled: e.target.checked } : s,
                            ),
                          })
                        }
                      />
                      <span>Required</span>
                    </label>

                    <button
                      type="button"
                      onClick={() =>
                        setForm({
                          ...form,
                          steps: form.steps.filter((_, n) => n !== i),
                        })
                      }
                      className="p-1 text-muted-fg hover:text-destructive rounded ml-auto"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 pt-3 border-t border-border/50">
            <button
              type="submit"
              disabled={busy}
              className="text-xs font-medium px-4 py-2 rounded-lg bg-primary text-primary-fg hover:opacity-90 transition-opacity disabled:opacity-50 shadow-2xs"
            >
              {busy ? 'Saving…' : editing ? 'Update Workflow' : 'Save Workflow'}
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(null)
                setShowForm(false)
                setForm(blank)
              }}
              className="text-xs text-muted-fg hover:text-fg px-3 py-2 rounded-lg hover:bg-muted/50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Workflows List */}
      <div className="rounded-xl border border-border/60 bg-card/60 shadow-2xs overflow-hidden">
        <div className="p-4 border-b border-border/50 flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-fg">
            Configured Workflows
          </h2>
          <span className="text-xs text-muted-fg tabular-nums">
            {rows?.length ?? 0} workflows
          </span>
        </div>

        <div className="divide-y divide-border/40">
          {rows?.map((row) => (
            <div
              key={row._id}
              className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-muted/30 transition-colors group"
            >
              <div className="flex items-start gap-3">
                <div className="p-2.5 rounded-lg bg-muted/60 text-muted-fg border border-border/40 shrink-0">
                  <WorkflowIcon className="size-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-xs text-fg">{row.name}</h3>
                    <span
                      className={`text-[10px] font-medium px-2 py-0.5 rounded-full border capitalize ${
                        row.status === 'active'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200/60 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/60'
                          : row.status === 'pending'
                            ? 'bg-amber-50 text-amber-700 border-amber-200/60 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/60'
                            : 'bg-neutral-100 text-neutral-600 border-neutral-200 dark:bg-neutral-800 dark:text-neutral-300 dark:border-neutral-700'
                      }`}
                    >
                      {row.status}
                    </span>
                  </div>
                  {row.description && (
                    <p className="text-xs text-muted-fg mt-1">
                      {row.description}
                    </p>
                  )}
                  <div className="flex flex-wrap items-center gap-3 mt-2 text-[11px] text-muted-fg">
                    <span className="inline-flex items-center gap-1">
                      <ListChecks className="size-3 text-primary" />
                      {row.steps.filter((s) => s.enabled).length} checklist steps
                    </span>
                    {(row as any).documentType && (row as any).documentType !== 'any' ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 font-medium">
                        Doc: {((row as any).documentType as string).replace('_', ' ').toUpperCase()}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted/60 text-muted-fg border border-border/40 font-medium">
                        Doc: Any Government ID
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1.5 self-end sm:self-center">
                <button
                  type="button"
                  onClick={() => {
                    setEditing(row._id)
                    setShowForm(true)
                    setForm({
                      name: row.name,
                      description: row.description || '',
                      type: row.type,
                      status: row.status,
                      documentType: (row as any).documentType || 'any',
                      steps: row.steps,
                    })
                  }}
                  className="px-2.5 py-1.5 text-xs font-medium text-muted-fg hover:text-fg rounded-md hover:bg-muted/50 transition-colors inline-flex items-center gap-1"
                >
                  <Edit3 className="size-3.5" />
                  <span>Edit</span>
                </button>

                <button
                  type="button"
                  onClick={async () => {
                    const newStatus =
                      row.status === 'active' ? 'archived' : 'active'
                    await update({ id: row._id, status: newStatus })
                    toast.success(
                      `Workflow ${newStatus === 'active' ? 'activated' : 'archived'}`,
                    )
                  }}
                  className="px-2.5 py-1.5 text-xs font-medium text-muted-fg hover:text-fg rounded-md hover:bg-muted/50 transition-colors inline-flex items-center gap-1"
                >
                  <Archive className="size-3.5" />
                  <span>{row.status === 'active' ? 'Archive' : 'Activate'}</span>
                </button>

                <button
                  type="button"
                  className="p-1.5 text-muted-fg hover:text-destructive hover:bg-destructive/10 rounded transition-colors"
                  title="Delete workflow"
                  onClick={async () => {
                    if (confirm('Delete this workflow?')) {
                      await remove({ id: row._id })
                      toast.success('Workflow deleted')
                    }
                  }}
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            </div>
          ))}

          {rows?.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <WorkflowIcon className="size-8 text-muted-fg/40 mb-2" />
              <p className="text-sm font-medium text-fg">No workflows defined</p>
              <p className="text-xs text-muted-fg mt-1 max-w-sm">
                Create your first workflow to define the checklist and document types required from subjects.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
