import { createFileRoute } from '@tanstack/react-router'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts'
import { api, useQuery } from '~/lib/api-client'
import {
  Users,
  CheckCircle2,
  Clock,
  FileCheck2,
  AlertTriangle,
  FileText,
} from 'lucide-react'

export const Route = createFileRoute('/_app/analytics')({
  component: Analytics,
})

const STAT_CONFIG = [
  {
    label: 'Total Sessions',
    key: 'total' as const,
    icon: Users,
    description: 'All-time verifications initiated',
  },
  {
    label: 'Submitted for Review',
    key: 'completed' as const,
    icon: FileCheck2,
    description: 'Awaiting operator decision',
  },
  {
    label: 'Awaiting Subject',
    key: 'pending' as const,
    icon: Clock,
    description: 'In-progress or awaiting upload',
  },
  {
    label: 'Approved',
    key: 'approved' as const,
    icon: CheckCircle2,
    description: 'Manual verification approved',
  },
  {
    label: 'Rejected / Failed',
    key: 'failed' as const,
    icon: AlertTriangle,
    description: 'Failed checks or operator rejected',
  },
  {
    label: 'Documents Vault',
    key: 'documents' as const,
    icon: FileText,
    description: 'Encrypted uploaded files',
  },
]

function Analytics() {
  const data = useQuery(api.analytics.get, {})

  if (!data) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <p className="text-sm text-muted-fg animate-pulse">Loading analytics…</p>
      </div>
    )
  }

  const statusData = [
    { name: 'Approved', value: data.approved, color: '#10b981' },
    { name: 'Submitted / In Review', value: data.completed, color: '#6366f1' },
    { name: 'Awaiting Subject', value: data.pending, color: '#f59e0b' },
    { name: 'Rejected / Failed', value: data.failed, color: '#f43f5e' },
  ].filter((d) => d.value > 0)

  const formattedDaily = (data.daily || []).map((d) => {
    // Format YYYY-MM-DD to short "MMM DD"
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

  return (
    <div className="space-y-8 max-w-7xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-fg">
          Analytics
        </h1>
        <p className="text-sm text-muted-fg mt-1">
          Real-time metrics and verification pipeline performance.
        </p>
      </div>

      {/* Stat cards grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {STAT_CONFIG.map(({ label, key, icon: Icon, description }) => (
          <div
            key={label}
            className="p-5 rounded-xl border border-border/70 bg-card/60 backdrop-blur-xs shadow-2xs transition-all hover:border-border"
          >
            <div className="flex items-center justify-between text-muted-fg">
              <span className="text-xs font-medium tracking-wide uppercase">
                {label}
              </span>
              <Icon className="size-4 opacity-70" />
            </div>
            <div className="mt-3 flex items-baseline justify-between">
              <span className="text-3xl font-semibold tracking-tight text-fg tabular-nums">
                {data[key]}
              </span>
            </div>
            <p className="text-xs text-muted-fg mt-1.5">{description}</p>
          </div>
        ))}
      </div>

      {/* Visualizations grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Daily Sessions Bar Chart */}
        <div className="lg:col-span-8 p-6 rounded-xl border border-border/70 bg-card/60 shadow-2xs">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-base font-semibold text-fg">
                Sessions Volume
              </h2>
              <p className="text-xs text-muted-fg mt-0.5">
                Daily verification sessions created
              </p>
            </div>
            <span className="text-xs text-muted-fg tabular-nums px-2.5 py-1 rounded-md bg-muted/50 border border-border/50">
              {data.total} total sessions
            </span>
          </div>

          {formattedDaily.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-[260px] text-center border border-dashed rounded-lg border-border/60">
              <p className="text-sm font-medium text-fg">
                No activity recorded yet
              </p>
              <p className="text-xs text-muted-fg mt-1 max-w-xs">
                Verification requests will populate this daily timeline
                automatically.
              </p>
            </div>
          ) : (
            <div className="w-full h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={formattedDaily}
                  margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                >
                  <XAxis
                    dataKey="date"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: 'hsl(var(--muted-fg))', fontSize: 11 }}
                    dy={8}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: 'hsl(var(--muted-fg))', fontSize: 11 }}
                    allowDecimals={false}
                  />
                  <Tooltip
                    cursor={{ fill: 'rgba(0, 0, 0, 0.04)' }}
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
                    maxBarSize={44}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Status Distribution Pie Chart */}
        <div className="lg:col-span-4 p-6 rounded-xl border border-border/70 bg-card/60 shadow-2xs flex flex-col">
          <div className="mb-4">
            <h2 className="text-base font-semibold text-fg">
              Status Distribution
            </h2>
            <p className="text-xs text-muted-fg mt-0.5">
              Decision & progress breakdown
            </p>
          </div>

          {statusData.length === 0 ? (
            <div className="flex flex-col items-center justify-center flex-1 min-h-[220px] text-center border border-dashed rounded-lg border-border/60">
              <p className="text-sm font-medium text-fg">No status data</p>
              <p className="text-xs text-muted-fg mt-1">
                Sessions will show breakdown here.
              </p>
            </div>
          ) : (
            <div className="flex-1 flex flex-col justify-between">
              <div className="w-full h-[180px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={statusData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={75}
                      paddingAngle={3}
                    >
                      {statusData.map((entry) => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'hsl(var(--card))',
                        borderColor: 'hsl(var(--border))',
                        borderRadius: '8px',
                        fontSize: '12px',
                        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* Minimal legend list */}
              <div className="space-y-2 mt-4 pt-4 border-t border-border/60">
                {statusData.map((item) => (
                  <div
                    key={item.name}
                    className="flex items-center justify-between text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="size-2 rounded-full"
                        style={{ backgroundColor: item.color }}
                      />
                      <span className="text-muted-fg">{item.name}</span>
                    </div>
                    <span className="font-semibold tabular-nums text-fg">
                      {item.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
