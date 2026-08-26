import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from 'recharts'
import {
  Wallet,
  Receipt,
  PiggyBank,
  Clock,
  ArrowRight,
  Sparkles,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  Info,
  Lightbulb,
  BarChart3,
  Layers,
} from 'lucide-react'
import { useAnalysisFilters } from '../../hooks/useAnalysisFilters'
import {
  useFinancialSummary,
  useCategoryAnalysis,
  useMonthlyTrend,
  useBudgetVsActual,
  useApprovedBudgetDistribution,
} from '../../hooks/useAnalysisData'
import { useAnalysisAI } from '../../hooks/useAnalysisAI'
import { AnalysisLayout, AnalysisFilterBar } from '../../components/analysis/AnalysisLayout'
import { MetricCard } from '../../components/analysis/AnalysisUI'
import { buildOverviewInsights } from '../../utils/insights'
import {
  formatCurrency,
  formatPercentage,
  periodLabel,
  CHART_COLORS,
  CHART_INK,
  pesoTick,
  colorForCategory,
} from '../../utils/analytics'


const BREADCRUMB = [{ label: 'Home', to: '/dashboard' }, { label: 'Financial Analysis' }]

const SEVERITY_META = {
  high: { label: 'High Risk', Icon: AlertTriangle, colorClass: 'high' },
  medium: { label: 'Medium Risk', Icon: Info, colorClass: 'medium' },
  low: { label: 'Low Risk', Icon: CheckCircle2, colorClass: 'low' },
}

