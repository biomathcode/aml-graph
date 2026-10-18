import { useState } from 'react'
import { CheckCircle2, Circle, FileCheck2, ArrowRight } from 'lucide-react'
import { toast } from 'sonner'
import type { RecommendationItem } from './types'

interface ActionableStepsCardProps {
  recommendations: RecommendationItem[]
  entityName: string
}

export function ActionableStepsCard({
  recommendations,
  entityName,
}: ActionableStepsCardProps) {
  const [completedSteps, setCompletedSteps] = useState<Record<string, boolean>>({})

  const toggleStep = (id: string) => {
    setCompletedSteps((prev) => {
      const next = !prev[id]
      if (next) toast.success(`Action step marked completed`)
      return { ...prev, [id]: next }
    })
  }

  const handleExecuteAction = (rec: RecommendationItem) => {
    if (rec.actionKey === 'file_sar') {
      const sarText = `FINCEN SUSPICIOUS ACTIVITY REPORT (SAR) - DRAFT PREVIEW
Form: FinCEN Form 111 (XML 2.0)
Subject: ${entityName}
Filing Date: ${new Date().toISOString().split('T')[0]}
Narrative: Multi-hop round-tripping money laundering typology confirmed via FalkorDB knowledge graph and OpenKYC identity records. Initial wire of $150,000 returned via shell accounts with 95% capital retention.`
      navigator.clipboard.writeText(sarText)
      toast.success('SAR Filing template drafted & copied to clipboard')
    } else if (rec.actionKey === 'freeze_account') {
      toast.error(`Automated debit-freeze signal queued for ${entityName} cluster`)
    } else if (rec.actionKey === 'initiate_edd') {
      toast.info(`Enhanced Due Diligence (EDD) questionnaire dispatched`)
    } else {
      toast.success(`Action initiated: ${rec.title}`)
    }
  }

  return (
    <div className="rounded-2xl border border-border/80 bg-card/80 backdrop-blur-md overflow-hidden text-xs shadow-xs">
      {/* Header */}
      <div className="px-4 py-3 bg-muted/40 border-b border-border/60 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="size-6 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
            <FileCheck2 className="size-3.5" />
          </div>
          <div>
            <span className="font-semibold text-fg block text-xs">
              Actionable Compliance Protocol
            </span>
            <span className="text-[10px] text-muted-fg">
              Recommended operational & regulatory actions
            </span>
          </div>
        </div>

        <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded-full bg-muted border border-border/60 text-muted-fg">
          {Object.values(completedSteps).filter(Boolean).length} /{' '}
          {recommendations.length} Completed
        </span>
      </div>

      {/* Steps List */}
      <div className="p-3 sm:p-4 space-y-2.5">
        {recommendations.map((rec) => {
          const isDone = completedSteps[rec.id]
          const isCritical = rec.priority === 'critical'
          const isHigh = rec.priority === 'high'

          return (
            <div
              key={rec.id}
              className={`p-3 rounded-xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                isDone
                  ? 'bg-muted/20 border-border/40 opacity-60'
                  : isCritical
                    ? 'bg-rose-500/5 border-rose-500/30 hover:border-rose-500/50'
                    : isHigh
                      ? 'bg-amber-500/5 border-amber-500/30 hover:border-amber-500/50'
                      : 'bg-card/70 border-border/70 hover:border-border'
              }`}
            >
              <div className="flex items-start gap-3 flex-1 min-w-0">
                <button
                  onClick={() => toggleStep(rec.id)}
                  className="mt-0.5 text-muted-fg hover:text-fg transition-colors shrink-0"
                  title={isDone ? 'Mark uncompleted' : 'Mark completed'}
                >
                  {isDone ? (
                    <CheckCircle2 className="size-4 text-emerald-400" />
                  ) : (
                    <Circle className="size-4 text-muted-fg hover:text-primary" />
                  )}
                </button>

                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5 mb-1">
                    <span
                      className={`font-semibold text-xs text-fg ${
                        isDone ? 'line-through text-muted-fg' : ''
                      }`}
                    >
                      {rec.title}
                    </span>
                    <span
                      className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded-full border ${
                        isCritical
                          ? 'bg-rose-500/15 text-rose-400 border-rose-500/30'
                          : isHigh
                            ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                            : 'bg-muted text-muted-fg border-border/40'
                      }`}
                    >
                      {rec.priority}
                    </span>
                    {rec.statutoryRef && (
                      <span className="text-[10px] font-mono text-muted-fg">
                        ({rec.statutoryRef})
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-fg leading-relaxed">
                    {rec.description}
                  </p>
                </div>
              </div>

              {/* Action Button */}
              <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                <button
                  onClick={() => handleExecuteAction(rec)}
                  className="px-2.5 py-1.5 rounded-lg bg-primary hover:bg-primary/90 text-primary-fg text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-2xs"
                >
                  <span>Execute Action</span>
                  <ArrowRight className="size-3" />
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
