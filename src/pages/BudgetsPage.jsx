import { useState, useMemo } from 'react'
import { useAuth } from '../context/AuthContext'
import { useBudget } from '../context/BudgetContext'
import CurrencyInput from '../components/CurrencyInput'
import YearSpinner from '../components/YearSpinner'

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
  const [viewMode, setViewMode] = useState('monthly')
  const [filterMonth, setFilterMonth] = useState(initialMonth)
  const [filterQuarter, setFilterQuarter] = useState(Math.floor((initialMonth - 1) / 3) + 1)
  const [filterYear, setFilterYear] = useState(now.getFullYear())
  const canEdit = role === 'SK Treasurer'

  function handleSubmit(event) {
    event.preventDefault()

    if (!canEdit) {
      return
    }

    const cleanedAmount = Number(amount)
    if (Number.isNaN(cleanedAmount) || cleanedAmount <= 0) {
      return
    }

    const finalSource = sourceOption === 'Other' ? customSource : sourceOption

    addMonthlyBudget({
      month,
      year,
      amount: cleanedAmount,
      source: finalSource || '',
    })

    setAmount('')
    setSourceOption('')
    setCustomSource('')
  }

  const displayedBudgets = useMemo(() => {
    let filtered = budgets.filter(b => b.year === filterYear);
    
    if (viewMode === 'monthly') {
      filtered = filtered.filter(b => b.month === filterMonth);
      return filtered.map(b => ({
        ...b,
        periodLabel: monthOptions.find(m => m.value === b.month)?.label || `Month ${b.month}`
      }))
    } else {
      filtered = filtered.filter(b => b.quarter === filterQuarter);
      // Aggregate by quarter and year
      const aggregated = {};
      filtered.forEach(b => {
        const key = `${b.year}-Q${b.quarter}`;
        if (!aggregated[key]) {
          aggregated[key] = {
            id: key,
            quarter: b.quarter,
            year: b.year,
            amount: 0,
            createdAt: b.createdAt,
            periodLabel: quarterOptions.find(q => q.value === b.quarter)?.label || `Q${b.quarter}`
          }
        }
        aggregated[key].amount += b.amount;
        if (new Date(b.createdAt) > new Date(aggregated[key].createdAt)) {
          aggregated[key].createdAt = b.createdAt;
        }
      });
      return Object.values(aggregated).sort((a, b) => {
        if (a.year !== b.year) return b.year - a.year;
        return b.quarter - a.quarter;
      });
    }
  }, [budgets, viewMode, filterMonth, filterQuarter, filterYear])

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

      <section className="dashboard-content two-column" style={{ gap: '24px', alignItems: 'start' }}>
        {canEdit ? (
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
                  <span style={{ fontWeight: 500, fontSize: '0.9rem', color: '#374151' }}>Year</span>
                  <div>
                    <YearSpinner year={year} onYearChange={setYear} />
                  </div>
                </label>
                <label className="field">
                  <span>Total budget (PHP)</span>
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
                    <span style={{ fontWeight: 500, fontSize: '0.9rem', color: '#374151' }}>Specify Other Source</span>
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
              </div>
              <button type="submit" className="primary-button" style={{ alignSelf: 'flex-start', padding: '10px 24px' }}>
                Save Budget
              </button>
            </form>
          </div>
        ) : (
          <div className="overview-card" style={{ padding: '24px' }}>
            <p className="eyebrow">Budget summary</p>
            <h2 style={{ margin: 0, marginBottom: '8px' }}>Budgets</h2>
            <p className="form-note">
              Only the SK Treasurer can add or edit budgets. You have view-only
              access.
            </p>
          </div>
        )}

        <div className="overview-card" style={{ padding: '24px' }}>
          <div className="card-header-bar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
            <div>
              <p className="eyebrow">History</p>
              <h2 style={{ margin: 0 }}>Recorded budgets</h2>
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
                  }}
                  className="filter-select panel-select"
                >
                  {viewMode === 'monthly' ? monthOptions.map(m => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  )) : quarterOptions.map(q => (
                    <option key={q.value} value={q.value}>{q.label}</option>
                  ))}
                </select>
                <YearSpinner year={filterYear} onYearChange={setFilterYear} />
              </div>
              <div className="page-tabs" role="tablist">
                <button
                  className={`page-tab ${viewMode === 'monthly' ? 'is-active' : ''}`}
                  type="button"
                  role="tab"
                  aria-selected={viewMode === 'monthly'}
                  onClick={() => setViewMode('monthly')}
                >
                  Monthly
                </button>
                <button
                  className={`page-tab ${viewMode === 'quarterly' ? 'is-active' : ''}`}
                  type="button"
                  role="tab"
                  aria-selected={viewMode === 'quarterly'}
                  onClick={() => setViewMode('quarterly')}
                >
                  Quarterly
                </button>
              </div>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '24px' }}>
            {displayedBudgets.length ? (
              displayedBudgets.map((budget) => (
                <div key={budget.id} style={{ border: '1px solid #e5e7eb', borderRadius: '12px', padding: '24px', backgroundColor: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column' }}>
                  
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                    <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600, color: '#111827', lineHeight: '1.3' }}>
                      {budget.periodLabel} {budget.year}
                    </h3>
                    <span className="status-pill status-approved" style={{ flexShrink: 0, marginLeft: '12px' }}>
                      Recorded
                    </span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                    <div>
                      <p style={{ margin: '0 0 4px', fontSize: '0.85rem', fontWeight: 600, color: '#6b7280' }}>Budget Amount</p>
                      <p style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: '#059669' }}>{currency.format(budget.amount)}</p>
                    </div>
                    {viewMode === 'monthly' && (
                      <div>
                        <p style={{ margin: '0 0 4px', fontSize: '0.85rem', fontWeight: 600, color: '#6b7280' }}>Budget Source</p>
                        <p style={{ margin: 0, fontSize: '0.95rem', color: '#374151' }}>{budget.source || 'Not Specified'}</p>
                      </div>
                    )}
                    <div>
                      <p style={{ margin: '0 0 4px', fontSize: '0.85rem', fontWeight: 600, color: '#6b7280' }}>{viewMode === 'monthly' ? 'Date Recorded' : 'Last Updated'}</p>
                      <p style={{ margin: 0, fontSize: '0.95rem', color: '#374151' }}>{new Date(budget.createdAt).toLocaleDateString()}</p>
                    </div>
                    <div>
                      <p style={{ margin: '0 0 4px', fontSize: '0.85rem', fontWeight: 600, color: '#6b7280' }}>Recorded By</p>
                      <p style={{ margin: 0, fontSize: '0.95rem', color: '#374151' }}>SK Treasurer</p>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '40px', color: '#6b7280', backgroundColor: '#f9fafb', borderRadius: '12px' }}>
                No recorded budget history found
              </div>
            )}
          </div>
        </div>
      </section>
    </>
  )
}

export default BudgetsPage
