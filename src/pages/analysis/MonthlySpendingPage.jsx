import { useMemo, useState } from 'react'
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine,
} from 'recharts'
import { CalendarDays, Sigma, TrendingUp, Activity } from 'lucide-react'
import { useAnalysisFilters } from '../../hooks/useAnalysisFilters'
import { useMonthlyTrend } from '../../hooks/useAnalysisData'
import { useAnalysisAI } from '../../hooks/useAnalysisAI'
import { AnalysisLayout, AnalysisFilterBar } from '../../components/analysis/AnalysisLayout'
import { InsightPanel } from '../../components/analysis/InsightPanel'
import {
  MetricCard, ChartCard, EmptyState, DataTable, PercentageChange, TrendIndicator,
} from '../../components/analysis/AnalysisUI'
import { buildTrendInsights } from '../../utils/insights'
import { formatCurrency, safeDivide } from '../../utils/analytics'
import { exportToCsv } from '../../utils/exportCsv'

const BREADCRUMB = [{ label: 'Home', to: '/dashboard' }, { label: 'Analysis', to: '/dashboard/analysis' }, { label: 'Monthly Spending' }]

function TrendTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="an-card" style={{ padding: 12, gap: 6, boxShadow: '0 8px 24px rgba(0,0,0,0.12)' }}>
      <strong style={{ fontSize: 13 }}>{label}</strong>
      {payload.filter((p) => p.value != null).map((p) => (
        <div key={p.name} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, fontSize: 12 }}>
          <span style={{ color: p.color }}>{p.name}</span>
          <strong>{formatCurrency(p.value)}</strong>
        </div>
      ))}
    </div>
  )
}

