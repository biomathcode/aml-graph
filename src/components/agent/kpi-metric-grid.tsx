import { Network, DollarSign, Layers, Activity } from 'lucide-react'
import type { ParsedKpis } from './types'

interface KpiMetricGridProps {
  kpis: ParsedKpis
}

export function KpiMetricGrid({ kpis }: KpiMetricGridProps) {
  const cards = [
    {
      title: 'Composite Risk Score',
      value: `${kpis.riskScore}/100`,
      subtext:
        kpis.riskLevel === 'critical'
          ? 'Critical Regulatory Breach'
          : kpis.riskLevel === 'high'
            ? 'High Risk Escalation Required'
            : kpis.riskLevel === 'medium'
              ? 'Moderate Risk Review'
              : 'Within Standard Tolerance',
      icon: Activity,
      trend: kpis.riskScore >= 70 ? 'Severe' : kpis.riskScore >= 40 ? 'Moderate' : 'Low',
      trendColor:
        kpis.riskScore >= 70
          ? 'text-rose-400 bg-rose-500/10 border-rose-500/20'
          : kpis.riskScore >= 40
            ? 'text-amber-400 bg-amber-500/10 border-amber-500/20'
            : 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    },
    {
      title: 'Graph Typologies',
      value:
        kpis.cyclesCount > 0
          ? `${kpis.cyclesCount} Circular Cycle`
          : kpis.structuringAlerts > 0
            ? `${kpis.structuringAlerts} Smurfing Alerts`
            : '0 Anomalies',
      subtext:
        kpis.cyclesCount > 0
          ? `${kpis.preservationRate || '95%'} Preservation Rate`
          : kpis.structuringAlerts > 0
            ? '<$10k Deposit Structuring'
            : 'No circular flows detected',
      icon: Network,
      trend: kpis.cyclesCount > 0 ? 'Cycle Loop' : kpis.structuringAlerts > 0 ? 'Smurfing' : 'Clean',
      trendColor:
        kpis.cyclesCount > 0
          ? 'text-rose-400 bg-rose-500/10 border-rose-500/20'
          : kpis.structuringAlerts > 0
            ? 'text-orange-400 bg-orange-500/10 border-orange-500/20'
            : 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    },
    {
      title: 'Flagged Exposure Volume',
      value: kpis.totalExposure || '$150,000',
      subtext:
        kpis.cyclesCount > 0
          ? 'Initial wire origin volume'
          : 'Aggregated micro-transactions',
      icon: DollarSign,
      trend: 'Threshold Breach',
      trendColor: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    },
    {
      title: 'Graph Trace Depth',
      value: `${kpis.hopsCount} Hops`,
      subtext: `${kpis.flagCount} active compliance rules triggered`,
      icon: Layers,
      trend: `${Math.round((kpis.confidenceScore || 0.94) * 100)}% Conf.`,
      trendColor: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20',
    },
  ]

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
      {cards.map((card, i) => {
        const Icon = card.icon
        return (
          <div
            key={i}
            className="p-3.5 rounded-xl border border-border/70 bg-card/70 backdrop-blur-xs hover:border-border transition-all flex flex-col justify-between shadow-2xs group"
          >
            <div className="flex items-center justify-between gap-1 mb-2">
              <span className="text-[11px] font-semibold text-muted-fg tracking-wide uppercase line-clamp-1">
                {card.title}
              </span>
              <div className="size-6 rounded-lg bg-muted/60 flex items-center justify-center text-muted-fg group-hover:text-fg group-hover:bg-primary/10 transition-colors shrink-0">
                <Icon className="size-3.5" />
              </div>
            </div>

            <div>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-lg sm:text-xl font-bold font-mono tracking-tight text-fg truncate">
                  {card.value}
                </span>
                <span
                  className={`text-[9px] font-bold px-1.5 py-0.2 rounded-full border shrink-0 ${card.trendColor}`}
                >
                  {card.trend}
                </span>
              </div>
              <p className="text-[11px] text-muted-fg mt-1 line-clamp-1">
                {card.subtext}
              </p>
            </div>
          </div>
        )
      })}
    </div>
  )
}
