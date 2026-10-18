import { useEffect, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { api, useQuery, useMutation } from '~/lib/api-client'
import type { Settings } from '@open-kyc/contracts'
import {
  Building2,
  Image as ImageIcon,
  ShieldAlert,
  Save,
} from 'lucide-react'
import { toast } from 'sonner'

export const Route = createFileRoute('/_app/customization')({
  component: Customization,
})

function Customization() {
  const settings = useQuery(api.settings.get, {})
  const save = useMutation(api.settings.update)

  const [form, setForm] = useState<Settings>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (settings) setForm(settings)
  }, [settings])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      await save(form)
      toast.success('Branding customization saved')
    } catch (err) {
      toast.error('Failed to save customization')
    } finally {
      setSaving(false)
    }
  }

  const accent = form.accentColor || '#6366f1'

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-border/50">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-fg">
            Brand Customization
          </h1>
          <p className="text-sm text-muted-fg mt-0.5">
            Configure the visual identity and disclosures shown on public document collection portals.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Settings Form */}
        <form onSubmit={handleSave} className="lg:col-span-7 space-y-6">
          <div className="p-6 rounded-xl border border-border/60 bg-card/60 shadow-2xs space-y-5">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-fg">
              Public Identity
            </h2>

            {/* Public Name */}
            <div>
              <label className="block text-xs font-medium text-fg mb-1.5">
                Organization Name
              </label>
              <div className="relative">
                <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-fg" />
                <input
                  type="text"
                  className="w-full text-xs bg-card border border-border/70 rounded-lg pl-9 pr-3 py-2 text-fg placeholder:text-muted-fg focus:outline-none focus:ring-1 focus:ring-primary shadow-2xs"
                  placeholder="Acme Compliance Corp"
                  value={form.publicName || ''}
                  onChange={(e) =>
                    setForm({ ...form, publicName: e.target.value })
                  }
                />
              </div>
              <p className="text-[11px] text-muted-fg mt-1">
                Displayed in page titles and confirmation headers.
              </p>
            </div>

            {/* Logo URL */}
            <div>
              <label className="block text-xs font-medium text-fg mb-1.5">
                Logo URL
              </label>
              <div className="relative">
                <ImageIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-fg" />
                <input
                  type="url"
                  className="w-full text-xs bg-card border border-border/70 rounded-lg pl-9 pr-3 py-2 text-fg placeholder:text-muted-fg focus:outline-none focus:ring-1 focus:ring-primary shadow-2xs"
                  placeholder="https://example.com/logo.png"
                  value={form.logoUrl || ''}
                  onChange={(e) => setForm({ ...form, logoUrl: e.target.value })}
                />
              </div>
              <p className="text-[11px] text-muted-fg mt-1">
                Direct image link to your company badge or emblem (SVG/PNG).
              </p>
            </div>

            {/* Privacy Policy URL */}
            <div>
              <label className="block text-xs font-medium text-fg mb-1.5">
                Privacy Policy URL
              </label>
              <div className="relative">
                <ShieldAlert className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-fg" />
                <input
                  type="url"
                  className="w-full text-xs bg-card border border-border/70 rounded-lg pl-9 pr-3 py-2 text-fg placeholder:text-muted-fg focus:outline-none focus:ring-1 focus:ring-primary shadow-2xs"
                  placeholder="https://example.com/privacy"
                  value={form.privacyPolicyUrl || ''}
                  onChange={(e) =>
                    setForm({ ...form, privacyPolicyUrl: e.target.value })
                  }
                />
              </div>
              <p className="text-[11px] text-muted-fg mt-1">
                Mandatory data processing disclosure shown to uploading subjects.
              </p>
            </div>

            {/* Accent Color */}
            <div className="pt-2 border-t border-border/50">
              <label className="block text-xs font-medium text-fg mb-1.5">
                Portal Accent Color
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  className="size-9 rounded-lg border border-border/70 cursor-pointer p-0.5 bg-card"
                  value={accent}
                  onChange={(e) =>
                    setForm({ ...form, accentColor: e.target.value })
                  }
                />
                <input
                  type="text"
                  className="w-32 font-mono text-xs bg-card border border-border/70 rounded-lg px-3 py-2 text-fg focus:outline-none focus:ring-1 focus:ring-primary shadow-2xs"
                  value={accent}
                  onChange={(e) =>
                    setForm({ ...form, accentColor: e.target.value })
                  }
                />
                <span className="text-xs text-muted-fg">
                  Applied to primary buttons and status highlights
                </span>
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-1.5 text-xs font-medium px-4 py-2 rounded-lg bg-primary text-primary-fg hover:opacity-90 transition-opacity disabled:opacity-50 shadow-2xs"
          >
            <Save className="size-3.5" />
            <span>{saving ? 'Saving…' : 'Save Changes'}</span>
          </button>
        </form>

        {/* Live Subject Portal Preview */}
        <div className="lg:col-span-5 space-y-3">
          <div className="flex items-center justify-between text-xs text-muted-fg">
            <span className="font-semibold uppercase tracking-wider text-[11px]">
              Live Subject Preview
            </span>
            <span>Mobile & Desktop</span>
          </div>

          <div className="p-6 rounded-2xl border border-border/70 bg-card shadow-sm space-y-6">
            <div className="flex items-center gap-3 pb-4 border-b border-border/40">
              {form.logoUrl ? (
                <img
                  src={form.logoUrl}
                  alt="Organization Logo"
                  className="size-8 object-contain rounded"
                  onError={(e) => (e.currentTarget.style.display = 'none')}
                />
              ) : (
                <div
                  className="size-8 rounded-lg flex items-center justify-center text-white text-xs font-semibold shadow-xs"
                  style={{ backgroundColor: accent }}
                >
                  {(form.publicName || 'KYC').slice(0, 2).toUpperCase()}
                </div>
              )}
              <div>
                <p className="font-semibold text-xs text-fg">
                  {form.publicName || 'OpenKYC Identity Portal'}
                </p>
                <p className="text-[10px] text-muted-fg">Secure Verification</p>
              </div>
            </div>

            <div className="space-y-3 py-2">
              <div className="h-3 w-3/4 bg-muted/60 rounded" />
              <div className="h-2.5 w-full bg-muted/40 rounded" />
              <div className="h-2.5 w-5/6 bg-muted/40 rounded" />
            </div>

            <div
              className="p-4 rounded-xl border border-dashed flex flex-col items-center justify-center text-center gap-1.5"
              style={{ borderColor: `${accent}40` }}
            >
              <div
                className="size-7 rounded-full flex items-center justify-center"
                style={{ backgroundColor: `${accent}15`, color: accent }}
              >
                <ImageIcon className="size-3.5" />
              </div>
              <span className="text-xs font-medium text-fg">Upload ID Document</span>
              <span className="text-[10px] text-muted-fg">PDF, JPEG, or PNG up to 20MB</span>
            </div>

            <button
              type="button"
              className="w-full text-xs font-semibold py-2.5 rounded-lg text-white shadow-xs transition-opacity"
              style={{ backgroundColor: accent }}
            >
              Continue Verification
            </button>

            {form.privacyPolicyUrl && (
              <p className="text-[10px] text-center text-muted-fg flex items-center justify-center gap-1">
                <span>Subject to our</span>
                <span className="underline" style={{ color: accent }}>
                  Privacy Policy
                </span>
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
