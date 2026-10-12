import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ClipboardCheck,
  Receipt,
  RotateCcw,
  Search,
  Settings,
  TriangleAlert,
  UserRound,
  Wallet,
  Folder,
  Calendar,
  PieChart as PieChartIcon,
  Coins,
  X,
  ArrowRight,
  ChevronRight,
} from 'lucide-react'
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts'
import NotificationBell from '../components/NotificationBell'
import { useAuth } from '../context/AuthContext'
import { useBudget, useBudgetCalculations } from '../context/BudgetContext'
import GlobalSearch from '../components/GlobalSearch'
import YearSpinner from '../components/YearSpinner'
import { supabase } from '../supabase/supabaseClient'
import { isBiodataComplete } from '../utils/biodata'
import { getBudgetTotalForPeriod, getApprovedAllocationTotal } from '../utils/budgetUtils'

const currency = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  maximumFractionDigits: 0,
})

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

const BIODATA_BANNER_DISMISS_KEY = 'cuenta.biodataBannerDismissed'

function MainDashboardPage() {
  const { role, user } = useAuth()
  const { requests, budgets, expenses } = useBudget()
  const navigate = useNavigate()
  const [viewMode, setViewMode] = useState('monthly')
  const currentDate = new Date()
  const currentYear = currentDate.getFullYear()
  const currentMonth = currentDate.getMonth() + 1
  const [selectedMonth, setSelectedMonth] = useState(currentMonth)
  const [selectedYear, setSelectedYear] = useState(currentYear)
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [showBiodataBanner, setShowBiodataBanner] = useState(false)
  const [isRemainingBudgetsModalOpen, setIsRemainingBudgetsModalOpen] = useState(false)
  const [modalViewScope, setModalViewScope] = useState('past')

  useEffect(() => {
    if (!isRemainingBudgetsModalOpen) return
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setIsRemainingBudgetsModalOpen(false)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isRemainingBudgetsModalOpen])

  useEffect(() => {
    let isMounted = true
    async function checkBiodata() {
      if (!user?.id) return
      if (typeof window !== 'undefined' && window.sessionStorage.getItem(BIODATA_BANNER_DISMISS_KEY) === 'true') {
        return
      }
      const { data } = await supabase
        .from('member_biodata')
        .select('birthdate, sex, civil_status, citizenship, complete_address, mobile_number')
        .eq('id', user.id)
        .maybeSingle()
      if (isMounted && !isBiodataComplete(data)) {
        setShowBiodataBanner(true)
      }
    }
    checkBiodata()
    return () => {
      isMounted = false
    }
  }, [user?.id])

  function dismissBiodataBanner() {
    setShowBiodataBanner(false)
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem(BIODATA_BANNER_DISMISS_KEY, 'true')
    }
  }

  const periodLabel = viewMode === 'monthly' ? `${monthOptions.find(m => m.value === selectedMonth)?.label} ${selectedYear}` : `${selectedYear}`
  const periodDescriptor = viewMode === 'monthly' ? 'month' : 'year'

  function isInPeriod(dateValue) {
    const date = parseDate(dateValue)
    if (!date) return false
    if (viewMode === 'monthly') {
      const month = date.getMonth() + 1
      return (
        date.getFullYear() === selectedYear && month === selectedMonth
      )
    }
    return date.getFullYear() === selectedYear
  }

  const targetMonth = viewMode === 'monthly' ? selectedMonth : null
  const { totalBudget, totalExpenses, remainingBalance: remainingBudget, hasBudgetData } = useBudgetCalculations(targetMonth, selectedYear)
  const usedPercent = totalBudget > 0
    ? Math.min(100, Math.round((totalExpenses / totalBudget) * 100))
    : 0
  const remainingPercent = totalBudget > 0
    ? Math.max(0, 100 - usedPercent)
    : 0
  const allocationPercent = totalBudget > 0
    ? Math.min(100, Math.round((totalExpenses / totalBudget) * 100))
    : 0
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
  
  // Projects and Events stats
  const projects = expenses.filter(
    (exp) =>
      exp.type === 'Project' &&
      !exp.archivedAt &&
      exp.status !== 'Cancelled' &&
      isInPeriod(exp.eventDate || exp.date || exp.approvedAt || exp.createdAt)
  )
  
  const events = expenses.filter(
    (exp) =>
      exp.type === 'Event' &&
      !exp.archivedAt &&
      exp.status !== 'Cancelled' &&
      isInPeriod(exp.eventDate || exp.date || exp.approvedAt || exp.createdAt)
  )

  const getStats = (items) => {
    let completed = 0
    let ongoing = 0
    let pending = 0
    items.forEach(item => {
      if (item.projectStatus === 'Completed') completed++
      else if (item.projectStatus === 'Ongoing') ongoing++
      else pending++
    })
    return [
      { name: 'Completed', value: completed, color: 'var(--cuenta-mint)' },
      { name: 'Ongoing', value: ongoing, color: 'var(--cuenta-blue)' },
      { name: 'Pending', value: pending, color: 'var(--ink-4)' }
    ].filter(d => d.value > 0)
  }

  const projectStats = getStats(projects)
  const eventStats = getStats(events)
  
  // To replace filteredExpenses, we can filter directly on validExpenses from useBudgetCalculations, 
  // but since useBudgetCalculations doesn't export validExpenses, we can just filter from expenses directly.
  const missingDocsCount = expenses.filter((expense) => {
    if (expense.archivedAt || expense.status === 'Cancelled') return false
    if (!isInPeriod(expense.eventDate || expense.date || expense.approvedAt || expense.createdAt)) return false
    return !expense.receiptUrl && !expense.receiptName
  }).length

  // Budget automatically returned when a Project or Event was completed with
  // unused funds. The card follows the selected period like its siblings; the
  // history table below lists every return regardless of the filter (its
  // Month column makes the scope explicit), since it serves as an audit trail.
  const returnedInPeriod = expenses.filter((exp) =>
    !exp.isAdditional &&
    !exp.archivedAt &&
    (Number(exp.returnedBudget) || 0) > 0 &&
    isInPeriod(exp.eventDate || exp.date || exp.approvedAt || exp.createdAt)
  )
  const totalReturnedBudget = returnedInPeriod.reduce(
    (sum, exp) => sum + (Number(exp.returnedBudget) || 0),
    0
  )

  // The month/year a returned budget belongs to is the same value the Month
  // column displays: the row's own month/year first (the budget it was
  // returned to), falling back to its event/approval date only when those
  // are missing. Filtering the history by anything else would disagree with
  // what the Month column visibly shows for a selected period.
  function getReturnedPeriod(exp) {
    const month = Number(exp.month)
    const year = Number(exp.year)
    if (month >= 1 && month <= 12 && year) return { month, year }
    const d = parseDate(exp.eventDate || exp.date || exp.approvedAt)
    return d ? { month: d.getMonth() + 1, year: d.getFullYear() } : { month: null, year: null }
  }

  function isReturnedInSelectedPeriod(exp) {
    const { month, year } = getReturnedPeriod(exp)
    if (!year) return false
    if (viewMode === 'monthly') return year === selectedYear && month === selectedMonth
    return year === selectedYear
  }

  const returnedHistory = expenses
    .filter((exp) =>
      !exp.isAdditional &&
      !exp.archivedAt &&
      (Number(exp.returnedBudget) || 0) > 0 &&
      isReturnedInSelectedPeriod(exp)
    )
    .sort((a, b) => new Date(b.returnedAt || 0) - new Date(a.returnedAt || 0))
  const returnedHistoryTotal = returnedHistory.reduce(
    (sum, exp) => sum + (Number(exp.returnedBudget) || 0),
    0
  )

  function returnedMonthLabel(exp) {
    const { month, year } = getReturnedPeriod(exp)
    const monthName = monthOptions.find((m) => m.value === month)?.label
    return monthName && year ? `${monthName} ${year}` : '—'
  }

  const monthlyBudgetSummaries = useMemo(() => {
    return monthOptions.map((m) => {
      const monthNum = m.value
      const allocated = getBudgetTotalForPeriod(budgets, monthNum, selectedYear)
      const totalExp = getApprovedAllocationTotal(expenses, monthNum, selectedYear)
      const remaining = allocated - totalExp

      let status = 'Remaining'
      if (allocated <= 0) {
        status = 'No Budget Allocated'
      } else if (remaining === 0) {
        status = 'Fully Utilized'
      } else if (remaining < 0) {
        status = 'Over Budget'
      } else {
        status = 'Remaining'
      }

      const isCurrentMonth = selectedYear === currentYear && monthNum === currentMonth
      const isSelectedMonth = viewMode === 'monthly' && monthNum === selectedMonth

      return {
        month: monthNum,
        label: m.label,
        allocatedBudget: allocated,
        totalExpenses: totalExp,
        remainingBudget: remaining,
        status,
        isCurrentMonth,
        isSelectedMonth,
      }
    })
  }, [budgets, expenses, selectedYear, currentYear, currentMonth, viewMode, selectedMonth])

  const totalYearlyAllocated = useMemo(() => {
    return monthlyBudgetSummaries.reduce((sum, r) => sum + r.allocatedBudget, 0)
  }, [monthlyBudgetSummaries])

  const totalYearlyExpenses = useMemo(() => {
    return monthlyBudgetSummaries.reduce((sum, r) => sum + r.totalExpenses, 0)
  }, [monthlyBudgetSummaries])

  const totalYearlyRemaining = totalYearlyAllocated - totalYearlyExpenses

  const monthsWithRemainingCount = useMemo(() => {
    return monthlyBudgetSummaries.filter((r) => r.status === 'Remaining').length
  }, [monthlyBudgetSummaries])

  const previousMonths = useMemo(() => {
    return monthlyBudgetSummaries.filter((m) => {
      if (selectedYear < currentYear) return true
      if (selectedYear === currentYear) return m.month < currentMonth
      return false
    })
  }, [monthlyBudgetSummaries, selectedYear, currentYear, currentMonth])

  const previousMonthsRemainingTotal = useMemo(() => {
    return Math.max(0, previousMonths.reduce((sum, m) => sum + m.remainingBudget, 0))
  }, [previousMonths])

  const previousMonthsAllocatedTotal = useMemo(() => {
    return previousMonths.reduce((sum, m) => sum + m.allocatedBudget, 0)
  }, [previousMonths])

  const previousMonthsExpensesTotal = useMemo(() => {
    return previousMonths.reduce((sum, m) => sum + m.totalExpenses, 0)
  }, [previousMonths])

  const displayedMonthlyRows = useMemo(() => {
    return modalViewScope === 'past' ? previousMonths : monthlyBudgetSummaries
  }, [modalViewScope, previousMonths, monthlyBudgetSummaries])

  const scopeAllocatedTotal = useMemo(() => {
    return modalViewScope === 'past' ? previousMonthsAllocatedTotal : totalYearlyAllocated
  }, [modalViewScope, previousMonthsAllocatedTotal, totalYearlyAllocated])

  const scopeExpensesTotal = useMemo(() => {
    return modalViewScope === 'past' ? previousMonthsExpensesTotal : totalYearlyExpenses
  }, [modalViewScope, previousMonthsExpensesTotal, totalYearlyExpenses])

  const scopeRemainingTotal = useMemo(() => {
    return modalViewScope === 'past' ? previousMonthsRemainingTotal : totalYearlyRemaining
  }, [modalViewScope, previousMonthsRemainingTotal, totalYearlyRemaining])

  function getBudgetStatusBadgeClass(status) {
    switch (status) {
      case 'Remaining':
        return 'badge--positive'
      case 'Fully Utilized':
        return 'badge--warn'
      case 'Over Budget':
        return 'badge--negative'
      case 'No Budget Allocated':
      default:
        return 'badge--neutral'
    }
  }

  const summaryCards = [
    {
      label: 'Total Budget',
      value: currency.format(totalBudget),
      meta: hasBudgetData
        ? `Allocated for ${periodLabel}`
        : 'No budget entries yet',
      chip: hasBudgetData
        ? viewMode === 'monthly'
          ? 'Monthly'
          : 'Yearly'
        : 'Empty',
      tone: hasBudgetData ? 'positive' : 'neutral',
      icon: Wallet,
    },
    {
      label: 'Approved Allocations',
      value: currency.format(totalExpenses),
      meta: totalExpenses
        ? `Approved requests in ${periodLabel}`
        : 'No approved requests yet',
      chip: hasBudgetData ? `${usedPercent}% used` : 'Awaiting data',
      tone: usedPercent > 80 ? 'warning' : 'positive',
      icon: Receipt,
    },
    {
      label: 'Remaining Budget',
      value: currency.format(remainingBudget),
      meta: remainingBudget < 0
        ? 'Approved allocations exceed monthly budget'
        : hasBudgetData ? 'Monthly budget minus approved allocations' : 'Add a budget to start',
      chip: remainingBudget < 0 ? 'Over-allocated' : hasBudgetData ? `${remainingPercent}% available` : 'Not started',
      tone: remainingBudget < 0 ? 'danger' : remainingPercent < 20 ? 'warning' : 'neutral',
      icon: PieChartIcon,
    },
    {
      label: 'Remaining Budgets',
      emoji: '💰',
      value: currency.format(previousMonthsRemainingTotal),
      meta: 'Unused budget from previous months',
      chip: previousMonthsRemainingTotal > 0 ? 'View breakdown' : 'Clear',
      tone: previousMonthsRemainingTotal > 0 ? 'positive' : 'neutral',
      icon: Coins,
      onClick: () => setIsRemainingBudgetsModalOpen(true),
    },
    {
      label: 'Returned Budget',
      value: currency.format(totalReturnedBudget),
      meta: 'Budget returned from completed Projects and Events',
      chip: returnedInPeriod.length
        ? `${returnedInPeriod.length} completed`
        : 'None yet',
      tone: returnedInPeriod.length ? 'positive' : 'neutral',
      icon: RotateCcw,
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
      title: 'Missing receipts',
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
            <Search size={16} color="#6b7280" />
            <input 
              type="text" 
              readOnly 
              placeholder="Search projects, categories..." 
              aria-label="Search" 
              style={{ cursor: 'pointer' }} 
            />
          </label>
          {['SK Chairman', 'SK Treasurer'].includes(role) && <NotificationBell />}
          <div className="user-chip">
            {user?.user_metadata?.avatar_url ? (
              <img src={user.user_metadata.avatar_url} alt="Profile" className="user-avatar" style={{ objectFit: 'cover' }} />
            ) : (
              <span className="user-avatar">{initials}</span>
            )}
            <span className="user-info">
              <span className="user-name">{role}</span>
              <span className="user-role">Active role</span>
            </span>
          </div>
        </div>
      </section>

      {showBiodataBanner ? (
        <div className="an-card biodata-banner" role="status">
          <span className="an-metric-icon" style={{ background: 'var(--cuenta-mint)', color: 'var(--cuenta-teal)' }}>
            <UserRound size={18} />
          </span>
          <div className="biodata-banner-text">
            <strong>Complete your biodata</strong>
            <p>Your personal information is kept on file for SK records and isn&apos;t filled out yet.</p>
          </div>
          <div className="biodata-banner-actions">
            <button
              type="button"
              className="an-btn an-btn-primary"
              onClick={() => navigate('/dashboard/profile/biodata')}
            >
              Complete now
            </button>
            <button
              type="button"
              className="an-btn an-btn-icon biodata-banner-dismiss"
              onClick={dismissBiodataBanner}
              aria-label="Dismiss reminder"
            >
              <span className="biodata-banner-dismiss-mark">×</span>
            </button>
          </div>
        </div>
      ) : null}

      <section className="dashboard-filters" aria-label="Dashboard filters" style={{ marginBottom: '24px' }}>
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
          <YearSpinner year={selectedYear} onYearChange={setSelectedYear} />
        </div>
      </section>

      <section className="summary-grid">
        {!hasBudgetData && pendingCount === 0 && missingDocsCount === 0 && totalExpenses === 0 ? (
          <div className="empty-state" style={{ gridColumn: '1 / -1', padding: '48px', textAlign: 'center', background: 'var(--surface)', borderRadius: 'var(--radius-surface)', border: '1px dashed #d1d5db' }}>
            <h3 style={{ color: 'var(--ink-2)', marginBottom: '8px' }}>No data available</h3>
            <p style={{ color: 'var(--ink-3)' }}>There are no budget allocations, pending requests, or expenses recorded for {periodLabel}.</p>
          </div>
        ) : null}
        {summaryCards.map((card) => {
          const Icon = card.icon
          const isInteractive = Boolean(card.onClick)
          return (
            <div
              key={card.label}
              className={`summary-card ${isInteractive ? 'is-interactive' : ''}`}
              onClick={card.onClick}
              role={isInteractive ? 'button' : undefined}
              tabIndex={isInteractive ? 0 : undefined}
              aria-haspopup={isInteractive ? 'dialog' : undefined}
              title={isInteractive ? 'Click to view the monthly breakdown.' : undefined}
              onKeyDown={
                isInteractive
                  ? (e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        card.onClick()
                      }
                    }
                  : undefined
              }
            >
              <div className="summary-header">
                <div className="summary-icon">
                  <Icon size={18} />
                </div>
                <span className={`summary-chip ${card.tone} ${isInteractive ? 'is-clickable' : ''}`}>
                  {card.chip}
                  {isInteractive ? <ChevronRight size={13} className="summary-chip-arrow" aria-hidden="true" /> : null}
                </span>
              </div>
              <div className="summary-body">
                <span className="summary-label">
                  {card.emoji ? <span style={{ marginRight: '6px' }} aria-hidden="true">{card.emoji}</span> : null}
                  {card.label}
                </span>
                <span className="summary-value">{card.value}</span>
              </div>
              <span className="summary-meta">{card.meta}</span>
              {isInteractive && (
                <div className="summary-card-footer">
                  <span className="summary-action-btn">
                    <span>{card.actionLabel || 'View Details'}</span>
                    <ArrowRight size={14} className="summary-action-arrow" aria-hidden="true" />
                  </span>
                </div>
              )}
            </div>
          )
        })}
      </section>

      {/* Project and Event Progress Section */}
      <section style={{ marginTop: '40px' }}>
        <div style={{ marginBottom: '20px' }}>
          <h2 style={{ fontSize: '1.4rem', fontWeight: '700', color: 'var(--ink-1)', marginBottom: '6px' }}>Project and event progress</h2>
          <p style={{ color: 'var(--ink-3)', fontSize: '0.95rem' }}>Current status of all approved projects and events.</p>
        </div>
        
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '20px' }}>
          
          {/* Projects Card */}
          <div className="summary-card" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: '24px' }}>
            <div>
              <div className="summary-header" style={{ marginBottom: '32px' }}>
                <div className="summary-icon">
                  <Folder size={18} />
                </div>
                <span style={{ fontWeight: '600', color: 'var(--ink-1)', fontSize: '1.1rem' }}>Projects Overview</span>
              </div>
              <div className="summary-body" style={{ marginTop: 'auto' }}>
                <span className="summary-label">TOTAL PROJECTS</span>
                <span className="summary-value" style={{ fontSize: '2.5rem' }}>{projects.length}</span>
              </div>
            </div>
            
            <div style={{ width: '140px', height: '140px', position: 'relative' }}>
              {projectStats.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={projectStats} cx="50%" cy="50%" innerRadius={45} outerRadius={65} paddingAngle={2} dataKey="value">
                      {projectStats.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip 
                      formatter={(value, name) => [value, name]} 
                      contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink-4)', fontSize: '0.85rem' }}>No data</div>
              )}
            </div>
          </div>

          {/* Events Card */}
          <div className="summary-card" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: '24px' }}>
            <div>
              <div className="summary-header" style={{ marginBottom: '32px' }}>
                <div className="summary-icon">
                  <Calendar size={18} />
                </div>
                <span style={{ fontWeight: '600', color: 'var(--ink-1)', fontSize: '1.1rem' }}>Events Overview</span>
              </div>
              <div className="summary-body" style={{ marginTop: 'auto' }}>
                <span className="summary-label">TOTAL EVENTS</span>
                <span className="summary-value" style={{ fontSize: '2.5rem' }}>{events.length}</span>
              </div>
            </div>
            
            <div style={{ width: '140px', height: '140px', position: 'relative' }}>
              {eventStats.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={eventStats} cx="50%" cy="50%" innerRadius={45} outerRadius={65} paddingAngle={2} dataKey="value">
                      {eventStats.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip 
                      formatter={(value, name) => [value, name]}
                      contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink-4)', fontSize: '0.85rem' }}>No data</div>
              )}
            </div>
          </div>

        </div>
      </section>

      {/* Returned Budget History */}
      <section style={{ marginTop: '40px' }} aria-label="Returned budget history">
        <div style={{ marginBottom: '20px' }}>
          <h2 style={{ fontSize: '1.4rem', fontWeight: '700', color: 'var(--ink-1)', marginBottom: '6px' }}>Returned Budget History</h2>
          <p style={{ color: 'var(--ink-3)', fontSize: '0.95rem' }}>
            Unused budget automatically returned to its month when a Project or Event was marked Completed, for {periodLabel}.
          </p>
        </div>
        <div className="overview-card" style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Project/Event</th>
                <th>Month</th>
                <th>Approved Budget</th>
                <th>Actual Used</th>
                <th>Returned Budget</th>
                <th>Date Completed</th>
              </tr>
            </thead>
            <tbody>
              {returnedHistory.length ? returnedHistory.map((exp) => {
                const returned = Number(exp.returnedBudget) || 0
                const originalApproved = Number(exp.originalApprovedBudget) || ((Number(exp.approvedBudget) || 0) + returned)
                const actualUsed = originalApproved - returned
                return (
                  <tr key={`returned-${exp.id}`}>
                    <td data-label="Project/Event">
                      <strong>{exp.event || exp.project || 'Untitled'}</strong><br />
                      <span style={{ color: 'var(--ink-3)', fontSize: '.82rem' }}>{exp.type || 'Project'}</span>
                    </td>
                    <td data-label="Month">{returnedMonthLabel(exp)}</td>
                    <td data-label="Approved Budget">{currency.format(originalApproved)}</td>
                    <td data-label="Actual Used">{currency.format(actualUsed)}</td>
                    <td data-label="Returned Budget" style={{ fontWeight: 600, color: 'var(--positive, #15803d)' }}>{currency.format(returned)}</td>
                    <td data-label="Date Completed">{exp.returnedAt ? new Date(exp.returnedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '—'}</td>
                  </tr>
                )
              }) : (
                <tr>
                  <td colSpan="6" style={{ textAlign: 'center', fontStyle: 'italic', color: 'var(--ink-3)' }}>
                    No returned budgets for {periodLabel}. When a completed Project or Event has unused funds, the return will appear here.
                  </td>
                </tr>
              )}
            </tbody>
            {returnedHistory.length ? (
              <tfoot>
                <tr>
                  <th colSpan="4">Total Returned Budget</th>
                  <th>{currency.format(returnedHistoryTotal)}</th>
                  <th />
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
      </section>

      {/* Remaining Budgets Modal */}
      {isRemainingBudgetsModalOpen && (
        <div
          className="modal-overlay"
          onClick={() => setIsRemainingBudgetsModalOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="remaining-budgets-modal-title"
        >
          <div
            className="modal-content remaining-budgets-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px' }}>
              <div>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <span style={{ fontSize: '1.3rem' }} aria-hidden="true">💰</span>
                  <h2 id="remaining-budgets-modal-title" style={{ margin: 0, fontSize: '1.35rem', fontWeight: 700, color: 'var(--ink-1)' }}>
                    Remaining Budgets Breakdown
                  </h2>
                </div>
                <p style={{ margin: 0, color: 'var(--ink-3)', fontSize: '0.92rem' }}>
                  Detailed breakdown of total budgets, approved budgets, and unused funds for {selectedYear}.
                </p>
              </div>
              <button
                type="button"
                className="icon-button"
                onClick={() => setIsRemainingBudgetsModalOpen(false)}
                aria-label="Close modal"
                style={{
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '8px',
                  borderRadius: '8px',
                  color: 'var(--ink-3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <X size={20} />
              </button>
            </div>

            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Stat Cards inside modal */}
              <div className="remaining-budgets-stats-grid">
                <div className="remaining-budgets-stat-card highlight">
                  <span className="remaining-budgets-stat-label">
                    Total Remaining (Previous Months)
                  </span>
                  <div className="remaining-budgets-stat-val" style={{ color: 'var(--cuenta-teal, #0f766e)' }}>
                    {currency.format(previousMonthsRemainingTotal)}
                  </div>
                  <span className="remaining-budgets-stat-sub">
                    Unused budget carried over from completed months
                  </span>
                </div>

                <div className="remaining-budgets-stat-card">
                  <span className="remaining-budgets-stat-label">
                    Completed Months
                  </span>
                  <div className="remaining-budgets-stat-val">
                    {previousMonths.length} <span style={{ fontSize: '0.95rem', fontWeight: 500, color: 'var(--ink-3)' }}>months</span>
                  </div>
                  <span className="remaining-budgets-stat-sub">
                    {previousMonths.length > 0 ? `${previousMonths[0].label} – ${previousMonths[previousMonths.length - 1].label}` : 'No past months'}
                  </span>
                </div>

                <div className="remaining-budgets-stat-card">
                  <span className="remaining-budgets-stat-label">
                    Current Active Month
                  </span>
                  <div className="remaining-budgets-stat-val" style={{ fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {monthOptions.find(m => m.value === currentMonth)?.label} {currentYear}
                    <span
                      style={{
                        fontSize: '0.68rem',
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: '12px',
                        backgroundColor: 'var(--cuenta-mint, #ccfbf1)',
                        color: 'var(--cuenta-teal, #0f766e)',
                        border: '1px solid rgba(15, 118, 110, 0.25)',
                      }}
                    >
                      Active
                    </span>
                  </div>
                  <span className="remaining-budgets-stat-sub">
                    Excluded from previous months summary
                  </span>
                </div>
              </div>

              {/* View Scope Toggle */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                <div className="filter-toggle" style={{ display: 'inline-flex' }}>
                  <button
                    type="button"
                    className={`filter-toggle-btn ${modalViewScope === 'past' ? 'is-active' : ''}`}
                    onClick={() => setModalViewScope('past')}
                  >
                    Previous Months ({previousMonths.length})
                  </button>
                  <button
                    type="button"
                    className={`filter-toggle-btn ${modalViewScope === 'all' ? 'is-active' : ''}`}
                    onClick={() => setModalViewScope('all')}
                  >
                    All Months (12)
                  </button>
                </div>
                <span style={{ fontSize: '0.84rem', color: 'var(--ink-3)' }}>
                  {modalViewScope === 'past'
                    ? 'Displaying completed past months in chronological order'
                    : `Displaying all 12 months for fiscal year ${selectedYear}`}
                </span>
              </div>

              {/* Monthly Breakdown Table */}
              <div className="overview-card" style={{ overflowX: 'auto', border: '1px solid var(--line, #e2e8f0)' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left' }}>Month</th>
                      <th style={{ textAlign: 'right' }}>Total Budget</th>
                      <th style={{ textAlign: 'right' }}>Approved Budgets</th>
                      <th style={{ textAlign: 'right' }}>Remaining Budget</th>
                      <th style={{ textAlign: 'center' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayedMonthlyRows.length === 0 ? (
                      <tr>
                        <td colSpan="5" style={{ textAlign: 'center', padding: '28px', color: 'var(--ink-3)', fontStyle: 'italic' }}>
                          No past months recorded for {selectedYear}.
                        </td>
                      </tr>
                    ) : (
                      displayedMonthlyRows.map((row) => (
                        <tr
                          key={`modal-monthly-budget-${row.month}`}
                          onClick={() => {
                            setSelectedMonth(row.month)
                            setViewMode('monthly')
                            setIsRemainingBudgetsModalOpen(false)
                          }}
                          style={{
                            cursor: 'pointer',
                            backgroundColor: row.isCurrentMonth
                              ? 'rgba(15, 118, 110, 0.05)'
                              : row.isSelectedMonth
                              ? 'rgba(37, 99, 235, 0.04)'
                              : undefined,
                            transition: 'background-color 0.15s ease',
                          }}
                          title={`Click to filter dashboard to ${row.label} ${selectedYear}`}
                        >
                          <td data-label="Month" style={{ position: 'relative' }}>
                            {row.isCurrentMonth && (
                              <span
                                style={{
                                  position: 'absolute',
                                  left: 0,
                                  top: 0,
                                  bottom: 0,
                                  width: '4px',
                                  backgroundColor: 'var(--cuenta-teal, #0f766e)',
                                  borderRadius: '0 2px 2px 0',
                                }}
                                aria-hidden="true"
                              />
                            )}
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', paddingLeft: row.isCurrentMonth ? '6px' : '0' }}>
                              <strong style={{ color: 'var(--ink-1)' }}>{row.label}</strong>
                              {row.isCurrentMonth && (
                                <span
                                  style={{
                                    fontSize: '0.68rem',
                                    fontWeight: 700,
                                    letterSpacing: '0.04em',
                                    textTransform: 'uppercase',
                                    padding: '2px 8px',
                                    borderRadius: '12px',
                                    backgroundColor: 'var(--cuenta-mint, #ccfbf1)',
                                    color: 'var(--cuenta-teal, #0f766e)',
                                    border: '1px solid rgba(15, 118, 110, 0.25)',
                                  }}
                                >
                                  Current Month
                                </span>
                              )}
                              {row.isSelectedMonth && !row.isCurrentMonth && (
                                <span
                                  style={{
                                    fontSize: '0.68rem',
                                    fontWeight: 600,
                                    padding: '2px 6px',
                                    borderRadius: '10px',
                                    backgroundColor: 'rgba(37, 99, 235, 0.1)',
                                    color: '#2563eb',
                                  }}
                                >
                                  Active Filter
                                </span>
                              )}
                            </div>
                          </td>
                          <td data-label="Total Budget" style={{ textAlign: 'right', fontWeight: row.allocatedBudget > 0 ? 600 : 400, color: row.allocatedBudget > 0 ? 'var(--ink-1)' : 'var(--ink-3)' }}>
                            {currency.format(row.allocatedBudget)}
                          </td>
                          <td data-label="Approved Budgets" style={{ textAlign: 'right', fontWeight: row.totalExpenses > 0 ? 600 : 400, color: row.totalExpenses > 0 ? 'var(--ink-1)' : 'var(--ink-3)' }}>
                            {currency.format(row.totalExpenses)}
                          </td>
                          <td
                            data-label="Remaining Budget"
                            style={{
                              textAlign: 'right',
                              fontWeight: 600,
                              color:
                                row.remainingBudget > 0
                                  ? 'var(--positive, #15803d)'
                                  : row.remainingBudget < 0
                                  ? 'var(--negative, #b91c1c)'
                                  : row.allocatedBudget > 0
                                  ? 'var(--ink-2)'
                                  : 'var(--ink-3)',
                            }}
                          >
                            {currency.format(row.remainingBudget)}
                          </td>
                          <td data-label="Status" style={{ textAlign: 'center' }}>
                            <span className={`status-pill ${getBudgetStatusBadgeClass(row.status)}`}>
                              {row.status}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  <tfoot>
                    <tr>
                      <th style={{ textAlign: 'left' }}>
                        {modalViewScope === 'past' ? 'Total (Previous Months)' : `Total (${selectedYear})`}
                      </th>
                      <th style={{ textAlign: 'right' }}>{currency.format(scopeAllocatedTotal)}</th>
                      <th style={{ textAlign: 'right' }}>{currency.format(scopeExpensesTotal)}</th>
                      <th
                        style={{
                          textAlign: 'right',
                          color:
                            scopeRemainingTotal > 0
                              ? 'var(--positive, #15803d)'
                              : scopeRemainingTotal < 0
                              ? 'var(--negative, #b91c1c)'
                              : 'var(--ink-1)',
                        }}
                      >
                        {currency.format(scopeRemainingTotal)}
                      </th>
                      <th style={{ textAlign: 'center' }}>
                        <span className={`status-pill ${
                          scopeAllocatedTotal <= 0
                            ? 'badge--neutral'
                            : scopeRemainingTotal > 0
                            ? 'badge--positive'
                            : scopeRemainingTotal === 0
                            ? 'badge--warn'
                            : 'badge--negative'
                        }`}>
                          {scopeAllocatedTotal <= 0
                            ? 'No Budget'
                            : scopeRemainingTotal > 0
                            ? 'Remaining'
                            : scopeRemainingTotal === 0
                            ? 'Fully Utilized'
                            : 'Over Budget'}
                        </span>
                      </th>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            <div className="modal-footer" style={{ marginTop: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.82rem', color: 'var(--ink-3)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>💡</span> Click any month row to filter the Main Dashboard to that month.
              </span>
              <button
                type="button"
                className="an-btn an-btn-primary"
                onClick={() => setIsRemainingBudgetsModalOpen(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <GlobalSearch isOpen={isSearchOpen} onClose={() => setIsSearchOpen(false)} />
    </>
  )
}

export default MainDashboardPage
