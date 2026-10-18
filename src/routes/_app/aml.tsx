import { createFileRoute, Link } from '@tanstack/react-router'
import {
  Network,
  ArrowRight,
  FileSearch,
  Ban,
  CheckCircle2,
} from 'lucide-react'

export const Route = createFileRoute('/_app/aml')({
  component: AMLHub,
})

function AMLHub() {
  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-border/50">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-semibold tracking-tight text-fg">
              AML & Sanctions Screening
            </h1>
            <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200/60 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800/60">
              Graph Analytics Active
            </span>
          </div>
          <p className="text-sm text-muted-fg mt-0.5">
            Knowledge-graph entity resolution, adverse media analysis, and operator manual decision workflows.
          </p>
        </div>
      </div>

      {/* Hero Overview */}
      <div className="p-6 rounded-xl border border-border/60 bg-card/60 backdrop-blur-xs shadow-2xs space-y-4">
        <div className="flex items-start gap-4">
          <div className="p-2.5 rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400 shrink-0">
            <Network className="size-6" />
          </div>
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-fg">
              Graph-Powered Compliance Pipeline
            </h2>
            <p className="text-xs text-muted-fg leading-relaxed">
              When documents are submitted, extracted identity attributes are ingested into a local FalkorDB graph. Graph algorithms evaluate multi-hop relationships between subjects, shared document identifiers, synthetic identity patterns, and sanctioned entities.
            </p>
          </div>
        </div>
      </div>

      {/* Quick Action Navigation Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Link
          to="/verifications"
          className="p-5 rounded-xl border border-border/60 bg-card/50 hover:bg-card hover:border-border transition-all shadow-2xs group flex flex-col justify-between"
        >
          <div className="space-y-2">
            <div className="size-8 rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400 flex items-center justify-center">
              <CheckCircle2 className="size-4" />
            </div>
            <h3 className="text-sm font-semibold text-fg flex items-center justify-between">
              Review Verifications
              <ArrowRight className="size-3.5 text-muted-fg group-hover:translate-x-0.5 transition-transform" />
            </h3>
            <p className="text-xs text-muted-fg">
              Inspect submitted documents, view automated OCR extractions, and review graph risk reports.
            </p>
          </div>
          <span className="text-[11px] font-medium text-primary mt-4 inline-block">
            Open review queue →
          </span>
        </Link>

        <Link
          to="/blocklist"
          className="p-5 rounded-xl border border-border/60 bg-card/50 hover:bg-card hover:border-border transition-all shadow-2xs group flex flex-col justify-between"
        >
          <div className="space-y-2">
            <div className="size-8 rounded-lg bg-rose-50 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400 flex items-center justify-center">
              <Ban className="size-4" />
            </div>
            <h3 className="text-sm font-semibold text-fg flex items-center justify-between">
              Blocklist Signals
              <ArrowRight className="size-3.5 text-muted-fg group-hover:translate-x-0.5 transition-transform" />
            </h3>
            <p className="text-xs text-muted-fg">
              Define matching rules for flagged emails, known fraud document numbers, and names.
            </p>
          </div>
          <span className="text-[11px] font-medium text-primary mt-4 inline-block">
            Manage signals →
          </span>
        </Link>

        <Link
          to="/backgroundsearch"
          className="p-5 rounded-xl border border-border/60 bg-card/50 hover:bg-card hover:border-border transition-all shadow-2xs group flex flex-col justify-between"
        >
          <div className="space-y-2">
            <div className="size-8 rounded-lg bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400 flex items-center justify-center">
              <FileSearch className="size-4" />
            </div>
            <h3 className="text-sm font-semibold text-fg flex items-center justify-between">
              Background Media Search
              <ArrowRight className="size-3.5 text-muted-fg group-hover:translate-x-0.5 transition-transform" />
            </h3>
            <p className="text-xs text-muted-fg">
              Perform Firecrawl queries for open-source adverse media and litigation findings.
            </p>
          </div>
          <span className="text-[11px] font-medium text-primary mt-4 inline-block">
            Search media →
          </span>
        </Link>
      </div>

      {/* Compliance Principles Card */}
      <div className="p-5 rounded-xl border border-border/60 bg-muted/20 space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-fg">
          Compliance Principles
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-muted-fg">
          <div className="flex items-start gap-2">
            <span className="size-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
            <span>
              <strong>Operator in the Loop:</strong> All AML reports and blocklist matches inform operator review; no automatic rejections take place without audit trail.
            </span>
          </div>
          <div className="flex items-start gap-2">
            <span className="size-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
            <span>
              <strong>Immutable Audit Log:</strong> Every review decision, approval, and rejection is stamped with operator ID and immutable timestamp in PostgreSQL.
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
