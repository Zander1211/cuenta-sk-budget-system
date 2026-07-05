import { useCallback, useEffect, useMemo, useState } from 'react'
import { Wallet, Receipt, PieChart, ClipboardCheck } from 'lucide-react'
import RoleGate from '../components/RoleGate'
import { useBudget, useBudgetCalculations } from '../context/BudgetContext'
import { supabase } from '../supabase/supabaseClient'


const monthOptions = [
  { value: 1, label: 'January' },
  { value: 2, label: 'February' },
  { value: 3, label: 'March' },
  { value: 4, label: 'April' },
  { value: 5, label: 'May' },
  { value: 6, label: 'June' },
  { value: 7, label: 'July' },
  { value: 8, label: 'August' },
  { value: 9, label: 'September' },
  { value: 10, label: 'October' },
  { value: 11, label: 'November' },
  { value: 12, label: 'December' },
]
function parseDate(value) {
  if (!value) return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed
}

const currency = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  maximumFractionDigits: 0,
})

const shortDate = new Intl.DateTimeFormat('en-PH', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
})

const categoryPalette = ['#ff6b3d', '#6de3b7', '#0f1f36', '#f59e0b', '#4b8bd8']
const severityLabel = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
}

const normalizeSeverity = (value) => {
  if (value === 'high' || value === 'medium' || value === 'low') {
    return value
  }
  return 'low'
}

const normalizeAiResponse = (payload) => {
  if (!payload || typeof payload !== 'object') {
    return {
      summary: '',
      insights: [],
      alerts: [],
      recommendations: [],
      updatedAt: null,
    }
  }

  const insights = Array.isArray(payload.insights) ? payload.insights : []
  const alerts = Array.isArray(payload.alerts) ? payload.alerts : []
  const recommendations = Array.isArray(payload.recommendations) ? payload.recommendations : []

  return {
    summary: typeof payload.summary === 'string' ? payload.summary : '',
    insights: insights.map((item) => ({
      title: item.title || item.headline || 'Insight',
      detail: item.detail || item.description || '',
      severity: normalizeSeverity(item.severity || item.level),
    })),
    alerts: alerts.map((item) => ({
      title: item.title || item.headline || 'Alert',
      detail: item.detail || item.description || '',
      severity: normalizeSeverity(item.severity || item.level),
      date: item.date || item.when || null,
    })),
    recommendations: recommendations.map((item) => ({
      title: item.title || item.headline || 'Recommendation',
      detail: item.detail || item.description || '',
      severity: normalizeSeverity(item.severity || item.level),
    })),
    updatedAt: payload.updatedAt || payload.updated_at || null,
  }
}

