import { useMemo } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
} from 'recharts'
import { BarChart3 } from 'lucide-react'
import type { RiskFactorItem } from './types'

interface RiskBreakdownChartProps {
  factors: RiskFactorItem[]
}

export function RiskBreakdownChart({ factors }: RiskBreakdownChartProps) {
  const chartData = useMemo(() => {
    return factors.map((f) => ({
      name: f.category,
      score: f.score,
      severity: f.severity,
      description: f.description,
    }))
  }, [factors])

  const getBarColor = (score: number) => {
    if (score >= 80) return '#f43f5e' // rose-500
    if (score >= 60) return '#f97316' // orange-500
    if (score >= 40) return '#f59e0b' // amber-500
    if (score >= 20) return '#3b82f6' // blue-500
    return '#10b981' // emerald-500
  }

  return (
    <div className="rounded-2xl border border-border/80 bg-card/80 backdrop-blur-md p-4 sm:p-5 text-xs shadow-xs">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="size-6 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
            <BarChart3 className="size-3.5" />
          </div>
          <div>
            <span className="font-semibold text-fg block text-xs">
              Typology Threat Vector Breakdown
            </span>
            <span className="text-[10px] text-muted-fg">
              Multi-dimensional scoring across FalkorDB Graph & KYC attributes
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 text-[10px] font-medium text-muted-fg">
          <span className="inline-flex items-center gap-1">
            <span className="size-2 rounded-full bg-rose-500" />
            Critical (&ge;80)
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="size-2 rounded-full bg-orange-500" />
            High (&ge;60)
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="size-2 rounded-full bg-emerald-500" />
            Normal
          </span>
        </div>
      </div>

      {/* Chart Canvas */}
      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ top: 5, right: 30, left: 10, bottom: 5 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              horizontal={false}
              stroke="var(--border)"
              opacity={0.4}
            />
            <XAxis
              type="number"
              domain={[0, 100]}
              tick={{ fill: 'var(--muted-fg)', fontSize: 10 }}
              axisLine={{ stroke: 'var(--border)' }}
            />
            <YAxis
              type="category"
              dataKey="name"
              width={160}
              tick={{ fill: 'var(--fg)', fontSize: 11, fontWeight: 500 }}
              axisLine={{ stroke: 'var(--border)' }}
            />
            <ReferenceLine
              x={70}
              stroke="#f43f5e"
              strokeDasharray="4 4"
              label={{
                value: 'Regulatory Escalation (70)',
                fill: '#f43f5e',
                fontSize: 9,
                position: 'insideTopRight',
              }}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const data = payload[0].payload
                  return (
                    <div className="p-2.5 rounded-xl bg-card border border-border shadow-lg text-xs space-y-1">
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-semibold text-fg">{data.name}</span>
                        <span
                          className="font-mono font-bold text-xs"
                          style={{ color: getBarColor(data.score) }}
                        >
                          {data.score} / 100
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-fg leading-snug">
                        {data.description}
                      </p>
                    </div>
                  )
                }
                return null
              }}
            />
            <Bar dataKey="score" radius={[0, 6, 6, 0]} barSize={16}>
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={getBarColor(entry.score)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