export default function MonthlySpendingPage() {
  const { filters, setFilter } = useAnalysisFilters()
  const trend = useMonthlyTrend(filters)
  const [showPrevYear, setShowPrevYear] = useState(false)

  const hasPrevYear = trend.rows.some((r) => r.prevYear > 0)
  const chartData = trend.rows.map((r) => ({
    month: r.month,
    Spending: r.total,
    ...(showPrevYear && hasPrevYear ? { 'Previous Year': r.prevYear } : {}),
  }))

  const tableRows = useMemo(() => {
    return trend.rows.map((r, i) => {
      const prev = i > 0 ? trend.rows[i - 1].total : null
      const changePrev = prev != null && prev > 0 ? safeDivide(r.total - prev, prev) * 100 : (prev === 0 && r.total > 0 ? null : (i === 0 ? null : 0))
      const changeAvg = trend.average > 0 ? safeDivide(r.total - trend.average, trend.average) * 100 : null
      return { ...r, _key: r.month, changePrev, changeAvg }
    }).filter((r) => r.total > 0 || r.count > 0)
  }, [trend])

  const fallback = useMemo(() => buildTrendInsights(trend), [trend])
  const aiPayload = useMemo(() => ({
    page: 'monthly-spending-trend',
    year: filters.year,
    trendDirection: trend.trend.direction,
    changePct: Number(trend.trend.changePct.toFixed(1)),
    averageMonthly: Math.round(trend.average),
    months: trend.activeRows.map((r) => ({ month: r.monthFull, total: Math.round(r.total), missingReceipts: r.missing })),
  }), [trend, filters.year])
  const ai = useAnalysisAI(aiPayload, { fallback, enabled: trend.hasData })

  const cards = [
    { icon: CalendarDays, label: 'Current Month Spend', value: formatCurrency(trend.currentMonth?.total || 0), meta: trend.currentMonth?.monthFull || '—' },
    { icon: Sigma, label: 'Average Monthly Spend', value: formatCurrency(trend.average), meta: 'Across active months' },
    { icon: TrendingUp, label: 'Highest Month', value: trend.highestMonth?.total ? trend.highestMonth.monthFull : '—', meta: trend.highestMonth?.total ? formatCurrency(trend.highestMonth.total) : 'No data', tone: 'warning' },
    { icon: Activity, label: 'Trend Direction', value: <TrendIndicator direction={trend.trend.direction} />, meta: `${trend.trend.changePct >= 0 ? '+' : ''}${trend.trend.changePct.toFixed(1)}% recent vs earlier` },
  ]

  const columns = [
    { key: 'monthFull', header: 'Month' },
    { key: 'total', header: 'Total Spend', align: 'right', render: (r) => formatCurrency(r.total) },
    { key: 'changePrev', header: 'vs Prev. Month', align: 'right', render: (r) => <PercentageChange value={r.changePrev} invertColor /> },
    { key: 'changeAvg', header: 'vs Average', align: 'right', render: (r) => <PercentageChange value={r.changeAvg} invertColor /> },
    { key: 'count', header: 'Approved', align: 'center', render: (r) => r.count },
    { key: 'missing', header: 'Missing Receipts', align: 'center', render: (r) => r.missing > 0 ? <span style={{ color: '#DC6B4F', fontWeight: 600 }}>{r.missing}</span> : r.missing },
  ]

  const handleExport = () => {
    exportToCsv(`monthly-spending-${filters.year}.csv`, [
      { header: 'Month', value: (r) => r.monthFull },
      { header: 'Total Spend', value: (r) => r.total },
      { header: 'Approved Expenses', value: (r) => r.count },
      { header: 'Missing Receipts', value: (r) => r.missing },
    ], tableRows)
  }

  return (
    <AnalysisLayout
      breadcrumb={BREADCRUMB}
      title="Monthly Spending Trend"
      description="How approved spending moves month to month across the selected year, against the 12-month average."
      filterBar={<AnalysisFilterBar filters={filters} setFilter={setFilter} showView={false} onExport={handleExport} exportDisabled={!trend.hasData} />}
    >
      <section className="an-metric-grid">
        {cards.map((c) => <MetricCard key={c.label} {...c} />)}
      </section>

      {!trend.hasData ? (
        <ChartCard><EmptyState title="No spending recorded" message={`No approved expenses found for ${filters.year}.`} /></ChartCard>
      ) : (
        <div className="an-detail-grid">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <ChartCard
              eyebrow="Trend" title={`Monthly spending — ${filters.year}`}
              action={hasPrevYear ? (
                <button type="button" className={`an-btn ${showPrevYear ? 'an-btn-primary' : 'an-btn-outline'}`} onClick={() => setShowPrevYear((v) => !v)}>
                  Compare {filters.year - 1}
                </button>
              ) : null}
            >
              <ResponsiveContainer width="100%" height={340}>
                <LineChart data={chartData} margin={{ top: 8, right: 16, left: 8, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e8eff0" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#6B7280' }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={(v) => `₱${(v / 1000).toLocaleString()}k`} tick={{ fontSize: 12, fill: '#6B7280' }} axisLine={false} tickLine={false} width={64} />
                  <Tooltip content={<TrendTooltip />} />
                  <Legend iconType="circle" iconSize={10} wrapperStyle={{ fontSize: 13, paddingTop: 12 }} />
                  {trend.average > 0 ? (
                    <ReferenceLine y={trend.average} stroke="#78cbb0" strokeDasharray="5 4" label={{ value: '12-mo avg', position: 'right', fontSize: 12, fill: '#6B7280' }} />
                  ) : null}
                  <Line type="monotone" dataKey="Spending" stroke="#0E9F6E" strokeWidth={2.5} dot={{ r: 4, fill: '#ffffff', stroke: '#0E9F6E', strokeWidth: 2 }} activeDot={{ r: 6, stroke: '#fff', strokeWidth: 2, fill: '#0E9F6E' }} />
                  {showPrevYear && hasPrevYear ? (
                    <Line type="monotone" dataKey="Previous Year" stroke="#9db1bc" strokeWidth={2} strokeDasharray="5 4" dot={false} />
                  ) : null}
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard eyebrow="Breakdown" title="Monthly breakdown">
              <DataTable columns={columns} rows={tableRows} empty={`No months with spending in ${filters.year}.`} />
            </ChartCard>
          </div>

          <InsightPanel
            title="AI Trend Insights"
            status={ai.status} summary={ai.summary} insights={ai.insights}
            recommendations={ai.recommendations} error={ai.error} onRefresh={ai.refresh} updatedAt={ai.updatedAt}
          />
        </div>
      )}
    </AnalysisLayout>
  )
}
