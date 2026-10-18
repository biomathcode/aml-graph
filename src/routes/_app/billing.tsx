import { createFileRoute } from '@tanstack/react-router'
import { api, useQuery } from '~/lib/api-client'
import {
  ShieldCheck,
  Database,
  HardDrive,
  FileText,
  Cpu,
  Layers,
} from 'lucide-react'

export const Route = createFileRoute('/_app/billing')({ component: Billing })

function Billing() {
  const usage = useQuery(api.analytics.get, {})

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-border/50">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight text-fg">
              Self-Hosted Usage
            </h1>
            <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/60 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/60">
              Community Edition
            </span>
          </div>
          <p className="text-sm text-muted-fg mt-0.5">
            Unlimited verification sessions, workflows, and operator accounts on your infrastructure.
          </p>
        </div>
      </div>

      {/* Plan / Model Overview Card */}
      <div className="p-6 rounded-xl border border-border/60 bg-card/60 backdrop-blur-xs shadow-2xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-1.5 max-w-xl">
            <h2 className="text-base font-semibold text-fg flex items-center gap-2">
              <ShieldCheck className="size-5 text-emerald-500" />
              100% Data Sovereignty & Zero Per-Check Fees
            </h2>
            <p className="text-xs text-muted-fg leading-relaxed">
              This OpenKYC installation runs entirely on your own infrastructure. There are no hosted subscriptions, metered per-verification fees, or external processing dependencies. Storage and compute are billed directly by your infrastructure provider.
            </p>
          </div>

          <div className="flex items-center gap-6 border-t md:border-t-0 md:border-l border-border/60 pt-4 md:pt-0 md:pl-6 shrink-0">
            <div>
              <span className="text-xs text-muted-fg block">Monthly License</span>
              <span className="text-2xl font-semibold text-fg tracking-tight">$0</span>
              <span className="text-[10px] text-muted-fg block">Free & Open Source</span>
            </div>
            <div>
              <span className="text-xs text-muted-fg block">Per Verification</span>
              <span className="text-2xl font-semibold text-fg tracking-tight">$0</span>
              <span className="text-[10px] text-muted-fg block">Unlimited volume</span>
            </div>
          </div>
        </div>
      </div>

      {/* Usage Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-5 rounded-xl border border-border/60 bg-card/60 shadow-2xs">
          <div className="flex items-center justify-between text-muted-fg">
            <span className="text-xs font-medium uppercase tracking-wider">
              Verification Sessions
            </span>
            <Layers className="size-4 opacity-60" />
          </div>
          <p className="text-3xl font-semibold tracking-tight text-fg mt-3 tabular-nums">
            {usage?.total ?? 0}
          </p>
          <p className="text-xs text-muted-fg mt-1">Processed on this node</p>
        </div>

        <div className="p-5 rounded-xl border border-border/60 bg-card/60 shadow-2xs">
          <div className="flex items-center justify-between text-muted-fg">
            <span className="text-xs font-medium uppercase tracking-wider">
              Stored Documents
            </span>
            <FileText className="size-4 opacity-60" />
          </div>
          <p className="text-3xl font-semibold tracking-tight text-fg mt-3 tabular-nums">
            {usage?.documents ?? 0}
          </p>
          <p className="text-xs text-muted-fg mt-1">Private uploaded credentials</p>
        </div>

        <div className="p-5 rounded-xl border border-border/60 bg-card/60 shadow-2xs">
          <div className="flex items-center justify-between text-muted-fg">
            <span className="text-xs font-medium uppercase tracking-wider">
              Successful Approvals
            </span>
            <ShieldCheck className="size-4 text-emerald-500 opacity-80" />
          </div>
          <p className="text-3xl font-semibold tracking-tight text-fg mt-3 tabular-nums">
            {usage?.approved ?? 0}
          </p>
          <p className="text-xs text-muted-fg mt-1">Verified compliance records</p>
        </div>
      </div>

      {/* Infrastructure Components */}
      <div className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-fg">
          Underlying Stack
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-4 rounded-xl border border-border/60 bg-card/40 flex items-start gap-3">
            <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400">
              <Database className="size-4" />
            </div>
            <div>
              <h3 className="text-xs font-semibold text-fg">PostgreSQL 17</h3>
              <p className="text-[11px] text-muted-fg mt-0.5">
                Tenant-scoped relational persistence with Drizzle migrations.
              </p>
            </div>
          </div>

          <div className="p-4 rounded-xl border border-border/60 bg-card/40 flex items-start gap-3">
            <div className="p-2 rounded-lg bg-rose-50 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400">
              <Cpu className="size-4" />
            </div>
            <div>
              <h3 className="text-xs font-semibold text-fg">Redis 7</h3>
              <p className="text-[11px] text-muted-fg mt-0.5">
                Upload tickets, API rate limiting, and real-time dashboard events.
              </p>
            </div>
          </div>

          <div className="p-4 rounded-xl border border-border/60 bg-card/40 flex items-start gap-3">
            <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400">
              <HardDrive className="size-4" />
            </div>
            <div>
              <h3 className="text-xs font-semibold text-fg">Object Storage</h3>
              <p className="text-[11px] text-muted-fg mt-0.5">
                Configurable adapter: Local disk, AWS S3, Cloudflare R2, or GCS.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
