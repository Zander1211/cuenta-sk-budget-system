import { useMemo, useState } from 'react'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell, PieChart, Pie,
} from 'recharts'
import { Receipt, TrendingUp, TrendingDown, BarChart3 } from 'lucide-react'
import { useBudget } from '../../context/BudgetContext'
import { useAnalysisFilters } from '../../hooks/useAnalysisFilters'
import { useCategoryAnalysis, useAnalysisData } from '../../hooks/useAnalysisData'
import { useAnalysisAI } from '../../hooks/useAnalysisAI'
import { AnalysisLayout, AnalysisFilterBar } from '../../components/analysis/AnalysisLayout'
import { InsightPanel } from '../../components/analysis/InsightPanel'
import {
  MetricCard, ChartCard, EmptyState, DataTable, PercentageChange,
} from '../../components/analysis/AnalysisUI'
import { buildCategoryInsights } from '../../utils/insights'
import {
  formatCurrency, formatPercentage, periodLabel, colorForCategory,
  filterExpenses, expenseDate, parseDate, normalizeAmount,
} from '../../utils/analytics'
import { exportToCsv } from '../../utils/exportCsv'

const BREADCRUMB = [{ label: 'Home', to: '/dashboard' }, { label: 'Analysis', to: '/dashboard/analysis' }, { label: 'Expenses by Category' }]

