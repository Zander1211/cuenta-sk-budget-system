import { useEffect, useMemo, useState } from 'react'
import RoleGate from '../components/RoleGate'
import { useBudget } from '../context/BudgetContext'
import { supabase } from '../supabase/supabaseClient'

const currency = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  maximumFractionDigits: 0,
})

function ReceiptDetailsPage() {
  const { expenses, expensesSyncStatus } = useBudget()
  const [receiptLinks, setReceiptLinks] = useState({})
  const RECEIPTS_BUCKET = 'receipts'

  const approvedExpenses = useMemo(
    () => expenses.filter((expense) => (expense.status || 'Approved') === 'Approved'),
    [expenses]
  )

  useEffect(() => {
    let mounted = true
    const missing = approvedExpenses.filter((expense) => {
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
  }, [approvedExpenses, receiptLinks])

  const withReceipts = approvedExpenses.filter(
    (expense) => expense.receiptUrl || expense.receipt_url || expense.receiptName || expense.receipt_name
  )
  const withoutReceipts = approvedExpenses.filter(
    (expense) => !expense.receiptUrl && !expense.receipt_url && !expense.receiptName && !expense.receipt_name
  )

  return (
    <RoleGate allow={['SK Kagawad', 'Barangay Treasurer']}>
      <header className="dashboard-header">
        <div className="header-left">
          <div>
            <p className="eyebrow">Receipts</p>
            <h1>Receipt reports</h1>
            <p>View all uploaded receipts and their associated projects and events.</p>
          </div>
        </div>
      </header>

      <section className="dashboard-content">
        <div className="overview-card">
          <p className="eyebrow">Uploaded receipts</p>
          <h2>Receipts by project / event</h2>
          {expensesSyncStatus === 'loading' ? (
            <p className="form-note">Syncing approved projects…</p>
          ) : null}

          <table className="data-table">
            <thead>
              <tr>
                <th>Project / Event</th>
                <th>Category</th>
                <th>Amount</th>
                <th>Approved</th>
                <th>Project Status</th>
                <th>Receipt</th>
              </tr>
            </thead>
            <tbody>
              {withReceipts.length ? (
                withReceipts.map((expense) => (
                  <tr key={expense.id}>
                    <td>{expense.event || expense.project || 'Untitled'}</td>
                    <td>{expense.category || 'Uncategorized'}</td>
                    <td>{currency.format(expense.amount || 0)}</td>
                    <td>
                      {expense.approvedAt
                        ? new Date(expense.approvedAt).toLocaleDateString()
                        : '—'}
                    </td>
                    <td>
                      <span
                        className={`status-pill status-${(
                          expense.projectStatus || 'Ongoing'
                        ).toLowerCase()}`}
                      >
                        {expense.projectStatus || 'Ongoing'}
                      </span>
                    </td>
                    <td>
                      {receiptLinks[expense.id] ? (
                        <a
                          className="file-link"
                          href={receiptLinks[expense.id]}
                          target="_blank"
                          rel="noreferrer"
                        >
                          View receipt
                        </a>
                      ) : (
                        <span className="status-pill status-pending">
                          {expense.receiptName || expense.receipt_name || 'Processing'}
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="6" className="empty-state">
                    No receipts have been uploaded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="overview-card">
          <p className="eyebrow">Missing receipts</p>
          <h2>Projects without receipts</h2>
          <table className="data-table">
            <thead>
              <tr>
                <th>Project / Event</th>
                <th>Category</th>
                <th>Amount</th>
                <th>Approved</th>
                <th>Project Status</th>
                <th>Receipt</th>
              </tr>
            </thead>
            <tbody>
              {withoutReceipts.length ? (
                withoutReceipts.map((expense) => (
                  <tr key={expense.id}>
                    <td>{expense.event || expense.project || 'Untitled'}</td>
                    <td>{expense.category || 'Uncategorized'}</td>
                    <td>{currency.format(expense.amount || 0)}</td>
                    <td>
                      {expense.approvedAt
                        ? new Date(expense.approvedAt).toLocaleDateString()
                        : '—'}
                    </td>
                    <td>
                      <span
                        className={`status-pill status-${(
                          expense.projectStatus || 'Ongoing'
                        ).toLowerCase()}`}
                      >
                        {expense.projectStatus || 'Ongoing'}
                      </span>
                    </td>
                    <td>
                      <span className="status-pill status-pending">Missing</span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="6" className="empty-state">
                    All projects have receipts attached.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </RoleGate>
  )
}

export default ReceiptDetailsPage
