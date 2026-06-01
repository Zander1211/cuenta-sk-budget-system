import { Fragment, useMemo, useState } from 'react'
import { useBudget } from '../context/BudgetContext'

const currency = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  maximumFractionDigits: 0,
})

function ExpensesPage() {
  const {
    expenses,
    expensesSyncStatus,
    refreshExpensesFromSupabase,
    archiveExpense,
    restoreExpense,
  } = useBudget()
  const [activeTab, setActiveTab] = useState('active')
  const [projectFilter, setProjectFilter] = useState('')
  const [dateFilter, setDateFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('All')
  const [statusFilter, setStatusFilter] = useState('All')
  const [expanded, setExpanded] = useState({})

  const categories = [
    'Sports',
    'Education',
    'Community Programs',
    'Environment',
    'Other',
  ]

  const activeExpenses = useMemo(() => {
    return expenses.filter((expense) => {
      if (expense.archivedAt) return false
      const resolvedStatus = expense.status || 'Approved'
      const projectName = (expense.project || expense.event || '').toLowerCase()
      const matchesProject = projectName.includes(projectFilter.toLowerCase())
      const expenseDate = (expense.date || expense.approvedAt || '').slice(0, 10)
      const matchesDate = dateFilter ? expenseDate === dateFilter : true
      const matchesCategory =
        categoryFilter === 'All' || expense.category === categoryFilter
      const matchesStatus =
        statusFilter === 'All' || resolvedStatus === statusFilter
      return matchesProject && matchesDate && matchesCategory && matchesStatus
    })
  }, [
    expenses,
    projectFilter,
    dateFilter,
    categoryFilter,
    statusFilter,
  ])

  const archivedExpenses = useMemo(() => {
    return expenses.filter((expense) => {
      if (!expense.archivedAt) return false
      const resolvedStatus = expense.status || 'Approved'
      const projectName = (expense.project || expense.event || '').toLowerCase()
      const matchesProject = projectName.includes(projectFilter.toLowerCase())
      const expenseDate = (expense.date || expense.approvedAt || '').slice(0, 10)
      const matchesDate = dateFilter ? expenseDate === dateFilter : true
      const matchesCategory =
        categoryFilter === 'All' || expense.category === categoryFilter
      const matchesStatus =
        statusFilter === 'All' || resolvedStatus === statusFilter
      return matchesProject && matchesDate && matchesCategory && matchesStatus
    })
  }, [
    expenses,
    projectFilter,
    dateFilter,
    categoryFilter,
    statusFilter,
  ])

  function toggleDetails(expenseId) {
    setExpanded((prev) => ({
      ...prev,
      [expenseId]: !prev[expenseId],
    }))
  }

  function handleTabChange(nextTab) {
    setActiveTab(nextTab)
  }

  function handleArchive(expenseId) {
    archiveExpense(expenseId)
    setActiveTab('archive')
  }

  function renderExpenseDetails(expense, columnCount) {
    if (!expanded[expense.id]) return null

    return (
      <tr className="details-row">
        <td colSpan={columnCount}>
          <div className="details-panel">
            <div className="details-grid">
              <div>
                <p className="details-label">Project description</p>
                <p className="details-value">{expense.description || '—'}</p>
              </div>
              <div>
                <p className="details-label">Event date</p>
                <p className="details-value">
                  {expense.eventDate
                    ? new Date(expense.eventDate).toLocaleDateString()
                    : '—'}
                </p>
              </div>
              <div>
                <p className="details-label">Venue</p>
                <p className="details-value">{expense.venue || '—'}</p>
              </div>
            </div>

            <div className="details-breakdown">
              <p className="details-label">Budget breakdown</p>
              {expense.breakdown?.length ? (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Other expenses</th>
                      <th>Quantity</th>
                      <th>Unit cost</th>
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {expense.breakdown.map((item, index) => (
                      <tr key={`${expense.id}-item-${index}`}>
                        <td>{item.itemName || '—'}</td>
                        <td>{item.quantity || 0}</td>
                        <td>{currency.format(item.unitCost || 0)}</td>
                        <td>
                          {currency.format(
                            (item.quantity || 0) * (item.unitCost || 0)
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="details-value">No breakdown provided.</p>
              )}
            </div>
          </div>
        </td>
      </tr>
    )
  }

  return (
    <>
      <header className="dashboard-header">
        <div className="header-left">
          <div>
            <p className="eyebrow">Expenses</p>
            <h1>Approved expenses</h1>
            <p>
              Approved requests from the SK Treasurer appear here as expenses.
            </p>
          </div>
        </div>
        <div
          className="header-actions page-tabs"
          role="tablist"
          aria-label="Expense views"
        >
          <button
            className={`page-tab ${activeTab === 'active' ? 'is-active' : ''}`}
            type="button"
            role="tab"
            aria-selected={activeTab === 'active'}
            onClick={() => handleTabChange('active')}
          >
            Active
          </button>
          <button
            className={`page-tab ${activeTab === 'archive' ? 'is-active' : ''}`}
            type="button"
            role="tab"
            aria-selected={activeTab === 'archive'}
            onClick={() => handleTabChange('archive')}
          >
            Archive
          </button>
        </div>
      </header>

      <section className="dashboard-content">
        {expensesSyncStatus === 'empty' && expenses.length === 0 ? (
          <div className="overview-card sync-banner">
            <p className="eyebrow">Supabase sync</p>
            <h2>No expenses found</h2>
            <p>
              We did not find expenses in Supabase yet. Import again to continue.
            </p>
            <div className="sync-actions">
              <button
                className="secondary-button"
                type="button"
                onClick={refreshExpensesFromSupabase}
              >
                Import from Supabase
              </button>
            </div>
          </div>
        ) : null}
        <div className="overview-card">
          <p className="eyebrow">Filters</p>
          <h2>Expense filters</h2>
          <div className="form-grid">
            <label className="field">
              <span>Project</span>
              <input
                type="text"
                value={projectFilter}
                onChange={(event) => setProjectFilter(event.target.value)}
                placeholder="Search by project"
              />
            </label>
            <label className="field">
              <span>Date</span>
              <input
                type="date"
                value={dateFilter}
                onChange={(event) => setDateFilter(event.target.value)}
              />
            </label>
            <label className="field">
              <span>Category</span>
              <select
                value={categoryFilter}
                onChange={(event) => setCategoryFilter(event.target.value)}
              >
                <option value="All">All categories</option>
                {categories.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Status</span>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
              >
                <option value="All">All statuses</option>
                <option value="Pending">Pending</option>
                <option value="Approved">Approved</option>
                <option value="Released">Released</option>
              </select>
            </label>
          </div>
        </div>

        {activeTab === 'active' ? (
          <div className="overview-card">
            <p className="eyebrow">Expense ledger</p>
            <h2>Latest expenses</h2>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Project</th>
                  <th>Category</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Date</th>
                  <th>Receipt</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {activeExpenses.length ? (
                  activeExpenses.map((expense) => (
                    <Fragment key={expense.id}>
                      <tr>
                        <td>{expense.project || expense.event || 'Untitled'}</td>
                        <td>{expense.category || 'Uncategorized'}</td>
                        <td>{currency.format(expense.amount || 0)}</td>
                        <td>
                          <span
                            className={`status-pill status-${(
                              expense.status || 'Approved'
                            ).toLowerCase()}`}
                          >
                            {expense.status || 'Approved'}
                          </span>
                        </td>
                        <td>
                          {expense.date || expense.approvedAt
                            ? new Date(
                                expense.date || expense.approvedAt
                              ).toLocaleDateString()
                            : '—'}
                        </td>
                        <td>
                          {expense.receiptUrl ? (
                            <a
                              className="file-link"
                              href={expense.receiptUrl}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {expense.receiptName || 'View'}
                            </a>
                          ) : (
                            expense.receiptName || '—'
                          )}
                        </td>
                        <td className="table-actions">
                          <button
                            className="secondary-button"
                            type="button"
                            onClick={() => toggleDetails(expense.id)}
                          >
                            {expanded[expense.id] ? 'Hide' : 'View'}
                          </button>
                          <button
                            className="secondary-button"
                            type="button"
                            onClick={() => handleArchive(expense.id)}
                          >
                            Archive
                          </button>
                        </td>
                      </tr>
                      {renderExpenseDetails(expense, 7)}
                    </Fragment>
                  ))
                ) : (
                  <tr>
                    <td colSpan="7" className="empty-state">
                      No expenses yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="overview-card">
            <p className="eyebrow">Archive</p>
            <h2>Archived expenses</h2>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Project</th>
                  <th>Category</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Date</th>
                  <th>Archived</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {archivedExpenses.length ? (
                  archivedExpenses.map((expense) => (
                    <Fragment key={expense.id}>
                      <tr>
                        <td>{expense.project || expense.event || 'Untitled'}</td>
                        <td>{expense.category || 'Uncategorized'}</td>
                        <td>{currency.format(expense.amount || 0)}</td>
                        <td>
                          <span
                            className={`status-pill status-${(
                              expense.status || 'Approved'
                            ).toLowerCase()}`}
                          >
                            {expense.status || 'Approved'}
                          </span>
                        </td>
                        <td>
                          {expense.date || expense.approvedAt
                            ? new Date(
                                expense.date || expense.approvedAt
                              ).toLocaleDateString()
                            : '—'}
                        </td>
                        <td>
                          {expense.archivedAt
                            ? new Date(expense.archivedAt).toLocaleDateString()
                            : '—'}
                        </td>
                        <td className="table-actions">
                          <button
                            className="secondary-button"
                            type="button"
                            onClick={() => toggleDetails(expense.id)}
                          >
                            {expanded[expense.id] ? 'Hide' : 'View'}
                          </button>
                          <button
                            className="secondary-button"
                            type="button"
                            onClick={() => restoreExpense(expense.id)}
                          >
                            Restore
                          </button>
                        </td>
                      </tr>
                      {renderExpenseDetails(expense, 7)}
                    </Fragment>
                  ))
                ) : (
                  <tr>
                    <td colSpan="7" className="empty-state">
                      No archived expenses yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  )
}

export default ExpensesPage
