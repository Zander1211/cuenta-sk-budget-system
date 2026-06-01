import { useState } from 'react'
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
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

function BudgetsPage() {
  const { role } = useAuth()
  const { budgets, addMonthlyBudget } = useBudget()
  const now = new Date()
  const [month, setMonth] = useState(now.getMonth())
  const [year, setYear] = useState(now.getFullYear())
  const [amount, setAmount] = useState('')
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

  return (
    <>
      <header className="dashboard-header">
        <div className="header-left">
          <div>
            <p className="eyebrow">Budgets</p>
            <h1>Monthly budget allocation</h1>
            <p>Set the monthly budget for SK programs.</p>
          </div>
        </div>
      </header>

      <section className="dashboard-content">
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
                    {monthOptions.map((label, index) => (
                      <option key={label} value={index}>
                        {label}
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
            <h2>Monthly budgets</h2>
            <p className="form-note">
              Only the SK Treasurer can add or edit budgets. You have view-only
              access.
            </p>
          </div>
        )}

        <div className="overview-card">
          <p className="eyebrow">History</p>
          <h2>Recorded budgets</h2>
          <table className="data-table">
            <thead>
              <tr>
                <th>Month</th>
                <th>Year</th>
                <th>Total Budget</th>
                <th>Date Added</th>
              </tr>
            </thead>
            <tbody>
              {budgets.length ? (
                budgets.map((budget) => (
                  <tr key={budget.id}>
                    <td>{monthOptions[budget.month] || '—'}</td>
                    <td>{budget.year}</td>
                    <td>{currency.format(budget.amount)}</td>
                    <td>{new Date(budget.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="4" className="empty-state">
                    No monthly budgets yet.
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
