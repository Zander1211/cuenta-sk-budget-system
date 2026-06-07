import { Fragment, useEffect, useMemo, useState } from 'react'
import { useBudget } from '../context/BudgetContext'
import { useAuditLog } from '../context/AuditLogContext'
import { supabase } from '../supabase/supabaseClient'
import ReceiptPrintPreview from '../components/ReceiptPrintPreview'

const currency = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  maximumFractionDigits: 0,
})

const monthLabels = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function getBreakdownTotal(breakdown = []) {
  return breakdown.reduce((sum, item) => {
    const qty = Number(item.quantity) || 0
    const unit = Number(item.unitCost) || 0
    return sum + qty * unit
  }, 0)
}

function ExpensesPage() {
  const {
    expenses,
    budgets,
    expensesSyncStatus,
    refreshExpensesFromSupabase,
    archiveExpense,
    restoreExpense,
  } = useBudget()
  const { addLog } = useAuditLog()

  const [activeTab, setActiveTab] = useState('active')
  const [projectFilter, setProjectFilter] = useState('')
  const [dateFilter, setDateFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('All')
  const [statusFilter, setStatusFilter] = useState('All')
  const [expanded, setExpanded] = useState({})

  // Receipt upload state
  const [filesById, setFilesById] = useState({})
  const [errorsById, setErrorsById] = useState({})
  const [uploadingId, setUploadingId] = useState(null)
  const [receiptLinks, setReceiptLinks] = useState({})
  const RECEIPTS_BUCKET = 'receipts'

  // Receipt print preview state
  const [printPreview, setPrintPreview] = useState(null)

  // Budget breakdown month filter
  const now = new Date()
  const [breakdownMonth, setBreakdownMonth] = useState(now.getMonth())
  const [breakdownYear, setBreakdownYear] = useState(now.getFullYear())

  const categories = [
    'Sports',
    'Education',
    'Community Programs',
    'Environment',
    'Other',
  ]

  // Generate signed URLs for receipts
  useEffect(() => {
    let mounted = true
    const missing = expenses.filter((expense) => {
      const path = expense.receiptUrl || expense.receipt_url
      return path && !receiptLinks[expense.id]
    })

    if (!missing.length) return

    ;(async () => {
      const updates = {}
      await Promise.all(
        missing.map(async (expense) => {
          const path = expense.receiptUrl || expense.receipt_url
          const { data } = await supabase.storage
            .from(RECEIPTS_BUCKET)
            .createSignedUrl(path, 60 * 60)
          if (data?.signedUrl) {
            updates[expense.id] = data.signedUrl
          }
        })
      )

      if (mounted && Object.keys(updates).length) {
        setReceiptLinks((prev) => ({ ...prev, ...updates }))
      }
    })()

    return () => {
      mounted = false
    }
  }, [expenses, receiptLinks])

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
  }, [expenses, projectFilter, dateFilter, categoryFilter, statusFilter])

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
  }, [expenses, projectFilter, dateFilter, categoryFilter, statusFilter])

  // Budget breakdown data for selected month
  const breakdownData = useMemo(() => {
    const monthExpenses = expenses.filter((expense) => {
      if (expense.archivedAt) return false
      const dateStr = expense.approvedAt || expense.date || expense.eventDate
      if (!dateStr) return false
      const d = new Date(dateStr)
      return d.getFullYear() === breakdownYear && d.getMonth() === breakdownMonth
    })

    const totalSpent = monthExpenses.reduce(
      (sum, e) => sum + (Number(e.amount) || 0), 0
    )

    // Group by category
    const byCategory = {}
    monthExpenses.forEach((e) => {
      const cat = e.category || 'Uncategorized'
      if (!byCategory[cat]) byCategory[cat] = { total: 0, items: [] }
      byCategory[cat].total += Number(e.amount) || 0
      byCategory[cat].items.push(e)
    })

    // Get budget for this month
    const monthBudgets = budgets.filter(
      (b) => b.month === breakdownMonth && b.year === breakdownYear
    )
    const totalBudget = monthBudgets.reduce(
      (sum, b) => sum + (Number(b.amount) || 0), 0
    )

    return {
      expenses: monthExpenses,
      totalSpent,
      totalBudget,
      byCategory,
      remaining: totalBudget - totalSpent,
      utilization: totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 100) : 0,
    }
  }, [expenses, budgets, breakdownMonth, breakdownYear])

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

  // Receipt upload handlers
  function handleFileChange(expenseId, file) {
    setFilesById((prev) => ({ ...prev, [expenseId]: file }))
    setErrorsById((prev) => ({ ...prev, [expenseId]: '' }))
  }

  async function handleUpload(expense) {
    const file = filesById[expense.id]
    if (!file) {
      setErrorsById((prev) => ({
        ...prev,
        [expense.id]: 'Select a receipt file first.',
      }))
      return
    }

    setUploadingId(expense.id)
    setErrorsById((prev) => ({ ...prev, [expense.id]: '' }))
    const safeName = file.name.replace(/\s+/g, '-')
    const filePath = `expenses/${expense.id}-${Date.now()}-${safeName}`

    const { error: uploadError } = await supabase.storage
      .from(RECEIPTS_BUCKET)
      .upload(filePath, file, { upsert: false })

    if (uploadError) {
      setErrorsById((prev) => ({ ...prev, [expense.id]: uploadError.message }))
      setUploadingId(null)
      return
    }

    const { error: updateError } = await supabase
      .from('expenses')
      .update({ receipt_url: filePath, receipt_name: file.name })
      .eq('id', expense.id)

    if (updateError) {
      setErrorsById((prev) => ({ ...prev, [expense.id]: updateError.message }))
      setUploadingId(null)
      return
    }

    const { data } = await supabase.storage
      .from(RECEIPTS_BUCKET)
      .createSignedUrl(filePath, 60 * 60)

    if (data?.signedUrl) {
      setReceiptLinks((prev) => ({ ...prev, [expense.id]: data.signedUrl }))
    }

    setFilesById((prev) => ({ ...prev, [expense.id]: null }))
    setUploadingId(null)
    addLog({ action: `Uploaded receipt for ${expense.event || expense.project || 'expense'}` })
    await refreshExpensesFromSupabase()
  }

  function handlePrintReceipt(expense) {
    setPrintPreview({
      expense,
      receiptUrl: receiptLinks[expense.id] || null,
    })
  }

  function renderExpenseDetails(expense, columnCount) {
    if (!expanded[expense.id]) return null

    const breakdownItems = Array.isArray(expense.breakdown) ? expense.breakdown : []
    const breakdownTotal = getBreakdownTotal(breakdownItems)
    const requestedAmount = Number(expense.amount) || 0
    const totalAmount = requestedAmount > 0 ? requestedAmount : breakdownTotal
    const hasReceipt = expense.receiptUrl || expense.receipt_url || receiptLinks[expense.id]

    return (
      <tr className="details-row">
        <td colSpan={columnCount}>
          <div className="details-panel">
            <div className="details-grid">
              <div>
                <p className="details-label">Project / Event</p>
                <p className="details-value">{expense.event || expense.project || '—'}</p>
              </div>
              <div>
                <p className="details-label">Category</p>
                <p className="details-value">{expense.category || '—'}</p>
              </div>
              <div>
                <p className="details-label">Total Amount</p>
                <p className="details-value">{currency.format(totalAmount)}</p>
              </div>
              <div>
                <p className="details-label">Total Cost (Breakdown)</p>
                <p className="details-value">
                  {breakdownItems.length ? currency.format(breakdownTotal) : '—'}
                </p>
              </div>
              <div>
                <p className="details-label">Event Date</p>
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
              <div>
                <p className="details-label">Requested By</p>
                <p className="details-value">{expense.requestedBy || '—'}</p>
              </div>
              <div>
                <p className="details-label">Approved Date</p>
                <p className="details-value">
                  {expense.approvedAt
                    ? new Date(expense.approvedAt).toLocaleDateString()
                    : '—'}
                </p>
              </div>
              <div>
                <p className="details-label">Project Description</p>
                <p className="details-value">{expense.description || '—'}</p>
              </div>
              <div>
                <p className="details-label">Notes / Supporting Info</p>
                <p className="details-value">{expense.notes || '—'}</p>
              </div>
            </div>

            <div className="details-breakdown">
              <p className="details-label">Budget Breakdown</p>
              {breakdownItems.length ? (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th>Quantity</th>
                      <th>Unit Cost</th>
                      <th>Total Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {breakdownItems.map((item, index) => (
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
                  <tfoot>
                    <tr>
                      <th colSpan="3">Total Cost</th>
                      <th>{currency.format(breakdownTotal)}</th>
                    </tr>
                    <tr>
                      <th colSpan="3">Total Amount</th>
                      <th>{currency.format(totalAmount)}</th>
                    </tr>
                  </tfoot>
                </table>
              ) : (
                <p className="details-value">No breakdown provided.</p>
              )}
            </div>

            {/* Receipt upload + print section */}
            <div className="details-receipt-section">
              <p className="details-label">Receipt</p>
              <div className="details-receipt-actions">
                {hasReceipt ? (
                  <>
                    {receiptLinks[expense.id] ? (
                      <a
                        className="file-link"
                        href={receiptLinks[expense.id]}
                        target="_blank"
                        rel="noreferrer"
                      >
                        View Receipt
                      </a>
                    ) : (
                      <span className="status-pill status-approved">Uploaded</span>
                    )}
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => handlePrintReceipt(expense)}
                    >
                      Print Receipt
                    </button>
                  </>
                ) : (
                  <div className="field-row">
                    <input
                      type="file"
                      accept="image/*,application/pdf"
                      capture="environment"
                      onChange={(event) =>
                        handleFileChange(expense.id, event.target.files?.[0] || null)
                      }
                    />
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => handleUpload(expense)}
                      disabled={uploadingId === expense.id}
                    >
                      {uploadingId === expense.id ? 'Uploading...' : 'Upload'}
                    </button>
                  </div>
                )}
                {errorsById[expense.id] ? (
                  <p className="form-error">{errorsById[expense.id]}</p>
                ) : null}
              </div>
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
            <p className="eyebrow">Tracking</p>
            <h1>Expenses</h1>
            <p>
              Complete log of all disbursements and receipts.
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


        {/* Filters */}
        <div className="overview-card">
          <p className="eyebrow">Filters</p>
          <h2>Expense filters</h2>
          <div className="form-grid">
            <label className="field">
              <span>Search by project</span>
              <input
                type="text"
                value={projectFilter}
                onChange={(event) => setProjectFilter(event.target.value)}
                placeholder="Search by project..."
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

        {/* Transaction History */}
        {activeTab === 'active' ? (
          <div className="overview-card">
            <div className="card-header-row">
              <div>
                <p className="eyebrow">Transaction History</p>
                <h2>Latest expenses</h2>
              </div>
              <span className="items-found-badge">
                {activeExpenses.length} items found
              </span>
            </div>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Description</th>
                  <th>Category</th>
                  <th>Amount</th>
                  <th>Receipt</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {activeExpenses.length ? (
                  activeExpenses.map((expense) => {
                    const hasReceipt = expense.receiptUrl || expense.receipt_url || receiptLinks[expense.id]
                    return (
                      <Fragment key={expense.id}>
                        <tr>
                          <td>
                            {expense.date || expense.approvedAt
                              ? new Date(
                                  expense.date || expense.approvedAt
                                ).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                              : '—'}
                          </td>
                          <td>
                            <div>
                              <strong>{expense.project || expense.event || 'Untitled'}</strong>
                              {expense.description ? (
                                <div style={{ fontSize: '0.82rem', color: 'var(--ink-soft)', marginTop: '2px' }}>
                                  {expense.description.slice(0, 60)}{expense.description.length > 60 ? '...' : ''}
                                </div>
                              ) : null}
                            </div>
                          </td>
                          <td>
                            <span className="category-tag">
                              {expense.category || 'Uncategorized'}
                            </span>
                          </td>
                          <td style={{ fontFamily: 'var(--font-mono, monospace)', fontWeight: 600 }}>
                            {currency.format(expense.amount || 0)}
                          </td>
                          <td>
                            {hasReceipt ? (
                              <span className="status-pill status-approved">Uploaded</span>
                            ) : (
                              <span className="status-pill status-pending">Missing</span>
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
                        {renderExpenseDetails(expense, 6)}
                      </Fragment>
                    )
                  })
                ) : (
                  <tr>
                    <td colSpan="6" className="empty-state">
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
                  <th>Date</th>
                  <th>Description</th>
                  <th>Category</th>
                  <th>Amount</th>
                  <th>Archived</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {archivedExpenses.length ? (
                  archivedExpenses.map((expense) => (
                    <Fragment key={expense.id}>
                      <tr>
                        <td>
                          {expense.date || expense.approvedAt
                            ? new Date(
                                expense.date || expense.approvedAt
                              ).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                            : '—'}
                        </td>
                        <td>
                          <strong>{expense.project || expense.event || 'Untitled'}</strong>
                        </td>
                        <td>
                          <span className="category-tag">
                            {expense.category || 'Uncategorized'}
                          </span>
                        </td>
                        <td style={{ fontFamily: 'var(--font-mono, monospace)', fontWeight: 600 }}>
                          {currency.format(expense.amount || 0)}
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
                      {renderExpenseDetails(expense, 6)}
                    </Fragment>
                  ))
                ) : (
                  <tr>
                    <td colSpan="6" className="empty-state">
                      No archived expenses yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Budget Breakdown Section */}
        <div className="expenses-breakdown-grid">
          <div className="overview-card">
            <div className="card-header-row">
              <div>
                <p className="eyebrow">Budget Utilization</p>
                <h2 className="breakdown-utilization-value">
                  {breakdownData.utilization}%
                </h2>
              </div>
              <div className="breakdown-month-selector">
                <select
                  className="panel-select"
                  value={breakdownMonth}
                  onChange={(e) => setBreakdownMonth(Number(e.target.value))}
                >
                  {monthLabels.map((label, idx) => (
                    <option key={label} value={idx}>{label}</option>
                  ))}
                </select>
                <select
                  className="panel-select"
                  value={breakdownYear}
                  onChange={(e) => setBreakdownYear(Number(e.target.value))}
                >
                  {[2024, 2025, 2026, 2027].map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
            </div>
            <p style={{ color: 'var(--ink-soft)', fontSize: '0.9rem', margin: '4px 0 16px' }}>
              You have utilized {currency.format(breakdownData.totalSpent)} out of the{' '}
              {currency.format(breakdownData.totalBudget)} allocated for{' '}
              {monthLabels[breakdownMonth]} {breakdownYear}.
            </p>
            <div className="allocation-bar">
              <div
                className="allocation-fill"
                style={{ width: `${Math.min(100, breakdownData.utilization)}%` }}
              />
            </div>
            <div className="breakdown-summary-row">
              <div>
                <span className="breakdown-summary-label">Total Budget</span>
                <span className="breakdown-summary-value">{currency.format(breakdownData.totalBudget)}</span>
              </div>
              <div>
                <span className="breakdown-summary-label">Total Spent</span>
                <span className="breakdown-summary-value">{currency.format(breakdownData.totalSpent)}</span>
              </div>
              <div>
                <span className="breakdown-summary-label">Remaining</span>
                <span className="breakdown-summary-value">{currency.format(breakdownData.remaining)}</span>
              </div>
            </div>
          </div>

          <div className="overview-card">
            <p className="eyebrow">Spending by Category</p>
            <h2>Where funds were spent</h2>
            {Object.keys(breakdownData.byCategory).length ? (
              <div className="breakdown-category-list">
                {Object.entries(breakdownData.byCategory)
                  .sort(([, a], [, b]) => b.total - a.total)
                  .map(([cat, data]) => (
                    <div key={cat} className="breakdown-category-row">
                      <div className="breakdown-category-info">
                        <span className="category-tag">{cat}</span>
                        <span className="breakdown-category-count">
                          {data.items.length} {data.items.length === 1 ? 'expense' : 'expenses'}
                        </span>
                      </div>
                      <span className="breakdown-category-amount">
                        {currency.format(data.total)}
                      </span>
                    </div>
                  ))}
              </div>
            ) : (
              <p className="empty-state" style={{ padding: '24px 0' }}>
                No expenses recorded for {monthLabels[breakdownMonth]} {breakdownYear}.
              </p>
            )}

            {/* Detailed breakdown table */}
            {breakdownData.expenses.length ? (
              <div style={{ marginTop: '16px' }}>
                <p className="eyebrow" style={{ marginBottom: '8px' }}>Detailed Breakdown</p>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Project</th>
                      <th>Category</th>
                      <th>Amount</th>
                      <th>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {breakdownData.expenses
                      .sort((a, b) => new Date(a.approvedAt || a.date || 0) - new Date(b.approvedAt || b.date || 0))
                      .map((e) => (
                        <tr key={e.id}>
                          <td>{e.event || e.project || 'Untitled'}</td>
                          <td><span className="category-tag">{e.category || 'Uncategorized'}</span></td>
                          <td style={{ fontWeight: 600 }}>{currency.format(e.amount || 0)}</td>
                          <td>
                            {(e.approvedAt || e.date)
                              ? new Date(e.approvedAt || e.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                              : '—'}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <th colSpan="2">Total</th>
                      <th>{currency.format(breakdownData.totalSpent)}</th>
                      <th></th>
                    </tr>
                  </tfoot>
                </table>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      {/* Receipt print preview overlay */}
      {printPreview ? (
        <ReceiptPrintPreview
          expense={printPreview.expense}
          receiptUrl={printPreview.receiptUrl}
          onClose={() => setPrintPreview(null)}
        />
      ) : null}
    </>
  )
}

export default ExpensesPage
