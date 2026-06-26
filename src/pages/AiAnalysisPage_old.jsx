import { useCallback, useEffect, useMemo, useState } from 'react'
import RoleGate from '../components/RoleGate'
import { useBudget } from '../context/BudgetContext'
import { supabase } from '../supabase/supabaseClient'

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
    <RoleGate allow={['SK Chairman', 'SK Treasurer']}>
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
        <div className="stat-grid">
          <div className="stat-card">
            <span className="stat-title">Total Budget</span>
            <span className="stat-value">
              {currency.format(totals.totalBudget)}
            </span>
            <span className="stat-meta">Allocated for all projects</span>
          </div>
          <div className="stat-card">
            <span className="stat-title">Total Expenses</span>
            <span className="stat-value">
              {currency.format(totals.totalExpenses)}
            </span>
            <span className="stat-meta">
              {usedPercent}% of total budget used
            </span>
          </div>
          <div className="stat-card">
            <span className="stat-title">Remaining Balance</span>
            <span className="stat-value">
              {currency.format(totals.remaining)}
            </span>
            <span className="stat-meta">Updated from approvals</span>
          </div>
          <div className="stat-card">
            <span className="stat-title">Pending Approvals</span>
            <span className="stat-value">{pendingRequests.length}</span>
            <span className="stat-meta">Awaiting review</span>
          </div>
        </div>

        <div className="ai-main-grid">
          <div className="overview-card">
            <div className="ai-card-header">
              <div>
                <p className="eyebrow">Spending Overview</p>
                <h2>Category share</h2>
              </div>
              <span className="ai-chip">Live</span>
            </div>
            <div className="ai-spending-body">
              <div
                className="ai-donut"
                style={{ '--used-angle': `${usedPercent * 3.6}deg` }}
              >
                <div className="ai-donut-label">
                  <span className="ai-donut-percent">{usedPercent}%</span>
                  <span className="ai-donut-caption">Used</span>
                </div>
              </div>
              <div className="ai-legend">
                {categoryTotals.length ? (
                  categoryTotals.map((category, index) => (
                    <div className="ai-legend-item" key={category.name}>
                      <div className="ai-legend-left">
                        <span
                          className="ai-legend-dot"
                          style={{
                            backgroundColor:
                              categoryPalette[index % categoryPalette.length],
                          }}
                        />
                        <span>{category.name}</span>
                      </div>
                      <span>{currency.format(category.value)}</span>
                    </div>
                  ))
                ) : (
                  <p className="ai-empty">No expenses recorded yet.</p>
                )}
              </div>
            </div>
            <p className="ai-card-foot">
              Total Expenses: {currency.format(totals.totalExpenses)}
            </p>
          </div>

          <div className="overview-card">
            <div className="ai-card-header">
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
          <div className="stat-card ai-mini-card">
            <span className="ai-mini-title">Budget Prediction</span>
            <span className="ai-mini-value">
              {runwayMonths === null
                ? 'N/A'
                : `${Math.max(0, runwayMonths).toFixed(1)} months`}
            </span>
            <span className="ai-mini-meta">Remaining budget runway</span>
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
