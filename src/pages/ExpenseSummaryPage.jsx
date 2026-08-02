import { useMemo, useState } from 'react'
import { Receipt, PieChart, TrendingUp, BarChart3, Filter } from 'lucide-react'
import RoleGate from '../components/RoleGate'
import { useBudget } from '../context/BudgetContext'
import YearSpinner from '../components/YearSpinner'

const currency = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  maximumFractionDigits: 0,
})

const monthLabels = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

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

const categoryColors = ['#ff6b3d', '#6de3b7', '#4b8bd8', '#f59e0b', '#a78bfa', '#f472b6', '#34d399']

function parseDate(value) {
  if (!value) return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed
}

function ExpenseSummaryPage() {
  const { expenses, budgets, totals } = useBudget()
  const [viewMode, setViewMode] = useState('monthly')
  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth() + 1
  const [selectedMonth, setSelectedMonth] = useState(currentMonth)
  const [selectedYear, setSelectedYear] = useState(currentYear)
  const [categoryFilter, setCategoryFilter] = useState('All')

  const periodLabel = viewMode === 'monthly'
    ? `${monthOptions.find(m => m.value === selectedMonth)?.label} ${selectedYear}`
    : `${selectedYear}`

  function isInPeriod(dateValue) {
    const date = parseDate(dateValue)
    if (!date) return false
    if (viewMode === 'monthly') {
      return date.getFullYear() === selectedYear && (date.getMonth() + 1) === selectedMonth
    }
    return date.getFullYear() === selectedYear
  }

  // Filter active approved expenses in the selected period
  const filteredExpenses = useMemo(() => {
    return expenses.filter((expense) => {
      if (expense.archivedAt || expense.status === 'Cancelled') return false
      const status = expense.status || 'Approved'
      if (!['Approved', 'Released'].includes(status)) return false
      const inPeriod = isInPeriod(
        expense.approvedAt || expense.date || expense.eventDate
      )
      if (!inPeriod) return false
      if (categoryFilter !== 'All' && expense.category !== categoryFilter) return false
      return true
    })
  }, [expenses, selectedMonth, selectedYear, viewMode, categoryFilter])

  const totalExpenses = filteredExpenses.reduce(
    (sum, item) => sum + Number(item.amount || 0), 0
  )

  // Budget for the period
  const periodBudget = useMemo(() => {
    return budgets
      .filter((b) => {
        if (!Number.isFinite(b.month) || !Number.isFinite(b.year)) return false
        if (viewMode === 'monthly') {
          return b.year === selectedYear && b.month === selectedMonth
        }
        return b.year === selectedYear
      })
      .reduce((sum, b) => sum + Number(b.amount || 0), 0)
  }, [budgets, selectedMonth, selectedYear, viewMode])

  const remaining = periodBudget - totalExpenses
  const utilizationPercent = periodBudget > 0
    ? Math.min(100, Math.round((totalExpenses / periodBudget) * 100))
    : 0

  // Category breakdown
  const categoryBreakdown = useMemo(() => {
    const map = new Map()
    filteredExpenses.forEach((expense) => {
      const cat = expense.category || 'Uncategorized'
      map.set(cat, (map.get(cat) || 0) + Number(expense.amount || 0))
    })
    return Array.from(map, ([name, value]) => ({
      name,
      value,
      percent: totalExpenses > 0 ? Math.round((value / totalExpenses) * 100) : 0,
    })).sort((a, b) => b.value - a.value)
  }, [filteredExpenses, totalExpenses])

  // Project breakdown
  const projectBreakdown = useMemo(() => {
    const map = new Map()
    filteredExpenses.forEach((expense) => {
      const project = expense.project || expense.event || 'Unlabeled'
      map.set(project, (map.get(project) || 0) + Number(expense.amount || 0))
    })
    return Array.from(map, ([name, value]) => ({
      name,
      value,
      percent: totalExpenses > 0 ? Math.round((value / totalExpenses) * 100) : 0,
    })).sort((a, b) => b.value - a.value)
  }, [filteredExpenses, totalExpenses])

  // Monthly trend (for yearly view)
  const monthlyTrend = useMemo(() => {
    if (viewMode !== 'yearly') return []
    const monthTotals = Array.from({ length: 12 }, () => 0)
    expenses.forEach((expense) => {
      if (expense.archivedAt || expense.status === 'Cancelled') return
      const date = parseDate(expense.approvedAt || expense.date || expense.eventDate)
      if (!date || date.getFullYear() !== selectedYear) return
      monthTotals[date.getMonth()] += Number(expense.amount || 0)
    })
    return monthTotals.map((value, idx) => ({
      month: monthLabels[idx].slice(0, 3),
      value,
    }))
  }, [expenses, selectedYear, viewMode])

  // All unique categories for filter
  const allCategories = useMemo(() => {
    const cats = new Set()
    expenses.forEach((e) => {
      if (e.category) cats.add(e.category)
    })
    return Array.from(cats).sort()
  }, [expenses])

  // SVG bar chart max value
  const barMax = monthlyTrend.length
    ? Math.max(...monthlyTrend.map((m) => m.value), 1)
    : 1

  return (
    <RoleGate allow={['SK Kagawad', 'Barangay Treasurer']}>
      <header className="dashboard-header">
        <div className="header-left">
          <div>
            <p className="eyebrow">Financial Monitoring</p>
            <h1>Expense Summary</h1>
            <p>
              View approved expenses, spending breakdown by category and
              project, and monitor budget utilization.
            </p>
          </div>
        </div>
      </header>

      {/* Filters */}
      <section className="dashboard-filters" aria-label="Summary filters" style={{ marginBottom: '24px' }}>
        <div className="filter-group">
          <span className="filter-label">View</span>
          <div className="filter-toggle">
            <button
              type="button"
              className={`filter-toggle-btn ${viewMode === 'monthly' ? 'is-active' : ''}`}
              onClick={() => setViewMode('monthly')}
            >
              Monthly
            </button>
            <button
              type="button"
              className={`filter-toggle-btn ${viewMode === 'yearly' ? 'is-active' : ''}`}
              onClick={() => setViewMode('yearly')}
            >
              Yearly
            </button>
          </div>
        </div>
        {viewMode === 'monthly' && (
          <div className="filter-group">
            <span className="filter-label">Month</span>
            <select
              className="panel-select"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(Number(e.target.value))}
            >
              {monthOptions.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>
        )}
        <div className="filter-group">
          <span className="filter-label">Year</span>
          <YearSpinner year={selectedYear} onYearChange={setSelectedYear} />
        </div>
        <div className="filter-group">
          <span className="filter-label">Category</span>
          <select
            className="panel-select"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
          >
            <option value="All">All Categories</option>
            {allCategories.map((cat) => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </div>
      </section>

      {/* Summary Cards */}
      <section className="summary-grid">
        <div className="summary-card">
          <div className="summary-header">
            <div className="summary-icon"><Receipt size={18} /></div>
            <span className={`summary-chip ${utilizationPercent > 80 ? 'warning' : 'positive'}`}>
              {utilizationPercent}% used
            </span>
          </div>
          <div className="summary-body">
            <span className="summary-label">Total Expenses</span>
            <span className="summary-value">{currency.format(totalExpenses)}</span>
          </div>
          <span className="summary-meta">
            {filteredExpenses.length} approved expense{filteredExpenses.length !== 1 ? 's' : ''} in {periodLabel}
          </span>
        </div>

        <div className="summary-card">
          <div className="summary-header">
            <div className="summary-icon"><PieChart size={18} /></div>
            <span className={`summary-chip ${remaining < 0 ? 'warning' : 'neutral'}`}>
              {periodBudget > 0 ? `${100 - utilizationPercent}% left` : 'No budget'}
            </span>
          </div>
          <div className="summary-body">
            <span className="summary-label">Remaining Budget</span>
            <span className="summary-value">{currency.format(remaining)}</span>
          </div>
          <span className="summary-meta">
            {periodBudget > 0 ? `Budget: ${currency.format(periodBudget)}` : 'No budget allocated'}
          </span>
        </div>

        <div className="summary-card">
          <div className="summary-header">
            <div className="summary-icon"><BarChart3 size={18} /></div>
            <span className="summary-chip neutral">{categoryBreakdown.length} categories</span>
          </div>
          <div className="summary-body">
            <span className="summary-label">Top Category</span>
            <span className="summary-value">
              {categoryBreakdown[0]?.name || '—'}
            </span>
          </div>
          <span className="summary-meta">
            {categoryBreakdown[0]
              ? `${currency.format(categoryBreakdown[0].value)} (${categoryBreakdown[0].percent}%)`
              : 'No expenses yet'}
          </span>
        </div>

        <div className="summary-card">
          <div className="summary-header">
            <div className="summary-icon"><TrendingUp size={18} /></div>
            <span className="summary-chip neutral">{projectBreakdown.length} projects</span>
          </div>
          <div className="summary-body">
            <span className="summary-label">Top Project</span>
            <span className="summary-value" style={{ fontSize: projectBreakdown[0]?.name?.length > 20 ? '1rem' : undefined }}>
              {projectBreakdown[0]?.name || '—'}
            </span>
          </div>
          <span className="summary-meta">
            {projectBreakdown[0]
              ? `${currency.format(projectBreakdown[0].value)} (${projectBreakdown[0].percent}%)`
              : 'No project expenses'}
          </span>
        </div>
      </section>

      <section className="dashboard-content" style={{ marginTop: '24px' }}>
        {/* Budget Utilization Bar */}
        {periodBudget > 0 && (
          <div className="overview-card" style={{ marginBottom: '24px' }}>
            <p className="eyebrow">Budget Utilization</p>
            <h2>{periodLabel}</h2>
            <div style={{ marginTop: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '0.9rem' }}>
                <span>Used: {currency.format(totalExpenses)}</span>
                <span>Budget: {currency.format(periodBudget)}</span>
              </div>
              <div style={{
                width: '100%',
                height: '12px',
                borderRadius: '6px',
                backgroundColor: 'var(--surface-hover, #e5e7eb)',
                overflow: 'hidden',
              }}>
                <div style={{
                  width: `${utilizationPercent}%`,
                  height: '100%',
                  borderRadius: '6px',
                  backgroundColor: utilizationPercent > 80 ? '#ef4444' : utilizationPercent > 60 ? '#f59e0b' : '#22c55e',
                  transition: 'width 0.4s ease',
                }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px', fontSize: '0.8rem', color: 'var(--ink-soft)' }}>
                <span>{utilizationPercent}% utilized</span>
                <span>Remaining: {currency.format(remaining)}</span>
              </div>
            </div>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '24px' }}>
          {/* Category Breakdown */}
          <div className="overview-card">
            <p className="eyebrow">Spending Analysis</p>
            <h2>By Category</h2>
            {categoryBreakdown.length ? (
              <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {categoryBreakdown.map((cat, idx) => (
                  <div key={cat.name}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '0.85rem' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{
                          width: '10px',
                          height: '10px',
                          borderRadius: '50%',
                          backgroundColor: categoryColors[idx % categoryColors.length],
                          display: 'inline-block',
                          flexShrink: 0,
                        }} />
                        {cat.name}
                      </span>
                      <span style={{ fontWeight: 600 }}>{currency.format(cat.value)} ({cat.percent}%)</span>
                    </div>
                    <div style={{
                      width: '100%',
                      height: '8px',
                      borderRadius: '4px',
                      backgroundColor: 'var(--surface-hover, #e5e7eb)',
                      overflow: 'hidden',
                    }}>
                      <div style={{
                        width: `${cat.percent}%`,
                        height: '100%',
                        borderRadius: '4px',
                        backgroundColor: categoryColors[idx % categoryColors.length],
                        transition: 'width 0.3s ease',
                      }} />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="empty-state" style={{ marginTop: '16px' }}>No expenses for this period.</p>
            )}
          </div>

          {/* Project Breakdown */}
          <div className="overview-card">
            <p className="eyebrow">Spending Analysis</p>
            <h2>By Project</h2>
            {projectBreakdown.length ? (
              <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {projectBreakdown.map((proj, idx) => (
                  <div key={proj.name}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '0.85rem' }}>
                      <span style={{ maxWidth: '60%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {proj.name}
                      </span>
                      <span style={{ fontWeight: 600 }}>{currency.format(proj.value)} ({proj.percent}%)</span>
                    </div>
                    <div style={{
                      width: '100%',
                      height: '8px',
                      borderRadius: '4px',
                      backgroundColor: 'var(--surface-hover, #e5e7eb)',
                      overflow: 'hidden',
                    }}>
                      <div style={{
                        width: `${proj.percent}%`,
                        height: '100%',
                        borderRadius: '4px',
                        backgroundColor: categoryColors[(idx + 2) % categoryColors.length],
                        transition: 'width 0.3s ease',
                      }} />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="empty-state" style={{ marginTop: '16px' }}>No project expenses for this period.</p>
            )}
          </div>
        </div>

        {/* Monthly Trend (Yearly view only) */}
        {viewMode === 'yearly' && monthlyTrend.length > 0 && (
          <div className="overview-card" style={{ marginTop: '24px' }}>
            <p className="eyebrow">Spending Trend</p>
            <h2>Monthly Spending — {selectedYear}</h2>
            <div style={{ marginTop: '16px', overflowX: 'auto' }}>
              <svg viewBox="0 0 600 200" style={{ width: '100%', maxHeight: '220px' }} aria-label="Monthly spending trend chart">
                {/* Grid lines */}
                {[0, 0.25, 0.5, 0.75, 1].map((frac) => (
                  <line
                    key={frac}
                    x1="40"
                    x2="590"
                    y1={180 - frac * 160}
                    y2={180 - frac * 160}
                    stroke="var(--border, #e5e7eb)"
                    strokeWidth="0.5"
                  />
                ))}
                {/* Bars */}
                {monthlyTrend.map((m, idx) => {
                  const barHeight = barMax > 0 ? (m.value / barMax) * 160 : 0
                  const x = 50 + idx * 46
                  const barColor = m.value > 0 ? '#4b8bd8' : 'var(--border, #e5e7eb)'
                  return (
                    <g key={m.month}>
                      <rect
                        x={x}
                        y={180 - barHeight}
                        width="30"
                        height={Math.max(barHeight, 1)}
                        rx="3"
                        fill={barColor}
                        opacity={0.85}
                      />
                      <text
                        x={x + 15}
                        y="195"
                        textAnchor="middle"
                        fontSize="9"
                        fill="var(--ink-soft, #6b7280)"
                      >
                        {m.month}
                      </text>
                      {m.value > 0 && (
                        <text
                          x={x + 15}
                          y={180 - barHeight - 4}
                          textAnchor="middle"
                          fontSize="8"
                          fill="var(--ink, #374151)"
                          fontWeight="600"
                        >
                          {(m.value / 1000).toFixed(0)}k
                        </text>
                      )}
                    </g>
                  )
                })}
              </svg>
            </div>
          </div>
        )}

        {/* Expense List Table */}
        <div className="overview-card" style={{ marginTop: '24px' }}>
          <div className="card-header-bar">
            <div>
              <p className="eyebrow">Records</p>
              <h2>Approved Expenses</h2>
            </div>
            <span className="items-found-badge">{filteredExpenses.length} expenses</span>
          </div>

          <table className="data-table">
            <thead>
              <tr>
                <th>Project / Event</th>
                <th>Category</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Date Approved</th>
              </tr>
            </thead>
            <tbody>
              {filteredExpenses.length ? (
                filteredExpenses.map((expense) => (
                  <tr key={expense.id}>
                    <td data-label="Project / Event" style={{ fontWeight: 500 }}>
                      {expense.project || expense.event || '—'}
                    </td>
                    <td data-label="Category">{expense.category || '—'}</td>
                    <td data-label="Amount">{currency.format(Number(expense.amount || 0))}</td>
                    <td data-label="Status">
                      <span className="status-chip is-positive">
                        {expense.status || 'Approved'}
                      </span>
                    </td>
                    <td data-label="Date Approved">
                      {expense.approvedAt
                        ? new Date(expense.approvedAt).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })
                        : '—'}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="5" className="empty-state">
                    No approved expenses found for {periodLabel}.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </RoleGate>
  )
}

export default ExpenseSummaryPage
