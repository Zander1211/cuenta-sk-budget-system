import { useEffect, useMemo, useState } from 'react'
import RoleGate from '../components/RoleGate'
import { useBudget } from '../context/BudgetContext'
import { supabase } from '../supabase/supabaseClient'

const currency = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  maximumFractionDigits: 0,
})

function formatReceiptName(fileName) {
  if (!fileName) return 'Receipt'
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(fileName)
  if (isUUID) {
    const ext = fileName.includes('.') ? fileName.split('.').pop() : 'jpg'
    return `Receipt (${fileName.slice(0, 8)}…${ext})`
  }
  if (fileName.length > 22) {
    const ext = fileName.includes('.') ? '.' + fileName.split('.').pop() : ''
    const base = fileName.slice(0, 16)
    return `${base}…${ext}`
  }
  return fileName
}

function getFileIcon(name = '', type = '') {
  const lower = (name || '').toLowerCase()
  if (lower.endsWith('.pdf') || (type && type.includes('pdf'))) return '📄'
  if (lower.endsWith('.png') || lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.webp') || (type && type.includes('image'))) return '🖼️'
  return '📎'
}

function ReceiptDetailsPage() {
  const { expenses, expensesSyncStatus } = useBudget()
  const [receiptLinks, setReceiptLinks] = useState({})
  const [viewerExpense, setViewerExpense] = useState(null)
  const RECEIPTS_BUCKET = 'receipts'

  const approvedExpenses = useMemo(
    () => expenses.filter((expense) => (expense.status || 'Approved') === 'Approved'),
    [expenses]
  )

  useEffect(() => {
    let mounted = true
    if (!approvedExpenses.length) return

    ;(async () => {
      const updates = {}
      const recordIds = approvedExpenses.map((e) => String(e.id))
      
      const { data: receiptRows, error } = await supabase
        .from('receipt_records')
        .select('id, record_id, file_path, file_name, file_type, uploaded_at')
        .in('record_id', recordIds)
        .order('uploaded_at', { ascending: true })

      if (error) {
        console.error('Could not load receipt records:', error)
      }

      await Promise.all((receiptRows || []).map(async (receipt) => {
        const { data } = await supabase.storage
          .from(RECEIPTS_BUCKET)
          .createSignedUrl(receipt.file_path, 60 * 60)

        if (data?.signedUrl) {
          const key = String(receipt.record_id)
          if (!updates[key]) updates[key] = []
          updates[key].push({
            id: receipt.id,
            url: data.signedUrl,
            path: receipt.file_path,
            name: receipt.file_name || 'Receipt',
            type: receipt.file_type,
          })
        }
      }))

      // Backward compatibility
      await Promise.all(
        approvedExpenses.map(async (expense) => {
          const path = expense.receiptUrl || expense.receipt_url
          if (!path) return
          const key = String(expense.id)
          const alreadyIncluded = (updates[key] || []).some((r) => r.path === path)
          if (alreadyIncluded) return

          const { data } = await supabase.storage
            .from(RECEIPTS_BUCKET)
            .createSignedUrl(path, 60 * 60)
          if (data?.signedUrl) {
            if (!updates[key]) updates[key] = []
            updates[key].push({
              id: `legacy-${key}`,
              url: data.signedUrl,
              path,
              name: expense.receiptName || expense.receipt_name || 'Receipt',
            })
          }
        })
      )

      if (mounted) {
        setReceiptLinks(updates)
      }
    })()

    return () => {
      mounted = false
    }
  }, [approvedExpenses])

  const withReceipts = approvedExpenses.filter(
    (expense) => (receiptLinks[expense.id] && receiptLinks[expense.id].length > 0) || expense.receiptUrl || expense.receipt_url
  )
  const withoutReceipts = approvedExpenses.filter(
    (expense) => !(receiptLinks[expense.id] && receiptLinks[expense.id].length > 0) && !expense.receiptUrl && !expense.receipt_url
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
        <div className="overview-card" style={{ marginBottom: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
            <div>
              <p className="eyebrow">Uploaded receipts</p>
              <h2>Receipts by project / event</h2>
            </div>
            <span className="status-pill status-approved">
              {withReceipts.length} with receipts
            </span>
          </div>

          {expensesSyncStatus === 'loading' ? (
            <p className="form-note">Syncing approved projects…</p>
          ) : null}

          <div className="receipts-table-container">
            <table className="receipts-table">
              <thead>
                <tr>
                  <th>Project / Event</th>
                  <th>Category</th>
                  <th>Amount</th>
                  <th>Approved</th>
                  <th>Project Status</th>
                  <th>Attached Receipt</th>
                </tr>
              </thead>
              <tbody>
                {withReceipts.length ? (
                  withReceipts.map((expense) => {
                    const receipts = receiptLinks[expense.id] || []
                    return (
                      <tr key={expense.id}>
                        <td className="receipt-event-cell">
                          <span className="receipt-event-name">{expense.event || expense.project || 'Untitled'}</span>
                          <span className="receipt-type-pill">{expense.type || 'Project'}</span>
                        </td>
                        <td>{expense.category || 'Uncategorized'}</td>
                        <td><span className="receipt-amount-val">{currency.format(expense.amount || 0)}</span></td>
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
                          {receipts.length > 1 ? (
                            <button
                              type="button"
                              className="receipt-multi-btn"
                              onClick={() => setViewerExpense(expense)}
                            >
                              <span>🧾</span>
                              <span>{receipts.length} Receipts</span>
                              <span className="receipt-multi-tag">View All →</span>
                            </button>
                          ) : receipts.length === 1 ? (
                            <div className="receipt-chip-single">
                              <a
                                href={receipts[0].url}
                                target="_blank"
                                rel="noreferrer"
                                className="receipt-chip-link"
                                title={receipts[0].name}
                              >
                                <span>{getFileIcon(receipts[0].name, receipts[0].type)}</span>
                                <span>{formatReceiptName(receipts[0].name)}</span>
                              </a>
                            </div>
                          ) : (
                            <span className="status-pill status-pending">Processing</span>
                          )}
                        </td>
                      </tr>
                    )
                  })
                ) : (
                  <tr>
                    <td colSpan="6" className="empty-state" style={{ textAlign: 'center', padding: '24px' }}>
                      No receipts have been uploaded yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="overview-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
            <div>
              <p className="eyebrow">Missing receipts</p>
              <h2>Projects without receipts</h2>
            </div>
            <span className="receipt-missing-chip">
              {withoutReceipts.length} missing
            </span>
          </div>

          <div className="receipts-table-container">
            <table className="receipts-table">
              <thead>
                <tr>
                  <th>Project / Event</th>
                  <th>Category</th>
                  <th>Amount</th>
                  <th>Approved</th>
                  <th>Project Status</th>
                  <th>Receipt Status</th>
                </tr>
              </thead>
              <tbody>
                {withoutReceipts.length ? (
                  withoutReceipts.map((expense) => (
                    <tr key={expense.id}>
                      <td className="receipt-event-cell">
                        <span className="receipt-event-name">{expense.event || expense.project || 'Untitled'}</span>
                        <span className="receipt-type-pill">{expense.type || 'Project'}</span>
                      </td>
                      <td>{expense.category || 'Uncategorized'}</td>
                      <td><span className="receipt-amount-val">{currency.format(expense.amount || 0)}</span></td>
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
                        <span className="receipt-missing-chip">⚠️ Missing</span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="6" className="empty-state" style={{ textAlign: 'center', padding: '24px' }}>
                      All projects have receipts attached.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Receipts Gallery Viewer Modal */}
      {viewerExpense ? (
        <div className="modal-overlay" onClick={() => setViewerExpense(null)}>
          <div className="modal-content receipt-viewer-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header" style={{ padding: '20px 24px 16px', borderBottom: '1px solid rgba(15,31,54,0.08)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', width: '100%' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <span className="eyebrow" style={{ margin: 0 }}>Receipts Gallery</span>
                    <span className="receipt-multi-tag">
                      {(receiptLinks[viewerExpense.id] || []).length} Attached
                    </span>
                  </div>
                  <h2 style={{ fontSize: '1.25rem', margin: '0 0 6px' }}>
                    {viewerExpense.event || viewerExpense.project || 'Record Receipts'}
                  </h2>
                  <div style={{ display: 'flex', gap: '10px', fontSize: '0.85rem', color: 'var(--ink-soft)' }}>
                    <span>Category: <strong>{viewerExpense.category || 'General'}</strong></span>
                    <span>•</span>
                    <span>Budget: <strong style={{ color: 'var(--positive)' }}>₱{Number(viewerExpense.amount || 0).toLocaleString()}</strong></span>
                  </div>
                </div>
                <button
                  type="button"
                  className="secondary-button"
                  style={{ padding: '6px 10px', minWidth: 'auto', borderRadius: '50%', cursor: 'pointer' }}
                  onClick={() => setViewerExpense(null)}
                  title="Close"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="modal-body" style={{ padding: '20px 24px' }}>
              {(receiptLinks[viewerExpense.id] || []).length > 0 ? (
                <div className="receipt-viewer-list">
                  {(receiptLinks[viewerExpense.id] || []).map((rcpt, idx) => (
                    <div key={rcpt.id || rcpt.path || idx} className="receipt-viewer-item">
                      <div className="receipt-viewer-item-info">
                        <div className="receipt-viewer-item-icon">
                          {getFileIcon(rcpt.name, rcpt.type)}
                        </div>
                        <div className="receipt-viewer-item-details">
                          <span className="receipt-viewer-item-name" title={rcpt.name}>
                            {rcpt.name || `Receipt #${idx + 1}`}
                          </span>
                          <span className="receipt-viewer-item-meta">
                            Receipt #{idx + 1} {rcpt.type ? `• ${rcpt.type}` : ''}
                          </span>
                        </div>
                      </div>
                      <div className="receipt-viewer-item-actions">
                        <a
                          href={rcpt.url}
                          target="_blank"
                          rel="noreferrer"
                          className="primary-button"
                          style={{
                            padding: '6px 12px',
                            fontSize: '0.82rem',
                            textDecoration: 'none',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                        >
                          👁️ View File
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--ink-soft)' }}>
                  <p style={{ fontSize: '2rem', margin: '0 0 8px' }}>🧾</p>
                  <p>No receipts attached yet.</p>
                </div>
              )}
            </div>

            <div className="modal-footer" style={{ padding: '16px 24px', borderTop: '1px solid rgba(15,31,54,0.08)', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="secondary-button"
                onClick={() => setViewerExpense(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </RoleGate>
  )
}

export default ReceiptDetailsPage
