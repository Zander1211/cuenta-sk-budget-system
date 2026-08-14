import { useEffect, useMemo, useState } from 'react'
import {
  ClipboardCheck,
  PieChart,
  Receipt,
  Search,
  Settings,
  TriangleAlert,
  Wallet,
} from 'lucide-react'
import NotificationBell from '../components/NotificationBell'
import { useAuth } from '../context/AuthContext'
import { useBudget } from '../context/BudgetContext'
import GlobalSearch from '../components/GlobalSearch'

const currency = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  maximumFractionDigits: 0,
})

const quarterOptions = [
  { value: 1, label: 'Quarter 1 (Jan - Mar)' },
  { value: 2, label: 'Quarter 2 (Apr - Jun)' },
  { value: 3, label: 'Quarter 3 (Jul - Sep)' },
  { value: 4, label: 'Quarter 4 (Oct - Dec)' },
]

function parseDate(value) {
  if (!value) return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed
}

function MainDashboardPage() {
  const { role } = useAuth()
  const { requests, budgets, expenses } = useBudget()
  const [viewMode, setViewMode] = useState('quarterly')
  const currentDate = new Date()
  const currentYear = currentDate.getFullYear()
  const currentQuarter = Math.floor(currentDate.getMonth() / 3) + 1
  const [selectedQuarter, setSelectedQuarter] = useState(currentQuarter)
  const [selectedYear, setSelectedYear] = useState(currentYear)
  const [isSearchOpen, setIsSearchOpen] = useState(false)

  const availableYears = useMemo(() => {
    const years = new Set([currentYear])
    budgets.forEach((budget) => {
      if (Number.isFinite(budget.year)) {
        years.add(budget.year)
        return
      }

      const createdDate = parseDate(budget.createdAt)
      if (createdDate) {
        years.add(createdDate.getFullYear())
      }
    })
    return Array.from(years).sort((a, b) => a - b)
  }, [budgets, currentYear])

  useEffect(() => {
    if (!availableYears.length) return
    if (!availableYears.includes(selectedYear)) {
      setSelectedYear(availableYears[availableYears.length - 1])
    }
  }, [availableYears, selectedYear])

  const periodLabel =
    viewMode === 'quarterly'
      ? `Q${selectedQuarter} ${selectedYear}`
      : `${selectedYear}`
  const periodDescriptor = viewMode === 'quarterly' ? 'quarter' : 'year'

  function isInPeriod(dateValue) {
    const date = parseDate(dateValue)
    if (!date) return false
    if (viewMode === 'quarterly') {
      const quarter = Math.floor(date.getMonth() / 3) + 1
      return (
        date.getFullYear() === selectedYear && quarter === selectedQuarter
      )
    }
    return date.getFullYear() === selectedYear
  }

  function budgetMatchesPeriod(budget) {
    if (!Number.isFinite(budget.quarter) || !Number.isFinite(budget.year)) {
      return false
    }
    if (viewMode === 'quarterly') {
      return budget.year === selectedYear && budget.quarter === selectedQuarter
    }
    return budget.year === selectedYear
  }

  const filteredBudgets = budgets.filter(budgetMatchesPeriod)
  const totalBudget = filteredBudgets.reduce(
    (sum, budget) => sum + Number(budget.amount || 0),
    0
  )

  const filteredExpenses = expenses.filter((expense) => {
    if (expense.archivedAt || expense.status === 'Cancelled') return false
    return isInPeriod(
      expense.eventDate || expense.date || expense.approvedAt || expense.createdAt
    )
  })
  const totalExpenses = filteredExpenses.reduce(
    (sum, item) => sum + Number(item.amount || 0),
    0
  )
  const remainingBudget = totalBudget - totalExpenses
  const usedPercent = totalBudget > 0
    ? Math.min(100, Math.round((totalExpenses / totalBudget) * 100))
    : 0
  const remainingPercent = totalBudget > 0
    ? Math.max(0, 100 - usedPercent)
    : 0
  const allocationPercent = totalBudget > 0
    ? Math.min(100, Math.round((totalExpenses / totalBudget) * 100))
    : 0
  const hasBudgetData = totalBudget > 0
  const greetingRole = role?.replace('SK ', '') || 'Team'
  const initials = role
    ? role
        .split(' ')
        .map((word) => word[0])
        .join('')
        .slice(0, 2)
        .toUpperCase()
    : 'U'

  const filteredRequests = requests.filter((request) =>
    isInPeriod(request.submittedAt || request.createdAt || request.eventDate)
  )

  const currentHour = currentDate.getHours()
  let timeOfDayGreeting = 'Good evening'
  if (currentHour >= 5 && currentHour < 12) {
    timeOfDayGreeting = 'Good morning'
  } else if (currentHour >= 12 && currentHour < 18) {
    timeOfDayGreeting = 'Good afternoon'
  }

  const pendingRequests = filteredRequests.filter(
    (request) =>
      (!request.status || request.status === 'Pending') && !request.archivedAt
  )
  const pendingCount = pendingRequests.length
  const missingDocsCount = filteredExpenses.filter(
    (expense) => !expense.receiptUrl && !expense.receiptName
  ).length

  const summaryCards = [
    {
      label: 'Total Budget',
      value: currency.format(totalBudget),
      meta: filteredBudgets.length
        ? `Allocated for ${periodLabel}`
        : 'No budget entries yet',
      chip: filteredBudgets.length
        ? viewMode === 'quarterly'
          ? 'Quarterly'
          : 'Yearly'
        : 'Empty',
      tone: filteredBudgets.length ? 'positive' : 'neutral',
      icon: Wallet,
    },
    {
      label: 'Total Expenses',
      value: currency.format(totalExpenses),
      meta: totalExpenses
        ? `Approved requests in ${periodLabel}`
        : 'No expenses recorded',
      chip: hasBudgetData ? `${usedPercent}% used` : 'Awaiting data',
      tone: usedPercent > 80 ? 'warning' : 'positive',
      icon: Receipt,
    },
    {
      label: 'Remaining Budget',
      value: currency.format(remainingBudget),
      meta: hasBudgetData ? 'Updated from approvals' : 'Add a budget to start',
      chip: hasBudgetData ? `${remainingPercent}% left` : 'Not started',
      tone: remainingPercent < 20 ? 'warning' : 'neutral',
      icon: PieChart,
    },
    {
      label: 'Pending Approvals',
      value: String(pendingCount),
      meta: pendingCount ? 'Awaiting review' : 'No pending requests',
      chip: pendingCount ? 'Action needed' : 'Clear',
      tone: pendingCount ? 'warning' : 'positive',
      icon: ClipboardCheck,
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

  const trendValues = hasBudgetData
    ? [0.18, 0.28, 0.24, 0.42, 0.6, 0.78]
    : [0, 0, 0, 0, 0, 0]
  const trendPoints = trendValues
    .map((value, index) => {
      const x = (index / (trendValues.length - 1)) * 100
      const y = 100 - value * 100
      return `${x},${y}`
    })
    .join(' ')

  const alerts = []
  if (pendingCount) {
    alerts.push({
      title: 'Pending approvals',
      detail: `${pendingCount} requests are waiting for review.`,
      tone: 'warning',
    })
  }
  if (missingDocsCount) {
    alerts.push({
      title: 'Missing documents',
      detail: `${missingDocsCount} expenses are missing receipts.`,
      tone: 'warning',
    })
  }
  if (hasBudgetData && usedPercent > 75) {
    alerts.push({
      title: 'Budget utilization rising',
      detail: `${usedPercent}% of the budget has been used this ${periodDescriptor}.`,
      tone: 'neutral',
    })
  }

  return (
    <>
      <section className="dashboard-topbar">
        <div className="topbar-greeting">
          <h1>{timeOfDayGreeting}, {greetingRole}!</h1>
          <p>Here&apos;s an overview of your financial status and key insights.</p>
        </div>
        <div className="topbar-actions">
          <label className="search-field" onClick={() => setIsSearchOpen(true)}>
            <Search size={16} />
            <input type="button" value="Search projects, categories..." aria-label="Search" style={{ textAlign: 'left', cursor: 'pointer' }} />
          </label>
          {['SK Chairman', 'SK Treasurer'].includes(role) && <NotificationBell />}
          <div className="user-chip">
            <span className="user-avatar">{initials}</span>
            <span className="user-info">
              <span className="user-name">{role}</span>
              <span className="user-role">Active role</span>
            </span>
          </div>
        </div>
      </section>

      <section className="dashboard-filters" aria-label="Budget filters">
        <div className="filter-group">
          <span className="filter-label">View</span>
          <div className="filter-toggle">
            <button
              type="button"
              className={`filter-toggle-btn ${
                viewMode === 'quarterly' ? 'is-active' : ''
              }`}
              onClick={() => setViewMode('quarterly')}
            >
              Quarterly Budget
            </button>
            <button
              type="button"
              className={`filter-toggle-btn ${
                viewMode === 'yearly' ? 'is-active' : ''
              }`}
              onClick={() => setViewMode('yearly')}
            >
              Yearly Budget
            </button>
          </div>
        </div>
        <div className="filter-group">
          <span className="filter-label">Quarter</span>
          <select
            className="panel-select"
            value={selectedQuarter}
            onChange={(event) => setSelectedQuarter(Number(event.target.value))}
            disabled={viewMode === 'yearly'}
          >
            {quarterOptions.map((q) => (
              <option key={q.value} value={q.value}>
                {q.label}
              </option>
            ))}
          </select>
        </div>
        <div className="filter-group">
          <span className="filter-label">Year</span>
          <span className="filter-year">{selectedYear}</span>
        </div>
      </section>

      <section className="summary-grid">
        {summaryCards.map((card) => {
          const Icon = card.icon
          return (
            <div key={card.label} className="summary-card">
              <div className="summary-header">
                <div className="summary-icon">
                  <Icon size={18} />
                </div>
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

      <section className="dashboard-panels">
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
              <div
                className={`donut ${hasBudgetData ? '' : 'is-empty'}`}
                style={{ '--donut-value': usedPercent }}
              >
                <div className="donut-center">
                  <span className="donut-value">{usedPercent}%</span>
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
                  <polyline
                    points={trendPoints}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              <div className="trend-foot">
                <span>Jan</span>
                <span>Jun</span>
              </div>
            </div>
          </div>
        </div>
        <div className="panel-card">
          <div className="panel-header">
            <div>
              <p className="panel-eyebrow">Budget Allocation</p>
              <h2>{viewMode === 'quarterly' ? 'Quarterly allocation' : 'Yearly allocation'}</h2>
            </div>
          </div>
          <div className="allocation-grid">
            <div>
              <span className="allocation-label">Total Budget</span>
              <span className="allocation-value">{currency.format(totalBudget)}</span>
            </div>
            <div>
              <span className="allocation-label">Allocated</span>
              <span className="allocation-value">
                {currency.format(totalExpenses)} ({allocationPercent}%)
              </span>
            </div>
          </div>
          <div className="allocation-bar">
            <div
              className="allocation-fill"
              style={{ width: `${allocationPercent}%` }}
            />
          </div>
        </div>
      </section>

      <section className="dashboard-panels single">
        <div className="panel-card">
          <div className="panel-header">
            <div className="panel-title-row">
              <TriangleAlert size={18} />
              <h2>Recent Alerts</h2>
            </div>
            <button className="ghost-button" type="button">View all</button>
          </div>
          <div className="alert-list">
            {alerts.length ? (
              alerts.map((item) => (
                <div key={item.title} className="alert-item">
                  <div>
                    <span className="alert-title">{item.title}</span>
                    <p className="alert-detail">{item.detail}</p>
                  </div>
                  <span className={`alert-pill ${item.tone}`}>{item.tone}</span>
                </div>
              ))
            ) : (
              <p className="empty-state">No alerts yet.</p>
            )}
          </div>
        </div>
      </section>

      <GlobalSearch isOpen={isSearchOpen} onClose={() => setIsSearchOpen(false)} />
    </>
  )
}

export default MainDashboardPage
