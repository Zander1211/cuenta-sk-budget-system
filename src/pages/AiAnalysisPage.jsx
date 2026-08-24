import { useMemo, useRef, useState } from 'react'
import {
  ResponsiveContainer,
  BarChart, Bar,
  LineChart, Line,
  PieChart, Pie, Cell,
  XAxis, YAxis,
  Tooltip, CartesianGrid, Legend,
} from 'recharts'
import {
  Wallet, Receipt, PiggyBank, Clock,
  TrendingUp, TrendingDown, ShieldAlert, Layers,
  AlertTriangle, CheckCircle2, Info,
  Lightbulb, BarChart3, Sparkles, RefreshCw,
  ArrowRight,
} from 'lucide-react'
import RoleGate from '../components/RoleGate'
import { useAnalysisFilters } from '../hooks/useAnalysisFilters'
import {
  useFinancialSummary,
  useCategoryAnalysis,
  useMonthlyTrend,
  useBudgetVsActual,
  useApprovedBudgetDistribution,
} from '../hooks/useAnalysisData'
import { useAnalysisAI } from '../hooks/useAnalysisAI'
import { MetricCard } from '../components/analysis/AnalysisUI'
import { buildOverviewInsights } from '../utils/insights'
import {
  formatCurrency,
  formatPercentage,
  periodLabel,
  CHART_COLORS,
  CHART_INK,
  CATEGORY_COLORS,
  colorForCategory,
  pesoTick,
} from '../utils/analytics'
import { exportAiAnalysisPdf } from '../utils/exportPdf'
import YearSpinner from '../components/YearSpinner'

// ---------- Constants ----------
const SEVERITY_META = {
  high: { label: 'High Risk', Icon: AlertTriangle, colorClass: 'high' },
  medium: { label: 'Medium Risk', Icon: Info, colorClass: 'medium' },
  low: { label: 'Low Risk', Icon: CheckCircle2, colorClass: 'low' },
}

// ---------- Custom Pie Tooltip ----------
function PieTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const { name, value } = payload[0]
  return (
    <div style={{
      background: '#fff',
      border: '1px solid var(--line)',
      borderRadius: 'var(--radius-control)',
      padding: '8px 12px',
      fontSize: '0.85rem',
      boxShadow: 'var(--shadow)',
    }}>
      <div style={{ fontWeight: 600, color: 'var(--ink-1)', marginBottom: 2 }}>{name}</div>
      <div style={{ color: 'var(--ink-2)' }}>{formatCurrency(value)}</div>
    </div>
  )
}

// ---------- Section wrapper ----------
function Section({ icon: Icon, title, desc, children }) {
  return (
    <section className="an-section" style={{ marginBottom: 0 }}>
      <div className="an-section-header">
        <div className="an-section-title-group">
          <span className="an-section-icon"><Icon size={18} /></span>
          <div>
            <h2 className="an-section-title">{title}</h2>
            {desc && <p className="an-section-desc">{desc}</p>}
          </div>
        </div>
      </div>
      {children}
    </section>
  )
}

