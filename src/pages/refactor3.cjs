const fs = require('fs');

const oldMain = fs.readFileSync('MainDashboardPage_old.jsx', 'utf8');
const oldAi = fs.readFileSync('AiAnalysisPage_old.jsx', 'utf8');

// --- 1. MainDashboardPage ---
let newMain = oldMain;
newMain = newMain.replace(/<section className="dashboard-filters"[\s\S]*?<\/section>\s*/, '');
newMain = newMain.replace(/<section className="dashboard-panels">[\s\S]*?<\/section>\s*/, '');
newMain = newMain.replace(/<section className="dashboard-panels single">[\s\S]*?<\/section>\s*/, '');
fs.writeFileSync('MainDashboardPage.jsx', newMain);

// --- 2. AiAnalysisPage ---
let newAi = oldAi;

const quarterOptions = `
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
`;
newAi = newAi.replace(/const currency = /, quarterOptions + '\nconst currency = ');

const logicToInject = `
  const [viewMode, setViewMode] = useState('quarterly')
  const currentDate = new Date()
  const currentYear = currentDate.getFullYear()
  const currentQuarter = Math.floor(currentDate.getMonth() / 3) + 1
  const [selectedQuarter, setSelectedQuarter] = useState(currentQuarter)
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

  const periodLabel = viewMode === 'quarterly' ? \`Q\${selectedQuarter} \${selectedYear}\` : \`\${selectedYear}\`
  const periodDescriptor = viewMode === 'quarterly' ? 'quarter' : 'year'

  function isInPeriod(dateValue) {
    const date = parseDate(dateValue)
    if (!date) return false
    if (viewMode === 'quarterly') {
      const quarter = Math.floor(date.getMonth() / 3) + 1
      return date.getFullYear() === selectedYear && quarter === selectedQuarter
    }
    return date.getFullYear() === selectedYear
  }

  function budgetMatchesPeriod(budget) {
    if (!Number.isFinite(budget.quarter) || !Number.isFinite(budget.year)) return false
    if (viewMode === 'quarterly') {
      return budget.year === selectedYear && budget.quarter === selectedQuarter
    }
    return budget.year === selectedYear
  }

  const filteredBudgets = budgets.filter(budgetMatchesPeriod)
  const totalBudget = filteredBudgets.reduce((sum, budget) => sum + Number(budget.amount || 0), 0)

  const filteredExpenses = expenses.filter((expense) => {
    if (expense.archivedAt || expense.status === 'Cancelled') return false
    return isInPeriod(expense.approvedAt || expense.createdAt || expense.eventDate || expense.date)
  })
  const totalExpenses = filteredExpenses.reduce((sum, item) => sum + Number(item.amount || 0), 0)
  
  const remainingBudget = totalBudget - totalExpenses
  const usedPercentOld = totalBudget > 0 ? Math.min(100, Math.round((totalExpenses / totalBudget) * 100)) : 0
  const remainingPercent = totalBudget > 0 ? Math.max(0, 100 - usedPercentOld) : 0
  const hasBudgetData = totalBudget > 0

  const filteredRequests = requests.filter((request) => isInPeriod(request.submittedAt || request.createdAt || request.eventDate))
  const pendingCount = filteredRequests.filter(req => (!req.status || req.status === 'Pending') && !req.archivedAt).length

  const summaryCards = [
    {
      label: 'Total Budget',
      value: currency.format(totalBudget),
      meta: filteredBudgets.length ? \`Allocated for \${periodLabel}\` : 'No budget entries yet',
      chip: filteredBudgets.length ? (viewMode === 'quarterly' ? 'Quarterly' : 'Yearly') : 'Empty',
      tone: filteredBudgets.length ? 'positive' : 'neutral',
    },
    {
      label: 'Total Expenses',
      value: currency.format(totalExpenses),
      meta: totalExpenses ? \`Approved requests in \${periodLabel}\` : 'No expenses recorded',
      chip: hasBudgetData ? \`\${usedPercentOld}% used\` : 'Awaiting data',
      tone: usedPercentOld > 80 ? 'warning' : 'positive',
    },
    {
      label: 'Remaining Budget',
      value: currency.format(remainingBudget),
      meta: hasBudgetData ? 'Updated from approvals' : 'Add a budget to start',
      chip: hasBudgetData ? \`\${remainingPercent}% left\` : 'Not started',
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
    return \`\${x},\${y}\`
  }).join(' ')
`;

newAi = newAi.replace(/const pendingRequests = useMemo/, logicToInject + '\n  const pendingRequests = useMemo');

newAi = newAi.replace(/import \{ useCallback, useEffect, useMemo, useState \} from 'react'/, 
  "import { useCallback, useEffect, useMemo, useState } from 'react'\nimport { Wallet, Receipt, PieChart, ClipboardCheck } from 'lucide-react'");

const layoutToInject = `
      <section className="dashboard-filters" aria-label="Budget filters" style={{ marginBottom: '24px' }}>
        <div className="filter-group">
          <span className="filter-label">View</span>
          <div className="filter-toggle">
            <button
              type="button"
              className={\`filter-toggle-btn \${viewMode === 'quarterly' ? 'is-active' : ''}\`}
              onClick={() => setViewMode('quarterly')}
            >
              Quarterly Budget
            </button>
            <button
              type="button"
              className={\`filter-toggle-btn \${viewMode === 'yearly' ? 'is-active' : ''}\`}
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
              <option key={q.value} value={q.value}>{q.label}</option>
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
                <span className={\`summary-chip \${card.tone}\`}>{card.chip}</span>
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
              <div className={\`donut \${hasBudgetData ? '' : 'is-empty'}\`} style={{ '--donut-value': usedPercentOld }}>
                <div className="donut-center">
                  <span className="donut-value">{usedPercentOld}%</span>
                  <span className="donut-label">used</span>
                </div>
              </div>
              <div className="category-list">
                {categoryShare.map((item) => (
                  <div key={item.label} className="category-row">
                    <span className={\`category-dot \${item.tone}\`} />
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
                <span className={\`trend-badge \${hasBudgetData ? 'positive' : 'neutral'}\`}>
                  {hasBudgetData ? 'Updated' : 'Awaiting data'}
                </span>
              </div>
              <div className={\`trend-chart \${hasBudgetData ? '' : 'is-empty'}\`}>
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
`;

const statGridRegex = /<div className="stat-grid">[\s\S]*?<\/div>\s*<div className="ai-main-grid">/;
newAi = newAi.replace(statGridRegex, layoutToInject + '\\n        <div className="ai-main-grid">');

const oldOverviewCardRegex = /<div className="overview-card">\s*<div className="ai-card-header">\s*<div>\s*<p className="eyebrow">Spending Overview<\/p>[\s\S]*?<p className="ai-card-foot">[\s\S]*?<\/p>\s*<\/div>/;
newAi = newAi.replace(oldOverviewCardRegex, '');

newAi = newAi.replace(/<div className="overview-card">\s*(<div className="ai-card-header">\s*<div>\s*<p className="eyebrow">AI Insights<\/p>)/, '<div className="overview-card" style={{ gridColumn: "1 / -1" }}>\\n            $1');

fs.writeFileSync('AiAnalysisPage.jsx', newAi);
