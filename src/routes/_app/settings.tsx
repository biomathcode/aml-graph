import { useEffect, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { api, useQuery, useMutation } from '~/lib/api-client'
import {
  Key,
  Webhook,
  Clock,
  Mail,
  Copy,
  Plus,
  RotateCw,
  Save,
} from 'lucide-react'
import { toast } from 'sonner'

export const Route = createFileRoute('/_app/settings')({ component: Settings })

function Settings() {
  const prefs = useQuery(api.settings.get, {})
  const keys = useQuery(api.developer.keys, {})
  const deliveries = useQuery(api.developer.webhooks, {})

  const save = useMutation(api.settings.update)
  const create = useMutation(api.developer.createKey)
  const revoke = useMutation(api.developer.revokeKey)
  const rotate = useMutation(api.developer.rotateWebhookSecret)

  const [hours, setHours] = useState(168)
  const [webhook, setWebhook] = useState('')
  const [emails, setEmails] = useState(false)
  const [keyName, setKeyName] = useState('')
  const [secret, setSecret] = useState('')
  const [secretType, setSecretType] = useState<'api_key' | 'webhook'>('api_key')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (prefs) {
      setHours(prefs.sessionExpiryHours || 168)
      setWebhook(prefs.webhookUrl || '')
      setEmails(!!prefs.emailNotifications)
    }
  }, [prefs])

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-border/50">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-fg">
            Settings & Developer Access
          </h1>
          <p className="text-sm text-muted-fg mt-0.5">
            Configure application runtime settings, developer API keys, and webhook endpoints.
          </p>
        </div>
      </div>

      {/* Secret Display Banner */}
      {secret && (
        <div className="p-4 rounded-xl border border-indigo-200/80 bg-indigo-50/60 dark:border-indigo-900/60 dark:bg-indigo-950/30 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-indigo-900 dark:text-indigo-200">
              {secretType === 'api_key' ? 'New API Key Secret' : 'Webhook Signing Secret'}
            </span>
            <span className="text-[11px] text-indigo-700 dark:text-indigo-300">
              Make sure to copy this now. It will not be shown again.
            </span>
          </div>
          <div className="flex items-center gap-2">
            <code className="flex-1 font-mono text-xs bg-card/80 p-2 rounded-lg border border-indigo-200/50 break-all select-all text-fg">
              {secret}
            </code>
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText(secret)
                toast.success('Secret copied to clipboard')
              }}
              className="px-3 py-2 text-xs font-medium bg-primary text-primary-fg rounded-lg hover:opacity-90 transition-opacity shrink-0 flex items-center gap-1 shadow-2xs"
            >
              <Copy className="size-3.5" />
              <span>Copy</span>
            </button>
          </div>
        </div>
      )}

      {/* General Settings Card */}
      <form
        onSubmit={async (e) => {
          e.preventDefault()
          setSaving(true)
          try {
            await save({
              sessionExpiryHours: hours,
              webhookUrl: webhook,
              emailNotifications: emails,
            })
            toast.success('Application settings saved')
          } catch (err) {
            toast.error('Failed to save settings')
          } finally {
            setSaving(false)
          }
        }}
        className="p-6 rounded-xl border border-border/60 bg-card/60 shadow-2xs space-y-5"
      >
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-fg">
          Runtime Configuration
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-fg mb-1">
              Session Expiration (Hours)
            </label>
            <div className="relative">
              <Clock className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-fg" />
              <input
                type="number"
                min="1"
                max="8760"
                className="w-full text-xs bg-card border border-border/70 rounded-lg pl-9 pr-3 py-2 text-fg focus:outline-none focus:ring-1 focus:ring-primary shadow-2xs tabular-nums"
                value={hours}
                onChange={(e) => setHours(Number(e.target.value))}
              />
            </div>
            <p className="text-[11px] text-muted-fg mt-1">
              Default collection link validity (168h = 7 days).
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-fg mb-1">
              Webhook Endpoint URL
            </label>
            <div className="relative">
              <Webhook className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-fg" />
              <input
                type="url"
                placeholder="https://api.yourdomain.com/webhooks/kyc"
                className="w-full text-xs bg-card border border-border/70 rounded-lg pl-9 pr-3 py-2 text-fg placeholder:text-muted-fg focus:outline-none focus:ring-1 focus:ring-primary shadow-2xs"
                value={webhook}
                onChange={(e) => setWebhook(e.target.value)}
              />
            </div>
            <p className="text-[11px] text-muted-fg mt-1">
              Signed HMAC events dispatched on submission and review completion.
            </p>
          </div>
        </div>

        <div className="pt-2 border-t border-border/40">
          <label className="flex items-center gap-2.5 text-xs text-fg cursor-pointer select-none">
            <input
              type="checkbox"
              checked={emails}
              onChange={(e) => setEmails(e.target.checked)}
              className="rounded"
            />
            <div className="flex items-center gap-1.5">
              <Mail className="size-3.5 text-muted-fg" />
              <span>Email verification alerts to operators (requires SMTP configuration)</span>
            </div>
          </label>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-1.5 text-xs font-medium px-4 py-2 rounded-lg bg-primary text-primary-fg hover:opacity-90 transition-opacity disabled:opacity-50 shadow-2xs"
        >
          <Save className="size-3.5" />
          <span>{saving ? 'Saving…' : 'Save Settings'}</span>
        </button>
      </form>

      {/* API Keys Card */}
      <div className="p-6 rounded-xl border border-border/60 bg-card/60 shadow-2xs space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-fg">
              Developer API Keys
            </h2>
            <p className="text-xs text-muted-fg mt-0.5">
              Authenticate programmatic session creation and review API requests.
            </p>
          </div>

          <button
            type="button"
            onClick={async () => {
              const res = await rotate({})
              setSecret(res.secret)
              setSecretType('webhook')
              toast.success('Webhook signing secret rotated')
            }}
            className="text-xs font-medium text-muted-fg hover:text-fg px-3 py-1.5 rounded-lg border border-border/70 hover:bg-muted/50 transition-colors inline-flex items-center gap-1.5 self-start sm:self-auto shadow-2xs"
          >
            <RotateCw className="size-3" />
            <span>Rotate Webhook Secret</span>
          </button>
        </div>

        {/* Create Key Form */}
        <form
          className="flex flex-col sm:flex-row gap-2.5"
          onSubmit={async (e) => {
            e.preventDefault()
            if (!keyName.trim()) return
            try {
              const res = await create({ name: keyName.trim() })
              setSecret(res.key)
              setSecretType('api_key')
              setKeyName('')
              toast.success('API key generated')
            } catch (err) {
              toast.error('Failed to create API key')
            }
          }}
        >
          <input
            type="text"
            aria-label="API key name"
            required
            placeholder="Key name, e.g. Production Backend or Zapier"
            className="flex-1 text-xs bg-card border border-border/70 rounded-lg px-3 py-2 text-fg placeholder:text-muted-fg focus:outline-none focus:ring-1 focus:ring-primary shadow-2xs"
            value={keyName}
            onChange={(e) => setKeyName(e.target.value)}
          />
          <button
            type="submit"
            className="text-xs font-medium px-4 py-2 rounded-lg bg-primary text-primary-fg hover:opacity-90 transition-opacity inline-flex items-center justify-center gap-1.5 shrink-0 shadow-2xs"
          >
            <Plus className="size-3.5" />
            <span>Create API Key</span>
          </button>
        </form>

        {/* Keys List */}
        <div className="rounded-lg border border-border/50 divide-y divide-border/40 overflow-hidden">
          {keys?.map((k) => (
            <div
              key={k.id}
              className="p-3.5 flex items-center justify-between text-xs hover:bg-muted/20 transition-colors"
            >
              <div className="flex items-center gap-2.5">
                <Key className="size-4 text-muted-fg" />
                <span className="font-semibold text-fg">{k.name}</span>
                <code className="font-mono text-[11px] text-muted-fg px-1.5 py-0.5 rounded bg-muted/60">
                  {k.prefix}…
                </code>
              </div>
              <button
                type="button"
                className="text-xs text-muted-fg hover:text-destructive px-2 py-1 rounded transition-colors"
                onClick={async () => {
                  if (confirm(`Revoke API key "${k.name}"?`)) {
                    await revoke({ id: k.id })
                    toast.success('API key revoked')
                  }
                }}
              >
                Revoke
              </button>
            </div>
          ))}

          {keys?.length === 0 && (
            <div className="p-8 text-center text-xs text-muted-fg">
              No developer API keys active. Generate one above to access REST endpoints.
            </div>
          )}
        </div>
      </div>

      {/* Webhook Deliveries Card */}
      <div className="p-6 rounded-xl border border-border/60 bg-card/60 shadow-2xs space-y-4">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-fg">
          Recent Webhook Deliveries
        </h2>

        <div className="rounded-lg border border-border/50 divide-y divide-border/40 overflow-hidden">
          {deliveries?.map((d) => (
            <div
              key={d.id}
              className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs hover:bg-muted/20 transition-colors"
            >
              <div className="flex items-center gap-2">
                <span
                  className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${
                    d.status === 'delivered'
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200/60 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/60'
                      : 'bg-rose-50 text-rose-700 border-rose-200/60 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800/60'
                  }`}
                >
                  {d.status}
                </span>
                <span className="text-muted-fg tabular-nums">
                  {d.attempts} {d.attempts === 1 ? 'attempt' : 'attempts'}
                </span>
                {d.last_error && (
                  <span className="text-rose-600 dark:text-rose-400 text-[11px] truncate max-w-xs">
                    {d.last_error}
                  </span>
                )}
              </div>
              <span className="text-muted-fg tabular-nums text-[11px]">
                {new Date(d.created_at).toLocaleString()}
              </span>
            </div>
          ))}

          {deliveries?.length === 0 && (
            <div className="p-8 text-center text-xs text-muted-fg">
              No webhook deliveries recorded yet.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