function AiAnalysisPage() {
  const { budgets, expenses, requests, totals } = useBudget()
  const [aiState, setAiState] = useState({
    status: 'idle',
    summary: '',
    insights: [],
    alerts: [],
    recommendations: [],
    updatedAt: null,
  })
  const [aiError, setAiError] = useState('')


  const [viewMode, setViewMode] = useState('monthly')
  const currentDate = new Date()
  const currentYear = currentDate.getFullYear()
  const currentMonth = currentDate.getMonth() + 1
  const [selectedMonth, setSelectedMonth] = useState(currentMonth)
  const [selectedYear, setSelectedYear] = useState(currentYear)

  const availableYears = useMemo(() => {
    const years = new Set([currentYear])
    budgets.forEach((budget) => {
      if (Number.isFinite(budget.year)) {
        years.add(budget.year)
        return
      }
      const createdDate = parseDate(budget.createdAt)
      if (createdDate) years.add(createdDate.getFullYear())
    })
    return Array.from(years).sort((a, b) => a - b)
  }, [budgets, currentYear])

  useEffect(() => {
    if (!availableYears.length) return
    if (!availableYears.includes(selectedYear)) {
      setSelectedYear(availableYears[availableYears.length - 1])
    }
  }, [availableYears, selectedYear])

  const periodLabel = viewMode === 'monthly' ? `${monthOptions.find(m => m.value === selectedMonth)?.label} ${selectedYear}` : `${selectedYear}`
  const periodDescriptor = viewMode === 'monthly' ? 'month' : 'year'

  function isInPeriod(dateValue) {
    const date = parseDate(dateValue)
    if (!date) return false
    if (viewMode === 'monthly') {
      const month = date.getMonth() + 1
      return date.getFullYear() === selectedYear && month === selectedMonth
    }
    return date.getFullYear() === selectedYear
  }

  const targetMonth = viewMode === 'monthly' ? selectedMonth : null
  const { totalBudget, totalExpenses, remainingBalance: remainingBudget, hasBudgetData } = useBudgetCalculations(targetMonth, selectedYear)
  const usedPercentOld = totalBudget > 0 ? Math.min(100, Math.round((totalExpenses / totalBudget) * 100)) : 0
  const remainingPercent = totalBudget > 0 ? Math.max(0, 100 - usedPercentOld) : 0

  const filteredRequests = requests.filter((request) => isInPeriod(request.submittedAt || request.createdAt || request.eventDate))
  const pendingCount = filteredRequests.filter(req => (!req.status || req.status === 'Pending') && !req.archivedAt).length

  const summaryCards = [
    {
      label: 'Total Budget',
      value: currency.format(totalBudget),
      meta: hasBudgetData ? `Allocated for ${periodLabel}` : 'No budget entries yet',
      chip: hasBudgetData ? (viewMode === 'monthly' ? 'Monthly' : 'Yearly') : 'Empty',
      tone: hasBudgetData ? 'positive' : 'neutral',
    },
    {
      label: 'Total Expenses',
      value: currency.format(totalExpenses),
      meta: totalExpenses ? `Approved requests in ${periodLabel}` : 'No expenses recorded',
      chip: hasBudgetData ? `${usedPercentOld}% used` : 'Awaiting data',
      tone: usedPercentOld > 80 ? 'warning' : 'positive',
    },
    {
      label: 'Remaining Budget',
      value: currency.format(remainingBudget),
      meta: hasBudgetData ? 'Updated from approvals' : 'Add a budget to start',
      chip: hasBudgetData ? `${remainingPercent}% left` : 'Not started',
      tone: remainingPercent < 20 ? 'warning' : 'neutral',
    },
    {
      label: 'Pending Approvals',
      value: String(pendingCount),
      meta: pendingCount ? 'Awaiting review' : 'No pending requests',
      chip: pendingCount ? 'Action needed' : 'Clear',
      tone: pendingCount ? 'warning' : 'positive',
    },
  ]

  const categoryShare = hasBudgetData
    ? [
      { label: 'Operations', percent: 50, tone: 'blue' },
      { label: 'Events', percent: 30, tone: 'mint' },
      { label: 'Programs', percent: 20, tone: 'sun' },
    ]
    : [
      { label: 'Operations', percent: 0, tone: 'blue' },
      { label: 'Events', percent: 0, tone: 'mint' },
      { label: 'Programs', percent: 0, tone: 'sun' },
    ]

  const trendValues = hasBudgetData ? [0.18, 0.28, 0.24, 0.42, 0.6, 0.78] : [0, 0, 0, 0, 0, 0]
  const trendPoints = trendValues.map((value, index) => {
    const x = (index / (trendValues.length - 1)) * 100
    const y = 100 - value * 100
    return `${x},${y}`
  }).join(' ')

  const pendingRequests = useMemo(
    () =>
      requests.filter(
        (request) => request.status === 'Pending' && !request.archivedAt
      ),
    [requests]
  )

  const activeExpenses = useMemo(
    () => expenses.filter((e) => !e.archivedAt && e.status !== 'Cancelled'),
    [expenses]
  )

  const categoryTotals = useMemo(() => {
    const totalsByCategory = new Map()
    activeExpenses.forEach((expense) => {
      const category = expense.category || 'Other'
      totalsByCategory.set(
        category,
        (totalsByCategory.get(category) || 0) + Number(expense.amount || 0)
      )
    })
    return Array.from(totalsByCategory, ([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5)
  }, [expenses])

  const projectTotals = useMemo(() => {
    const totalsByProject = new Map()
    activeExpenses.forEach((expense) => {
      const project = expense.project || expense.event || 'Unlabeled'
      totalsByProject.set(
        project,
        (totalsByProject.get(project) || 0) + Number(expense.amount || 0)
      )
    })
    return Array.from(totalsByProject, ([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5)
  }, [expenses])

  const spendingPercent = totals.totalBudget
    ? Math.round((totals.totalExpenses / totals.totalBudget) * 100)
    : 0
  const usedPercent = Math.min(100, Math.max(0, spendingPercent))

  const missingDocsCount = useMemo(
    () =>
      activeExpenses.filter(
        (expense) => !expense.receiptUrl && !expense.receiptName
      ).length,
    [activeExpenses]
  )

  const spendingTrend = useMemo(() => {
    const now = Date.now()
    const last30Start = now - 1000 * 60 * 60 * 24 * 30
    const prev30Start = now - 1000 * 60 * 60 * 24 * 60
    let last30 = 0
    let prev30 = 0

    activeExpenses.forEach((expense) => {
      const dateValue = new Date(
        expense.date || expense.approvedAt || 0
      ).getTime()
      if (!dateValue) {
        return
      }
      if (dateValue >= last30Start) {
        last30 += Number(expense.amount || 0)
      } else if (dateValue >= prev30Start) {
        prev30 += Number(expense.amount || 0)
      }
    })

    if (!last30 && !prev30) {
      return { label: 'No data', delta: 0 }
    }

    if (!prev30) {
      return { label: 'Increasing', delta: 100 }
    }

    const change = ((last30 - prev30) / prev30) * 100
    if (Math.abs(change) < 5) {
      return { label: 'Stable', delta: 0 }
    }
    return { label: change > 0 ? 'Increasing' : 'Decreasing', delta: change }
  }, [activeExpenses])

  const runwayMonths = useMemo(() => {
    const dates = activeExpenses
      .map((expense) =>
        new Date(expense.date || expense.approvedAt || 0).getTime()
      )
      .filter((value) => value)
    if (!dates.length || !totals.totalExpenses) {
      return null
    }

    const earliest = Math.min(...dates)
    const monthsActive = Math.max(
      1,
      (Date.now() - earliest) / (1000 * 60 * 60 * 24 * 30)
    )
    const avgMonthly = totals.totalExpenses / monthsActive
    if (!avgMonthly) {
      return null
    }

    return totals.remaining / avgMonthly
  }, [activeExpenses, totals])

  const fallbackInsights = useMemo(() => {
    const insights = []
    const topCategory = categoryTotals[0]
    const runway = runwayMonths

    if (spendingPercent >= 85) {
      insights.push({
        title: 'High spending detected',
        detail: `Total expenses have reached ${usedPercent}% of the allocated budget.`,
        severity: 'high',
      })
    } else if (spendingPercent >= 65) {
      insights.push({
        title: 'Spending is accelerating',
        detail: `You have used ${usedPercent}% of the budget so far.`,
        severity: 'medium',
      })
    } else {
      insights.push({
        title: 'Budget is on track',
        detail: `${usedPercent}% of the budget has been used to date.`,
        severity: 'low',
      })
    }

    if (topCategory) {
      insights.push({
        title: 'Top spending category',
        detail: `${topCategory.name} accounts for ${currency.format(
          topCategory.value
        )} in expenses.`,
        severity: 'medium',
      })
    }

    if (missingDocsCount > 0) {
      insights.push({
        title: 'Documents missing',
        detail: `${missingDocsCount} expenses do not have receipts attached.`,
        severity: 'medium',
      })
    } else {
      insights.push({
        title: 'Documentation healthy',
        detail: 'All recorded expenses include receipt references.',
        severity: 'low',
      })
    }

    if (runway !== null) {
      const runwayLabel = runway <= 0 ? 0 : runway
      insights.push({
        title: 'Budget runway',
        detail: `Current spend rate gives about ${runwayLabel.toFixed(
          1
        )} months of runway.`,
        severity: runwayLabel < 2 ? 'high' : runwayLabel < 4 ? 'medium' : 'low',
      })
    }

    return insights.slice(0, 4)
  }, [categoryTotals, missingDocsCount, runwayMonths, spendingPercent, usedPercent])

  const fallbackAlerts = useMemo(() => {
    const today = shortDate.format(new Date())
    const topProject = projectTotals[0]
    const alerts = []

    if (topProject) {
      alerts.push({
        title: 'Top project spending',
        detail: `${topProject.name} has reached ${currency.format(
          topProject.value
        )} in expenses.`,
        severity: 'medium',
        date: today,
      })
    }

    if (missingDocsCount > 0) {
      alerts.push({
        title: 'Missing receipts',
        detail: `${missingDocsCount} expenses are missing documentation.`,
        severity: 'high',
        date: today,
      })
    }

    if (spendingPercent >= 85) {
      alerts.push({
        title: 'Overspending risk',
        detail: `Budget utilization is at ${usedPercent}% of the allocation.`,
        severity: 'high',
        date: today,
      })
    }

    return alerts.slice(0, 3)
  }, [missingDocsCount, projectTotals, spendingPercent, usedPercent])

  const fallbackRecommendations = useMemo(() => {
    const recs = []

    if (spendingPercent >= 85) {
      recs.push({
        title: 'Implement immediate spending freeze',
        detail: 'Halt all non-essential expenditures to ensure funds remain for critical operations.',
        severity: 'high',
      })
    } else if (spendingPercent >= 65) {
      recs.push({
        title: 'Review upcoming allocations',
        detail: 'Analyze projected costs for the next month to avoid exceeding the budget limit.',
        severity: 'medium',
      })
    } else {
      recs.push({
        title: 'Maintain current spending pace',
        detail: 'Current budget utilization is healthy. Continue monitoring expenses regularly.',
        severity: 'low',
      })
    }

    if (missingDocsCount > 0) {
      recs.push({
        title: 'Enforce documentation policy',
        detail: 'Require receipts for all pending and future reimbursements to improve auditability.',
        severity: 'medium',
      })
    }

    if (runwayMonths !== null && runwayMonths < 3) {
      recs.push({
        title: 'Explore cost-saving measures',
        detail: 'Negotiate with frequent vendors or defer low-priority projects to extend budget runway.',
        severity: 'high',
      })
    }

    return recs.slice(0, 4)
  }, [missingDocsCount, spendingPercent, runwayMonths])

  const aiPayload = useMemo(
    () => ({
      totals,
      pendingApprovals: pendingRequests.length,
      topCategories: categoryTotals,
      topProjects: projectTotals,
      missingDocuments: missingDocsCount,
      spendingTrend: spendingTrend.label,
      spendingTrendDelta: spendingTrend.delta,
      recentExpenses: activeExpenses.slice(0, 8).map((expense) => ({
        project: expense.project || expense.event || 'Unlabeled',
        category: expense.category || 'Other',
        amount: Number(expense.amount || 0),
        date: expense.date || expense.approvedAt,
      })),
      budgets: budgets.map((budget) => ({
        month: budget.month,
        year: budget.year,
        amount: Number(budget.amount || 0),
        createdAt: budget.createdAt,
      })),
    }),
    [
      budgets,
      categoryTotals,
      activeExpenses,
      missingDocsCount,
      pendingRequests.length,
      projectTotals,
      spendingTrend,
      totals,
    ]
  )

  const runAiAnalysis = useCallback(async () => {
    setAiError('')
    setAiState((prev) => ({ ...prev, status: 'loading' }))

    const { data, error } = await supabase.functions.invoke('ai-analysis', {
      body: aiPayload,
    })

    if (error) {
      setAiState((prev) => ({ ...prev, status: 'error' }))
      setAiError('Unable to reach AI service. Showing local insights.')
      return
    }

    const normalized = normalizeAiResponse(data)
    setAiState({
      status: 'ready',
      summary: normalized.summary,
      insights: normalized.insights,
      alerts: normalized.alerts,
      recommendations: normalized.recommendations,
      updatedAt: normalized.updatedAt,
    })
  }, [aiPayload])

  useEffect(() => {
    runAiAnalysis()
  }, [runAiAnalysis])

  const insights = aiState.insights.length ? aiState.insights : fallbackInsights
  const alerts = aiState.alerts.length ? aiState.alerts : fallbackAlerts
  const recommendations = aiState.recommendations.length ? aiState.recommendations : fallbackRecommendations
  const aiStatusLabel =
    aiState.status === 'loading'
      ? 'Generating analysis...'
      : aiState.status === 'error'
        ? 'AI service unavailable'
        : aiState.updatedAt
          ? `Updated ${shortDate.format(new Date(aiState.updatedAt))}`
          : 'Ready for analysis'

  const maxProjectValue = projectTotals[0]?.value || 0

  return (
    <RoleGate allow={['SK Chairman', 'SK Treasurer', 'Barangay Treasurer', 'SK Kagawad']}>
      <header className="dashboard-header">
        <div className="header-left">
          <div>
            <p className="eyebrow">AI Insights</p>
            <h1>Financial intelligence</h1>
            <p>Automated analysis of spending patterns and budget risks.</p>
          </div>
        </div>
      </header>

      <section className="dashboard-content ai-dashboard">

        <section className="dashboard-filters" aria-label="Budget filters" style={{ marginBottom: '24px' }}>
          <div className="filter-group">
            <span className="filter-label">View</span>
            <div className="filter-toggle">
              <button
                type="button"
                className={`filter-toggle-btn ${viewMode === 'monthly' ? 'is-active' : ''}`}
                onClick={() => setViewMode('monthly')}
              >
                Monthly Budget
              </button>
              <button
                type="button"
                className={`filter-toggle-btn ${viewMode === 'yearly' ? 'is-active' : ''}`}
                onClick={() => setViewMode('yearly')}
              >
                Yearly Budget
              </button>
            </div>
          </div>
          <div className="filter-group">
            <span className="filter-label">Month</span>
            <select
              className="panel-select"
              value={selectedMonth}
              onChange={(event) => setSelectedMonth(Number(event.target.value))}
              disabled={viewMode === 'yearly'}
            >
              {monthOptions.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>
          <div className="filter-group">
            <span className="filter-label">Year</span>
            <span className="filter-year">{selectedYear}</span>
          </div>
        </section>

        <section className="summary-grid" style={{ marginBottom: '24px' }}>
          {summaryCards.map((card) => {
            const Icon = card.label === 'Total Budget' ? Wallet : card.label === 'Total Expenses' ? Receipt : card.label === 'Remaining Budget' ? PieChart : ClipboardCheck
            return (
              <div key={card.label} className="summary-card">
                <div className="summary-header">
                  <div className="summary-icon"><Icon size={18} /></div>
                  <span className={`summary-chip ${card.tone}`}>{card.chip}</span>
                </div>
                <div className="summary-body">
                  <span className="summary-label">{card.label}</span>
                  <span className="summary-value">{card.value}</span>
                </div>
                <span className="summary-meta">{card.meta}</span>
              </div>
            )
          })}
        </section>

        <section className="dashboard-panels single" style={{ marginBottom: '24px' }}>
          <div className="panel-card">
            <div className="panel-header">
              <div>
                <p className="panel-eyebrow">Spending Overview</p>
                <h2>Category share</h2>
              </div>
              <span className="panel-period">{periodLabel}</span>
            </div>
            <div className="spending-grid">
              <div className="donut-wrap">
                <div className={`donut ${hasBudgetData ? '' : 'is-empty'}`} style={{ '--donut-value': usedPercentOld }}>
                  <div className="donut-center">
                    <span className="donut-value">{usedPercentOld}%</span>
                    <span className="donut-label">used</span>
                  </div>
                </div>
                <div className="category-list">
                  {categoryShare.map((item) => (
                    <div key={item.label} className="category-row">
                      <span className={`category-dot ${item.tone}`} />
                      <span className="category-name">{item.label}</span>
                      <span className="category-value">{item.percent}%</span>
                    </div>
                  ))}
                  <p className="category-meta">
                    Total Expenses ({periodLabel}): {currency.format(totalExpenses)}
                  </p>
                </div>
              </div>
              <div className="trend-wrap">
                <div className="trend-header">
                  <span>Monthly Trend</span>
                  <span className={`trend-badge ${hasBudgetData ? 'positive' : 'neutral'}`}>
                    {hasBudgetData ? 'Updated' : 'Awaiting data'}
                  </span>
                </div>
                <div className={`trend-chart ${hasBudgetData ? '' : 'is-empty'}`}>
                  <svg viewBox="0 0 100 100" preserveAspectRatio="none">
                    <polyline points={trendPoints} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <div className="trend-foot">
                  <span>Jan</span>
                  <span>Jun</span>
                </div>
              </div>
            </div>
          </div>
        </section>
        <div className="ai-main-grid">


          <div className="overview-card" style={{ gridColumn: "1 / -1" }}>            <div className="ai-card-header">
            <div>
              <p className="eyebrow">AI Insights</p>
              <h2>Risk and recommendations</h2>
              <p className="ai-status">{aiStatusLabel}</p>
              {aiState.summary ? (
                <p className="ai-summary">{aiState.summary}</p>
              ) : null}
            </div>
            <span className="ai-chip ai-chip-accent">Powered by AI</span>
          </div>
            <div style={{ marginTop: '16px', padding: '16px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px' }}>
              <h3 style={{ fontSize: '14px', fontWeight: '600', color: '#334155', margin: 0 }}>Risk Level Guide</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '16px' }}>
                <div style={{ padding: '12px', background: 'white', borderRadius: '6px', borderLeft: '4px solid #ef4444', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <span style={{ height: '10px', width: '10px', borderRadius: '50%', background: '#ef4444' }}></span>
                    <strong style={{ fontSize: '13px', color: '#b91c1c' }}>High Risk</strong>
                  </div>
                  <p style={{ fontSize: '12px', color: '#475569', margin: 0, lineHeight: '1.4' }}>Indicates that the project or event has a high likelihood of exceeding its allocated budget or experiencing significant financial issues.</p>
                </div>
                <div style={{ padding: '12px', background: 'white', borderRadius: '6px', borderLeft: '4px solid #f59e0b', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <span style={{ height: '10px', width: '10px', borderRadius: '50%', background: '#f59e0b' }}></span>
                    <strong style={{ fontSize: '13px', color: '#b45309' }}>Medium Risk</strong>
                  </div>
                  <p style={{ fontSize: '12px', color: '#475569', margin: 0, lineHeight: '1.4' }}>Indicates that the project or event is currently within an acceptable budget range but requires close monitoring.</p>
                </div>
                <div style={{ padding: '12px', background: 'white', borderRadius: '6px', borderLeft: '4px solid #10b981', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <span style={{ height: '10px', width: '10px', borderRadius: '50%', background: '#10b981' }}></span>
                    <strong style={{ fontSize: '13px', color: '#047857' }}>Low Risk</strong>
                  </div>
                  <p style={{ fontSize: '12px', color: '#475569', margin: 0, lineHeight: '1.4' }}>Indicates that the project or event is being managed efficiently and is well within its allocated budget.</p>
                </div>
              </div>
            </div>
            <div className="ai-insight-list">
              {insights.map((item, index) => (
                <div
                  key={`${item.title}-${index}`}
                  className={`ai-insight-item ${item.severity}`}
                >
                  <div className="ai-insight-head">
                    <span className="ai-insight-title">{item.title}</span>
                    <span
                      className={`ai-severity ai-severity-${item.severity}`}
                    >
                      {severityLabel[item.severity]}
                    </span>
                  </div>
                  <p className="ai-insight-detail">{item.detail}</p>
                </div>
              ))}
            </div>
            <div className="ai-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={runAiAnalysis}
                disabled={aiState.status === 'loading'}
              >
                Refresh Analysis
              </button>
              {aiError ? <span className="ai-status error">{aiError}</span> : null}
            </div>
          </div>

          <div className="overview-card" style={{ gridColumn: '1 / -1' }}>
            <div className="ai-card-header">
              <div>
                <p className="eyebrow">Budget Management</p>
                <h2>AI Recommendations</h2>
                <p>Suggested actions to optimize spending and prevent overspending.</p>
              </div>
              <span className="ai-chip">Actionable</span>
            </div>
            <div className="ai-insight-list" style={{ marginTop: '1rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
              {recommendations.length ? (
                recommendations.map((item, index) => (
                  <div
                    key={`${item.title}-${index}`}
                    className={`ai-insight-item ${item.severity}`}
                    style={{ borderLeft: `4px solid var(--${item.severity === 'high' ? 'cherry' : item.severity === 'medium' ? 'sun' : 'ocean'})`, background: 'var(--surface-sunken)', padding: '1rem', borderRadius: '8px' }}
                  >
                    <div className="ai-insight-head" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                      <span className="ai-insight-title" style={{ fontWeight: '600' }}>{item.title}</span>
                      <span
                        className={`ai-severity ai-severity-${item.severity}`}
                      >
                        {severityLabel[item.severity]}
                      </span>
                    </div>
                    <p className="ai-insight-detail" style={{ fontSize: '0.9rem', color: 'var(--ink-soft)', margin: 0 }}>{item.detail}</p>
                  </div>
                ))
              ) : (
                <p className="ai-empty">No recommendations available.</p>
              )}
            </div>
          </div>
        </div>

        <div className="ai-mini-grid">
          <div className="stat-card ai-mini-card">
            <span className="ai-mini-title">Overspending Risk</span>
            <span className="ai-mini-value">
              {spendingPercent >= 85
                ? 'High'
                : spendingPercent >= 65
                  ? 'Medium'
                  : 'Low'}
            </span>
            <span className="ai-mini-meta">
              {usedPercent}% budget used
            </span>
          </div>
          <div className="stat-card ai-mini-card">
            <span className="ai-mini-title">Missing Documents</span>
            <span className="ai-mini-value">{missingDocsCount}</span>
            <span className="ai-mini-meta">Expenses without receipts</span>
          </div>
          <div className="stat-card ai-mini-card">
            <span className="ai-mini-title">Spending Trend</span>
            <span className="ai-mini-value">{spendingTrend.label}</span>
            <span className="ai-mini-meta">
              {spendingTrend.delta
                ? `${Math.abs(Math.round(spendingTrend.delta))}% from last month`
                : 'Flat vs last month'}
            </span>
          </div>
        </div>

        <div className="ai-bottom-grid">
          <div className="overview-card">
            <div className="ai-card-header">
              <div>
                <p className="eyebrow">Recent AI Alerts</p>
                <h2>Highlighted risks</h2>
              </div>
              <span className="ai-chip">Alerts</span>
            </div>
            <div className="ai-alerts-list">
              {alerts.length ? (
                alerts.map((alert, index) => (
                  <div className="ai-alert-item" key={`${alert.title}-${index}`}>
                    <div className="ai-alert-head">
                      <span className="ai-alert-title">{alert.title}</span>
                      <span
                        className={`ai-severity ai-severity-${alert.severity}`}
                      >
                        {severityLabel[alert.severity]}
                      </span>
                    </div>
                    <p className="ai-alert-detail">{alert.detail}</p>
                    <div className="ai-alert-meta">
                      <span>{alert.date || shortDate.format(new Date())}</span>
                    </div>
                  </div>
                ))
              ) : (
                <p className="ai-empty">No alerts yet.</p>
              )}
            </div>
          </div>

          <div className="overview-card">
            <div className="ai-card-header">
              <div>
                <p className="eyebrow">Top Spending by Project</p>
                <h2>Largest allocations</h2>
              </div>
              <span className="ai-chip">Projects</span>
            </div>
            <div className="ai-bars">
              {projectTotals.length ? (
                projectTotals.map((project) => (
                  <div className="ai-bar-row" key={project.name}>
                    <div className="ai-bar-head">
                      <span>{project.name}</span>
                      <span>{currency.format(project.value)}</span>
                    </div>
                    <div className="ai-bar">
                      <div
                        className="ai-bar-fill"
                        style={{
                          width: maxProjectValue
                            ? `${(project.value / maxProjectValue) * 100}%`
                            : '0%',
                        }}
                      />
                    </div>
                  </div>
                ))
              ) : (
                <p className="ai-empty">No project expenses yet.</p>
              )}
            </div>
          </div>
        </div>
      </section>
    </RoleGate>
  )
}

export default AiAnalysisPage
