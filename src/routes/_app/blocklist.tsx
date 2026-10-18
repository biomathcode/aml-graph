import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { api, useQuery, useMutation } from '~/lib/api-client'
import {
  Ban,
  Plus,
  Trash2,
  Mail,
  User,
  FileText,
  AlertCircle,
} from 'lucide-react'
import { toast } from 'sonner'

export const Route = createFileRoute('/_app/blocklist')({
  component: Blocklist,
})

function getKindIcon(kind: string) {
  if (kind === 'email') return <Mail className="size-3.5" />
  if (kind === 'name') return <User className="size-3.5" />
  return <FileText className="size-3.5" />
}

function Blocklist() {
  const entries = useQuery(api.blocklist.list, {})
  const add = useMutation(api.blocklist.add)
  const remove = useMutation(api.blocklist.remove)

  const [value, setValue] = useState('')
  const [reason, setReason] = useState('')
  const [kind, setKind] = useState('email')
  const [submitting, setSubmitting] = useState(false)

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!value.trim() || !reason.trim() || submitting) return
    setSubmitting(true)
    try {
      await add({ value: value.trim(), reason: reason.trim(), kind })
      setValue('')
      setReason('')
      toast.success('Blocklist signal added')
    } catch (err) {
      toast.error('Failed to add blocklist entry')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-border/50">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-fg">
            Review Blocklist
          </h1>
          <p className="text-sm text-muted-fg mt-0.5">
            Configure matching flags for suspicious emails, names, or document numbers.
          </p>
        </div>
      </div>

      {/* Advisory Note */}
      <div className="p-4 rounded-xl border border-amber-200/50 bg-amber-50/40 dark:border-amber-900/40 dark:bg-amber-950/20 flex items-start gap-3 text-xs text-amber-800 dark:text-amber-300">
        <AlertCircle className="size-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
        <p className="leading-relaxed">
          Matches surface as warning signals on the operator review screen. Blocklist items do not make automated rejection decisions; all final KYC actions remain operator-controlled.
        </p>
      </div>

      {/* Add Entry Card */}
      <div className="p-5 rounded-xl border border-border/60 bg-card/60 shadow-2xs">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-fg mb-4">
          Add Matching Signal
        </h2>
        <form onSubmit={handleAdd} className="grid grid-cols-1 sm:grid-cols-12 gap-3">
          <div className="sm:col-span-3">
            <select
              aria-label="Match field"
              value={kind}
              onChange={(e) => setKind(e.target.value)}
              className="w-full text-xs bg-card border border-border/70 rounded-lg px-3 py-2 text-fg focus:outline-none focus:ring-1 focus:ring-primary shadow-2xs"
            >
              <option value="email">Email Address</option>
              <option value="name">Full Name</option>
              <option value="document_number">Document Number</option>
            </select>
          </div>

          <div className="sm:col-span-4">
            <input
              type="text"
              aria-label="Blocked value"
              required
              className="w-full text-xs bg-card border border-border/70 rounded-lg px-3 py-2 text-fg placeholder:text-muted-fg focus:outline-none focus:ring-1 focus:ring-primary shadow-2xs"
              placeholder={
                kind === 'email'
                  ? 'badactor@example.com'
                  : kind === 'name'
                    ? 'John Doe'
                    : 'AB12345678'
              }
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          </div>

          <div className="sm:col-span-3">
            <input
              type="text"
              aria-label="Reason"
              required
              className="w-full text-xs bg-card border border-border/70 rounded-lg px-3 py-2 text-fg placeholder:text-muted-fg focus:outline-none focus:ring-1 focus:ring-primary shadow-2xs"
              placeholder="e.g. Chargeback history"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>

          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={submitting}
              className="w-full h-full text-xs font-medium px-3.5 py-2 rounded-lg bg-primary text-primary-fg hover:opacity-90 transition-opacity disabled:opacity-50 inline-flex items-center justify-center gap-1.5 shadow-2xs"
            >
              <Plus className="size-3.5" />
              <span>Add Signal</span>
            </button>
          </div>
        </form>
      </div>

      {/* Entries List */}
      <div className="rounded-xl border border-border/60 bg-card/60 shadow-2xs overflow-hidden">
        <div className="p-4 border-b border-border/50 flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-fg">
            Active Blocklist Signals
          </h2>
          <span className="text-xs text-muted-fg tabular-nums">
            {entries?.length ?? 0} active signals
          </span>
        </div>

        <div className="divide-y divide-border/40">
          {entries?.map((entry) => (
            <div
              key={entry._id}
              className="p-4 flex items-center justify-between gap-4 hover:bg-muted/30 transition-colors"
            >
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-muted/60 text-muted-fg border border-border/40 shrink-0">
                  {getKindIcon(entry.kind)}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-xs text-fg">
                      {entry.value}
                    </span>
                    <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-muted/60 text-muted-fg capitalize">
                      {entry.kind.replace('_', ' ')}
                    </span>
                  </div>
                  <p className="text-xs text-muted-fg mt-0.5">{entry.reason}</p>
                </div>
              </div>

              <button
                type="button"
                className="p-1.5 text-muted-fg hover:text-destructive hover:bg-destructive/10 rounded transition-colors"
                title="Remove entry"
                onClick={async () => {
                  if (confirm(`Remove blocklist signal for "${entry.value}"?`)) {
                    await remove({ id: entry._id })
                    toast.success('Blocklist signal removed')
                  }
                }}
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          ))}

          {entries?.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Ban className="size-8 text-muted-fg/40 mb-2" />
              <p className="text-sm font-medium text-fg">No blocklist signals</p>
              <p className="text-xs text-muted-fg mt-1 max-w-sm">
                Add emails, subject names, or document numbers above to flag matching submissions during review.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
