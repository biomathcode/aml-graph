import { ShieldAlert, Sparkles, ArrowRight } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import type {
  AmlRiskLevel,
  AmlSignalSeverity,
  AmlRiskReport,
} from '@open-kyc/contracts'
import { CardContent } from '~/components/ui/card'

const levelStyles: Record<AmlRiskLevel, { label: string; className: string }> = {
  critical: {
    label: 'Critical',
    className: 'bg-rose-100 text-rose-800 border-rose-300',
  },
  high: {
    label: 'High',
    className: 'bg-orange-100 text-orange-800 border-orange-300',
  },
  medium: {
    label: 'Medium',
    className: 'bg-amber-100 text-amber-800 border-amber-300',
  },
  low: {
    label: 'Low',
    className: 'bg-blue-100 text-blue-800 border-blue-300',
  },
  clean: {
    label: 'Clean',
    className: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  },
}

const severityStyles: Record<AmlSignalSeverity, string> = {
  informational: 'bg-neutral-200 text-neutral-700 border-neutral-300',
  low: 'bg-blue-100 text-blue-800 border-blue-300',
  medium: 'bg-amber-100 text-amber-800 border-amber-300',
  high: 'bg-orange-100 text-orange-800 border-orange-300',
}

function RiskBadge({ level }: { level: AmlRiskLevel }) {
  const style = levelStyles[level]
  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${style.className}`}
    >
      {style.label}
    </span>
  )
}

export function AmlRiskPanel({ risk }: { risk: AmlRiskReport }) {
  return (
    <div className="overflow-hidden border rounded-2xl w-full bg-card shadow-sm">
      <div className="py-2.5 bg-accent/60 px-4 text-md font-semibold text-neutral-800 flex items-center justify-between flex-wrap gap-2">
        <span className="flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-primary" />
          AML Risk Analysis
        </span>
        <span className="flex items-center gap-2">
          <span className="text-xs font-normal text-muted-fg">
            Risk score {Math.round(risk.riskScore)}/100
          </span>
          <RiskBadge level={risk.level} />
        </span>
      </div>
      <CardContent className="space-y-4 p-4">
        <p className="text-sm text-neutral-700">{risk.summary}</p>

        {risk.signals.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-fg">
              Detected Signals
            </h3>
            {risk.signals.map((signal) => (
              <div
                key={signal.type}
                className="border rounded-xl p-3 bg-neutral-50/50 space-y-1"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`px-2 py-0.5 rounded text-xs font-medium border ${severityStyles[signal.severity]}`}
                  >
                    {signal.severity}
                  </span>
                  <span className="font-mono text-xs font-medium text-neutral-800">
                    {signal.type}
                  </span>
                </div>
                <p className="text-sm text-neutral-600">{signal.detail}</p>
                {signal.entities.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {signal.entities.map((entity) => (
                      <span
                        key={entity}
                        className="px-2 py-0.5 rounded bg-neutral-200 text-neutral-700 text-xs font-mono"
                      >
                        {entity}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {risk.communities && risk.communities.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-fg">
              Suspicious Communities
            </h3>
            <div className="flex flex-wrap gap-2">
              {risk.communities.map((community) => (
                <span
                  key={community.id}
                  className="px-3 py-1.5 rounded-xl border bg-neutral-50 text-sm"
                >
                  <span className="font-semibold text-neutral-800">
                    Community {community.id}
                  </span>
                  <span className="text-muted-fg"> · {community.size} entities</span>
                  <span className="block text-xs text-neutral-500">
                    {community.members.slice(0, 6).join(', ')}
                    {community.members.length > 6 ? ' …' : ''}
                  </span>
                </span>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </div>
  )
}

const AGENT_SUGGESTIONS = [
  'Is this subject linked to any shared identifiers?',
  'Summarize the sanctions exposure for this subject',
  'Which graph typologies fired for this session?',
]

/**
 * Launcher for the compliance agent. The full agentic chat (retrieval over
 * PostgreSQL, the FalkorDB AML graph, and the document records) lives at
 * /agent — this card funnels operators there from the review view.
 */
export function GraphAgentCta({ subjectName }: { subjectName?: string }) {
  return (
    <div className="overflow-hidden border rounded-2xl w-full bg-card shadow-sm">
      <div className="py-2.5 bg-accent/60 px-4 text-md font-semibold text-neutral-800 flex items-center justify-between">
        <span className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          Agentic Chat
        </span>
        <span className="text-xs font-normal text-muted-fg">
          FalkorDB graph + verification records
        </span>
      </div>
      <CardContent className="space-y-3 p-4">
        <p className="text-sm text-neutral-700">
          Ask the compliance agent about
          {subjectName ? ` ${subjectName}` : ' this subject'}, shared
          identifiers, transaction typologies, or sanctions exposure. The agent
          grounds every answer in retrieved evidence and cites it.
        </p>
        <div className="flex flex-wrap gap-2">
          {AGENT_SUGGESTIONS.map((suggestion) => (
            <span
              key={suggestion}
              className="px-2.5 py-1 rounded-full border bg-neutral-50 text-xs text-neutral-600"
            >
              {suggestion}
            </span>
          ))}
        </div>
        <Link
          to="/agent"
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-3.5 py-2 text-sm font-medium text-primary-fg hover:opacity-90"
        >
          Open the compliance agent
          <ArrowRight className="h-4 w-4" />
        </Link>
      </CardContent>
    </div>
  )
}
