import { useState, useMemo, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { useBudget } from '../context/BudgetContext'
import CurrencyInput from '../components/CurrencyInput'
import YearSpinner from '../components/YearSpinner'
import PaginationControls from '../components/PaginationControls'

const BUDGETS_PAGE_SIZE = 2

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

const quarterOptions = [
  { value: 1, label: 'Quarter 1 (Jan - Mar)' },
  { value: 2, label: 'Quarter 2 (Apr - Jun)' },
  { value: 3, label: 'Quarter 3 (Jul - Sep)' },
  { value: 4, label: 'Quarter 4 (Oct - Dec)' },
]

function BudgetsPage() {
  const { role } = useAuth()
  const { budgets, addMonthlyBudget } = useBudget()
  const now = new Date()
  const initialMonth = now.getMonth() + 1
  const [month, setMonth] = useState(initialMonth)
  const [year, setYear] = useState(now.getFullYear())
  const [amount, setAmount] = useState('')
  const [sourceOption, setSourceOption] = useState('')
  const [customSource, setCustomSource] = useState('')
  const [description, setDescription] = useState('')
  const [viewMode, setViewMode] = useState('monthly')
  const [filterMonth, setFilterMonth] = useState(initialMonth)
  const [filterQuarter, setFilterQuarter] = useState(Math.floor((initialMonth - 1) / 3) + 1)
  const [filterYear, setFilterYear] = useState(now.getFullYear())
  const [budgetPage, setBudgetPage] = useState(1)
  const [savedMessage, setSavedMessage] = useState('')
  const canEdit = role === 'SK Treasurer'

  useEffect(() => {
    if (!savedMessage) return
    const timer = setTimeout(() => setSavedMessage(''), 3500)
    return () => clearTimeout(timer)
  }, [savedMessage])

  async function handleSubmit(event) {
    event.preventDefault()

    if (!canEdit) {
      return
    }

    const cleanedAmount = Number(amount)
    if (Number.isNaN(cleanedAmount) || cleanedAmount <= 0) {
      return
    }

    const finalSource = sourceOption === 'Other' ? customSource : sourceOption

    const result = await addMonthlyBudget({
      month,
      year,
      amount: cleanedAmount,
      source: finalSource || '',
      description: description.trim(),
    })

    if (result?.error) return

    const monthLabel = monthOptions.find((m) => m.value === month)?.label || `Month ${month}`
    setSavedMessage(`Budget for ${monthLabel} ${year} was added successfully.`)

    setAmount('')
    setSourceOption('')
    setCustomSource('')
    setDescription('')
    setBudgetPage(1)
  }

  const displayedBudgets = useMemo(() => {
    let filtered = budgets.filter(b => Number(b.year) === Number(filterYear));
    
    if (viewMode === 'monthly') {
      filtered = filtered.filter(b => Number(b.month) === Number(filterMonth));
    } else {
      filtered = filtered.filter(b => Number(b.quarter) === Number(filterQuarter));
    }

    return filtered
      .map(b => ({
        ...b,
        periodLabel: monthOptions.find(m => m.value === b.month)?.label || `Month ${b.month}`
      }))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
  }, [budgets, viewMode, filterMonth, filterQuarter, filterYear])

  const displayedTotal = useMemo(
    () => displayedBudgets.reduce((sum, budget) => sum + (Number(budget.amount) || 0), 0),
    [displayedBudgets],
  )
  const budgetTotalPages = Math.max(1, Math.ceil(displayedBudgets.length / BUDGETS_PAGE_SIZE))
  const safeBudgetPage = Math.min(budgetPage, budgetTotalPages)
  const paginatedBudgets = useMemo(() => {
    const start = (safeBudgetPage - 1) * BUDGETS_PAGE_SIZE
    return displayedBudgets.slice(start, start + BUDGETS_PAGE_SIZE)
  }, [displayedBudgets, safeBudgetPage])

  return (
    <>
      <header className="dashboard-header">
        <div className="header-left">
          <div>
            <p className="eyebrow">Budgets</p>
            <h1>Budget allocation</h1>
            <p>Set the budget for SK programs.</p>
          </div>
        </div>
      </header>

      <section className={`dashboard-content ${canEdit ? 'two-column' : ''}`} style={{ gap: '24px', alignItems: 'start' }}>
        {canEdit && (
          <div className="overview-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div>
              <p className="eyebrow">New budget</p>
              <h2 style={{ margin: 0 }}>Add a monthly budget</h2>
            </div>
            <form className="user-form" onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div className="form-grid" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <label className="field">
                  <span>Month</span>
                  <select
                    value={month}
                    onChange={(event) => setMonth(Number(event.target.value))}
                  >
                    {monthOptions.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span style={{ fontWeight: 500, fontSize: '0.9rem', color: 'var(--ink)' }}>Year</span>
                  <div>
                    <YearSpinner year={year} onYearChange={setYear} />
                  </div>
                </label>
                <label className="field">
                  <span>Allocation amount (PHP)</span>
                  <CurrencyInput
                    value={amount}
                    onValueChange={(val) => setAmount(val)}
                    placeholder="250,000"
                    required
                  />
                </label>
                <label className="field">
                  <span>Budget Source (Optional)</span>
                  <select
                    value={sourceOption}
                    onChange={(event) => setSourceOption(event.target.value)}
                  >
                    <option value="">Select a source (Optional)</option>
                    <option value="Regular SK Budget">Regular SK Budget</option>
                    <option value="Donation">Donation</option>
                    <option value="Solicitation">Solicitation</option>
                    <option value="Sponsorship">Sponsorship</option>
                    <option value="Other">Other</option>
                  </select>
                </label>
                {sourceOption === 'Other' && (
                  <label className="field" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span style={{ fontWeight: 500, fontSize: '0.9rem', color: 'var(--ink)' }}>Specify Other Source</span>
                    <input
                      type="text"
                      value={customSource}
                      onChange={(event) => setCustomSource(event.target.value)}
                      placeholder="e.g. Fundraising Event"
                      required
                      style={{ width: '100%' }}
                    />
                  </label>
                )}
                <label className="field">
                  <span>Description (Optional)</span>
                  <textarea
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    placeholder="Purpose or notes for this allocation"
                    rows={3}
                  />
                </label>
              </div>
              {savedMessage && (
                <div
                  role="status"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '12px 16px',
                    borderRadius: 'var(--radius-surface)',
                    backgroundColor: 'var(--positive-soft)',
                    color: 'var(--positive)',
                    fontWeight: 500,
                    fontSize: '0.9rem',
                  }}
                >
                  <span aria-hidden="true">✓</span>
                  <span>{savedMessage}</span>
                </div>
              )}
              <button type="submit" className="primary-button" style={{ alignSelf: 'flex-start', padding: '10px 24px' }}>
                Save Budget
              </button>
            </form>
          </div>
        )}

        <div className="overview-card" style={{ padding: '24px' }}>
          <div className="card-header-bar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
            <div>
              <p className="eyebrow">History</p>
              <h2 style={{ margin: 0 }}>Recorded budgets</h2>
              <p className="form-note" style={{ margin: '6px 0 0' }}>
                {displayedBudgets.length} allocation{displayedBudgets.length === 1 ? '' : 's'} · {currency.format(displayedTotal)} total
              </p>
            </div>
            <div className="card-header-controls">
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <select
                  value={viewMode === 'monthly' ? filterMonth : filterQuarter}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    if (viewMode === 'monthly') {
                      setFilterMonth(val);
                    } else {
                      setFilterQuarter(val);
                    }
                    setBudgetPage(1)
                  }}
                  className="filter-select panel-select"
                >
                  {viewMode === 'monthly' ? monthOptions.map(m => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  )) : quarterOptions.map(q => (
                    <option key={q.value} value={q.value}>{q.label}</option>
                  ))}
                </select>
                <YearSpinner
                  year={filterYear}
                  onYearChange={(nextYear) => {
                    setFilterYear(nextYear)
                    setBudgetPage(1)
                  }}
                />
              </div>
              <div className="page-tabs" role="tablist">
                <button
                  className={`page-tab ${viewMode === 'monthly' ? 'is-active' : ''}`}
                  type="button"
                  role="tab"
                  aria-selected={viewMode === 'monthly'}
                  onClick={() => {
                    setViewMode('monthly')
                    setBudgetPage(1)
                  }}
                >
                  Monthly
                </button>
                <button
                  className={`page-tab ${viewMode === 'quarterly' ? 'is-active' : ''}`}
                  type="button"
                  role="tab"
                  aria-selected={viewMode === 'quarterly'}
                  onClick={() => {
                    setViewMode('quarterly')
                    setBudgetPage(1)
                  }}
                >
                  Quarterly
                </button>
              </div>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '24px' }}>
            {displayedBudgets.length ? (
              paginatedBudgets.map((budget) => (
                <div key={budget.id} style={{ border: '1px solid var(--line)', borderRadius: 'var(--radius-surface)', padding: '24px', backgroundColor: 'var(--surface)', boxShadow: 'var(--shadow)', display: 'flex', flexDirection: 'column' }}>
                  
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                    <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600, color: 'var(--ink)', lineHeight: '1.3' }}>
                      {budget.periodLabel} {budget.year}
                    </h3>
                    <span className="status-pill status-approved" style={{ flexShrink: 0, marginLeft: '12px' }}>
                      Recorded
                    </span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                    <div>
                      <p style={{ margin: '0 0 4px', fontSize: '0.85rem', fontWeight: 600, color: 'var(--ink-3)' }}>Budget Amount</p>
                      <p style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: 'var(--positive)' }}>{currency.format(budget.amount)}</p>
                    </div>
                    <div>
                      <p style={{ margin: '0 0 4px', fontSize: '0.85rem', fontWeight: 600, color: 'var(--ink-3)' }}>Budget Source</p>
                      <p style={{ margin: 0, fontSize: '0.95rem', color: 'var(--ink)' }}>{budget.source || 'Not Specified'}</p>
                    </div>
                    <div>
                      <p style={{ margin: '0 0 4px', fontSize: '0.85rem', fontWeight: 600, color: 'var(--ink-3)' }}>Date Added</p>
                      <p style={{ margin: 0, fontSize: '0.95rem', color: 'var(--ink)' }}>{new Date(budget.createdAt).toLocaleString()}</p>
                    </div>
                    <div>
                      <p style={{ margin: '0 0 4px', fontSize: '0.85rem', fontWeight: 600, color: 'var(--ink-3)' }}>Added By</p>
                      <p style={{ margin: 0, fontSize: '0.95rem', color: 'var(--ink)' }}>{budget.addedBy || 'SK Treasurer'}</p>
                    </div>
                  </div>
                  <div style={{ borderTop: '1px solid var(--line)', paddingTop: '12px' }}>
                    <p style={{ margin: '0 0 4px', fontSize: '0.85rem', fontWeight: 600, color: 'var(--ink-3)' }}>Description</p>
                    <p style={{ margin: 0, fontSize: '0.95rem', color: 'var(--ink)' }}>{budget.description || 'No description provided'}</p>
                  </div>
                </div>
              ))
            ) : (
              <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '40px', color: 'var(--ink-3)', backgroundColor: 'var(--surface-2)', borderRadius: 'var(--radius-surface)' }}>
                No recorded budget history found
              </div>
            )}
          </div>
          <PaginationControls
            currentPage={safeBudgetPage}
            totalPages={budgetTotalPages}
            totalItems={displayedBudgets.length}
            pageSize={BUDGETS_PAGE_SIZE}
            onPageChange={setBudgetPage}
            idPrefix="budgets"
          />
        </div>
      </section>
    </>
  )
}

export default BudgetsPage
