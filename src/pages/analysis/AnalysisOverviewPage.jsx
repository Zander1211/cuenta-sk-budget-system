import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, Tooltip,
} from 'recharts'
import { Wallet, Receipt, PiggyBank, Gauge, Activity, ArrowRight } from 'lucide-react'
import { useAnalysisFilters } from '../../hooks/useAnalysisFilters'
import {
  useFinancialSummary, useCategoryAnalysis, useMonthlyTrend, useBudgetVsActual,
} from '../../hooks/useAnalysisData'
import { useAnalysisAI } from '../../hooks/useAnalysisAI'
import { AnalysisLayout, AnalysisFilterBar } from '../../components/analysis/AnalysisLayout'
import { InsightPanel } from '../../components/analysis/InsightPanel'
import AnalysisInsightHeader from '../../components/analysis/AnalysisInsightHeader'
import { MetricCard, EmptyState, ChartCard } from '../../components/analysis/AnalysisUI'
import { buildOverviewInsights } from '../../utils/insights'
import {
  formatCurrency, formatPercentage, periodLabel, colorForCategory, CHART_COLORS,
} from '../../utils/analytics'

const BREADCRUMB = [{ label: 'Home', to: '/dashboard' }, { label: 'Analysis' }]

export default function AnalysisOverviewPage() {
  const navigate = useNavigate()
  const { filters, setFilter } = useAnalysisFilters()

  const summary = useFinancialSummary(filters)
  const category = useCategoryAnalysis(filters)
  const trend = useMonthlyTrend(filters)
  // The budget-vs-actual preview mirrors its detail page: recent months across the year.
  const yearFilters = useMemo(() => ({ ...filters, view: 'yearly' }), [filters])
  const bva = useBudgetVsActual(yearFilters)

  const label = periodLabel(filters)
  const hasData = summary.hasAnyData

  const fallbackInsights = useMemo(
    () => buildOverviewInsights({ ...summary, highestCategory: category.highest }),
    [summary, category.highest]
  )

  const aiPayload = useMemo(
    () => ({
      page: 'financial-overview',
      period: label,
      metrics: {
        totalBudget: summary.totalBudget,
        totalExpenses: summary.totalExpenses,
        remainingBalance: summary.remainingBalance,
        utilizationRate: Number(summary.utilizationRate.toFixed(1)),
        performance: summary.performance.label,
        missingReceipts: summary.missingReceipts,
        pendingApprovals: summary.pendingRequests.length,
        spendingTrend: trend.trend.direction,
      },
      topCategories: category.categories.slice(0, 5).map((c) => ({ name: c.name, total: Math.round(c.value) })),
    }),
    [summary, category.categories, trend.trend.direction, label]
  )

  const ai = useAnalysisAI(aiPayload, { fallback: fallbackInsights, enabled: hasData })

  const metricCards = [
    { icon: Wallet, label: 'Total Budget', value: formatCurrency(summary.totalBudget), meta: `Allocated for ${label}`, tone: 'neutral' },
    { icon: Receipt, label: 'Total Expenses', value: formatCurrency(summary.totalExpenses), meta: 'Approved spending', chip: summary.hasBudgetData ? `${formatPercentage(summary.utilizationRate, 0)} used` : null, tone: summary.utilizationRate > 80 ? 'warning' : 'positive' },
    { icon: PiggyBank, label: 'Remaining Balance', value: formatCurrency(summary.remainingBalance), meta: summary.remainingBalance < 0 ? 'Over budget' : 'Available to spend', tone: summary.remainingBalance < 0 ? 'danger' : 'positive' },
    { icon: Gauge, label: 'Budget Utilization', value: formatPercentage(summary.utilizationRate, 1), meta: 'Expenses ÷ budget', tone: summary.utilizationRate > 95 ? 'danger' : summary.utilizationRate > 80 ? 'warning' : 'positive' },
    { icon: Activity, label: 'Overall Performance', value: summary.performance.label, meta: summary.performance.message, tone: summary.performance.tone },
  ]

  const bvaMini = bva.monthly.filter((m) => m.budget > 0 || m.spending > 0).slice(-6)
    .map((m) => ({ month: m.key, Budget: m.budget, Spending: m.spending }))
  const catMini = category.categories.slice(0, 5).map((c) => ({ name: c.name, value: c.value }))
  const trendMini = trend.activeRows.map((r) => ({ month: r.month, value: r.total }))
  const donutData = [
    { name: 'Utilized', value: Math.min(summary.totalExpenses, summary.totalBudget || summary.totalExpenses) },
    { name: 'Remaining', value: Math.max(0, summary.remainingBalance) },
  ]

  const previews = [
    {
      key: 'bva', title: 'Budget vs Actual Spending', to: '/dashboard/analysis/budget-vs-actual',
      chart: bvaMini.length ? (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={bvaMini} margin={{ top: 6, right: 6, left: 6, bottom: 0 }}>
            <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#6B7280' }} axisLine={false} tickLine={false} />
            <Tooltip formatter={(v) => formatCurrency(v)} />
            <Bar dataKey="Budget" fill={CHART_COLORS.budget} radius={[3, 3, 0, 0]} />
            <Bar dataKey="Spending" fill={CHART_COLORS.actual} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      ) : null,
    },
    {
      key: 'cat', title: 'Expenses by Category', to: '/dashboard/analysis/expenses-by-category',
      chart: catMini.length ? (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={catMini} layout="vertical" margin={{ top: 4, right: 8, left: 4, bottom: 0 }}>
            <XAxis type="number" hide />
            <Tooltip formatter={(v) => formatCurrency(v)} />
            <Bar dataKey="value" radius={[0, 4, 4, 0]}>
              {catMini.map((c, i) => <Cell key={c.name} fill={colorForCategory(c.name, i)} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      ) : null,
    },
    {
      key: 'trend', title: 'Monthly Spending Trend', to: '/dashboard/analysis/monthly-spending',
      chart: trendMini.length ? (
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={trendMini} margin={{ top: 6, right: 8, left: 6, bottom: 0 }}>
            <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#6B7280' }} axisLine={false} tickLine={false} />
            <Tooltip formatter={(v) => formatCurrency(v)} />
            <Line type="monotone" dataKey="value" stroke={CHART_COLORS.primaryLine} strokeWidth={2.5} dot={{ r: 3, fill: CHART_COLORS.primaryLine }} />
          </LineChart>
        </ResponsiveContainer>
      ) : null,
    },
    {
      key: 'util', title: 'Budget Utilization', to: '/dashboard/analysis/budget-utilization',
      chart: summary.hasBudgetData ? (
        <div className="an-donut-wrap" style={{ height: '100%' }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={donutData} dataKey="value" innerRadius="62%" outerRadius="90%" paddingAngle={2} startAngle={90} endAngle={-270}>
                <Cell fill="#0E9F6E" />
                <Cell fill={CHART_COLORS.remaining} />
              </Pie>
              <Tooltip formatter={(v) => formatCurrency(v)} />
            </PieChart>
          </ResponsiveContainer>
          <div className="an-donut-center">
            <span className="val" style={{ fontSize: '1.1rem' }}>{formatPercentage(summary.utilizationRate, 0)}</span>
            <span className="lbl">used</span>
          </div>
        </div>
      ) : null,
    },
  ]

  return (
    <AnalysisLayout
      breadcrumb={BREADCRUMB}
      title="Financial Analysis"
      description="A consolidated view of budgets, spending, and AI-generated insights for the selected period."
      filterBar={
        <AnalysisFilterBar
          filters={filters}
          setFilter={setFilter}
          projectOptions={summary.projectOptions}
          categoryOptions={summary.categoryOptions}
          showProject
        />
      }
    >
      {hasData ? (
        <AnalysisInsightHeader
          status={ai.status}
          summary={ai.summary}
          insights={ai.insights}
          updatedAt={ai.updatedAt}
          onRefresh={ai.refresh}
          onViewDetails={() => {
            document.getElementById('ai-insights-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }}
        />
      ) : null}

      <section className="an-metric-grid" aria-label="Summary metrics">
        {metricCards.map((c) => <MetricCard key={c.label} {...c} />)}
      </section>

      {!hasData ? (
        <ChartCard>
          <EmptyState
            title="No financial records for this period"
            message={`There are no budgets or approved expenses for ${label}. Add a monthly budget or approve a request to see analysis.`}
          />
        </ChartCard>
      ) : (
        <div className="an-overview-grid">
          <div className="an-preview-grid">
            {previews.map((p) => (
              <button key={p.key} type="button" className="an-preview-card" onClick={() => navigate(p.to)} aria-label={`View details: ${p.title}`}>
                <div className="an-preview-head">
                  <span className="an-preview-title">{p.title}</span>
                  <span className="an-preview-view">View details <ArrowRight size={14} /></span>
                </div>
                <div className="an-preview-chart">
                  {p.chart || <EmptyState title="No data" message="Nothing to chart yet." />}
                </div>
              </button>
            ))}
          </div>

          <InsightPanel
            id="ai-insights-panel"
            title="AI Insights"
            status={ai.status}
            summary={ai.summary}
            insights={ai.insights}
            recommendations={ai.recommendations}
            error={ai.error}
            onRefresh={ai.refresh}
            updatedAt={ai.updatedAt}
          />
        </div>
      )}
    </AnalysisLayout>
  )
}
