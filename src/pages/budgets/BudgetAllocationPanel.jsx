import { useState, useMemo, useEffect, useRef } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useBudget } from '../../context/BudgetContext'
import CurrencyInput from '../../components/CurrencyInput'
import YearSpinner from '../../components/YearSpinner'
import PaginationControls from '../../components/PaginationControls'
import { parseBudgetAmount } from '../../services/monthlyBudget'
import { getBudgetTotalForPeriod, calculateCarryForwardBudget } from '../../utils/budgetUtils'

const BUDGETS_PAGE_SIZE = 2

const currency = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
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

function BudgetAllocationPanel() {
  const { role } = useAuth()
  const { budgets, budgetAllocations, addMonthlyBudget, expenses } = useBudget()
  const now = new Date()
  const initialMonth = now.getMonth() + 1
  const [draft, setDraft] = useState(null)
  const [viewMode, setViewMode] = useState('monthly')
  const [filterMonth, setFilterMonth] = useState(initialMonth)
  const [filterQuarter, setFilterQuarter] = useState(Math.floor((initialMonth - 1) / 3) + 1)
  const [filterYear, setFilterYear] = useState(now.getFullYear())
  const [budgetPage, setBudgetPage] = useState(1)
  const [savedMessage, setSavedMessage] = useState('')
  const [saveError, setSaveError] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const saving = useRef(false)
  const pendingAddition = useRef(null)
  const month = filterMonth
  const year = filterYear
  const canEdit = role === 'SK Treasurer'
  const periodKey = `${year}-${month}`
  const selectedBudget = budgets.find((budget) => budget.month === month && budget.year === year)

  const monthApprovedBudget = useMemo(() => {
    return getBudgetTotalForPeriod(budgets, filterMonth, filterYear)
  }, [budgets, filterMonth, filterYear])

  const monthCarryForward = useMemo(() => {
    if (viewMode !== 'monthly') return 0
    return calculateCarryForwardBudget(budgets, expenses, filterMonth, filterYear)
  }, [budgets, expenses, filterMonth, filterYear, viewMode])

  const monthTotalBudget = monthApprovedBudget + monthCarryForward
  // This form enters an additional allocation, never the existing total.
  const values = draft?.periodKey === periodKey ? draft : {
    amount: '', sourceOption: '', customSource: '', description: '',
  }
  const { amount, sourceOption, customSource, description } = values
  function editDraft(patch) {
    setDraft({ ...values, ...patch, periodKey })
  }

  useEffect(() => {
    if (!savedMessage) return
    const timer = setTimeout(() => setSavedMessage(''), 3500)
    return () => clearTimeout(timer)
  }, [savedMessage])

  async function handleSubmit(event) {
    event.preventDefault()

    if (!canEdit || saving.current) return
    setSavedMessage('')
    setSaveError('')
    // Capture the visible value before disabling controls. Autofill and native
    // input changes can occur without the formatted-input state callback.
    const enteredAmount = new FormData(event.currentTarget).get('amount')
    saving.current = true
    setIsSaving(true)
    try {
      const finalSource = sourceOption === 'Other' ? customSource : sourceOption
      const submittedAmount = parseBudgetAmount(enteredAmount)
      editDraft({ amount: String(submittedAmount) })
      const fingerprint = JSON.stringify([month, year, submittedAmount, finalSource || '', description.trim()])
      if (pendingAddition.current?.fingerprint !== fingerprint) {
        pendingAddition.current = { fingerprint, id: crypto.randomUUID() }
      }
      const result = await addMonthlyBudget({ month, year, amount: submittedAmount,
        operationId: pendingAddition.current.id,
        source: finalSource || '', description: description.trim() })
      if (result?.error) throw result.error
      if (!result?.data) throw new Error('The budget could not be saved. Please try again.')

      const monthLabel = monthOptions.find((m) => m.value === month)?.label
      setSavedMessage(`${currency.format(result.addedAmount)} added to ${monthLabel} ${year}. Monthly budget is now ${currency.format(result.data.amount)}.`)
      pendingAddition.current = null
      changePeriod({ viewMode: 'monthly', month, year })
      setDraft(null)
    } catch (error) {
      setSaveError(error?.message || 'The budget could not be saved. Please try again.')
    } finally {
      saving.current = false
      setIsSaving(false)
    }
  }

  const displayedBudgets = useMemo(() => {
    let filtered = budgetAllocations.filter(b => Number(b.year) === Number(filterYear));
    
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
  }, [budgetAllocations, viewMode, filterMonth, filterQuarter, filterYear])

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

  const periodLabel = viewMode === 'monthly'
    ? `${monthOptions.find((m) => m.value === Number(filterMonth))?.label || ''} ${filterYear}`.trim()
    : `Quarter ${filterQuarter} ${filterYear}`

  // Changing the period re-scopes the recorded budgets below and resets the
  // pager so it is never left on a page that no longer exists.
  function changePeriod(patch) {
    setDraft(null)
    if ('viewMode' in patch) setViewMode(patch.viewMode)
    if ('month' in patch) {
      setFilterMonth(patch.month)
      setFilterQuarter(Math.floor((patch.month - 1) / 3) + 1)
    }
    if ('quarter' in patch) {
      setFilterQuarter(patch.quarter)
      setFilterMonth((patch.quarter - 1) * 3 + 1)
    }
    if ('year' in patch) setFilterYear(patch.year)
    setBudgetPage(1)
  }

  return (
    <section className="dashboard-content" style={{ gap: '20px' }}>
        <div className="overview-card budgets-filter-bar">
          <div>
            <p className="eyebrow" style={{ margin: 0 }}>Period</p>
          </div>
          <div className="card-header-controls">
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <select
                value={viewMode === 'monthly' ? filterMonth : filterQuarter}
                onChange={(e) => {
                  const val = Number(e.target.value)
                  changePeriod(viewMode === 'monthly' ? { month: val } : { quarter: val })
                }}
                className="filter-select panel-select"
                aria-label={viewMode === 'monthly' ? 'Filter by month' : 'Filter by quarter'}
              >
                {viewMode === 'monthly' ? monthOptions.map(m => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                )) : quarterOptions.map(q => (
                  <option key={q.value} value={q.value}>{q.label}</option>
                ))}
              </select>
              <YearSpinner
                year={filterYear}
                onYearChange={(nextYear) => changePeriod({ year: nextYear })}
              />
            </div>
            <div className="page-tabs" role="tablist">
              <button
                className={`page-tab ${viewMode === 'monthly' ? 'is-active' : ''}`}
                type="button"
                role="tab"
                aria-selected={viewMode === 'monthly'}
                onClick={() => changePeriod({ viewMode: 'monthly' })}
              >
                Monthly
              </button>
              <button
                className={`page-tab ${viewMode === 'quarterly' ? 'is-active' : ''}`}
                type="button"
                role="tab"
                aria-selected={viewMode === 'quarterly'}
                onClick={() => changePeriod({ viewMode: 'quarterly' })}
              >
                Quarterly
              </button>
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
          <div className="overview-card" style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <span style={{ fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--ink-3)', fontWeight: 600 }}>
              {viewMode === 'monthly' ? 'Approved Monthly Budget' : 'Quarterly Recorded Budget'}
            </span>
            <span style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--ink)' }}>
              {currency.format(viewMode === 'monthly' ? monthApprovedBudget : displayedTotal)}
            </span>
            <span style={{ fontSize: '0.8rem', color: 'var(--ink-soft)' }}>
              Allocated for {periodLabel}
            </span>
          </div>

          {viewMode === 'monthly' && (
            <div className="overview-card" style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <span style={{ fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--ink-3)', fontWeight: 600 }}>
                Carried Forward Unused Budget
              </span>
              <span style={{ fontSize: '1.4rem', fontWeight: 700, color: monthCarryForward > 0 ? 'var(--positive, #15803d)' : 'var(--ink)' }}>
                {currency.format(monthCarryForward)}
              </span>
              <span style={{ fontSize: '0.8rem', color: 'var(--ink-soft)' }}>
                {monthCarryForward > 0 ? 'Unused funds transferred from past months' : 'No unused funds to carry forward'}
              </span>
            </div>
          )}

          {viewMode === 'monthly' && (
            <div className="overview-card" style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '4px', borderLeft: '4px solid var(--brand, #0E6B4D)' }}>
              <span style={{ fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--brand, #0E6B4D)', fontWeight: 600 }}>
                Total Available Budget
              </span>
              <span style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--ink)' }}>
                {currency.format(monthTotalBudget)}
              </span>
              <span style={{ fontSize: '0.8rem', color: 'var(--ink-soft)' }}>
                {monthCarryForward > 0
                  ? `${currency.format(monthApprovedBudget)} approved + ${currency.format(monthCarryForward)} carried forward`
                  : `Total available for ${periodLabel}`}
              </span>
            </div>
          )}
        </div>

        {/* Form and history sit side by side on desktop (≥1024px) instead of
            stacking full-width — the form only ever needs a few input-width
            columns, so giving it the whole row wasted the space history could
            use for a second card per line. `.two-column` already collapses
            back to a single column below 1024px. */}
        <div className={canEdit ? 'dashboard-content two-column' : undefined} style={canEdit ? { gap: '20px' } : undefined}>
        {canEdit && (
          <div className="overview-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div>
              <p className="eyebrow">Monthly budget</p>
              <h2 style={{ margin: 0 }}>Add to monthly budget</h2>
              <p className="form-note">
                Current approved: {currency.format(monthApprovedBudget)}
                {monthCarryForward > 0 ? ` (Total with carry-forward: ${currency.format(monthTotalBudget)})` : ''}. The amount entered below will be added to this total.
              </p>
            </div>
            <form className="user-form" onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              <fieldset disabled={isSaving} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
              <div className="form-grid">
                <label className="field">
                  <span>Month</span>
                  <select
                    value={month}
                    required
                    onChange={(event) => changePeriod({ month: Number(event.target.value) })}
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
                    <YearSpinner year={year} onYearChange={(nextYear) => changePeriod({ year: nextYear })} />
                  </div>
                </label>
                <label className="field">
                  <span>Amount to add (PHP)</span>
                  <CurrencyInput
                    name="amount"
                    value={amount}
                    onValueChange={(val, _name, sourceInfo) => {
                      if (sourceInfo?.source !== 'prop') editDraft({ amount: val })
                    }}
                    placeholder="250,000"
                    required
                  />
                </label>
                <label className="field">
                  <span>Budget Source (Optional)</span>
                  <select
                    value={sourceOption}
                    onChange={(event) => editDraft({ sourceOption: event.target.value })}
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
                  <label className="field" style={{ display: 'flex', flexDirection: 'column', gap: '4px', gridColumn: '1 / -1' }}>
                    <span style={{ fontWeight: 500, fontSize: '0.9rem', color: 'var(--ink)' }}>Specify Other Source</span>
                    <input
                      type="text"
                      value={customSource}
                      onChange={(event) => editDraft({ customSource: event.target.value })}
                      placeholder="e.g. Fundraising Event"
                      required
                      style={{ width: '100%' }}
                    />
                  </label>
                )}
                <label className="field" style={{ gridColumn: '1 / -1' }}>
                  <span>Description (Optional)</span>
                  <textarea
                    value={description}
                    onChange={(event) => editDraft({ description: event.target.value })}
                    placeholder="Purpose or notes for this allocation"
                    rows={3}
                  />
                </label>
              </div>
              </fieldset>
              {saveError && <p role="alert" className="form-note">{saveError}</p>}
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
              <button type="submit" disabled={isSaving} className="primary-button" style={{ alignSelf: 'flex-start', padding: '10px 24px' }}>
                {isSaving ? 'Saving...' : 'Save Budget'}
              </button>
            </form>
          </div>
        )}

        <div className="overview-card" style={{ padding: '24px' }}>
          <div className="card-header-bar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', marginBottom: '20px' }}>
            <div>
              <p className="eyebrow">History</p>
              <h2 style={{ margin: 0 }}>Recorded budgets</h2>
              <p className="form-note" style={{ margin: '6px 0 0' }}>
                {displayedBudgets.length} allocation{displayedBudgets.length === 1 ? '' : 's'} · {currency.format(displayedTotal)} total
              </p>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '20px' }}>
            {displayedBudgets.length ? (
              paginatedBudgets.map((budget) => (
                <div key={budget.id} style={{ border: '1px solid var(--line)', borderRadius: 'var(--radius-surface)', padding: '20px', backgroundColor: 'var(--surface)', boxShadow: 'var(--shadow)', display: 'flex', flexDirection: 'column' }}>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
                    <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 600, color: 'var(--ink)', lineHeight: '1.3' }}>
                      {budget.periodLabel} {budget.year}
                    </h3>
                    <span className="status-pill status-approved" style={{ flexShrink: 0, marginLeft: '12px' }}>
                      Recorded
                    </span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
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
                      <p style={{ margin: 0, fontSize: '0.95rem', color: 'var(--ink)' }}>{budget.addedBy || 'Not recorded'}</p>
                    </div>
                    <div>
                      <p style={{ margin: '0 0 4px', fontSize: '0.85rem', fontWeight: 600, color: 'var(--ink-3)' }}>Last Updated</p>
                      <p style={{ margin: 0, fontSize: '0.95rem', color: 'var(--ink)' }}>{budget.updatedAt ? new Date(budget.updatedAt).toLocaleString() : 'Not recorded'}</p>
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
                No recorded budgets for {periodLabel}
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
      </div>
    </section>
  )
}

export default BudgetAllocationPanel
