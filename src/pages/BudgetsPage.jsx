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

function BudgetsPage() {
  const { role } = useAuth()
  const { budgets, addQuarterBudget } = useBudget()
  const [quarter, setQuarter] = useState('')
  const [amount, setAmount] = useState('')
  const canEdit = role === 'SK Chairman'

  function handleSubmit(event) {
    event.preventDefault()

    if (!canEdit) {
      return
    }

    const cleanedAmount = parseNumberInput(amount)
    if (!quarter.trim() || Number.isNaN(cleanedAmount)) {
      return
    }

    addQuarterBudget({
      quarter: quarter.trim(),
      amount: cleanedAmount,
    })

    setQuarter('')
    setAmount('')
  }

  return (
    <>
      <header className="dashboard-header">
        <div className="header-left">
          <div>
            <p className="eyebrow">Budgets</p>
            <h1>Quarterly budget allocation</h1>
            <p>Set the total quarterly budget for SK programs.</p>
          </div>
        </div>
      </header>

      <section className="dashboard-content">
        {canEdit ? (
          <div className="overview-card">
            <p className="eyebrow">New budget</p>
            <h2>Add a quarterly budget</h2>
            <form className="user-form" onSubmit={handleSubmit}>
              <div className="form-grid">
                <label className="field">
                  <span>Quarter</span>
                  <input
                    type="text"
                    value={quarter}
                    onChange={(event) => setQuarter(event.target.value)}
                    placeholder="2026 Q3"
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
            <h2>Quarterly budgets</h2>
            <p className="form-note">
              Only the SK Chairman can add or edit budgets. You have view-only
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
                <th>Quarter</th>
                <th>Total Budget</th>
                <th>Date Added</th>
              </tr>
            </thead>
            <tbody>
              {budgets.length ? (
                budgets.map((budget) => (
                  <tr key={budget.id}>
                    <td>{budget.quarter}</td>
                    <td>{currency.format(budget.amount)}</td>
                    <td>{new Date(budget.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="3" className="empty-state">
                    No quarterly budgets yet.
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
