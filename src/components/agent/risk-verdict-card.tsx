import { useState } from 'react'
import {
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  FileText,
  User,
  Briefcase,
  Users,
  Copy,
  Check,
} from 'lucide-react'
import { toast } from 'sonner'
import type { ParsedVerdict, RiskLevel } from './types'

interface RiskVerdictCardProps {
  verdict: ParsedVerdict
  onExportAudit?: () => void
}

const levelConfig: Record<
  RiskLevel,
  {
    label: string
    badgeClass: string
    ringColor: string
    bgColor: string
    icon: typeof ShieldAlert
    strokeColor: string
  }
> = {
  critical: {
    label: 'CRITICAL RISK',
    badgeClass: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
    ringColor: 'from-rose-500 to-red-600',
    bgColor: 'bg-rose-500/10 border-rose-500/25',
    icon: ShieldAlert,
    strokeColor: '#f43f5e',
  },
  high: {
    label: 'HIGH RISK',
    badgeClass: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
    ringColor: 'from-orange-500 to-amber-600',
    bgColor: 'bg-orange-500/10 border-orange-500/25',
    icon: AlertTriangle,
    strokeColor: '#f97316',
  },
  medium: {
    label: 'MEDIUM RISK',
    badgeClass: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    ringColor: 'from-amber-400 to-yellow-500',
    bgColor: 'bg-amber-500/10 border-amber-500/25',
    icon: AlertTriangle,
    strokeColor: '#f59e0b',
  },
  low: {
    label: 'LOW RISK',
    badgeClass: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
    ringColor: 'from-blue-400 to-indigo-500',
    bgColor: 'bg-blue-500/10 border-blue-500/25',
    icon: ShieldCheck,
    strokeColor: '#3b82f6',
  },
  clean: {
    label: 'CLEAN BASELINE',
    badgeClass: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    ringColor: 'from-emerald-400 to-teal-500',
    bgColor: 'bg-emerald-500/10 border-emerald-500/25',
    icon: ShieldCheck,
    strokeColor: '#10b981',
  },
}

