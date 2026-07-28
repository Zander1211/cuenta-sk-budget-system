import { useMemo } from 'react'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts'
import { Wallet, Receipt, Scale, Gauge } from 'lucide-react'
import { useAnalysisFilters } from '../../hooks/useAnalysisFilters'
import { useBudgetVsActual } from '../../hooks/useAnalysisData'
import { useAnalysisAI } from '../../hooks/useAnalysisAI'
import { AnalysisLayout, AnalysisFilterBar } from '../../components/analysis/AnalysisLayout'
import { InsightPanel } from '../../components/analysis/InsightPanel'
import {
  MetricCard, ChartCard, StatusBadge, EmptyState, DataTable,
} from '../../components/analysis/AnalysisUI'
import { buildVarianceInsights } from '../../utils/insights'
import { formatCurrency, formatPercentage, CHART_COLORS } from '../../utils/analytics'
import { exportToCsv } from '../../utils/exportCsv'

const BREADCRUMB = [{ label: 'Home', to: '/dashboard' }, { label: 'Analysis', to: '/dashboard/analysis' }, { label: 'Budget vs Actual' }]

function Money({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="an-card" style={{ padding: 12, gap: 6, boxShadow: '0 8px 24px rgba(0,0,0,0.12)' }}>
      <strong style={{ fontSize: 13 }}>{label}</strong>
      {payload.map((p) => (
        <div key={p.name} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, fontSize: 12 }}>
          <span style={{ color: p.color }}>{p.name}</span>
          <strong>{formatCurrency(p.value)}</strong>
        </div>
      ))}
    </div>
  )
}

export default function BudgetVsActualPage() {
  const { filters, setFilter } = useAnalysisFilters()
  // This comparison is most meaningful across the full year's months.
  const yearFilters = useMemo(() => ({ ...filters, view: 'yearly' }), [filters])
  const bva = useBudgetVsActual(yearFilters)

  const chartData = bva.monthly.map((m) => ({
    month: m.key, 'Allocated Budget': m.budget, 'Approved Spending': m.spending,
  }))

  const fallback = useMemo(() => buildVarianceInsights(bva), [bva])
  const aiPayload = useMemo(() => ({
    page: 'budget-vs-actual',
    period: `${filters.year}`,
    note: 'Data model has no separate actual-spend field; spending = approved expenses (allocated budget vs approved spending).',
    totals: { allocatedBudget: bva.totalBudget, approvedSpending: bva.totalSpending, variance: bva.totalVariance },
    monthly: bva.rowsWithData.map((r) => ({ month: r.label, budget: Math.round(r.budget), spending: Math.round(r.spending), status: r.status })),
  }), [bva, filters.year])

  const ai = useAnalysisAI(aiPayload, { fallback, enabled: bva.hasData })

  const perf = bva.performance
  const cards = [
    { icon: Wallet, label: 'Total Budget', value: formatCurrency(bva.totalBudget), meta: `Allocated in ${filters.year}` },
    { icon: Receipt, label: 'Approved Spending', value: formatCurrency(bva.totalSpending), meta: 'Sum of approved expenses' },
    { icon: Scale, label: 'Total Variance', value: formatCurrency(bva.totalVariance), meta: bva.totalVariance < 0 ? 'Over budget' : 'Under budget', tone: bva.totalVariance < 0 ? 'danger' : 'positive' },
    { icon: Gauge, label: 'Budget Performance', value: perf.label, meta: perf.message, tone: perf.tone },
  ]

  const columns = [
    { key: 'label', header: 'Month' },
    { key: 'budget', header: 'Budget', align: 'right', render: (r) => formatCurrency(r.budget) },
    { key: 'spending', header: 'Spending', align: 'right', render: (r) => formatCurrency(r.spending) },
    { key: 'variance', header: 'Variance', align: 'right', render: (r) => <span style={{ color: r.variance < 0 ? '#DC6B4F' : '#237c57', fontWeight: 600 }}>{formatCurrency(r.variance)}</span> },
    { key: 'percentUsed', header: 'Used', align: 'right', render: (r) => formatPercentage(r.percentUsed, 0) },
    { key: 'status', header: 'Status', align: 'center', render: (r) => <StatusBadge status={r.status} /> },
  ]

  const handleExport = () => {
    exportToCsv(`budget-vs-actual-${filters.year}.csv`, [
      { header: 'Month', value: (r) => r.label },
      { header: 'Allocated Budget', value: (r) => r.budget },
      { header: 'Approved Spending', value: (r) => r.spending },
      { header: 'Variance', value: (r) => r.variance },
      { header: 'Percent Used', value: (r) => r.percentUsed.toFixed(1) },
      { header: 'Status', value: (r) => r.status },
    ], bva.rowsWithData)
  }

  return (
    <AnalysisLayout
      breadcrumb={BREADCRUMB}
      title="Budget vs Actual Spending"
      description="Allocated monthly budget compared with approved spending. This system records approved expenses as spending — there is no separate 'actual' amount, so figures are labeled accordingly."
      filterBar={<AnalysisFilterBar filters={filters} setFilter={setFilter} showView={false} onExport={handleExport} exportDisabled={!bva.hasData} />}
    >
      <section className="an-metric-grid">
        {cards.map((c) => <MetricCard key={c.label} {...c} />)}
      </section>

      <div className="an-detail-grid">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <ChartCard eyebrow="Financial Performance" title={`Allocated Budget vs Approved Spending — ${filters.year}`}>
            {bva.hasData ? (
              <ResponsiveContainer width="100%" height={340}>
                <BarChart data={chartData} margin={{ top: 8, right: 16, left: 8, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e8eff0" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#6B7280' }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={(v) => `₱${(v / 1000).toLocaleString()}k`} tick={{ fontSize: 12, fill: '#6B7280' }} axisLine={false} tickLine={false} width={64} />
                  <Tooltip content={<Money />} cursor={{ fill: 'rgba(16,116,99,0.06)' }} />
                  <Legend iconType="circle" iconSize={10} wrapperStyle={{ fontSize: 13, paddingTop: 12 }} />
                  <Bar dataKey="Allocated Budget" fill={CHART_COLORS.budget} radius={[4, 4, 0, 0]} maxBarSize={34} />
                  <Bar dataKey="Approved Spending" fill={CHART_COLORS.actual} radius={[4, 4, 0, 0]} maxBarSize={34} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState title="No budget or spending data" message={`No allocated budget or approved expenses recorded for ${filters.year}.`} />
            )}
          </ChartCard>

          <ChartCard eyebrow="Breakdown" title="Variance table" description="Positive variance means budget remained; negative means overspending.">
            <DataTable columns={columns} rows={bva.rowsWithData.map((r, i) => ({ ...r, _key: r.key || i }))} empty={`No months with data in ${filters.year}.`} />
          </ChartCard>
        </div>

        <InsightPanel
          title="Spending Insights"
          status={ai.status}
          summary={ai.summary}
          insights={ai.insights}
          recommendations={ai.recommendations}
          error={ai.error}
          onRefresh={ai.refresh}
          updatedAt={ai.updatedAt}
        />
      </div>
    </AnalysisLayout>
  )
}
