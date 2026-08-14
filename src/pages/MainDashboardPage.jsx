import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ClipboardCheck,
  PieChart,
  Receipt,
  Search,
  Settings,
  TriangleAlert,
  UserRound,
  X,
  Wallet,
} from 'lucide-react'
import NotificationBell from '../components/NotificationBell'
import { useAuth } from '../context/AuthContext'
import { useBudget, useBudgetCalculations } from '../context/BudgetContext'
import GlobalSearch from '../components/GlobalSearch'
import YearSpinner from '../components/YearSpinner'
import { supabase } from '../supabase/supabaseClient'
import { isBiodataComplete } from '../utils/biodata'

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
  
  // To replace filteredExpenses, we can filter directly on validExpenses from useBudgetCalculations, 
  // but since useBudgetCalculations doesn't export validExpenses, we can just filter from expenses directly.
  const missingDocsCount = expenses.filter((expense) => {
    if (expense.archivedAt || expense.status === 'Cancelled') return false
    if (!isInPeriod(expense.eventDate || expense.date || expense.approvedAt || expense.createdAt)) return false
    return !expense.receiptUrl && !expense.receiptName
  }).length

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
              className="an-btn an-btn-icon an-btn-ghost"
              onClick={dismissBiodataBanner}
              aria-label="Dismiss reminder"
            >
              <X size={16} />
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
          <div className="empty-state" style={{ gridColumn: '1 / -1', padding: '48px', textAlign: 'center', background: '#fff', borderRadius: '12px', border: '1px dashed #d1d5db' }}>
            <h3 style={{ color: '#4b5563', marginBottom: '8px' }}>No data available</h3>
            <p style={{ color: '#6b7280' }}>There are no budget allocations, pending requests, or expenses recorded for {periodLabel}.</p>
          </div>
        ) : null}
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

      <GlobalSearch isOpen={isSearchOpen} onClose={() => setIsSearchOpen(false)} />
    </>
  )
}

export default MainDashboardPage
