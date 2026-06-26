import { useState, useMemo } from 'react'
import { useAuth } from '../context/AuthContext'
import { useBudget } from '../context/BudgetContext'

const currency = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  maximumFractionDigits: 0,
})

const numberFormatter = new Intl.NumberFormat('en-PH', {
  maximumFractionDigits: 0,
})

const parseNumberInput = (value) => {
  const numeric = String(value).replace(/,/g, '')
  return numeric ? Number(numeric) : 0
}

const formatNumberInput = (value) => {
  const numeric = String(value).replace(/\D/g, '')
  if (!numeric) {
    return ''
  }

  return numberFormatter.format(Number(numeric))
}

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
  const [viewMode, setViewMode] = useState('monthly')
  const canEdit = role === 'SK Treasurer'

  function handleSubmit(event) {
    event.preventDefault()

    if (!canEdit) {
      return
    }

    const cleanedAmount = parseNumberInput(amount)
    if (Number.isNaN(cleanedAmount) || cleanedAmount <= 0) {
      return
    }

    addMonthlyBudget({
      month,
      year,
      amount: cleanedAmount,
    })

    setAmount('')
  }

  const displayedBudgets = useMemo(() => {
    if (viewMode === 'monthly') {
      return budgets.map(b => ({
        ...b,
        periodLabel: monthOptions.find(m => m.value === b.month)?.label || `Month ${b.month}`
      }))
    } else {
      // Aggregate by quarter and year
      const aggregated = {};
      budgets.forEach(b => {
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
  }, [budgets, viewMode])

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

      <section className="dashboard-content two-column">
        {canEdit ? (
          <div className="overview-card">
            <p className="eyebrow">New budget</p>
            <h2>Add a monthly budget</h2>
            <form className="user-form" onSubmit={handleSubmit}>
              <div className="form-grid">
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
                <label className="field">
                  <span>Year</span>
                  <input
                    type="number"
                    value={year}
                    min="2000"
                    max="2100"
                    onChange={(event) => setYear(Number(event.target.value))}
                    required
                  />
                </label>
                <label className="field">
                  <span>Total budget (PHP)</span>
                  <div className="input-with-symbol">
                    <span className="currency-symbol">₱</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={amount}
                      onChange={(event) =>
                        setAmount(formatNumberInput(event.target.value))
                      }
                      placeholder="250,000"
                      required
                    />
                  </div>
                </label>
              </div>
              <button type="submit" className="primary-button">
                Save Budget
              </button>
            </form>
          </div>
        ) : (
          <div className="overview-card">
            <p className="eyebrow">Budget summary</p>
            <h2>Budgets</h2>
            <p className="form-note">
              Only the SK Treasurer can add or edit budgets. You have view-only
              access.
            </p>
          </div>
        )}

        <div className="overview-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div>
              <p className="eyebrow">History</p>
              <h2 style={{ margin: 0 }}>Recorded budgets</h2>
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
          <table className="data-table">
            <thead>
              <tr>
                <th>{viewMode === 'monthly' ? 'Month' : 'Quarter'}</th>
                <th>Year</th>
                <th>Total Budget</th>
                <th>{viewMode === 'monthly' ? 'Date Added' : 'Last Updated'}</th>
              </tr>
            </thead>
            <tbody>
              {displayedBudgets.length ? (
                displayedBudgets.map((budget) => (
                  <tr key={budget.id}>
                    <td>{budget.periodLabel}</td>
                    <td>{budget.year}</td>
                    <td>{currency.format(budget.amount)}</td>
                    <td>{new Date(budget.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="4" className="empty-state">
                    No budgets yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  )
}

export default BudgetsPage