export default function AnalysisOverviewPage() {
  const navigate = useNavigate()
  const { filters, setFilter } = useAnalysisFilters()

  const summary = useFinancialSummary(filters)
  const category = useCategoryAnalysis(filters)
  const trend = useMonthlyTrend(filters)
  const dist = useApprovedBudgetDistribution(filters)
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
      topCategories: category.categories.slice(0, 5).map((c) => ({
        name: c.name,
        total: Math.round(c.value),
      })),
      budgetDistribution: dist.distribution.map(d => ({ name: d.name, value: d.value }))
    }),
    [summary, category.categories, trend.trend.direction, label, dist.distribution]
  )

  const ai = useAnalysisAI(aiPayload, { fallback: fallbackInsights, enabled: hasData })

  // Top 4 summary metric cards for desktop (4-col), tablet (2-col), mobile (1-col)
  const metricCards = [
    {
      icon: Wallet,
      label: 'Total Budget',
      value: formatCurrency(summary.totalBudget),
      meta: `Allocated for ${label}`,
      tone: 'neutral',
    },
    {
      icon: Receipt,
      label: 'Total Expenses',
      value: formatCurrency(summary.totalExpenses),
      meta: 'Approved spending',
      chip: summary.hasBudgetData ? `${formatPercentage(summary.utilizationRate, 0)} used` : null,
      tone: summary.utilizationRate > 80 ? 'warning' : 'positive',
    },
    {
      icon: PiggyBank,
      label: 'Remaining Budget',
      value: formatCurrency(summary.remainingBalance),
      meta: summary.remainingBalance < 0 ? 'Over budget' : 'Available to spend',
      chip: summary.remainingBalance < 0 ? 'Deficit' : 'Surplus',
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
  ]

  // Severity counts for AI summary
  const severityCounts = useMemo(() => {
    return ai.insights.reduce(
      (acc, item) => {
        const s = item.severity === 'high' || item.severity === 'medium' ? item.severity : 'low'
        acc[s] += 1
        return acc
      },
      { high: 0, medium: 0, low: 0 }
    )
  }, [ai.insights])

  const overallHealth = useMemo(() => {
    if (severityCounts.high > 0 || summary.remainingBalance < 0) {
      return { label: 'Action Needed', tone: 'danger' }
    }
    if (severityCounts.medium > 0 || summary.utilizationRate > 80) {
      return { label: 'Monitor Closely', tone: 'warning' }
    }
    return { label: 'Healthy Status', tone: 'positive' }
  }, [severityCounts, summary.remainingBalance, summary.utilizationRate])

  // Chart data
  const bvaData = useMemo(() => {
    return bva.monthly
      .filter((m) => m.budget > 0 || m.spending > 0)
      .slice(-6)
      .map((m) => ({
        month: m.key,
        Budget: m.budget,
        Spending: m.spending,
      }))
  }, [bva.monthly])

  const trendData = useMemo(() => {
    return trend.rows.map((r) => ({
      month: r.month,
      Spending: r.total,
    }))
  }, [trend.rows])

  // Spending Highlights 4 compact cards
  const spendingHighlights = useMemo(() => {
    const highestDist = dist.distribution.length > 0 ? dist.distribution[0] : null
    const lowestDist = dist.distribution.length > 1 ? dist.distribution[dist.distribution.length - 1] : null

    const highest = highestDist ? { name: highestDist.name, value: highestDist.value, percent: (highestDist.value / dist.total) * 100 } : null
    const lowest = lowestDist ? { name: lowestDist.name, value: lowestDist.value, percent: (lowestDist.value / dist.total) * 100 } : null

    return [
      {
        icon: TrendingUp,
        label: 'Highest Allocation Category',
        value: highest ? highest.name : 'None',
        sub: highest
          ? `${formatCurrency(highest.value)} (${formatPercentage(highest.percent, 0)})`
          : 'No budget allocated',
      },
      {
        icon: TrendingDown,
        label: 'Lowest Allocation Category',
        value: lowest ? lowest.name : (dist.distribution.length === 1 ? 'Only 1 Category' : 'None'),
        sub: lowest
          ? `${formatCurrency(lowest.value)} (${formatPercentage(lowest.percent, 0)})`
          : 'No secondary allocations',
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

  // Normalized recommendations
  const normalizedRecommendations = useMemo(() => {
    const rawList = ai.recommendations && ai.recommendations.length ? ai.recommendations : []
    if (!rawList.length) {
      // Smart default recommendations based on current financial state
      const fallbackList = []
      if (summary.remainingBalance < 0) {
        fallbackList.push({
          title: 'Implement Spending Moratorium',
          description: `Expenses exceed allocation by ${formatCurrency(Math.abs(summary.remainingBalance))}. Restrict new disbursement requests until supplemental budget is passed.`,
          priority: 'High',
          category: 'Budget Control',
        })
      }
      if (summary.missingReceipts > 0) {
        fallbackList.push({
          title: 'Enforce Receipt Compliance',
          description: `${summary.missingReceipts} approved transactions are missing supporting documents. Require uploaded receipts before final liquidation.`,
          priority: 'High',
          category: 'Audit & Compliance',
        })
      }
      if (category.highest && category.highest.percent > 45) {
        fallbackList.push({
          title: `Diversify ${category.highest.name} Allocation`,
          description: `${category.highest.name} accounts for ${formatPercentage(category.highest.percent)} of expenditures. Review multi-vendor quotes to reduce category concentration.`,
          priority: 'Medium',
          category: 'Resource Optimization',
        })
      }
      fallbackList.push({
        title: 'Maintain 10% Emergency Buffer',
        description: 'Preserve at least 10% of total barangay youth funds as an unencumbered contingency buffer for unforeseen community needs.',
        priority: 'Low',
        category: 'Contingency Planning',
      })
      fallbackList.push({
        title: 'Conduct Monthly Variance Review',
        description: 'Host a monthly financial review with SK kagawads to align ongoing project milestones with disbursements.',
        priority: 'Low',
        category: 'Governance',
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
      if (splitIdx !== -1) {
        title = str.slice(0, splitIdx).trim()
        description = str.slice(splitIdx + 1).trim()
      } else if (str.length > 50) {
        const words = str.split(' ')
        if (words.length > 4) {
          title = words.slice(0, 4).join(' ')
        }
      }

      const lower = str.toLowerCase()
      let priority = 'Medium'
      let categoryType = 'Optimization'

      if (lower.includes('urgent') || lower.includes('critical') || lower.includes('overspending') || lower.includes('exceed') || lower.includes('missing receipt') || lower.includes('compliance')) {
        priority = 'High'
        categoryType = 'Compliance & Risk'
      } else if (lower.includes('informational') || lower.includes('favorable') || lower.includes('buffer') || lower.includes('contingency')) {
        priority = 'Low'
        categoryType = 'Contingency'
      } else if (lower.includes('budget') || lower.includes('allocat')) {
        categoryType = 'Budget Planning'
      }

      return { title, description, priority, category: categoryType }
    })
  }, [ai.recommendations, summary, category])

  const distPieData = useMemo(() =>
    dist.distribution.map((d, index) => ({
      name: d.name,
      value: d.value,
      color: colorForCategory(d.name, index)
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

  const renderCustomizedLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }) => {
    if (percent < 0.05) return null; // Hide label for very small slices
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + radius * Math.cos(-midAngle * Math.PI / 180);
    const y = cy + radius * Math.sin(-midAngle * Math.PI / 180);
    return (
      <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight="bold">
        {`${(percent * 100).toFixed(0)}%`}
      </text>
    );
  };

  const CustomPieTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      const percent = ((data.value / dist.total) * 100).toFixed(1);
      return (
        <div className="an-tooltip" style={{ background: '#fff', border: '1px solid var(--cuenta-border)', padding: '12px', borderRadius: '8px', boxShadow: 'var(--cuenta-shadow)' }}>
          <p style={{ margin: '0 0 8px 0', fontWeight: 'bold', color: 'var(--cuenta-text-heading)' }}>{data.name}</p>
          <p style={{ margin: '4px 0', fontSize: '13px', color: 'var(--cuenta-text-secondary)' }}>Approved Budget: <strong style={{ color: 'var(--cuenta-text-heading)' }}>{formatCurrency(data.value)}</strong></p>
          <p style={{ margin: '4px 0', fontSize: '13px', color: 'var(--cuenta-text-secondary)' }}>Percentage: <strong style={{ color: 'var(--cuenta-text-heading)' }}>{percent}%</strong></p>
        </div>
      );
    }
    return null;
  };

  const renderDetailedLegend = (props) => {
    const { payload } = props;
    return (
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {payload.map((entry, index) => {
          const d = distPieData.find(x => x.name === entry.value);
          if (!d) return null;
          const percent = ((d.value / dist.total) * 100).toFixed(0);
          return (
            <li key={`item-${index}`} style={{ display: 'flex', alignItems: 'center', fontSize: '13px', color: 'var(--cuenta-text-secondary)' }}>
              <span style={{ backgroundColor: entry.color, width: 12, height: 12, borderRadius: '50%', display: 'inline-block', marginRight: 10, flexShrink: 0 }}></span>
              <span style={{ flexGrow: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginRight: '8px' }}>{entry.value}</span>
              <span style={{ fontWeight: '500', color: 'var(--cuenta-text-heading)', whiteSpace: 'nowrap' }}>{formatCurrency(d.value)} ({percent}%)</span>
            </li>
          );
        })}
      </ul>
    );
  };

  function handleViewFullReport() {
    const params = new URLSearchParams({ view: filters.view, year: String(filters.year) })
    if (filters.view === 'monthly') params.set('month', String(filters.month))
    navigate(`/dashboard/analysis/budget-distribution?${params.toString()}`)
  }

  return (
    <AnalysisLayout
      breadcrumb={BREADCRUMB}
      title="Financial Analysis & AI Insights"
      description="Consolidated intelligence on budgets, spending velocity, category concentrations, and AI-driven risk detection."
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
      {/* 1. Top Summary Metric Cards (4 equal cards) */}
      <section className="an-metric-grid" aria-label="Financial summary metrics">
        {metricCards.map((c) => (
          <MetricCard key={c.label} {...c} />
        ))}
      </section>

      {!hasData ? (
        /* Empty State */
        <div className="an-empty-state-card" role="status">
          <div className="an-empty-icon-box">
            <BarChart3 size={32} />
          </div>
          <h2 className="an-empty-title">No financial data available</h2>
          <p className="an-empty-desc">
            No records were found for {label}. Try selecting a different month, year, or project from the filter bar above.
          </p>
        </div>
      ) : (
        <>
          {/* 2. Executive AI Summary Card */}
          <section className="an-ai-summary-card" aria-label="Executive AI summary">
            <div className="an-ai-summary-head">
              <div className="an-ai-summary-lead">
                <span className="an-ai-summary-badge" aria-hidden="true">
                  <Sparkles size={20} />
                </span>
                <div>
                  <h2 className="an-ai-summary-title">Executive Financial Summary</h2>
                  <div className="an-ai-summary-status" style={{ marginTop: '2px' }}>
                    Status: <span className={`an-status-badge ${overallHealth.tone}`}>{overallHealth.label}</span>
                  </div>
                </div>
              </div>

              <div className="an-ai-summary-meta">
                <span className="an-ai-summary-status">
                  {ai.status === 'loading'
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

            <p className="an-ai-summary-text">
              {ai.summary?.trim() ||
                `For ${label}, total allocated budget is ${formatCurrency(summary.totalBudget)} with ${formatCurrency(summary.totalExpenses)} in approved disbursements (${formatPercentage(summary.utilizationRate, 1)} utilization). ${severityCounts.high} high-priority, ${severityCounts.medium} medium-priority, and ${severityCounts.low} informational insights detected.`}
            </p>

            <div className="an-ai-counts-row">
              <span className="an-ai-count-tag high">
                <AlertTriangle size={14} /> High Risk ({severityCounts.high})
              </span>
              <span className="an-ai-count-tag medium">
                <Info size={14} /> Medium Risk ({severityCounts.medium})
              </span>
              <span className="an-ai-count-tag low">
                <CheckCircle2 size={14} /> Low / Info ({severityCounts.low})
              </span>
            </div>
          </section>

          {/* 3. Budget & Spending Charts (2-Column Dedicated Cards) */}
          <section className="an-section" aria-label="Budget charts">
            <div className="an-section-header">
              <div className="an-section-title-group">
                <span className="an-section-icon"><BarChart3 size={18} /></span>
                <div>
                  <h2 className="an-section-title">Budget & Spending Analytics</h2>
                  <p className="an-section-desc">Visual comparison of allocated budgets vs actual disbursements over time.</p>
                </div>
              </div>
            </div>

            <div className="an-charts-grid">
              {/* Card 1: Budget vs Actual */}
              <div className="an-chart-card">
                <div className="an-chart-head">
                  <div>
                    <h3 className="an-chart-title">Budget vs Actual Spending</h3>
                    <p className="an-chart-desc">Monthly comparison across active periods</p>
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
                        <Bar dataKey="Budget" fill={CHART_COLORS.budget} radius={[4, 4, 0, 0]} maxBarSize={22} />
                        <Bar dataKey="Spending" fill={CHART_COLORS.actual} radius={[4, 4, 0, 0]} maxBarSize={22} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div style={{ height: '100%', display: 'grid', placeItems: 'center', color: 'var(--ink-3)' }}>
                      No budget vs actual data available
                    </div>
                  )}
                </div>

                <div className="an-chart-footer">
                  <span style={{ fontSize: '0.84rem', color: 'var(--ink-3)' }}>Updated for {label}</span>
                  <button
                    type="button"
                    className="an-chart-link"
                    onClick={() => navigate('/dashboard/analysis/budget-vs-actual')}
                  >
                    View full report <ArrowRight size={14} />
                  </button>
                </div>
              </div>

              {/* Card 2: Approved Budget Distribution (Pie Chart) */}
              <div className="an-chart-card">
                <div className="an-chart-head">
                  <div>
                    <h3 className="an-chart-title">Approved Budget Distribution</h3>
                    <p className="an-chart-desc">Breakdown by category for the selected period</p>
                  </div>
                </div>
                <div className="an-chart-body" style={{ padding: '0 12px' }}>
                  {distPieData.length ? (
                    <div className="an-pie-inner">
                      <div style={{ height: '260px' }}>
                        <ResponsiveContainer width="100%" height={250}>
                          <PieChart>
                            <Pie
                              data={distPieData}
                              cx="50%"
                              cy="50%"
                              innerRadius={65}
                              outerRadius={105}
                              paddingAngle={2}
                              dataKey="value"
                              nameKey="name"
                              label={renderCustomizedLabel}
                              labelLine={false}
                            >
                              {distPieData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.color} />
                              ))}
                            </Pie>
                            <Tooltip content={<CustomPieTooltip />} cursor={{ fill: CHART_INK.cursor }} />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <div style={{ maxHeight: '260px', overflowY: 'auto', paddingRight: '8px' }}>
                        {renderDetailedLegend({ payload: distPieData.map(d => ({ value: d.name, color: d.color })) })}
                      </div>
                    </div>
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
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--ink-4)' }}>Updated for {label}</span>
                    <button
                      type="button"
                      className="an-chart-link"
                      onClick={handleViewFullReport}
                      disabled={!dist.hasData}
                    >
                      View full report <ArrowRight size={14} />
                    </button>
                  </div>
                </div>
              </div>

              {/* Card 3: Monthly Spending Trend */}
              <div className="an-chart-card an-chart-card--wide">
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
                        <Tooltip formatter={(v) => [formatCurrency(v), 'Expenses']} />
                        <Line
                          type="monotone"
                          dataKey="Spending"
                          stroke={CHART_COLORS.primaryLine}
                          strokeWidth={2.5}
                          dot={{ r: 3.5, fill: CHART_INK.surface, strokeWidth: 2, stroke: CHART_COLORS.primaryLine }}
                          activeDot={{ r: 6, fill: CHART_COLORS.primaryLine, stroke: CHART_INK.surface, strokeWidth: 2 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <div style={{ height: '100%', display: 'grid', placeItems: 'center', color: 'var(--ink-3)' }}>
                      No trend data available
                    </div>
                  )}
                </div>

                <div className="an-chart-footer">
                  <span style={{ fontSize: '0.84rem', color: 'var(--ink-3)' }}>Velocity: {trend.trend.direction}</span>
                  <button
                    type="button"
                    className="an-chart-link"
                    onClick={() => navigate('/dashboard/analysis/monthly-spending')}
                  >
                    View detailed trend <ArrowRight size={14} />
                  </button>
                </div>
              </div>
            </div>
          </section>

          {/* 4. Spending Highlights (4 Compact Cards) */}
          <section className="an-section" aria-label="Spending highlights">
            <div className="an-section-header">
              <div className="an-section-title-group">
                <span className="an-section-icon"><TrendingUp size={18} /></span>
                <div>
                  <h2 className="an-section-title">Spending Highlights & Metrics</h2>
                  <p className="an-section-desc">Key drivers, category concentrations, and budget compliance metrics.</p>
                </div>
              </div>
            </div>

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
                    <div className="an-highlight-value" title={item.value}>
                      {item.value}
                    </div>
                    <div className="an-highlight-sub">{item.sub}</div>
                  </div>
                )
              })}
            </div>
          </section>

          {/* 5. AI Risk & Anomaly Analysis (Individual Modular Cards) */}
          <section className="an-section" aria-label="AI risk analysis">
            <div className="an-section-header">
              <div className="an-section-title-group">
                <span className="an-section-icon"><ShieldAlert size={18} /></span>
                <div>
                  <h2 className="an-section-title">AI Risk & Anomaly Analysis</h2>
                  <p className="an-section-desc">
                    Identified spending anomalies, compliance gaps, and category concentration risks.
                  </p>
                </div>
              </div>
            </div>

            <div className="an-risk-grid">
              {ai.insights && ai.insights.length ? (
                ai.insights.map((item, index) => {
                  const sev = item.severity === 'high' || item.severity === 'medium' ? item.severity : 'low'
                  const meta = SEVERITY_META[sev]
                  const Icon = meta.Icon

                  return (
                    <div key={`${item.title}-${index}`} className={`an-risk-card ${meta.colorClass}`}>
                      <div className="an-risk-card-head">
                        <h3 className="an-risk-card-title">{item.title}</h3>
                        <span className={`an-chip ${sev}`}>
                          <Icon size={12} style={{ display: 'inline', marginRight: '4px', verticalAlign: '-1px' }} />
                          {meta.label}
                        </span>
                      </div>

                      {item.why ? (
                        <p className="an-risk-why">
                          <span className="an-risk-why-tag">Why:</span>
                          {item.why}
                        </p>
                      ) : null}

                      {item.detail ? (
                        <p className="an-risk-detail">{item.detail}</p>
                      ) : null}
                    </div>
                  )
                })
              ) : (
                <div className="an-card" style={{ gridColumn: '1 / -1', textAlign: 'center', color: 'var(--ink-3)' }}>
                  No risks or anomalies detected for this period.
                </div>
              )}
            </div>
          </section>

          {/* 6. AI Strategic Recommendations (List of Recommendation Cards) */}
          <section className="an-section" aria-label="AI recommendations">
            <div className="an-section-header">
              <div className="an-section-title-group">
                <span className="an-section-icon"><Lightbulb size={18} /></span>
                <div>
                  <h2 className="an-section-title">AI Strategic Recommendations</h2>
                  <p className="an-section-desc">
                    Actionable steps to optimize budget allocation, mitigate risks, and enhance audit compliance.
                  </p>
                </div>
              </div>
            </div>

            <div className="an-reco-grid">
              {normalizedRecommendations.map((rec, index) => {
                const sev = rec.priority === 'High' ? 'danger' : rec.priority === 'Medium' ? 'warning' : 'positive'
                return (
                  <div key={`${rec.title}-${index}`} className="an-reco-card">
                    <div className="an-reco-card-top">
                      <span className="an-reco-icon-wrap">
                        <Lightbulb size={18} />
                      </span>
                      <span className={`an-chip ${sev}`}>{rec.priority} Priority</span>
                    </div>

                    <div>
                      <h3 className="an-reco-title">{rec.title}</h3>
                      <p className="an-reco-desc" style={{ marginTop: '8px' }}>
                        {rec.description}
                      </p>
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
          </section>
        </>
      )}
    </AnalysisLayout>
  )
}
