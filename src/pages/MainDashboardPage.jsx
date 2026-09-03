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
} from 'lucide-react'
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts'
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

  const returnedHistory = expenses
    .filter((exp) => !exp.isAdditional && !exp.archivedAt && (Number(exp.returnedBudget) || 0) > 0)
    .sort((a, b) => new Date(b.returnedAt || 0) - new Date(a.returnedAt || 0))
  const returnedHistoryTotal = returnedHistory.reduce(
    (sum, exp) => sum + (Number(exp.returnedBudget) || 0),
    0
  )

  function returnedMonthLabel(exp) {
    const monthName = monthOptions.find((m) => m.value === Number(exp.month))?.label
    if (monthName && exp.year) return `${monthName} ${exp.year}`
    const d = parseDate(exp.eventDate || exp.date || exp.approvedAt)
    return d ? d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : '—'
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
          <p style={{ color: 'var(--ink-3)', fontSize: '0.95rem' }}>Unused budget automatically returned to its month when a Project or Event was marked Completed.</p>
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
                    No returned budgets yet. When a completed Project or Event has unused funds, the return will appear here.
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

      <GlobalSearch isOpen={isSearchOpen} onClose={() => setIsSearchOpen(false)} />
    </>
  )
}

export default MainDashboardPage
