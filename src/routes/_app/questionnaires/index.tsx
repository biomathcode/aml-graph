import { useState } from 'react'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { api, useQuery, useMutation } from '~/lib/api-client'
import { ListTodo, Plus, Trash2, Edit3 } from 'lucide-react'
import { toast } from 'sonner'

export const Route = createFileRoute('/_app/questionnaires/')({
  component: Questionnaires,
})

function Questionnaires() {
  const list = useQuery(api.questionnaires.list, {})
  const create = useMutation(api.questionnaires.create)
  const remove = useMutation(api.questionnaires.remove)
  const navigate = useNavigate()

  const [title, setTitle] = useState('')
  const [submitting, setSubmitting] = useState(false)

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-border/50">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-fg">
            Custom Questionnaires
          </h1>
          <p className="text-sm text-muted-fg mt-0.5">
            Author and publish bespoke compliance questionnaires and subject disclosures.
          </p>
        </div>
      </div>

      {/* Create Questionnaire Form */}
      <div className="p-5 rounded-xl border border-border/60 bg-card/60 shadow-2xs">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-fg mb-4">
          Create New Questionnaire
        </h2>
        <form
          className="flex flex-col sm:flex-row gap-3"
          onSubmit={async (e) => {
            e.preventDefault()
            if (!title.trim() || submitting) return
            setSubmitting(true)
            try {
              const id = await create({ title: title.trim() })
              toast.success('Questionnaire created')
              await navigate({ to: '/questionnaires/$id', params: { id } })
            } catch (err) {
              toast.error('Failed to create questionnaire')
            } finally {
              setSubmitting(false)
            }
          }}
        >
          <input
            type="text"
            aria-label="Questionnaire title"
            className="flex-1 text-xs bg-card border border-border/70 rounded-lg px-3 py-2 text-fg placeholder:text-muted-fg focus:outline-none focus:ring-1 focus:ring-primary shadow-2xs"
            required
            placeholder="e.g. Source of Wealth Declaration or PEP Questionnaire"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <button
            type="submit"
            disabled={submitting}
            className="text-xs font-medium px-4 py-2 rounded-lg bg-primary text-primary-fg hover:opacity-90 transition-opacity disabled:opacity-50 inline-flex items-center justify-center gap-1.5 shrink-0 shadow-2xs"
          >
            <Plus className="size-3.5" />
            <span>Create Questionnaire</span>
          </button>
        </form>
      </div>

      {/* Questionnaires List */}
      <div className="rounded-xl border border-border/60 bg-card/60 shadow-2xs overflow-hidden">
        <div className="p-4 border-b border-border/50 flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-fg">
            Questionnaires
          </h2>
          <span className="text-xs text-muted-fg tabular-nums">
            {list?.length ?? 0} total
          </span>
        </div>

        <div className="divide-y divide-border/40">
          {list?.map((q) => (
            <div
              key={q._id}
              className="p-4 flex items-center justify-between gap-4 hover:bg-muted/30 transition-colors group"
            >
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-muted/60 text-muted-fg border border-border/40 shrink-0">
                  <ListTodo className="size-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <Link
                      to="/questionnaires/$id"
                      params={{ id: q._id }}
                      className="font-semibold text-xs text-fg hover:text-primary hover:underline"
                    >
                      {q.title}
                    </Link>
                    <span
                      className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${
                        q.isPublished
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200/60 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/60'
                          : 'bg-neutral-100 text-neutral-600 border-neutral-200 dark:bg-neutral-800 dark:text-neutral-300 dark:border-neutral-700'
                      }`}
                    >
                      {q.isPublished ? 'Published' : 'Draft'}
                    </span>
                  </div>
                  {q.description && (
                    <p className="text-xs text-muted-fg mt-0.5 line-clamp-1">
                      {q.description}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Link
                  to="/questionnaires/$id"
                  params={{ id: q._id }}
                  className="inline-flex items-center gap-1 text-xs font-medium text-muted-fg hover:text-fg px-2.5 py-1.5 rounded-md hover:bg-muted/50 transition-colors"
                >
                  <Edit3 className="size-3.5" />
                  <span>Edit</span>
                </Link>
                <button
                  type="button"
                  className="p-1.5 text-muted-fg hover:text-destructive hover:bg-destructive/10 rounded transition-colors"
                  title="Delete questionnaire"
                  onClick={async () => {
                    if (confirm('Delete this questionnaire and its responses?')) {
                      await remove({ id: q._id })
                      toast.success('Questionnaire deleted')
                    }
                  }}
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            </div>
          ))}

          {list?.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <ListTodo className="size-8 text-muted-fg/40 mb-2" />
              <p className="text-sm font-medium text-fg">No questionnaires yet</p>
              <p className="text-xs text-muted-fg mt-1 max-w-sm">
                Create a custom questionnaire above to collect structured subject declarations alongside document uploads.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