function Sparkline({ points, color = '#12805C' }) {
  if (!points || points.length < 2 || points.every((p) => p === 0)) {
    return <span style={{ color: '#6B7280', fontSize: 13 }}>—</span>
  }
  const max = Math.max(...points, 1)
  const w = 64, h = 20
  const step = w / (points.length - 1)
  const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(1)},${(h - (p / max) * h).toFixed(1)}`).join(' ')
  return (
    <svg width={w} height={h} aria-hidden="true" style={{ display: 'block' }}>
      <path d={d} fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export default function ExpensesByCategoryPage() {
  const { filters, setFilter } = useAnalysisFilters()
  const { expenses } = useBudget()
  const cat = useCategoryAnalysis(filters)
  const base = useAnalysisData(filters)
  const [mode, setMode] = useState('amount') // amount | percent
  const label = periodLabel(filters)

  // Per-category monthly series (within the selected year) for sparklines.
  const sparklines = useMemo(() => {
    const yearFilters = { view: 'yearly', year: filters.year, month: filters.month }
    const rows = filterExpenses(expenses, yearFilters)
    const map = new Map()
    rows.forEach((e) => {
      const c = (e.category || 'Uncategorized').toString().trim() || 'Uncategorized'
      const d = parseDate(expenseDate(e))
      if (!d) return
      const arr = map.get(c) || new Array(12).fill(0)
      arr[d.getMonth()] += normalizeAmount(e.amount)
      map.set(c, arr)
    })
    return map
  }, [expenses, filters.year, filters.month])

  const chartData = cat.categories.map((c, i) => ({
    name: c.name, value: c.value, percent: c.percent, fill: colorForCategory(c.name, i),
  }))

  const fallback = useMemo(() => buildCategoryInsights(cat), [cat])
  const aiPayload = useMemo(() => ({
    page: 'expenses-by-category',
    period: label,
    totalExpenses: Math.round(cat.total),
    categories: cat.categories.slice(0, 8).map((c) => ({ name: c.name, total: Math.round(c.value), share: Number(c.percent.toFixed(1)), changePct: c.changePct == null ? null : Number(c.changePct.toFixed(1)) })),
    missingReceipts: cat.missingReceipts,
  }), [cat, label])
  const ai = useAnalysisAI(aiPayload, { fallback, enabled: cat.categories.length > 0 })

  const cards = [
    { icon: Receipt, label: 'Total Expenses', value: formatCurrency(cat.total), meta: `${cat.categories.length} categories in ${label}` },
    { icon: TrendingUp, label: 'Highest Category', value: cat.highest ? cat.highest.name : '—', meta: cat.highest ? `${formatCurrency(cat.highest.value)} (${formatPercentage(cat.highest.percent, 0)})` : 'No data', tone: 'warning' },
    { icon: TrendingDown, label: 'Lowest Category', value: cat.lowest && cat.categories.length > 1 ? cat.lowest.name : '—', meta: cat.lowest && cat.categories.length > 1 ? formatCurrency(cat.lowest.value) : 'No data', tone: 'positive' },
    { icon: BarChart3, label: 'Average Category', value: formatCurrency(cat.average), meta: 'Mean spend per category' },
  ]

  const columns = [
    { key: 'rank', header: '#', render: (r) => r.rank },
    { key: 'name', header: 'Category', render: (r) => (
      <span><span className="an-cat-dot" style={{ background: colorForCategory(r.name, r.rank - 1) }} />{r.name}</span>
    ) },
    { key: 'value', header: 'Total', align: 'right', render: (r) => formatCurrency(r.value) },
    { key: 'percent', header: '% of Total', align: 'right', render: (r) => formatPercentage(r.percent, 1) },
    { key: 'changePct', header: 'vs Prev.', align: 'right', render: (r) => <PercentageChange value={r.hasPrev ? r.changePct : null} invertColor /> },
    { key: 'spark', header: 'Trend', align: 'center', render: (r) => <Sparkline points={sparklines.get(r.name)} color={colorForCategory(r.name, r.rank - 1)} /> },
  ]

  const hasData = cat.categories.length > 0

  return (
    <AnalysisLayout
      breadcrumb={BREADCRUMB}
      title="Expenses by Category"
      description="Where approved spending goes, ranked by category, with period-over-period change."
      filterBar={
        <AnalysisFilterBar
          filters={filters} setFilter={setFilter}
          categoryOptions={base.categoryOptions} showCategory
        />
      }
    >
      <section className="an-metric-grid">
        {cards.map((c) => <MetricCard key={c.label} {...c} />)}
      </section>

      {!hasData ? (
        <ChartCard><EmptyState title="No category data available" message={`No approved expenses were recorded for ${label}.`} /></ChartCard>
      ) : (
        <>
          <div className="an-two-col">
            <ChartCard
              eyebrow="Distribution" title="Spending by category"
              action={
                <div className="an-toggle">
                  <button type="button" className={mode === 'amount' ? 'is-active' : ''} onClick={() => setMode('amount')}>Amount</button>
                  <button type="button" className={mode === 'percent' ? 'is-active' : ''} onClick={() => setMode('percent')}>%</button>
                </div>
              }
            >
              <ResponsiveContainer width="100%" height={Math.max(240, chartData.length * 44)}>
                <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 4 }}>
                  <XAxis type="number" tickFormatter={(v) => mode === 'percent' ? `${v}%` : `₱${(v / 1000).toLocaleString()}k`} tick={{ fontSize: 12, fill: '#6B7280' }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 12, fill: '#6B7280' }} axisLine={false} tickLine={false} />
                  <Tooltip formatter={(v, n, p) => mode === 'percent' ? formatPercentage(p.payload.percent, 1) : formatCurrency(p.payload.value)} cursor={{ fill: 'rgba(16,116,99,0.06)' }} />
                  <Bar dataKey={mode === 'percent' ? 'percent' : 'value'} radius={[0, 5, 5, 0]} maxBarSize={26}>
                    {chartData.map((c) => <Cell key={c.name} fill={c.fill} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard eyebrow="Share" title="Category share">
              <div className="an-donut-wrap">
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={chartData} dataKey="value" nameKey="name" innerRadius="60%" outerRadius="88%" paddingAngle={2}>
                      {chartData.map((c) => <Cell key={c.name} fill={c.fill} />)}
                    </Pie>
                    <Tooltip formatter={(v, n, p) => `${formatCurrency(p.payload.value)} (${formatPercentage(p.payload.percent, 1)})`} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="an-donut-center">
                  <span className="val">{formatCurrency(cat.total)}</span>
                  <span className="lbl">{label}</span>
                </div>
              </div>
              <div className="an-legend">
                {chartData.map((c) => (
                  <div className="an-legend-item" key={c.name}>
                    <span className="an-legend-left">
                      <span className="an-legend-dot" style={{ background: c.fill }} />
                      <span className="an-legend-name">{c.name}</span>
                    </span>
                    <span className="an-legend-val">{formatCurrency(c.value)} · {formatPercentage(c.percent, 0)}</span>
                  </div>
                ))}
              </div>
            </ChartCard>
          </div>

          <div className="an-detail-grid">
            <ChartCard eyebrow="Breakdown" title="Category details" description={cat.hasPrev ? undefined : 'No previous-period data — change column shows N/A.'}>
              <DataTable columns={columns} rows={cat.categories.map((c) => ({ ...c, _key: c.name }))} />
            </ChartCard>
            <InsightPanel
              title="AI Category Insights"
              status={ai.status} summary={ai.summary} insights={ai.insights}
              recommendations={ai.recommendations} error={ai.error} onRefresh={ai.refresh} updatedAt={ai.updatedAt}
            />
          </div>
        </>
      )}
    </AnalysisLayout>
  )
}
