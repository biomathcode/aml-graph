import { createFileRoute, Link } from '@tanstack/react-router'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { api, useQuery } from '~/lib/api-client'
import {
  Users,
  CheckCircle2,
  Clock,
  FileText,
  Plus,
  ArrowRight,
  ShieldCheck,
  Workflow as WorkflowIcon,
  Search,
  ExternalLink,
} from 'lucide-react'

export const Route = createFileRoute('/_app/dashboard')({
  component: DashboardPage,
})

function StatusPill({ status }: { status?: string }) {
  const s = status || 'initiated'
  const styles: Record<string, { bg: string; dot: string; label: string }> = {
    completed: {
      bg: 'bg-indigo-50/80 text-indigo-700 border-indigo-200/60 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800/60',
      dot: 'bg-indigo-500',
      label: 'Submitted',
    },
    approved: {
      bg: 'bg-emerald-50/80 text-emerald-700 border-emerald-200/60 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/60',
      dot: 'bg-emerald-500',
      label: 'Approved',
    },
    in_progress: {
      bg: 'bg-blue-50/80 text-blue-700 border-blue-200/60 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800/60',
      dot: 'bg-blue-500 animate-pulse',
      label: 'In Progress',
    },
    initiated: {
      bg: 'bg-neutral-100 text-neutral-600 border-neutral-200/80 dark:bg-neutral-800 dark:text-neutral-300 dark:border-neutral-700',
      dot: 'bg-neutral-400',
      label: 'Initiated',
    },
    rejected: {
      bg: 'bg-rose-50/80 text-rose-700 border-rose-200/60 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800/60',
      dot: 'bg-rose-500',
      label: 'Rejected',
    },
    failed: {
      bg: 'bg-red-50/80 text-red-700 border-red-200/60 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800/60',
      dot: 'bg-red-500',
      label: 'Failed',
    },
    expired: {
      bg: 'bg-amber-50/80 text-amber-700 border-amber-200/60 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/60',
      dot: 'bg-amber-500',
      label: 'Expired',
    },
  }
  const current = styles[s] || {
    bg: 'bg-neutral-100 text-neutral-600 border-neutral-200 dark:bg-neutral-800 dark:text-neutral-300 dark:border-neutral-700',
    dot: 'bg-neutral-400',
    label: s,
  }
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium border ${current.bg}`}
    >
      <span className={`size-1.5 rounded-full ${current.dot}`} />
      {current.label}
    </span>
  )
}

function DashboardPage() {
  const analytics = useQuery(api.analytics.get, {})
  const sessions = useQuery(api.sessions.getSessions, {})
  const workflows = useQuery(api.functions.workflows.getWorkflows, {})

  const recentSessions = (sessions || []).slice(0, 5)

  const dailyVolume = (analytics?.daily || []).map((d) => {
    const parts = d.date.split('-')
    const dateObj = new Date(
      Number(parts[0]),
      Number(parts[1]) - 1,
      Number(parts[2]),
    )
    const shortLabel = isNaN(dateObj.getTime())
      ? d.date
      : dateObj.toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
        })
    return {
      date: shortLabel,
      fullDate: d.date,
      count: d.count,
    }
  })

  const total = analytics?.total || 0
  const completed = analytics?.completed || 0
  const pending = analytics?.pending || 0
  const approved = analytics?.approved || 0
  const failed = analytics?.failed || 0
  const documents = analytics?.documents || 0

  const approvalRate = total > 0 ? Math.round((approved / total) * 100) : 0

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-border/50">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-fg">
            Dashboard
          </h1>
          <p className="text-sm text-muted-fg mt-0.5">
            Identity verification pipeline, incoming submissions, and review
            activity.
          </p>
        </div>

        {/* Minimal Action Bar */}
        <div className="flex items-center gap-2.5">
          <Link
            to="/verifications"
            className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-border/70 bg-card hover:bg-muted/50 text-fg transition-colors shadow-2xs"
          >
            <Plus className="size-3.5 text-muted-fg" />
            New Session
          </Link>
          <Link
            to="/workflow"
            className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-border/70 bg-card hover:bg-muted/50 text-fg transition-colors shadow-2xs"
          >
            <WorkflowIcon className="size-3.5 text-muted-fg" />
            Workflows
          </Link>
        </div>
      </div>

      {/* Key Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Sessions */}
        <div className="p-5 rounded-xl border border-border/60 bg-card/60 backdrop-blur-xs shadow-2xs transition-all hover:border-border">
          <div className="flex items-center justify-between text-muted-fg">
            <span className="text-xs font-medium uppercase tracking-wider">
              Total Sessions
            </span>
            <Users className="size-4 opacity-60" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-semibold tracking-tight text-fg tabular-nums">
              {total}
            </span>
          </div>
          <p className="text-xs text-muted-fg mt-1">Initiated verification requests</p>
        </div>

        {/* Ready for Review */}
        <div className="p-5 rounded-xl border border-border/60 bg-card/60 backdrop-blur-xs shadow-2xs transition-all hover:border-border">
          <div className="flex items-center justify-between text-muted-fg">
            <span className="text-xs font-medium uppercase tracking-wider">
              Ready for Review
            </span>
            <Clock className="size-4 text-indigo-500 opacity-80" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-semibold tracking-tight text-fg tabular-nums">
              {completed}
            </span>
            {completed > 0 && (
              <span className="text-[11px] font-medium px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300">
                Action needed
              </span>
            )}
          </div>
          <p className="text-xs text-muted-fg mt-1">Documents uploaded by subjects</p>
        </div>

        {/* Approved */}
        <div className="p-5 rounded-xl border border-border/60 bg-card/60 backdrop-blur-xs shadow-2xs transition-all hover:border-border">
          <div className="flex items-center justify-between text-muted-fg">
            <span className="text-xs font-medium uppercase tracking-wider">
              Approved
            </span>
            <CheckCircle2 className="size-4 text-emerald-500 opacity-80" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-semibold tracking-tight text-fg tabular-nums">
              {approved}
            </span>
            {total > 0 && (
              <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                {approvalRate}% rate
              </span>
            )}
          </div>
          <p className="text-xs text-muted-fg mt-1">Successfully verified identities</p>
        </div>

        {/* Documents Vault */}
        <div className="p-5 rounded-xl border border-border/60 bg-card/60 backdrop-blur-xs shadow-2xs transition-all hover:border-border">
          <div className="flex items-center justify-between text-muted-fg">
            <span className="text-xs font-medium uppercase tracking-wider">
              Documents Collected
            </span>
            <FileText className="size-4 opacity-60" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-semibold tracking-tight text-fg tabular-nums">
              {documents}
            </span>
          </div>
          <p className="text-xs text-muted-fg mt-1">Passports, IDs, and proofs stored</p>
        </div>
      </div>

      {/* Pipeline Analytics & Decisions */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Verification Volume (Bar Chart) */}
        <div className="lg:col-span-8 p-6 rounded-xl border border-border/60 bg-card/60 shadow-2xs">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-sm font-semibold text-fg uppercase tracking-wider">
                Verification Volume
              </h2>
              <p className="text-xs text-muted-fg mt-0.5">
                Daily sessions initiated across active workflows
              </p>
            </div>
            <Link
              to="/analytics"
              className="text-xs font-medium text-primary hover:underline inline-flex items-center gap-1"
            >
              Detailed Analytics
              <ArrowRight className="size-3" />
            </Link>
          </div>

          {dailyVolume.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-[200px] border border-dashed rounded-lg border-border/60 text-center p-4">
              <p className="text-sm font-medium text-fg">No verification sessions yet</p>
              <p className="text-xs text-muted-fg mt-1 max-w-sm">
                Create a workflow and share collection links to start monitoring volume trends.
              </p>
            </div>
          ) : (
            <div className="w-full h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={dailyVolume}
                  margin={{ top: 10, right: 10, left: -24, bottom: 0 }}
                >
                  <XAxis
                    dataKey="date"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: 'hsl(var(--muted-fg))', fontSize: 11 }}
                    dy={6}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: 'hsl(var(--muted-fg))', fontSize: 11 }}
                    allowDecimals={false}
                  />
                  <Tooltip
                    cursor={{ fill: 'rgba(0, 0, 0, 0.03)' }}
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      borderColor: 'hsl(var(--border))',
                      borderRadius: '8px',
                      fontSize: '12px',
                      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
                    }}
                    labelStyle={{ color: 'hsl(var(--fg))', fontWeight: 600 }}
                  />
                  <Bar
                    dataKey="count"
                    name="Sessions"
                    fill="#6366f1"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={40}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Pipeline Decision Status */}
        <div className="lg:col-span-4 p-6 rounded-xl border border-border/60 bg-card/60 shadow-2xs flex flex-col justify-between">
          <div>
            <h2 className="text-sm font-semibold text-fg uppercase tracking-wider">
              Status Breakdown
            </h2>
            <p className="text-xs text-muted-fg mt-0.5">
              Current state of all verification sessions
            </p>
          </div>

          <div className="space-y-4 my-4">
            {/* Approved */}
            <div>
              <div className="flex justify-between text-xs mb-1.5">
                <span className="flex items-center gap-1.5 font-medium text-fg">
                  <span className="size-2 rounded-full bg-emerald-500" />
                  Approved
                </span>
                <span className="text-muted-fg tabular-nums font-medium">
                  {approved} ({total > 0 ? Math.round((approved / total) * 100) : 0}%)
                </span>
              </div>
              <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all"
                  style={{ width: `${total > 0 ? (approved / total) * 100 : 0}%` }}
                />
              </div>
            </div>

            {/* In Review */}
            <div>
              <div className="flex justify-between text-xs mb-1.5">
                <span className="flex items-center gap-1.5 font-medium text-fg">
                  <span className="size-2 rounded-full bg-indigo-500" />
                  Submitted / In Review
                </span>
                <span className="text-muted-fg tabular-nums font-medium">
                  {completed} ({total > 0 ? Math.round((completed / total) * 100) : 0}%)
                </span>
              </div>
              <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-indigo-500 rounded-full transition-all"
                  style={{ width: `${total > 0 ? (completed / total) * 100 : 0}%` }}
                />
              </div>
            </div>

            {/* Awaiting Subject */}
            <div>
              <div className="flex justify-between text-xs mb-1.5">
                <span className="flex items-center gap-1.5 font-medium text-fg">
                  <span className="size-2 rounded-full bg-amber-500" />
                  Awaiting Subject
                </span>
                <span className="text-muted-fg tabular-nums font-medium">
                  {pending} ({total > 0 ? Math.round((pending / total) * 100) : 0}%)
                </span>
              </div>
              <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-amber-500 rounded-full transition-all"
                  style={{ width: `${total > 0 ? (pending / total) * 100 : 0}%` }}
                />
              </div>
            </div>

            {/* Rejected / Failed */}
            <div>
              <div className="flex justify-between text-xs mb-1.5">
                <span className="flex items-center gap-1.5 font-medium text-fg">
                  <span className="size-2 rounded-full bg-rose-500" />
                  Rejected / Failed
                </span>
                <span className="text-muted-fg tabular-nums font-medium">
                  {failed} ({total > 0 ? Math.round((failed / total) * 100) : 0}%)
                </span>
              </div>
              <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-rose-500 rounded-full transition-all"
                  style={{ width: `${total > 0 ? (failed / total) * 100 : 0}%` }}
                />
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-border/50 flex items-center justify-between text-xs text-muted-fg">
            <span>Active workflows:</span>
            <span className="font-semibold text-fg tabular-nums">
              {(workflows || []).filter((w) => w.status === 'active').length}
            </span>
          </div>
        </div>
      </div>

      {/* Recent Verifications Feed */}
      <div className="p-6 rounded-xl border border-border/60 bg-card/60 shadow-2xs">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-base font-semibold text-fg">Recent Verifications</h2>
            <p className="text-xs text-muted-fg mt-0.5">
              Latest subject document submissions and live sessions
            </p>
          </div>
          <Link
            to="/verifications"
            className="text-xs font-medium text-primary hover:underline inline-flex items-center gap-1"
          >
            View all sessions
            <ArrowRight className="size-3" />
          </Link>
        </div>

        {recentSessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center border border-dashed rounded-lg border-border/60">
            <ShieldCheck className="size-8 text-muted-fg/60 mb-2" />
            <p className="text-sm font-medium text-fg">No verification sessions yet</p>
            <p className="text-xs text-muted-fg mt-1 max-w-sm">
              Generate a session link in the Verifications tab to start collecting and reviewing documents.
            </p>
            <Link
              to="/verifications"
              className="mt-4 text-xs font-medium px-3 py-1.5 rounded-lg border border-border/70 bg-primary text-primary-fg hover:opacity-90 transition-opacity"
            >
              Go to Verifications
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-border/60 text-muted-fg">
                  <th className="pb-3 font-medium">Subject / ID</th>
                  <th className="pb-3 font-medium">Status</th>
                  <th className="pb-3 font-medium">Step</th>
                  <th className="pb-3 font-medium">Created</th>
                  <th className="pb-3 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {recentSessions.map((session) => {
                  const subjectName = [session.first_name, session.last_name]
                    .filter(Boolean)
                    .join(' ')
                  const displayName =
                    subjectName || session.email || session.username || 'Anonymous'

                  const dateFormatted = new Date(session.createdAt).toLocaleDateString(
                    undefined,
                    {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    },
                  )

                  return (
                    <tr
                      key={session._id}
                      className="hover:bg-muted/30 transition-colors group"
                    >
                      <td className="py-3">
                        <div className="flex flex-col">
                          <span className="font-medium text-fg">{displayName}</span>
                          <span className="font-mono text-[11px] text-muted-fg">
                            {session._id.slice(0, 13)}…
                          </span>
                        </div>
                      </td>
                      <td className="py-3">
                        <StatusPill status={session.status} />
                      </td>
                      <td className="py-3">
                        <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-muted/60 text-muted-fg capitalize">
                          {session.step || 'start'}
                        </span>
                      </td>
                      <td className="py-3 text-muted-fg tabular-nums">
                        {dateFormatted}
                      </td>
                      <td className="py-3 text-right">
                        <Link
                          to="/verifications/$id"
                          params={{ id: session._id }}
                          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline px-2 py-1 rounded hover:bg-primary/10 transition-colors"
                        >
                          Review
                          <ArrowRight className="size-3" />
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Quick Shortcuts */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
        <Link
          to="/workflow"
          className="p-4 rounded-xl border border-border/60 bg-card/40 hover:bg-card hover:border-border transition-all flex items-start gap-3 shadow-2xs group"
        >
          <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400">
            <WorkflowIcon className="size-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-fg">Workflows</span>
              <ExternalLink className="size-3 text-muted-fg opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
            <p className="text-[11px] text-muted-fg mt-0.5 line-clamp-1">
              Configure verification steps and required IDs.
            </p>
          </div>
        </Link>

        <Link
          to="/documents"
          className="p-4 rounded-xl border border-border/60 bg-card/40 hover:bg-card hover:border-border transition-all flex items-start gap-3 shadow-2xs group"
        >
          <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400">
            <FileText className="size-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-fg">Document Vault</span>
              <ExternalLink className="size-3 text-muted-fg opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
            <p className="text-[11px] text-muted-fg mt-0.5 line-clamp-1">
              Search and download submitted private files.
            </p>
          </div>
        </Link>

        <Link
          to="/aml"
          className="p-4 rounded-xl border border-border/60 bg-card/40 hover:bg-card hover:border-border transition-all flex items-start gap-3 shadow-2xs group"
        >
          <div className="p-2 rounded-lg bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400">
            <Search className="size-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-fg">AML Screening</span>
              <ExternalLink className="size-3 text-muted-fg opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
            <p className="text-[11px] text-muted-fg mt-0.5 line-clamp-1">
              Investigate entities with Knowledge Graph risk reports.
            </p>
          </div>
        </Link>
      </div>
    </div>
  )
}
