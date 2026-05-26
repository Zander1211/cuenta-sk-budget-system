import { useAuth } from '../context/AuthContext'
import { useBudget } from '../context/BudgetContext'

const currency = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  maximumFractionDigits: 0,
})

function MainDashboardPage() {
  const { role } = useAuth()
  const { totals, requests, budgets } = useBudget()
  const isSummaryOnly =
    role === 'SK Kagawad' || role === 'Barangay Treasurer'

  return (
    <>
      <header className="dashboard-header">
        <div className="header-left">
          <div>
            <p className="eyebrow">Main Dashboard</p>
            <h1>{role} Dashboard</h1>
            <p>Overview of budgets, expenses, and pending approvals.</p>
          </div>
        </div>
      </header>

      <section className="dashboard-content">
        <div className="stat-grid">
          <div className="stat-card">
            <span className="stat-title">💰 Total Budget Allocated</span>
            <span className="stat-value">
              {currency.format(totals.totalBudget)}
            </span>
            <span className="stat-meta">{budgets.length} quarterly entries</span>
          </div>
          <div className="stat-card">
            <span className="stat-title">📉 Total Expenses</span>
            <span className="stat-value">
              {currency.format(totals.totalExpenses)}
            </span>
            <span className="stat-meta">Approved budget requests</span>
          </div>
          <div className="stat-card">
            <span className="stat-title">📊 Remaining Budget</span>
            <span className="stat-value">
              {currency.format(totals.remaining)}
            </span>
            <span className="stat-meta">Updated in real time</span>
          </div>
        </div>

        <div className="overview-card">
          <p className="eyebrow">Highlights</p>
          <h2>Today at a glance</h2>
          <ul>
            {isSummaryOnly ? (
              <>
                <li>Review the latest quarterly budgets.</li>
                <li>Track total spending against allocations.</li>
                <li>Monitor remaining budget for SK programs.</li>
              </>
            ) : (
              <>
                <li>{requests.length} budget requests waiting for approval.</li>
                <li>Latest quarter budgets are ready to review.</li>
                <li>Track approvals to keep expenses aligned.</li>
              </>
            )}
          </ul>
        </div>
      </section>
    </>
  )
}

export default MainDashboardPage
