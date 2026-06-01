import { useEffect, useMemo, useState } from 'react'
import RoleGate from '../components/RoleGate'
import { useBudget } from '../context/BudgetContext'
import { supabase } from '../supabase/supabaseClient'

function DocumentsPage() {
  const { expenses, refreshExpensesFromSupabase, expensesSyncStatus } = useBudget()
  const [filesById, setFilesById] = useState({})
  const [errorsById, setErrorsById] = useState({})
  const [uploadingId, setUploadingId] = useState(null)
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
    await refreshExpensesFromSupabase()
  }

  return (
    <RoleGate allow={['SK Chairman', 'SK Treasurer']}>
      <header className="dashboard-header">
        <div className="header-left">
          <div>
            <p className="eyebrow">Receipts</p>
            <h1>Receipt uploads</h1>
            <p>Upload and scan receipts for approved projects and events.</p>
          </div>
        </div>
      </header>

      <section className="dashboard-content">
        <div className="overview-card">
          <p className="eyebrow">Approved requests</p>
          <h2>Attach receipts to approved projects</h2>
          {expensesSyncStatus === 'loading' ? (
            <p className="form-note">Syncing approved projects...</p>
          ) : null}

          <table className="data-table">
            <thead>
              <tr>
                <th>Project / Event</th>
                <th>Category</th>
                <th>Amount</th>
                <th>Approved</th>
                <th>Receipt</th>
                <th>Upload</th>
              </tr>
            </thead>
            <tbody>
              {approvedExpenses.length ? (
                approvedExpenses.map((expense) => (
                  <tr key={expense.id}>
                    <td>{expense.event || expense.project || 'Untitled'}</td>
                    <td>{expense.category || 'Uncategorized'}</td>
                    <td>{`₱${Number(expense.amount || 0).toLocaleString()}`}</td>
                    <td>
                      {expense.approvedAt
                        ? new Date(expense.approvedAt).toLocaleDateString()
                        : '—'}
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
                        <span className="status-pill status-pending">Missing</span>
                      )}
                    </td>
                    <td>
                      <div className="field-row">
                        <input
                          type="file"
                          accept="image/*,application/pdf"
                          capture="environment"
                          onChange={(event) =>
                            handleFileChange(
                              expense.id,
                              event.target.files?.[0] || null
                            )
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
                      {errorsById[expense.id] ? (
                        <p className="form-error">{errorsById[expense.id]}</p>
                      ) : null}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="6" className="empty-state">
                    No approved events available yet.
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

export default DocumentsPage