export function RiskVerdictCard({ verdict, onExportAudit }: RiskVerdictCardProps) {
  const [copied, setCopied] = useState(false)
  const config = levelConfig[verdict.riskLevel]
  const Icon = config.icon

  // Radial gauge calculations
  const radius = 38
  const circumference = 2 * Math.PI * radius
  const strokeDashoffset = circumference - (verdict.riskScore / 100) * circumference

  const copyDossier = () => {
    const text = `OPENKYC COMPLIANCE VERDICT
Subject: ${verdict.entityName} (${verdict.entityType.toUpperCase()})
Classification: ${verdict.classification}
Risk Score: ${verdict.riskScore}/100 [${config.label}]
Summary: ${verdict.summary}
Flags:
${verdict.flags.map((f) => ` • ${f}`).join('\n')}`

    navigator.clipboard.writeText(text)
    setCopied(true)
    toast.success('Executive verdict copied to clipboard')
    setTimeout(() => setCopied(false), 2000)
  }

  const EntityIcon =
    verdict.entityType === 'employee'
      ? Briefcase
      : verdict.entityType === 'network'
        ? Users
        : User

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border ${config.bgColor} backdrop-blur-md p-4 sm:p-5 transition-all shadow-xs`}
    >
      {/* Subtle background ambient glow */}
      <div
        className={`absolute -top-16 -right-16 size-44 rounded-full blur-3xl opacity-20 pointer-events-none bg-gradient-to-br ${config.ringColor}`}
      />

      <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Left: Entity & Classification */}
        <div className="flex items-start gap-3.5 flex-1 min-w-0">
          <div className="relative size-12 rounded-xl bg-muted/80 border border-border/80 flex items-center justify-center shrink-0 shadow-2xs">
            <EntityIcon className="size-6 text-fg" />
            <span
              className={`absolute -bottom-1 -right-1 size-3.5 rounded-full border-2 border-card ${
                verdict.riskLevel === 'critical'
                  ? 'bg-rose-500 animate-pulse'
                  : verdict.riskLevel === 'high'
                    ? 'bg-orange-500'
                    : verdict.riskLevel === 'medium'
                      ? 'bg-amber-500'
                      : 'bg-emerald-500'
              }`}
            />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <h2 className="text-base sm:text-lg font-bold text-fg tracking-tight truncate">
                {verdict.entityName}
              </h2>
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase border ${config.badgeClass}`}
              >
                <span className="size-1.5 rounded-full bg-current animate-ping" />
                {config.label}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-fg">
              <span className="font-medium text-fg/90">
                {verdict.classification}
              </span>
              {verdict.departmentOrRole && (
                <span>• {verdict.departmentOrRole}</span>
              )}
              {verdict.nationalityOrJurisdiction && (
                <span>• {verdict.nationalityOrJurisdiction}</span>
              )}
            </div>

            <p className="text-xs text-muted-fg/90 mt-2 leading-relaxed">
              {verdict.summary}
            </p>
          </div>
        </div>

        {/* Right: Radial Score Gauge & Quick Actions */}
        <div className="flex items-center justify-between md:justify-end gap-4 shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-border/40">
          {/* Radial Gauge */}
          <div className="flex items-center gap-3">
            <div className="relative size-20 flex items-center justify-center">
              <svg className="size-full -rotate-90" viewBox="0 0 90 90">
                {/* Background Ring */}
                <circle
                  cx="45"
                  cy="45"
                  r={radius}
                  stroke="currentColor"
                  strokeWidth="7"
                  className="text-muted/30"
                  fill="transparent"
                />
                {/* Value Arc */}
                <circle
                  cx="45"
                  cy="45"
                  r={radius}
                  stroke={config.strokeColor}
                  strokeWidth="7"
                  strokeDasharray={circumference}
                  strokeDashoffset={strokeDashoffset}
                  strokeLinecap="round"
                  className="transition-all duration-1000 ease-out"
                  fill="transparent"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="text-lg font-black font-mono tracking-tight text-fg leading-none">
                  {verdict.riskScore}
                </span>
                <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-fg">
                  / 100
                </span>
              </div>
            </div>

            <div className="text-left hidden sm:block">
              <span className="text-[10px] uppercase font-bold text-muted-fg tracking-wider block">
                Composite Index
              </span>
              <span className="text-xs font-semibold text-fg">
                {verdict.riskScore >= 75
                  ? 'Severe Flag'
                  : verdict.riskScore >= 50
                    ? 'Elevated Concern'
                    : verdict.riskScore >= 25
                      ? 'Minor Deviations'
                      : 'Optimal Baseline'}
              </span>
            </div>
          </div>

          {/* Quick Copy / Export Buttons */}
          <div className="flex flex-col gap-1.5">
            <button
              onClick={copyDossier}
              className="px-2.5 py-1.5 rounded-lg border border-border/80 bg-card hover:bg-muted text-xs font-medium text-fg flex items-center gap-1.5 transition-colors shadow-2xs"
              title="Copy executive summary"
            >
              {copied ? (
                <>
                  <Check className="size-3 text-emerald-400" />
                  <span className="text-[11px]">Copied</span>
                </>
              ) : (
                <>
                  <Copy className="size-3 text-muted-fg" />
                  <span className="text-[11px]">Copy Verdict</span>
                </>
              )}
            </button>
            {onExportAudit && (
              <button
                onClick={onExportAudit}
                className="px-2.5 py-1.5 rounded-lg border border-border/80 bg-card hover:bg-muted text-xs font-medium text-fg flex items-center gap-1.5 transition-colors shadow-2xs"
              >
                <FileText className="size-3 text-primary" />
                <span className="text-[11px]">Export SAR</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Flag Tags Strip */}
      {verdict.flags.length > 0 && (
        <div className="mt-3 pt-3 border-t border-border/40 flex flex-wrap gap-1.5">
          {verdict.flags.map((flag, idx) => (
            <span
              key={idx}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-muted/60 border border-border/60 text-[11px] text-muted-fg font-medium"
            >
              <Icon className="size-3 text-primary shrink-0" />
              <span>{flag}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
