import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useAction } from '~/lib/api-client'
import { useForm } from '@tanstack/react-form'
import { z } from 'zod'
import { api } from '@open-kyc/contracts'
import {
  Search,
  Globe,
  Newspaper,
  Image as ImageIcon,
  ExternalLink,
  Loader2,
  Calendar,
} from 'lucide-react'

export const Route = createFileRoute('/_app/backgroundsearch')({
  component: SearchPage,
})

export interface WebResult {
  url: string
  title: string
  description: string
  position: number
}

interface SearchResults {
  web?: Array<WebResult>
  news?: Array<any>
  images?: Array<any>
}

const searchSchema = z.object({
  name: z.string().min(3, 'Name must be at least 3 characters'),
})

function SearchPage() {
  const [results, setResults] = useState<SearchResults | null>(null)
  const searchMutation = useAction(api.search.publicSearch)

  const form = useForm({
    defaultValues: {
      name: '',
    },
    onSubmit: async ({ value }) => {
      const res = await searchMutation({ name: value.name })
      setResults(res)
    },
  })

  const web = results?.web ?? []
  const news = results?.news ?? []
  const images = results?.images ?? []

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-border/50">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-fg">
            Background Search
          </h1>
          <p className="text-sm text-muted-fg mt-0.5">
            Query open-source web, news articles, and media signals for subjects under review.
          </p>
        </div>
      </div>

      {/* Search Input Card */}
      <div className="p-6 rounded-xl border border-border/60 bg-card/60 shadow-2xs">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            e.stopPropagation()
            form.handleSubmit()
          }}
          className="space-y-3"
        >
          <form.Field
            name="name"
            validators={{
              onChange: ({ value }) => {
                const r = searchSchema.shape.name.safeParse(value)
                if (!r.success) return r.error.issues[0]?.message
              },
            }}
          >
            {(field) => (
              <div>
                <label className="block text-xs font-medium text-fg mb-1.5">
                  Subject Full Name or Entity
                </label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-fg" />
                  <input
                    type="text"
                    className="w-full text-xs bg-card border border-border/70 rounded-lg pl-9 pr-3 py-2.5 text-fg placeholder:text-muted-fg focus:outline-none focus:ring-1 focus:ring-primary shadow-2xs"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    placeholder="e.g. Satoshi Nakamoto or Acme Holdings Ltd"
                  />
                </div>
                {field.state.meta.errors.map((err) => (
                  <p key={err as string} className="text-destructive text-xs mt-1">
                    {err}
                  </p>
                ))}
              </div>
            )}
          </form.Field>

          <form.Subscribe selector={(s) => [s.canSubmit, s.isSubmitting]}>
            {([canSubmit, isSubmitting]) => (
              <button
                type="submit"
                disabled={!canSubmit || isSubmitting}
                className="w-full text-xs font-medium py-2.5 rounded-lg bg-primary text-primary-fg hover:opacity-90 transition-opacity disabled:opacity-50 inline-flex items-center justify-center gap-1.5 shadow-2xs"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" />
                    <span>Searching external sources…</span>
                  </>
                ) : (
                  <>
                    <Search className="size-3.5" />
                    <span>Run Background Check</span>
                  </>
                )}
              </button>
            )}
          </form.Subscribe>
        </form>
      </div>

      {/* Results Section */}
      {results && (
        <div className="space-y-6">
          {/* Web Results */}
          {web.length > 0 && (
            <div className="rounded-xl border border-border/60 bg-card/60 shadow-2xs overflow-hidden">
              <div className="p-4 border-b border-border/50 flex items-center gap-2">
                <Globe className="size-4 text-indigo-500" />
                <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-fg">
                  Web Intelligence ({web.length})
                </h2>
              </div>
              <div className="divide-y divide-border/40 p-4 space-y-4">
                {web.map((item) => (
                  <div key={item.url} className="pt-3 first:pt-0">
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-semibold text-fg hover:text-primary hover:underline inline-flex items-center gap-1 group"
                    >
                      <span>{item.title}</span>
                      <ExternalLink className="size-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </a>
                    <p className="text-xs text-muted-fg mt-1 line-clamp-2">
                      {item.description}
                    </p>
                    <span className="font-mono text-[10px] text-muted-fg/70 truncate block mt-0.5">
                      {item.url}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* News Results */}
          {news.length > 0 && (
            <div className="rounded-xl border border-border/60 bg-card/60 shadow-2xs overflow-hidden">
              <div className="p-4 border-b border-border/50 flex items-center gap-2">
                <Newspaper className="size-4 text-amber-500" />
                <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-fg">
                  Adverse News Articles ({news.length})
                </h2>
              </div>
              <div className="divide-y divide-border/40 p-4 space-y-4">
                {news.map((item) => (
                  <div key={item.url} className="pt-3 first:pt-0">
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-semibold text-fg hover:text-primary hover:underline inline-flex items-center gap-1 group"
                    >
                      <span>{item.title}</span>
                      <ExternalLink className="size-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </a>
                    <p className="text-xs text-muted-fg mt-1">
                      {item.snippet}
                    </p>
                    {item.date && (
                      <span className="inline-flex items-center gap-1 text-[10px] text-muted-fg mt-1 tabular-nums">
                        <Calendar className="size-3" />
                        {item.date}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Image Results */}
          {images.length > 0 && (
            <div className="rounded-xl border border-border/60 bg-card/60 shadow-2xs overflow-hidden">
              <div className="p-4 border-b border-border/50 flex items-center gap-2">
                <ImageIcon className="size-4 text-emerald-500" />
                <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-fg">
                  Media Images ({images.length})
                </h2>
              </div>
              <div className="p-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
                {images.map((item) => (
                  <a
                    key={item.url}
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group block rounded-lg border border-border/50 overflow-hidden hover:border-primary transition-colors"
                  >
                    <img
                      src={item.imageUrl}
                      alt={item.title}
                      className="w-full h-24 object-cover group-hover:scale-105 transition-transform"
                    />
                    <p className="p-1.5 text-[10px] text-muted-fg truncate">
                      {item.title}
                    </p>
                  </a>
                ))}
              </div>
            </div>
          )}

          {web.length === 0 && news.length === 0 && images.length === 0 && (
            <div className="p-8 text-center text-xs text-muted-fg border border-dashed rounded-xl border-border/60">
              No public findings returned for this query.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