// ---------- Main Page ----------
export default function AiAnalysisPage() {
  const { filters, setFilter } = useAnalysisFilters()
  const [exporting, setExporting] = useState(false)
  const distChartRef = useRef(null)

  // Derived data via modern hooks
  const summary = useFinancialSummary(filters)
  const category = useCategoryAnalysis(filters)
  const trend = useMonthlyTrend(filters)
  const bva = useBudgetVsActual(filters)
  const dist = useApprovedBudgetDistribution(filters)

  const label = periodLabel(filters)
  const hasData = summary.hasAnyData

  // ---------- AI layer ----------
  const fallbackInsights = useMemo(
    () => buildOverviewInsights({ ...summary, highestCategory: category.highest }),
    [summary, category.highest]
  )

  const aiPayload = useMemo(() => ({
    page: 'ai-analysis',
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
    topCategories: category.categories.slice(0, 5).map((c) => ({
      name: c.name,
      total: Math.round(c.value),
    })),
    budgetDistribution: dist.distribution.map(d => ({ name: d.name, value: d.value }))
  }), [summary, category.categories, trend.trend.direction, label, dist.distribution])

  const ai = useAnalysisAI(aiPayload, { fallback: fallbackInsights, enabled: hasData })

  // ---------- Receipts Tracker ----------
  const receiptsTracker = useMemo(() => {
    const expenses = summary.periodExpenses || []
    let totalUploaded = 0
    let verifiedCount = 0
    let missingCount = 0
    let byProject = 0
    let byEvent = 0
    let byPayroll = 0

    expenses.forEach((e) => {
      const isMissing = !e.hasVerifiedReceipt && !e.receiptUrl && !e.receiptName
      const hasReceipt = !isMissing

      if (hasReceipt) totalUploaded++
      if (e.hasVerifiedReceipt) verifiedCount++
      if (isMissing) missingCount++

      if (hasReceipt) {
        if (e.type === 'Project') byProject++
        else if (e.type === 'Event') byEvent++
        else if (e.type === 'Payroll') byPayroll++
      }
    })

    return {
      totalUploaded,
      verifiedCount,
      missingCount,
      pendingReview: Math.max(0, totalUploaded - verifiedCount),
      byProject,
      byEvent,
      byPayroll
    }
  }, [summary.periodExpenses])

  // ---------- Chart data ----------
  const bvaData = useMemo(() =>
    bva.monthly
      .filter((m) => m.budget > 0 || m.spending > 0)
      .slice(-6)
      .map((m) => ({ month: m.key, 'Total Budget (Monthly Budget)': m.budget, 'Approved Budgets': m.spending })),
    [bva.monthly]
  )

  const trendData = useMemo(() =>
    trend.activeRows.map((r) => ({ month: r.month, 'Approved Budgets': r.total })),
    [trend.activeRows]
  )

  const pieData = useMemo(() =>
    category.categories
      .filter((c) => c.value > 0)
      .slice(0, 8)
      .map((c, i) => ({ name: c.name, value: c.value, color: colorForCategory(c.name, i) })),
    [category.categories]
  )

  const distPieData = useMemo(() =>
    dist.distribution.map(d => ({
      name: d.name,
      value: d.value,
      color: colorForCategory(d.name)
    })),
    [dist.distribution]
  )

  const distAiSummary = useMemo(() => {
    if (!dist.distribution.length) return null;
    const highest = dist.distribution[0];
    const lowest = dist.distribution[dist.distribution.length - 1];
    const highPct = ((highest.value / dist.total) * 100).toFixed(0);
    const lowPct = ((lowest.value / dist.total) * 100).toFixed(0);

    if (dist.distribution.length === 1) {
      return `${highest.name} received the entire approved budget allocation for this period, accounting for 100% of the total approved budget.`
    }

    return `${highest.name} received the highest approved budget allocation for this period, accounting for ${highPct}% of the total approved budget. ${lowest.name} has the lowest allocation, representing ${lowPct}% of the total approved budget.`
  }, [dist.distribution, dist.total])

  async function handleExportPdf() {
    if (exporting || !dist.hasData) return
    setExporting(true)
    try {
      await exportAiAnalysisPdf({
        chartRef: distChartRef.current,
        distribution: dist.distribution,
        total: dist.total,
        aiSummary: distAiSummary,
        filters,
      })
    } catch (err) {
      console.error('PDF export failed:', err)
    } finally {
      setExporting(false)
    }
  }

  // ---------- Summary metric cards ----------
  const metricCards = useMemo(() => [
    {
      icon: Wallet,
      label: 'Total Budget',
      value: formatCurrency(summary.totalBudget),
      meta: `Allocated for ${label}`,
      chip: filters.view === 'monthly' ? 'Monthly' : 'Yearly',
      tone: summary.hasBudgetData ? 'positive' : 'neutral',
    },
    {
      icon: Receipt,
      label: 'Approved Allocations',
      value: formatCurrency(summary.totalExpenses),
      meta: 'Total approved budget requests',
      chip: summary.hasBudgetData
        ? `${formatPercentage(summary.utilizationRate, 0)} allocated`
        : 'No requests',
      tone: summary.utilizationRate > 80 ? 'warning' : 'positive',
    },
    {
      icon: PiggyBank,
      label: 'Remaining Budget',
      value: formatCurrency(summary.remainingBalance),
      meta: summary.remainingBalance < 0
        ? 'Approved allocations exceed monthly budget'
        : 'Monthly budget minus approved allocations',
      chip: summary.remainingBalance < 0 ? 'Over-allocated' : 'Available',
      tone: summary.remainingBalance < 0 ? 'danger' : 'positive',
    },
    {
      icon: Clock,
      label: 'Pending Approvals',
      value: `${summary.pendingRequests.length} Pending`,
      meta: summary.missingReceipts > 0
        ? `${summary.missingReceipts} missing receipts`
        : 'All receipts attached',
      chip: summary.pendingRequests.length > 0 ? 'Action required' : 'Up to date',
      tone: summary.pendingRequests.length > 0 ? 'warning' : 'positive',
    },
  ], [summary, label, filters.view])

  // ---------- Spending highlights ----------
  const spendingHighlights = useMemo(() => {
    const highest = category.highest
    const lowest = category.lowest && category.lowest.name !== highest?.name
      ? category.lowest
      : category.categories.length > 1
        ? category.categories[category.categories.length - 1]
        : null

    return [
      {
        icon: TrendingUp,
        label: 'Highest Spending Category',
        value: highest ? highest.name : 'None',
        sub: highest
          ? `${formatCurrency(highest.value)} (${formatPercentage(highest.percent, 0)})`
          : 'No expenses recorded',
      },
      {
        icon: TrendingDown,
        label: 'Lowest Spending Category',
        value: lowest ? lowest.name : (category.categories.length === 1 ? 'Only 1 Category' : 'None'),
        sub: lowest
          ? `${formatCurrency(lowest.value)} (${formatPercentage(lowest.percent, 0)})`
          : 'No secondary expenses',
      },
      {
        icon: Layers,
        label: 'Budget Utilization Rate',
        value: formatPercentage(summary.utilizationRate, 1),
        sub: summary.hasBudgetData
          ? `${formatCurrency(summary.totalExpenses)} of ${formatCurrency(summary.totalBudget)}`
          : 'No budget allocated',
      },
      {
        icon: ShieldAlert,
        label: 'Overspending & Audit Status',
        value: summary.remainingBalance < 0
          ? `Over by ${formatCurrency(Math.abs(summary.remainingBalance))}`
          : summary.missingReceipts > 0
            ? `${summary.missingReceipts} Missing Receipts`
            : '100% Compliant',
        sub: summary.remainingBalance < 0
          ? 'Requires immediate budget review'
          : summary.missingReceipts > 0
            ? 'Supporting documentation pending'
            : 'Within allocated budget limits',
      },
    ]
  }, [category, summary])

  // ---------- AI Recommendations ----------
  const normalizedRecommendations = useMemo(() => {
    const rawList = ai.recommendations && ai.recommendations.length ? ai.recommendations : []
    if (!rawList.length) {
      const fallbackList = []
      if (summary.remainingBalance < 0) {
        fallbackList.push({
          title: 'Implement Spending Moratorium',
          description: `Expenses exceed allocation by ${formatCurrency(Math.abs(summary.remainingBalance))}. Restrict new disbursement requests until supplemental budget is passed.`,
          priority: 'High', category: 'Budget Control',
        })
      }
      if (summary.missingReceipts > 0) {
        fallbackList.push({
          title: 'Enforce Receipt Compliance',
          description: `${summary.missingReceipts} approved transactions are missing supporting documents. Require uploaded receipts before final liquidation.`,
          priority: 'High', category: 'Audit & Compliance',
        })
      }
      if (category.highest && category.highest.percent > 45) {
        fallbackList.push({
          title: `Diversify ${category.highest.name} Allocation`,
          description: `${category.highest.name} accounts for ${formatPercentage(category.highest.percent)} of expenditures. Review multi-vendor quotes to reduce category concentration.`,
          priority: 'Medium', category: 'Resource Optimization',
        })
      }
      fallbackList.push({
        title: 'Maintain 10% Emergency Buffer',
        description: 'Preserve at least 10% of total SK youth funds as an unencumbered contingency buffer for unforeseen community needs.',
        priority: 'Low', category: 'Contingency Planning',
      })
      fallbackList.push({
        title: 'Conduct Monthly Variance Review',
        description: 'Host a monthly financial review with SK kagawads to align ongoing project milestones with disbursements.',
        priority: 'Low', category: 'Governance',
      })
      return fallbackList
    }
    return rawList.map((rec, idx) => {
      if (typeof rec === 'object') {
        return {
          title: rec.title || `Recommendation ${idx + 1}`,
          description: rec.detail || rec.description || rec.text || '',
          priority: rec.severity || rec.priority || 'Medium',
          category: rec.category || 'Strategic Planning',
        }
      }
      const str = String(rec).trim()
      const colonIdx = str.indexOf(':')
      const dashIdx = str.indexOf(' - ')
      const splitIdx = colonIdx > 0 && colonIdx < 50 ? colonIdx : dashIdx > 0 && dashIdx < 50 ? dashIdx : -1
      let title = `Strategic Action ${idx + 1}`
      let description = str
      if (splitIdx !== -1) { title = str.slice(0, splitIdx).trim(); description = str.slice(splitIdx + 1).trim() }
      const lower = str.toLowerCase()
      const priority = lower.includes('urgent') || lower.includes('critical') || lower.includes('overspend') || lower.includes('exceed') ? 'High'
        : lower.includes('buffer') || lower.includes('contingency') || lower.includes('informational') ? 'Low' : 'Medium'
      return { title, description, priority, category: 'Strategic Planning' }
    })
  }, [ai.recommendations, summary, category])

  // ---------- Health badge ----------
  const severityCounts = useMemo(() =>
    ai.insights.reduce((acc, item) => {
      const s = item.severity === 'high' || item.severity === 'medium' ? item.severity : 'low'
      acc[s] += 1
      return acc
    }, { high: 0, medium: 0, low: 0 }),
    [ai.insights]
  )
  const overallHealth = useMemo(() => {
    if (severityCounts.high > 0 || summary.remainingBalance < 0) return { label: 'Action Needed', tone: 'danger' }
    if (severityCounts.medium > 0 || summary.utilizationRate > 80) return { label: 'Monitor Closely', tone: 'warning' }
    return { label: 'Healthy Status', tone: 'positive' }
  }, [severityCounts, summary.remainingBalance, summary.utilizationRate])

  // ---------- Render ----------
  return (
    <RoleGate allow={['SK Chairman', 'SK Treasurer', 'Barangay Treasurer', 'SK Kagawad']}>
      {/* Page header */}
      <header className="dashboard-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div className="header-left">
          <div>
            <p className="eyebrow">AI Insights</p>
            <h1>Financial Intelligence</h1>
            <p>Automated analysis of spending patterns and budget risks.</p>
          </div>
        </div>
        {hasData && dist.hasData && (
          <div className="header-actions">
            <button
              type="button"
              className="an-btn an-btn-outline"
              onClick={handleExportPdf}
              disabled={exporting}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              {exporting ? 'Exporting...' : 'Export AI Analysis PDF'}
            </button>
          </div>
        )}
      </header>

      <section className="dashboard-content" style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>

        {/* ── Filter Bar ── */}
        <section className="dashboard-filters" aria-label="Budget filters">
          <div className="filter-group">
            <span className="filter-label">View</span>
            <div className="filter-toggle">
              <button
                type="button"
                className={`filter-toggle-btn ${filters.view === 'monthly' ? 'is-active' : ''}`}
                onClick={() => setFilter({ view: 'monthly' })}
              >
                Monthly Budget
              </button>
              <button
                type="button"
                className={`filter-toggle-btn ${filters.view === 'yearly' ? 'is-active' : ''}`}
                onClick={() => setFilter({ view: 'yearly' })}
              >
                Yearly Budget
              </button>
            </div>
          </div>
          {filters.view === 'monthly' && (
            <div className="filter-group">
              <span className="filter-label">Month</span>
              <select
                className="panel-select"
                value={filters.month}
                onChange={(e) => setFilter({ month: Number(e.target.value) })}
              >
                {[
                  'January', 'February', 'March', 'April', 'May', 'June',
                  'July', 'August', 'September', 'October', 'November', 'December',
                ].map((m, i) => (
                  <option key={m} value={i + 1}>{m}</option>
                ))}
              </select>
            </div>
          )}
          <div className="filter-group">
            <span className="filter-label">Year</span>
            <YearSpinner year={filters.year} onYearChange={(y) => setFilter({ year: y })} />
          </div>
        </section>

        {/* ── 1. Summary Metric Cards ── */}
        <section className="an-metric-grid" aria-label="Financial summary metrics">
          {metricCards.map((c) => <MetricCard key={c.label} {...c} />)}
        </section>

        {/* ── 1.5 Receipts Tracker ── */}
        {hasData && (
          <Section
            icon={Receipt}
            title="Receipts Tracker"
            desc="Status of supporting documents across all approved allocations."
          >
            <div className="an-metric-grid">
              <MetricCard
                icon={Receipt}
                label="Total Uploaded"
                value={receiptsTracker.totalUploaded}
                meta={`${receiptsTracker.byProject} Project, ${receiptsTracker.byEvent} Event, ${receiptsTracker.byPayroll} Payroll`}
                tone="neutral"
              />
              <MetricCard
                icon={CheckCircle2}
                label="Verified Receipts"
                value={receiptsTracker.verifiedCount}
                meta="Approved & confirmed"
                tone="positive"
              />
              <MetricCard
                icon={Clock}
                label="Pending Review"
                value={receiptsTracker.pendingReview}
                meta="Uploaded but not verified"
                tone={receiptsTracker.pendingReview > 0 ? "warning" : "positive"}
              />
              <MetricCard
                icon={AlertTriangle}
                label="Missing Receipts"
                value={receiptsTracker.missingCount}
                meta="Expenses without documentation"
                tone={receiptsTracker.missingCount > 0 ? "danger" : "positive"}
              />
            </div>
          </Section>
        )}

        {/* ── 2. AI Executive Summary Card ── */}
        {hasData && (
          <section className="an-ai-summary-card" aria-label="Executive AI summary">
            <div className="an-ai-summary-head">
              <div className="an-ai-summary-lead">
                <span className="an-ai-summary-badge" aria-hidden="true"><Sparkles size={20} /></span>
                <div>
                  <h2 className="an-ai-summary-title">Executive Financial Summary</h2>
                  <div className="an-ai-summary-status" style={{ marginTop: '2px' }}>
                    Status: <span className={`an-status-badge ${overallHealth.tone}`}>{overallHealth.label}</span>
                  </div>
                </div>
              </div>
              <div className="an-ai-summary-meta">
                <span className="an-ai-summary-status">
                  {ai.status === 'error'
                    ? 'Temporarily unavailable'
                    : ai.status === 'loading'
                      ? 'Analyzing records with Gemini…'
                      : ai.updatedAt
                        ? `Updated ${new Date(ai.updatedAt).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })}`
                        : 'Deterministic Evaluation'}
                </span>
                <button
                  type="button"
                  className="an-btn an-btn-ghost an-btn-icon"
                  onClick={ai.refresh}
                  disabled={ai.status === 'loading'}
                  aria-label="Refresh AI analysis"
                  title="Refresh AI analysis"
                >
                  <RefreshCw size={16} className={ai.status === 'loading' ? 'an-spin' : ''} />
                </button>
              </div>
            </div>

            {ai.status === 'error' ? (
              <div style={{ marginTop: '12px', marginBottom: '16px', padding: '12px 16px', background: 'var(--danger-50)', border: '1px solid var(--danger-100)', borderRadius: '6px' }}>
                <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--danger-700)', fontWeight: 500 }}>
                  {ai.error}
                </p>
                <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: 'var(--danger-600)' }}>
                  Computed insights are shown below as a fallback. Click the refresh button to try again.
                </p>
              </div>
            ) : (
              <p className="an-ai-summary-text">
                {ai.summary?.trim() ||
                  `For ${label}, total allocated budget is ${formatCurrency(summary.totalBudget)} with ${formatCurrency(summary.totalExpenses)} in approved disbursements (${formatPercentage(summary.utilizationRate, 1)} utilization). ${severityCounts.high} high-priority, ${severityCounts.medium} medium-priority, and ${severityCounts.low} informational insights detected.`}
              </p>
            )}

            <div className="an-ai-counts-row">
              <span className="an-ai-count-tag high"><AlertTriangle size={14} /> High Risk ({severityCounts.high})</span>
              <span className="an-ai-count-tag medium"><Info size={14} /> Medium Risk ({severityCounts.medium})</span>
              <span className="an-ai-count-tag low"><CheckCircle2 size={14} /> Low / Info ({severityCounts.low})</span>
            </div>
          </section>
        )}

        {/* ── Empty state ── */}
        {!hasData ? (
          <div className="an-empty-state-card" role="status">
            <div className="an-empty-icon-box"><BarChart3 size={32} /></div>
            <h2 className="an-empty-title">No financial data available</h2>
            <p className="an-empty-desc">
              No records found for {label}. Try selecting a different month, year, or filter.
            </p>
          </div>
        ) : (
          <>
            {/* ── 3. Budget & Spending Charts ── */}
            <Section
              icon={BarChart3}
              title="Budget & Spending Analytics"
              desc="Visual comparison of allocated budgets, approved disbursements, and monthly trends."
            >
              <div className="an-charts-grid">
                {/* Chart A: Budget vs Actual */}
                <div className="an-chart-card">
                  <div className="an-chart-head">
                    <div>
                      <h3 className="an-chart-title">Budget vs Approved Budgets</h3>
                      <p className="an-chart-desc">Comparison for the selected period</p>
                    </div>
                  </div>
                  <div className="an-chart-body">
                    {bvaData.length ? (
                      <ResponsiveContainer width="100%" height={250}>
                        <BarChart data={bvaData} margin={{ top: 8, right: 8, left: -8, bottom: 0 }} barGap={4}>
                          <CartesianGrid vertical={false} stroke={CHART_INK.grid} />
                          <XAxis dataKey="month" tick={{ fontSize: 12, fill: CHART_INK.tick }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fontSize: 11, fill: CHART_INK.tick }} axisLine={false} tickLine={false} tickFormatter={pesoTick} width={56} />
                          <Tooltip formatter={(v, k) => [formatCurrency(v), k]} cursor={{ fill: CHART_INK.cursor }} />
                          <Legend iconType="circle" iconSize={9} wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                          <Bar dataKey="Total Budget (Monthly Budget)" fill={CHART_COLORS.budget} radius={[4, 4, 0, 0]} maxBarSize={22} />
                          <Bar dataKey="Approved Budgets" fill={CHART_COLORS.actual} radius={[4, 4, 0, 0]} maxBarSize={22} />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <div style={{ height: '100%', display: 'grid', placeItems: 'center', color: 'var(--ink-3)', fontSize: '0.9rem' }}>
                        No budget vs actual data available for this period
                      </div>
                    )}
                  </div>
                  <div className="an-chart-footer">
                    <span style={{ fontSize: '0.84rem', color: 'var(--ink-3)' }}>Updated for {label}</span>
                  </div>
                </div>

                {/* Chart B: Monthly Spending Trend */}
                <div className="an-chart-card">
                  <div className="an-chart-head">
                    <div>
                      <h3 className="an-chart-title">Monthly Spending Trend</h3>
                      <p className="an-chart-desc">Historical trajectory and disbursement momentum</p>
                    </div>
                  </div>
                  <div className="an-chart-body">
                    {trendData.length ? (
                      <ResponsiveContainer width="100%" height={250}>
                        <LineChart data={trendData} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
                          <CartesianGrid vertical={false} stroke={CHART_INK.grid} />
                          <XAxis dataKey="month" tick={{ fontSize: 12, fill: CHART_INK.tick }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fontSize: 11, fill: CHART_INK.tick }} axisLine={false} tickLine={false} tickFormatter={pesoTick} width={56} />
                          <Tooltip formatter={(v) => [formatCurrency(v), 'Approved Budgets']} />
                          <Line
                            type="monotone"
                            dataKey="Approved Budgets"
                            stroke={CHART_COLORS.primaryLine}
                            strokeWidth={2.5}
                            dot={{ r: 3.5, fill: CHART_INK.surface, strokeWidth: 2, stroke: CHART_COLORS.primaryLine }}
                            activeDot={{ r: 6, fill: CHART_COLORS.primaryLine, stroke: CHART_INK.surface, strokeWidth: 2 }}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    ) : (
                      <div style={{ height: '100%', display: 'grid', placeItems: 'center', color: 'var(--ink-3)', fontSize: '0.9rem' }}>
                        No trend data available
                      </div>
                    )}
                  </div>
                  <div className="an-chart-footer">
                    <span style={{ fontSize: '0.84rem', color: 'var(--ink-3)' }}>Velocity: {trend.trend.direction}</span>
                  </div>
                </div>

                {/* Chart C: Approved Budget Distribution */}
                <div className="an-chart-card" ref={distChartRef} data-pdf-capture="full">
                  <div className="an-chart-head">
                    <div>
                      <h3 className="an-chart-title">Approved Budget Distribution</h3>
                      <p className="an-chart-desc">Breakdown by category for the selected period</p>
                    </div>
                  </div>
                  <div className="an-chart-body">
                    {distPieData.length ? (
                      <ResponsiveContainer width="100%" height={250}>
                        <PieChart>
                          <Pie
                            data={distPieData}
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={100}
                            paddingAngle={2}
                            dataKey="value"
                            nameKey="name"
                          >
                            {distPieData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip
                            formatter={(value, name) => {
                              const percent = ((value / dist.total) * 100).toFixed(1)
                              return [`${formatCurrency(value)} (${percent}%)`, name]
                            }}
                            cursor={{ fill: CHART_INK.cursor }}
                          />
                          <Legend iconType="circle" iconSize={9} wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                        </PieChart>
                      </ResponsiveContainer>
                    ) : (
                      <div style={{ height: '100%', display: 'grid', placeItems: 'center', color: 'var(--ink-3)', fontSize: '0.9rem' }}>
                        No approved budget data available
                      </div>
                    )}
                  </div>
                  <div className="an-chart-footer" style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '16px', background: 'var(--surface-50)' }}>
                    {distAiSummary && (
                      <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--ink-2)', lineHeight: 1.5 }}>
                        <strong>AI Summary:</strong> {distAiSummary}
                      </p>
                    )}
                    <span style={{ fontSize: '0.75rem', color: 'var(--ink-4)', marginTop: '4px' }}>Updated for {label}</span>
                  </div>
                </div>
              </div>
            </Section>

            {/* ── 4. Spending by Category (Pie Chart) ── */}
            <Section
              icon={Layers}
              title="Spending by Category"
              desc="Budget allocation distribution across project types, events, and payroll."
            >
              <div className="an-chart-card" style={{ maxWidth: '100%' }}>
                <div className="an-chart-head">
                  <div>
                    <h3 className="an-chart-title">Category Breakdown</h3>
                    <p className="an-chart-desc">Approved allocations grouped by spending category</p>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', padding: '16px 0 8px', alignItems: 'center' }}>
                  {/* Pie */}
                  <div style={{ height: '280px' }}>
                    {pieData.length ? (
                      <ResponsiveContainer width="100%" height={250}>
                        <PieChart>
                          <Pie
                            data={pieData}
                            cx="50%"
                            cy="50%"
                            innerRadius="40%"
                            outerRadius="72%"
                            paddingAngle={3}
                            dataKey="value"
                          >
                            {pieData.map((entry, index) => (
                              <Cell key={entry.name} fill={entry.color || CATEGORY_COLORS[index % CATEGORY_COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip content={<PieTooltip />} />
                        </PieChart>
                      </ResponsiveContainer>
                    ) : (
                      <div style={{ height: '100%', display: 'grid', placeItems: 'center', color: 'var(--ink-3)', fontSize: '0.9rem' }}>
                        No category data available
                      </div>
                    )}
                  </div>
                  {/* Legend */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {pieData.length ? pieData.map((entry, index) => (
                      <div key={entry.name} style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                        <span style={{
                          width: '12px', height: '12px', borderRadius: '50%', flexShrink: 0,
                          background: entry.color || CATEGORY_COLORS[index % CATEGORY_COLORS.length],
                        }} />
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--ink-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {entry.name}
                          </div>
                          <div style={{ fontSize: '0.78rem', color: 'var(--ink-3)' }}>
                            {formatCurrency(entry.value)}
                          </div>
                        </div>
                      </div>
                    )) : (
                      <p style={{ fontSize: '0.85rem', color: 'var(--ink-3)' }}>No data to display</p>
                    )}
                  </div>
                </div>
              </div>
            </Section>

            {/* ── 5. Spending Highlights ── */}
            <Section
              icon={TrendingUp}
              title="Spending Highlights & Metrics"
              desc="Key drivers, category concentrations, and budget compliance metrics."
            >
              <div className="an-highlight-grid">
                {spendingHighlights.map((item) => {
                  const IconComponent = item.icon
                  return (
                    <div key={item.label} className="an-highlight-item">
                      <div className="an-highlight-top">
                        <span className="an-highlight-label">{item.label}</span>
                        <span className="an-highlight-icon">
                          <IconComponent size={16} color={CHART_COLORS.primaryLine} />
                        </span>
                      </div>
                      <div className="an-highlight-value" title={item.value}>{item.value}</div>
                      <div className="an-highlight-sub">{item.sub}</div>
                    </div>
                  )
                })}
              </div>
            </Section>

            {/* ── 6. AI Risk & Anomaly Analysis ── */}
            <Section
              icon={ShieldAlert}
              title="AI Risk & Anomaly Analysis"
              desc="Identified spending anomalies, compliance gaps, and category concentration risks."
            >
              <div className="an-risk-grid">
                {ai.insights && ai.insights.length ? (
                  ai.insights.map((item, index) => {
                    const sev = item.severity === 'high' || item.severity === 'medium' ? item.severity : 'low'
                    const meta = SEVERITY_META[sev]
                    const IconComp = meta.Icon
                    return (
                      <div key={`${item.title}-${index}`} className={`an-risk-card ${meta.colorClass}`}>
                        <div className="an-risk-card-head">
                          <h3 className="an-risk-card-title">{item.title}</h3>
                          <span className={`an-chip ${sev}`}>
                            <IconComp size={12} style={{ display: 'inline', marginRight: '4px', verticalAlign: '-1px' }} />
                            {meta.label}
                          </span>
                        </div>
                        {item.why && (
                          <p className="an-risk-why">
                            <span className="an-risk-why-tag">Why:</span>{item.why}
                          </p>
                        )}
                        {item.detail && <p className="an-risk-detail">{item.detail}</p>}
                      </div>
                    )
                  })
                ) : (
                  <div className="an-card" style={{ gridColumn: '1 / -1', textAlign: 'center', color: 'var(--ink-3)' }}>
                    No risks or anomalies detected for this period.
                  </div>
                )}
              </div>
            </Section>

            {/* ── 7. AI Strategic Recommendations ── */}
            <Section
              icon={Lightbulb}
              title="AI Strategic Recommendations"
              desc="Actionable steps to optimize budget allocation, mitigate risks, and enhance audit compliance."
            >
              <div className="an-reco-grid">
                {normalizedRecommendations.map((rec, index) => {
                  const sev = rec.priority === 'High' ? 'danger' : rec.priority === 'Medium' ? 'warning' : 'positive'
                  return (
                    <div key={`${rec.title}-${index}`} className="an-reco-card">
                      <div className="an-reco-card-top">
                        <span className="an-reco-icon-wrap"><Lightbulb size={18} /></span>
                        <span className={`an-chip ${sev}`}>{rec.priority} Priority</span>
                      </div>
                      <div>
                        <h3 className="an-reco-title">{rec.title}</h3>
                        <p className="an-reco-desc" style={{ marginTop: '8px' }}>{rec.description}</p>
                      </div>
                      <div className="an-reco-footer">
                        <span className="an-reco-category">{rec.category}</span>
                        <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--accent)' }}>
                          Recommendation #{index + 1}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </Section>
          </>
        )}
      </section>
    </RoleGate>
  )
}

export default AiAnalysisPage
