import { useMemo, useState } from 'react'
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
  PieChart as PieChartIcon,
  FileText,
  Bot,
  LayoutDashboard,
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
import { Accordion, AccordionSection } from '../../components/analysis/AnalysisAccordion'
import { buildOverviewInsights, rollUpHealth } from '../../utils/insights'
import {
  formatCurrency,
  formatPercentage,
  periodLabel,
  CHART_COLORS,
  CHART_INK,
  pesoTick,
  assignCategoryColors,
  isMissingReceipt,
} from '../../utils/analytics'


const BREADCRUMB = [{ label: 'Home', to: '/dashboard' }, { label: 'Financial Analysis' }]

const SEVERITY_META = {
  // `colorClass` drives the card's left-border accent (`.an-risk-card.high`
  // etc.); `chipTone` is separate because `.an-chip` only ships danger/
  // warning/positive/neutral variants, not high/medium/low ones.
  high: { label: 'High Risk', Icon: AlertTriangle, colorClass: 'high', chipTone: 'danger' },
  medium: { label: 'Medium Risk', Icon: Info, colorClass: 'medium', chipTone: 'warning' },
  low: { label: 'Low Risk', Icon: CheckCircle2, colorClass: 'low', chipTone: 'positive' },
}

export default function AnalysisOverviewPage({ embedded = false }) {
  const navigate = useNavigate()
  const { filters, setFilter } = useAnalysisFilters()

  // Which report is expanded, or null for none. A single value rather than a
  // set: opening one collapses whatever was open, which is what keeps the page
  // to one report at a time.
  const [openSection, setOpenSection] = useState(null)

  function toggleSection(key) {
    setOpenSection((current) => (current === key ? null : key))
  }

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
        returnedBudget: Math.round(summary.returnedBudget || 0),
        returnedFromCompleted: summary.returnedRecordCount || 0,
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

  // Top 4 summary metric cards for desktop (4-col), tablet (2-col), mobile (1-col).
  //
  // Scoped to one project these report that record's own budget against its
  // verified spending, so they agree with Projects & Events and the record
  // analysis. At period level they report how much of the monthly envelope has
  // been committed — a different question, so it is labelled as commitment
  // rather than as spending.
  const metricCards = summary.isProjectScoped
    ? [
        {
          icon: Wallet,
          label: 'Approved Budget',
          value: formatCurrency(summary.totalBudget),
          meta: `Allocated to ${filters.project}`,
          tone: 'neutral',
        },
        {
          icon: Receipt,
          label: 'Actual Spending',
          value: formatCurrency(summary.totalExpenses),
          meta: 'From verified receipts',
          chip: summary.hasBudgetData ? `${formatPercentage(summary.utilizationRate, 0)} used` : null,
          tone: summary.performance.tone,
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
    : [
        {
          icon: Wallet,
          label: 'Total Budget',
          value: formatCurrency(summary.totalBudget),
          meta: `Allocated for ${label}`,
          tone: 'neutral',
        },
        {
          icon: Receipt,
          label: 'Approved Allocations',
          value: formatCurrency(summary.totalExpenses),
          meta: `${formatCurrency(summary.actualExpenses)} actually spent`,
          chip: summary.hasBudgetData ? `${formatPercentage(summary.utilizationRate, 0)} committed` : null,
          tone: summary.performance.tone,
        },
        {
          icon: PiggyBank,
          label: 'Uncommitted Budget',
          value: formatCurrency(summary.remainingBalance),
          meta: summary.remainingBalance < 0 ? 'Over budget' : 'Available to allocate',
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

  // Same insights, bucketed by severity — feeds the "High/Medium/Low Risk
  // Alerts" groups in the combined AI Risk & Strategic Analysis panel so each
  // group renders only the cards that belong to it.
  const insightsBySeverity = useMemo(() => {
    const buckets = { high: [], medium: [], low: [] }
    ai.insights.forEach((item) => {
      const sev = item.severity === 'high' || item.severity === 'medium' ? item.severity : 'low'
      buckets[sev].push(item)
    })
    return buckets
  }, [ai.insights])

  const overallHealth = useMemo(() => rollUpHealth({
    severityCounts,
    remainingBalance: summary.remainingBalance,
    utilizationRate: summary.utilizationRate,
  }), [severityCounts, summary.remainingBalance, summary.utilizationRate])

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

  // Receipt tracker: documentation status across the period's approved
  // allocations. `isMissingReceipt` is the same predicate the summary counts
  // with, so the tracker and the "missing receipts" metric never disagree.
  const receiptsTracker = useMemo(() => {
    const expenses = summary.periodExpenses || []
    let uploaded = 0
    let verified = 0
    let missing = 0
    let byProject = 0
    let byEvent = 0
    let byPayroll = 0

    expenses.forEach((e) => {
      if (isMissingReceipt(e)) {
        missing += 1
        return
      }
      uploaded += 1
      if (e.hasVerifiedReceipt) verified += 1
      if (e.type === 'Project') byProject += 1
      else if (e.type === 'Event') byEvent += 1
      else if (e.type === 'Payroll') byPayroll += 1
    })

    return {
      total: expenses.length,
      uploaded,
      verified,
      missing,
      pendingReview: Math.max(0, uploaded - verified),
      byProject,
      byEvent,
      byPayroll,
    }
  }, [summary.periodExpenses])

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
        label: summary.isProjectScoped ? 'Budget Utilization Rate' : 'Budget Committed Rate',
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

  const distPieData = useMemo(() => {
    const colorByName = assignCategoryColors(dist.distribution.map((d) => d.name))
    return dist.distribution.map((d) => ({
      name: d.name,
      value: d.value,
      count: d.count,
      color: colorByName.get(d.name),
    }))
  }, [dist.distribution])

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

  // The full financial picture for the period, in one readable list. Every
  // figure here is already on the page somewhere; this is the consolidated
  // read for anyone writing it up.
  const summaryReportRows = useMemo(() => {
    const rows = [
      { label: 'Reporting period', value: label },
      {
        label: summary.isProjectScoped ? 'Approved budget' : 'Total monthly budget',
        value: formatCurrency(summary.totalBudget),
      },
      { label: 'Approved allocations', value: formatCurrency(summary.totalApprovedAllocations) },
      { label: 'Actual spending (verified receipts)', value: formatCurrency(summary.actualExpenses) },
      {
        label: summary.isProjectScoped ? 'Remaining budget' : 'Uncommitted budget',
        value: formatCurrency(summary.remainingBalance),
        tone: summary.remainingBalance < 0 ? 'danger' : 'positive',
      },
      {
        label: summary.isProjectScoped ? 'Budget utilization rate' : 'Budget committed rate',
        value: formatPercentage(summary.utilizationRate, 1),
      },
      {
        label: 'Budget performance',
        value: summary.performance.label,
        tone: summary.performance.tone,
      },
      {
        label: 'Unused budget recovered',
        value: `${formatCurrency(summary.returnedBudget || 0)}${summary.returnedRecordCount ? ` (${summary.returnedRecordCount} completed)` : ''}`,
      },
      { label: 'Approved records in period', value: String(summary.approvedBudgetRecords.length) },
      { label: 'Categories funded', value: String(dist.distribution.length) },
      {
        label: 'Pending approvals',
        value: String(summary.pendingRequests.length),
        tone: summary.pendingRequests.length > 0 ? 'warning' : 'positive',
      },
      {
        label: 'Missing receipts',
        value: String(summary.missingReceipts),
        tone: summary.missingReceipts > 0 ? 'danger' : 'positive',
      },
      { label: 'Spending trend', value: trend.trend.direction },
      {
        label: 'Highest allocation category',
        value: dist.distribution.length ? dist.distribution[0].name : 'None',
      },
    ]
    return rows
  }, [summary, dist.distribution, trend.trend.direction, label])

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
          {data.count != null && (
            <p style={{ margin: '4px 0', fontSize: '13px', color: 'var(--cuenta-text-secondary)' }}>Projects/Events: <strong style={{ color: 'var(--cuenta-text-heading)' }}>{data.count}</strong></p>
          )}
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
      embedded={embedded}
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
                (summary.isProjectScoped
                  ? `For ${label}, ${filters.project} holds an approved budget of ${formatCurrency(summary.totalBudget)} with ${formatCurrency(summary.totalExpenses)} in verified spending (${formatPercentage(summary.utilizationRate, 1)} utilized), leaving ${formatCurrency(summary.remainingBalance)}.`
                  : `For ${label}, total allocated budget is ${formatCurrency(summary.totalBudget)} with ${formatCurrency(summary.totalExpenses)} committed to approved projects and events (${formatPercentage(summary.utilizationRate, 1)} committed) and ${formatCurrency(summary.actualExpenses)} actually spent against verified receipts.`)
                + ` ${severityCounts.high} high-priority, ${severityCounts.medium} medium-priority, and ${severityCounts.low} informational insights detected.`}
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

          {/* 3. Report accordion — one open at a time.
              Every chart, tracker and AI panel below the executive summary now
              lives in a collapsible row. Nothing was dropped: each panel keeps
              its own chart, its "view full report" link, and the period from
              the filter bar above. */}
          <Accordion label="Analytics reports">
            {/* AI Risk & Strategic Analysis — Risk & Anomaly Analysis and
                Strategic Recommendations combined into one report. They used
                to be two separate accordion rows; they read the same AI
                response and are always consulted together, so splitting them
                only cost an extra click. */}
            <AccordionSection
              id="an-acc-risk-strategic"
              icon={Bot}
              title="AI Risk & Strategic Analysis"
              description="AI-detected anomalies, compliance gaps, and strategic recommendations for this period."
              meta={`${ai.insights.length} ${ai.insights.length === 1 ? 'finding' : 'findings'} · ${normalizedRecommendations.length} ${normalizedRecommendations.length === 1 ? 'action' : 'actions'}`}
              open={openSection === 'risk-strategic'}
              onToggle={() => toggleSection('risk-strategic')}
            >
              <div className="an-acc-report">
                {/* AI Risk & Anomaly Analysis */}
                <div className="an-acc-subsection">
                  <div className="an-acc-subhead">
                    <span className="an-acc-subhead-icon"><ShieldAlert size={16} /></span>
                    <div>
                      <h3 className="an-acc-subhead-title">AI Risk &amp; Anomaly Analysis</h3>
                      <p className="an-acc-subhead-desc">
                        Identified spending anomalies, compliance gaps, and category concentration risks.
                      </p>
                    </div>
                  </div>

                  <div className="an-risk-glance">
                    <div className="an-risk-glance-item">
                      <span className="an-risk-glance-label">Risk Level</span>
                      <span className={`an-status-badge ${overallHealth.tone}`}>{overallHealth.label}</span>
                    </div>
                    <div className="an-risk-glance-item">
                      <span className="an-risk-glance-label">Budget Consumption Status</span>
                      <span className={`an-status-badge ${summary.performance.tone}`}>
                        {summary.performance.label} · {formatPercentage(summary.utilizationRate, 1)}
                      </span>
                    </div>
                  </div>

                  {ai.insights && ai.insights.length ? (
                    <>
                      <h4 className="an-risk-section-title">Detected Budget Anomalies</h4>
                      <div className="an-risk-groups">
                        {[
                          { key: 'high', label: 'High Risk Alerts', items: insightsBySeverity.high },
                          { key: 'medium', label: 'Medium Risk Alerts', items: insightsBySeverity.medium },
                          { key: 'low', label: 'Low Risk Status', items: insightsBySeverity.low },
                        ].map((group) => {
                          const meta = SEVERITY_META[group.key]
                          const GroupIcon = meta.Icon
                          return (
                            <div key={group.key} className="an-risk-group">
                              <div className="an-risk-group-head">
                                <span className={`an-chip ${meta.chipTone}`}>
                                  <GroupIcon size={12} style={{ display: 'inline', marginRight: '4px', verticalAlign: '-1px' }} />
                                  {group.label}
                                </span>
                                <span className="an-risk-group-count">{group.items.length}</span>
                              </div>

                              {group.items.length ? (
                                <div className="an-risk-grid">
                                  {group.items.map((item, index) => (
                                    <div key={`${item.title}-${index}`} className={`an-risk-card ${meta.colorClass}`}>
                                      <div className="an-risk-card-head">
                                        <h3 className="an-risk-card-title">{item.title}</h3>
                                        <span className={`an-chip ${meta.chipTone}`}>
                                          <GroupIcon size={12} style={{ display: 'inline', marginRight: '4px', verticalAlign: '-1px' }} />
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
                                  ))}
                                </div>
                              ) : (
                                <p className="an-risk-group-empty">No {group.label.toLowerCase()} for this period.</p>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </>
                  ) : (
                    <div className="an-card" style={{ textAlign: 'center', color: 'var(--ink-3)' }}>
                      No risks or anomalies detected for this period.
                    </div>
                  )}
                </div>

                {/* AI Strategic Recommendations */}
                <div className="an-acc-subsection">
                  <div className="an-acc-subhead">
                    <span className="an-acc-subhead-icon"><Lightbulb size={16} /></span>
                    <div>
                      <h3 className="an-acc-subhead-title">AI Strategic Recommendations</h3>
                      <p className="an-acc-subhead-desc">
                        Actionable steps to optimize budget allocation, mitigate risks, and enhance audit compliance.
                      </p>
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
                </div>
              </div>
            </AccordionSection>

            {/* Financial Analytics Dashboard — Budget vs Approved Allocations,
                Monthly Spending Trend, and Category Budget Distribution
                combined into one report. They used to be three separate
                accordion rows; they're the same three period charts a reader
                checks together, so splitting them only cost extra clicks. */}
            <AccordionSection
              id="an-acc-financial-dashboard"
              icon={LayoutDashboard}
              title="Financial Analytics Dashboard"
              description="Budget vs approved allocations, spending trend, and category distribution for this period."
              meta={label}
              open={openSection === 'financial-dashboard'}
              onToggle={() => toggleSection('financial-dashboard')}
            >
              <div className="an-acc-report">
                {/* Budget vs Approved Allocations */}
                <div className="an-acc-subsection">
                  <div className="an-acc-subhead">
                    <span className="an-acc-subhead-icon"><BarChart3 size={16} /></span>
                    <div>
                      <h3 className="an-acc-subhead-title">Budget vs Approved Allocations</h3>
                      <p className="an-acc-subhead-desc">
                        Allocated budget against approved disbursements, month by month.
                      </p>
                    </div>
                  </div>

                  <div className="an-chart-body">
                    {bvaData.length ? (
                      <ResponsiveContainer width="100%" height={280}>
                        <BarChart data={bvaData} margin={{ top: 8, right: 8, left: -8, bottom: 0 }} barGap={4}>
                          <CartesianGrid vertical={false} stroke={CHART_INK.grid} />
                          <XAxis dataKey="month" tick={{ fontSize: 12, fill: CHART_INK.tick }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fontSize: 11, fill: CHART_INK.tick }} axisLine={false} tickLine={false} tickFormatter={pesoTick} width={56} />
                          <Tooltip formatter={(v, k) => [formatCurrency(v), k]} cursor={{ fill: CHART_INK.cursor }} />
                          <Legend iconType="circle" iconSize={9} wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                          <Bar dataKey="Budget" fill={CHART_COLORS.budget} radius={[4, 4, 0, 0]} maxBarSize={28} />
                          <Bar dataKey="Spending" fill={CHART_COLORS.actual} radius={[4, 4, 0, 0]} maxBarSize={28} />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="an-chart-empty" style={{ minHeight: '200px' }}>
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

                {/* Monthly Spending Trend */}
                <div className="an-acc-subsection">
                  <div className="an-acc-subhead">
                    <span className="an-acc-subhead-icon"><TrendingUp size={16} /></span>
                    <div>
                      <h3 className="an-acc-subhead-title">Monthly Spending Trend</h3>
                      <p className="an-acc-subhead-desc">
                        Historical trajectory and disbursement momentum across the year.
                      </p>
                    </div>
                  </div>

                  <div className="an-chart-body">
                    {trendData.length ? (
                      <ResponsiveContainer width="100%" height={280}>
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
                      <div className="an-chart-empty" style={{ minHeight: '200px' }}>
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

                {/* Category Budget Distribution */}
                <div className="an-acc-subsection">
                  <div className="an-acc-subhead">
                    <span className="an-acc-subhead-icon"><PieChartIcon size={16} /></span>
                    <div>
                      <h3 className="an-acc-subhead-title">Category Budget Distribution</h3>
                      <p className="an-acc-subhead-desc">
                        How the approved budget for this period is split across categories.
                      </p>
                    </div>
                  </div>

                  <div className="an-chart-body">
                    {distPieData.length ? (
                      <div className="an-pie-inner">
                        <div style={{ height: '280px' }}>
                          <ResponsiveContainer width="100%" height={280}>
                            <PieChart>
                              <Pie
                                data={distPieData}
                                cx="50%"
                                cy="50%"
                                innerRadius={70}
                                outerRadius={115}
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
                        <div style={{ maxHeight: '280px', overflowY: 'auto', paddingRight: '8px' }}>
                          {renderDetailedLegend({ payload: distPieData.map(d => ({ value: d.name, color: d.color })) })}
                        </div>
                      </div>
                    ) : (
                      <div className="an-chart-empty" style={{ minHeight: '200px' }}>
                        No approved budget data available
                      </div>
                    )}
                  </div>

                  <div className="an-chart-footer" style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: '10px' }}>
                    {distAiSummary && (
                      <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--ink-2)', lineHeight: 1.5 }}>
                        <strong>AI Summary:</strong> {distAiSummary}
                      </p>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '0.84rem', color: 'var(--ink-3)' }}>Updated for {label}</span>
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
              </div>
            </AccordionSection>

            {/* Receipt Tracker */}
            <AccordionSection
              id="an-acc-receipts"
              icon={Receipt}
              title="Receipt Tracker"
              description="Supporting documentation status across the period's approved allocations."
              meta={receiptsTracker.missing > 0
                ? `${receiptsTracker.missing} missing`
                : receiptsTracker.total > 0 ? 'All documented' : 'No records'}
              open={openSection === 'receipts'}
              onToggle={() => toggleSection('receipts')}
            >
              <div className="an-acc-report">
                <div className="an-metric-grid">
                  <MetricCard
                    icon={Receipt}
                    label="Total Uploaded"
                    value={String(receiptsTracker.uploaded)}
                    meta={`${receiptsTracker.byProject} Project, ${receiptsTracker.byEvent} Event, ${receiptsTracker.byPayroll} Payroll`}
                    tone="neutral"
                  />
                  <MetricCard
                    icon={CheckCircle2}
                    label="Verified Receipts"
                    value={String(receiptsTracker.verified)}
                    meta="Approved and confirmed"
                    tone="positive"
                  />
                  <MetricCard
                    icon={Clock}
                    label="Pending Review"
                    value={String(receiptsTracker.pendingReview)}
                    meta="Uploaded but not yet verified"
                    tone={receiptsTracker.pendingReview > 0 ? 'warning' : 'positive'}
                  />
                  <MetricCard
                    icon={AlertTriangle}
                    label="Missing Receipts"
                    value={String(receiptsTracker.missing)}
                    meta="Expenses without documentation"
                    tone={receiptsTracker.missing > 0 ? 'danger' : 'positive'}
                  />
                </div>

                <div className="an-chart-footer" style={{ marginTop: '18px' }}>
                  <span style={{ fontSize: '0.84rem', color: 'var(--ink-3)' }}>
                    {receiptsTracker.total} approved {receiptsTracker.total === 1 ? 'record' : 'records'} for {label}
                  </span>
                  <button
                    type="button"
                    className="an-chart-link"
                    onClick={() => navigate('/dashboard/documents')}
                  >
                    View full report <ArrowRight size={14} />
                  </button>
                </div>
              </div>
            </AccordionSection>

            {/* Financial Summary Report */}
            <AccordionSection
              id="an-acc-summary-report"
              icon={FileText}
              title="Financial Summary Report"
              description="The complete financial picture for the selected period, with spending highlights."
              meta={label}
              open={openSection === 'summary-report'}
              onToggle={() => toggleSection('summary-report')}
            >
              <div className="an-highlight-grid" style={{ marginBottom: '22px' }}>
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

              <dl className="an-summary-rows">
                {summaryReportRows.map((row) => (
                  <div key={row.label} className="an-summary-row">
                    <dt>{row.label}</dt>
                    <dd className={row.tone || ''}>{row.value}</dd>
                  </div>
                ))}
              </dl>

              <div className="an-chart-footer" style={{ marginTop: '18px' }}>
                <span style={{ fontSize: '0.84rem', color: 'var(--ink-3)' }}>
                  {summary.isProjectScoped ? `Scoped to ${filters.project}` : 'All projects and events'}
                </span>
                <button
                  type="button"
                  className="an-chart-link"
                  onClick={() => navigate('/dashboard/analysis/budget-utilization')}
                >
                  View full report <ArrowRight size={14} />
                </button>
              </div>
            </AccordionSection>
          </Accordion>
        </>
      )}
    </AnalysisLayout>
  )
}
