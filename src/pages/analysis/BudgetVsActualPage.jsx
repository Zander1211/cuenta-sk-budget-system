import { useMemo, useRef, useState } from 'react'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts'
import { Wallet, Receipt, Scale, Gauge, FileDown } from 'lucide-react'
import { useAnalysisFilters } from '../../hooks/useAnalysisFilters'
import { useBudgetVsActual } from '../../hooks/useAnalysisData'
import { useAnalysisAI } from '../../hooks/useAnalysisAI'
import { AnalysisLayout, AnalysisFilterBar } from '../../components/analysis/AnalysisLayout'
import { InsightPanel } from '../../components/analysis/InsightPanel'
import {
  MetricCard, ChartCard, StatusBadge, EmptyState, DataTable,
} from '../../components/analysis/AnalysisUI'
import { buildVarianceInsights } from '../../utils/insights'
import { formatCurrency, formatPercentage, CHART_COLORS, CHART_INK, pesoTick } from '../../utils/analytics'

import { exportToCsv } from '../../utils/exportCsv'
import { exportBudgetVsActualPdf } from '../../utils/exportPdf'

const BREADCRUMB = [{ label: 'Home', to: '/dashboard' }, { label: 'Analysis', to: '/dashboard/analysis' }, { label: 'Budget vs Actual' }]

function Money({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="an-card" style={{ padding: 12, gap: 6, boxShadow: 'var(--shadow-lift)' }}>
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
  const chartRef = useRef(null)
  const [exporting, setExporting] = useState(false)

  // This comparison is most meaningful across the full year's months.
  const yearFilters = useMemo(() => ({ ...filters, view: 'yearly' }), [filters])
  const bva = useBudgetVsActual(yearFilters)

  async function handleExportPdf() {
    if (exporting || !bva.hasData) return
    setExporting(true)
    try {
      await exportBudgetVsActualPdf({ chartRef: chartRef.current, bva, filters })
    } catch (err) {
      console.error('PDF export failed:', err)
    } finally {
      setExporting(false)
    }
  }

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
    { key: 'variance', header: 'Variance', align: 'right', render: (r) => <span style={{ color: r.variance < 0 ? 'var(--negative)' : 'var(--positive)', fontWeight: 600 }}>{formatCurrency(r.variance)}</span> },
    { key: 'percentUsed', header: 'Used', align: 'right', render: (r) => formatPercentage(r.percentUsed, 0) },
    { key: 'status', header: 'Status', align: 'center', render: (r) => <StatusBadge status={r.status} /> },
  ]

  return (
    <AnalysisLayout
      breadcrumb={BREADCRUMB}
      title="Budget vs Actual Spending"
      description="Allocated monthly budget compared with approved spending. This system records approved expenses as spending — there is no separate 'actual' amount, so figures are labeled accordingly."
      filterBar={<AnalysisFilterBar filters={filters} setFilter={setFilter} showView={false} />}
    >
      <section className="an-metric-grid">
        {cards.map((c) => <MetricCard key={c.label} {...c} />)}
      </section>

      <div className="an-detail-grid">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <ChartCard eyebrow="Financial Performance" title={`Allocated Budget vs Approved Spending — ${filters.year}`}
            action={bva.hasData ? (
              <button type="button" className={`an-btn an-btn-outline`} onClick={handleExportPdf} disabled={exporting} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                <FileDown size={15} />
                {exporting ? 'Exporting…' : 'Export PDF'}
              </button>
            ) : null}
          >
            {bva.hasData ? (
              <div ref={chartRef}>
              <ResponsiveContainer width="100%" height={340}>
                <BarChart data={chartData} margin={{ top: 8, right: 16, left: 8, bottom: 4 }}>
                  <CartesianGrid vertical={false} stroke={CHART_INK.grid} />
                  <XAxis dataKey="month" tick={{ fontSize: 12, fill: CHART_INK.tick }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={pesoTick} tick={{ fontSize: 12, fill: CHART_INK.tick }} axisLine={false} tickLine={false} width={64} />
                  <Tooltip content={<Money />} cursor={{ fill: CHART_INK.cursor }} />
                  <Legend iconType="circle" iconSize={10} wrapperStyle={{ fontSize: 13, paddingTop: 12 }} />
                  <Bar dataKey="Allocated Budget" fill={CHART_COLORS.budget} radius={[4, 4, 0, 0]} maxBarSize={34} />
                  <Bar dataKey="Approved Spending" fill={CHART_COLORS.actual} radius={[4, 4, 0, 0]} maxBarSize={34} />
                </BarChart>
              </ResponsiveContainer>
              </div>
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
