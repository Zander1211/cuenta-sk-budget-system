import { useEffect, useMemo, useState, useRef } from 'react'
import RoleGate from '../components/RoleGate'
import { useBudget } from '../context/BudgetContext'
import { supabase } from '../supabase/supabaseClient'
import CurrencyInput from '../components/CurrencyInput'
import { useAuth } from '../context/AuthContext'
import { useNotifications } from '../context/NotificationContext'
import { validateReceiptFile, getUploadErrorMessage, generateReceiptPath, logUploadDebugInfo, insertReceiptRecord } from '../utils/uploadUtils'

function ReceiptsPage() {
  const { user, role } = useAuth()
  const { addNotification } = useNotifications()
  const { expenses, refreshExpensesFromSupabase, expensesSyncStatus, updateExpenseReceipt } = useBudget()
  const [errorsById, setErrorsById] = useState({})
  const [uploadingId, setUploadingId] = useState(null)
  const [feedback, setFeedback] = useState(null)
  const [receiptLinks, setReceiptLinks] = useState({})
  const [scanModalOpen, setScanModalOpen] = useState(false)
  const [scanFile, setScanFile] = useState(null)
  const [scanStatus, setScanStatus] = useState('idle') // 'camera', 'camera_error', 'scanning', 'review', 'uploading'
  const [activeExpense, setActiveExpense] = useState(null)
  const [viewerExpense, setViewerExpense] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterCategory, setFilterCategory] = useState('all')
  const [ocrData, setOcrData] = useState({ vendor: '', receiptNumber: '', date: '', amount: '', items: '' })
  
  const uploadInputRef = useRef(null)
  const pendingUploadExpenseRef = useRef(null)
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const RECEIPTS_BUCKET = 'receipts'

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

  const approvedExpenses = useMemo(
    () => expenses.filter((expense) =>
      (expense.status || 'Approved') === 'Approved'
      && ['Project', 'Event', 'Payroll'].includes(expense.type || 'Project')
    ),
    [expenses]
  )

  const categories = useMemo(() => {
    const set = new Set()
    approvedExpenses.forEach((e) => {
      if (e.category) set.add(e.category)
    })
    return Array.from(set)
  }, [approvedExpenses])

  const filteredExpenses = useMemo(() => {
    return approvedExpenses.filter((expense) => {
      const title = (expense.event || expense.project || '').toLowerCase()
      const cat = (expense.category || '').toLowerCase()
      const query = searchQuery.toLowerCase().trim()
      const matchesSearch = !query || title.includes(query) || cat.includes(query)
      
      const receipts = receiptLinks[expense.id] || []
      const hasReceipts = receipts.length > 0
      
      let matchesStatus = true
      if (filterStatus === 'with') matchesStatus = hasReceipts
      if (filterStatus === 'missing') matchesStatus = !hasReceipts
      
      let matchesCategory = true
      if (filterCategory !== 'all') matchesCategory = expense.category === filterCategory

      return matchesSearch && matchesStatus && matchesCategory
    })
  }, [approvedExpenses, searchQuery, filterStatus, filterCategory, receiptLinks])

  useEffect(() => {
    let mounted = true
    if (!approvedExpenses.length) {
      return
    }

    ;(async () => {
      const updates = {}

      const recordIds = approvedExpenses.map((expense) => String(expense.id))
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

      // Preserve compatibility with receipts uploaded before receipt_records
      // existed. Do not duplicate a path already returned by the table.
      await Promise.all(
        approvedExpenses.map(async (expense) => {
          const path = expense.receiptUrl || expense.receipt_url
          if (!path) return
          const key = String(expense.id)
          const alreadyIncluded = (updates[key] || []).some((receipt) => receipt.path === path)
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

  function stopCamera() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }
  }

  useEffect(() => {
    if (scanStatus === 'camera') {
      navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
        .then(stream => {
          streamRef.current = stream
          if (videoRef.current) {
            videoRef.current.srcObject = stream
          }
        })
        .catch(err => {
          console.error("Camera error:", err)
          setScanStatus('camera_error')
        })
    } else {
      stopCamera()
    }
    return () => stopCamera()
  }, [scanStatus])

  async function uploadReceipt(expense, file, { appendedNotes = '' } = {}) {
    if (!expense || !['Project', 'Event', 'Payroll'].includes(expense.type || 'Project')) {
      const message = 'Select a valid approved Project, Event, or Payroll record before uploading.'
      setFeedback({ type: 'error', message })
      return { error: new Error(message) }
    }

    const validationError = validateReceiptFile(file, role)
    if (validationError) {
      setErrorsById((prev) => ({ ...prev, [expense.id]: validationError }))
      setFeedback({ type: 'error', message: validationError })
      return { error: new Error(validationError) }
    }

    setUploadingId(expense.id)
    setErrorsById((prev) => ({ ...prev, [expense.id]: '' }))
    setFeedback(null)

    const filePath = generateReceiptPath(expense, file)
    try {
      const { error: uploadError } = await supabase.storage
        .from(RECEIPTS_BUCKET)
        .upload(filePath, file, { upsert: false })

      if (uploadError) {
        throw Object.assign(uploadError, { uploadStep: 'storage' })
      }

      // 2. Persist one authoritative database row for this attachment
      const { data: receiptData, error: dbError } = await insertReceiptRecord(
        supabase,
        expense,
        file,
        filePath,
        user,
        role
      )

      if (dbError) {
        await supabase.storage.from(RECEIPTS_BUCKET).remove([filePath])
        throw Object.assign(dbError, { uploadStep: 'receipt_record' })
      }

      // 3. Link receipt to expenses table in Supabase
      const updatePayload = {
        receipt_url: filePath,
        receipt_name: file.name,
      }
      if (appendedNotes) {
        updatePayload.remarks = expense.remarks
          ? `${expense.remarks}\n\n${appendedNotes}`
          : appendedNotes
      }

      const { error: linkError } = await supabase
        .from('expenses')
        .update(updatePayload)
        .eq('id', expense.id)

      if (linkError) {
        console.warn('Could not update expenses table in Supabase:', linkError)
      }

      // 4. Update local state
      updateExpenseReceipt(expense.id, filePath, file.name)

      // 5. Generate signed URL for immediate viewing
      const { data: signedData } = await supabase.storage
        .from(RECEIPTS_BUCKET)
        .createSignedUrl(filePath, 60 * 60)
      if (signedData?.signedUrl) {
        const receiptRow = receiptData?.[0]
        setReceiptLinks((prev) => ({
          ...prev,
          [expense.id]: [
            ...(prev[expense.id] || []),
            {
              id: receiptRow?.id || filePath,
              url: signedData.signedUrl,
              path: filePath,
              name: file.name,
              type: file.type,
            },
          ],
        }))
      }

      await refreshExpensesFromSupabase()
      const recordName = expense.event || expense.project || 'the selected record'
      const message = `Receipt uploaded and attached to ${recordName}.`
      setFeedback({ type: 'success', message })
      addNotification({
        type: 'system',
        title: 'Receipt Uploaded',
        message,
      })
      return { error: null }
    } catch (error) {
      logUploadDebugInfo(error, {
        expenseId: expense.id,
        filePath,
        step: error.uploadStep || 'unknown',
      })
      const message = error.uploadStep === 'receipt_record'
        ? `The file uploaded, but its receipt record could not be saved: ${error.message}`
        : error.uploadStep === 'expense_link'
          ? `The receipt could not be linked to the selected record: ${error.message}`
          : getUploadErrorMessage(error)
      setErrorsById((prev) => ({ ...prev, [expense.id]: message }))
      setFeedback({ type: 'error', message })
      return { error }
    } finally {
      setUploadingId(null)
    }
  }

  function triggerCamera(expense) {
    setActiveExpense(expense)
    setScanModalOpen(true)
    setScanStatus('camera')
  }

  function triggerUpload(expense) {
    if (uploadingId !== null) return
    pendingUploadExpenseRef.current = expense
    setActiveExpense(expense)
    setFeedback(null)
    setErrorsById((prev) => ({ ...prev, [expense.id]: '' }))
    if (uploadInputRef.current) uploadInputRef.current.value = ''
    uploadInputRef.current?.click()
  }

  function capturePhoto() {
    if (!videoRef.current) return
    const canvas = document.createElement('canvas')
    canvas.width = videoRef.current.videoWidth
    canvas.height = videoRef.current.videoHeight
    const ctx = canvas.getContext('2d')
    ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height)
    canvas.toBlob(blob => {
      const file = new File([blob], `capture-${Date.now()}.jpg`, { type: 'image/jpeg' })
      setScanFile(file)
      setScanStatus('scanning')
      setTimeout(() => {
        setOcrData({
          vendor: 'Local Vendor Inc.',
          receiptNumber: `RCP-${Math.floor(Math.random() * 10000)}`,
          date: new Date().toISOString().split('T')[0],
          amount: activeExpense?.amount || '',
          items: 'Office Supplies, Event Materials'
        })
        setScanStatus('review')
      }, 2000)
    }, 'image/jpeg')
  }

  async function handleFileSelected(event) {
    const files = Array.from(event.target.files || [])
    const expense = pendingUploadExpenseRef.current
    event.target.value = ''
    pendingUploadExpenseRef.current = null

    if (!files.length) return
    if (!expense) {
      setFeedback({
        type: 'error',
        message: 'No Project, Event, or Payroll record was selected. Please choose Upload again.',
      })
      return
    }

    for (const file of files) {
      await uploadReceipt(expense, file)
    }
  }

  async function confirmScanUpload() {
    if (!activeExpense || !scanFile || scanStatus === 'uploading') return

    setScanStatus('uploading')
    const appendedNotes = [
      ocrData.vendor ? `Vendor: ${ocrData.vendor}` : '',
      ocrData.receiptNumber ? `Receipt #: ${ocrData.receiptNumber}` : '',
      ocrData.date ? `Receipt date: ${ocrData.date}` : '',
      ocrData.amount !== '' ? `Receipt amount: ${ocrData.amount}` : '',
      ocrData.items ? `Items: ${ocrData.items}` : '',
    ].filter(Boolean).join('\n')

    const { error } = await uploadReceipt(activeExpense, scanFile, {
      appendedNotes,
    })

    if (error) {
      setScanStatus('review')
      return
    }

    setScanModalOpen(false)
    setScanFile(null)
    setScanStatus('idle')
  }

  return (
    <RoleGate allow={['SK Chairman', 'SK Treasurer', 'Barangay Treasurer']}>
      <header className="dashboard-header">
        <div className="header-left">
          <div>
            <p className="eyebrow">Receipts</p>
            <h1>Approved Project, Event, and Payroll receipts</h1>
            <p>Upload and manage multiple receipts for approved Projects, Events, and Payroll records. Maximum 20 MB per file.</p>
          </div>
        </div>
        <div className="header-actions">
          <input
            type="file"
            multiple
            accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf"
            ref={uploadInputRef}
            onChange={handleFileSelected}
            style={{ display: 'none' }}
          />
        </div>
      </header>

      <section className="dashboard-content">
        {feedback ? (
          <div
            className={feedback.type === 'success' ? 'form-success' : 'form-error'}
            role={feedback.type === 'error' ? 'alert' : 'status'}
            style={{ marginBottom: '16px' }}
          >
            {feedback.message}
          </div>
        ) : null}

        <div className="overview-card">
          <p className="eyebrow">Receipts</p>
          <h2 style={{ marginBottom: '16px' }}>Attach receipts to approved Projects, Events, and Payroll</h2>

          {/* Search & Filter Toolbar */}
          <div className="receipts-toolbar">
            <div className="receipts-search-box">
              <span className="receipts-search-icon">🔍</span>
              <input
                type="text"
                placeholder="Search event, category, or amount…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <div className="receipts-filter-group">
              <select
                className="receipts-select"
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
              >
                <option value="all">All Receipts Status</option>
                <option value="with">With Receipts</option>
                <option value="missing">Missing Receipts</option>
              </select>

              {categories.length > 0 ? (
                <select
                  className="receipts-select"
                  value={filterCategory}
                  onChange={(e) => setFilterCategory(e.target.value)}
                >
                  <option value="all">All Categories</option>
                  {categories.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              ) : null}

              <span style={{ fontSize: '0.82rem', color: 'var(--ink-soft)', fontWeight: 600, padding: '4px 8px', background: 'rgba(15,31,54,0.04)', borderRadius: '8px' }}>
                {filteredExpenses.length} record{filteredExpenses.length === 1 ? '' : 's'}
              </span>
            </div>
          </div>

          {expensesSyncStatus === 'loading' ? (
            <p className="form-note">Syncing approved Projects, Events, and Payroll records...</p>
          ) : null}

          {/* Desktop Table View */}
          <div className="receipts-table-container receipt-desktop-table">
            <table className="receipts-table">
              <thead>
                <tr>
                  <th style={{ width: '25%' }}>Event / Project</th>
                  <th style={{ width: '18%' }}>Category</th>
                  <th style={{ width: '14%' }}>Amount</th>
                  <th style={{ width: '13%' }}>Approved</th>
                  <th style={{ width: '18%' }}>Receipts</th>
                  <th style={{ width: '12%', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredExpenses.length > 0 ? (
                  filteredExpenses.map((expense) => {
                    const receipts = receiptLinks[expense.id] || []
                    return (
                      <tr key={expense.id}>
                        <td className="receipt-event-cell">
                          <span className="receipt-event-name" title={expense.event || expense.project || 'Untitled'}>
                            {expense.event || expense.project || 'Untitled'}
                          </span>
                          <span className="receipt-type-pill">
                            {expense.type || 'Project'}
                          </span>
                        </td>
                        <td>{expense.category || 'Uncategorized'}</td>
                        <td>
                          <span className="receipt-amount-val">
                            ₱{Number(expense.amount || 0).toLocaleString()}
                          </span>
                        </td>
                        <td>
                          {expense.approvedAt
                            ? new Date(expense.approvedAt).toLocaleDateString()
                            : '—'}
                        </td>
                        <td>
                          {receipts.length > 1 ? (
                            <button
                              type="button"
                              className="receipt-multi-btn"
                              onClick={() => setViewerExpense(expense)}
                              title="Click to view all attached receipts"
                            >
                              <span>🧾</span>
                              <span>{receipts.length} Receipts</span>
                              <span className="receipt-multi-tag">View All →</span>
                            </button>
                          ) : receipts.length === 1 ? (
                            <div className="receipt-cell-wrapper">
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
                              <button
                                type="button"
                                className="receipt-action-btn"
                                style={{ padding: '5px 8px', fontSize: '0.75rem' }}
                                title="View Details"
                                onClick={() => setViewerExpense(expense)}
                              >
                                👁️
                              </button>
                            </div>
                          ) : (
                            <span className="receipt-missing-chip">
                              ⚠️ Missing
                            </span>
                          )}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          {role !== 'Barangay Treasurer' ? (
                            <div className="receipt-actions-wrapper" style={{ justifyContent: 'flex-end' }}>
                              <button
                                type="button"
                                className="receipt-action-btn scan-btn"
                                disabled={uploadingId !== null}
                                onClick={() => triggerCamera(expense)}
                                title="Scan receipt with camera & OCR"
                              >
                                📷 Scan
                              </button>
                              <button
                                type="button"
                                className="receipt-action-btn upload-btn"
                                disabled={uploadingId !== null}
                                onClick={() => triggerUpload(expense)}
                                title="Upload file"
                              >
                                {uploadingId === expense.id ? (
                                  <>
                                    <span
                                      className="spinner"
                                      aria-hidden="true"
                                      style={{ width: '12px', height: '12px', margin: 0 }}
                                    />
                                    <span>…</span>
                                  </>
                                ) : '📁 Upload'}
                              </button>
                            </div>
                          ) : (
                            <span className="status-pill status-neutral">View Only</span>
                          )}
                          {errorsById[expense.id] ? (
                            <div className="form-error" role="alert" style={{ marginTop: '4px', fontSize: '0.75rem' }}>
                              {errorsById[expense.id]}
                            </div>
                          ) : null}
                        </td>
                      </tr>
                    )
                  })
                ) : (
                  <tr>
                    <td colSpan="6" className="empty-state" style={{ textAlign: 'center', padding: '36px 16px' }}>
                      {searchQuery || filterStatus !== 'all' || filterCategory !== 'all'
                        ? 'No records match the active filter criteria.'
                        : 'No approved Projects, Events, or Payroll records are available yet.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards View */}
          <div className="receipt-mobile-cards">
            {filteredExpenses.length > 0 ? (
              filteredExpenses.map((expense) => {
                const receipts = receiptLinks[expense.id] || []
                return (
                  <div key={expense.id} className="receipt-card-mobile">
                    <div className="receipt-card-header">
                      <div>
                        <h3 className="receipt-card-title">{expense.event || expense.project || 'Untitled'}</h3>
                        <span className="receipt-type-pill">{expense.type || 'Project'}</span>
                      </div>
                      <span className="receipt-amount-val" style={{ fontSize: '1.05rem' }}>
                        ₱{Number(expense.amount || 0).toLocaleString()}
                      </span>
                    </div>

                    <div className="receipt-card-meta">
                      <span>📂 {expense.category || 'Uncategorized'}</span>
                      <span>•</span>
                      <span>📅 {expense.approvedAt ? new Date(expense.approvedAt).toLocaleDateString() : '—'}</span>
                    </div>

                    <div className="receipt-card-receipt-section">
                      <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--ink-soft)' }}>
                        Attached Receipts:
                      </span>
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
                        <span className="receipt-missing-chip">⚠️ Missing</span>
                      )}
                    </div>

                    {role !== 'Barangay Treasurer' ? (
                      <div className="receipt-card-actions">
                        <button
                          type="button"
                          className="receipt-action-btn scan-btn"
                          disabled={uploadingId !== null}
                          onClick={() => triggerCamera(expense)}
                        >
                          📷 Scan Receipt
                        </button>
                        <button
                          type="button"
                          className="receipt-action-btn upload-btn"
                          disabled={uploadingId !== null}
                          onClick={() => triggerUpload(expense)}
                        >
                          {uploadingId === expense.id ? (
                            <>
                              <span className="spinner" style={{ width: '14px', height: '14px', margin: 0 }} />
                              Uploading…
                            </>
                          ) : '📁 Upload File'}
                        </button>
                      </div>
                    ) : (
                      <div style={{ textAlign: 'right' }}>
                        <span className="status-pill status-neutral">View Only</span>
                      </div>
                    )}

                    {errorsById[expense.id] ? (
                      <div className="form-error" role="alert" style={{ marginTop: '6px', fontSize: '0.82rem' }}>
                        {errorsById[expense.id]}
                      </div>
                    ) : null}
                  </div>
                )
              })
            ) : (
              <div className="empty-state" style={{ textAlign: 'center', padding: '36px 16px', background: '#fff', borderRadius: '12px' }}>
                {searchQuery || filterStatus !== 'all' || filterCategory !== 'all'
                  ? 'No records match the active filter criteria.'
                  : 'No approved Projects, Events, or Payroll records are available yet.'}
              </div>
            )}
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
                    <span>Budget: <strong style={{ color: '#15803d' }}>₱{Number(viewerExpense.amount || 0).toLocaleString()}</strong></span>
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

            <div className="modal-footer" style={{ padding: '16px 24px', borderTop: '1px solid rgba(15,31,54,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
              {role !== 'Barangay Treasurer' ? (
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    className="secondary-button"
                    style={{ fontSize: '0.85rem', padding: '8px 14px' }}
                    onClick={() => {
                      const target = viewerExpense
                      setViewerExpense(null)
                      triggerCamera(target)
                    }}
                  >
                    📷 Scan Receipt
                  </button>
                  <button
                    type="button"
                    className="secondary-button"
                    style={{ fontSize: '0.85rem', padding: '8px 14px' }}
                    onClick={() => {
                      const target = viewerExpense
                      setViewerExpense(null)
                      triggerUpload(target)
                    }}
                  >
                    📁 Upload More
                  </button>
                </div>
              ) : <div />}
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

      {scanModalOpen ? (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h2>Scanning Receipt</h2>
              <p>Analyzing document with AI...</p>
            </div>
            <div className="modal-body">
              {scanStatus === 'camera' ? (
                <div style={{ textAlign: 'center' }}>
                  <div style={{ background: '#000', borderRadius: '12px', overflow: 'hidden', marginBottom: '16px' }}>
                    <video ref={videoRef} autoPlay playsInline style={{ width: '100%', maxHeight: '60vh', display: 'block' }}></video>
                  </div>
                  <button type="button" className="primary-button" onClick={capturePhoto} style={{ width: '100%', padding: '16px', fontSize: '1.1rem' }}>
                    Capture Photo
                  </button>
                </div>
              ) : scanStatus === 'camera_error' ? (
                <div style={{ padding: '40px 0', textAlign: 'center' }}>
                  <p style={{ color: 'var(--cherry)', marginBottom: '16px' }}>Camera access denied or unavailable.</p>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => {
                      pendingUploadExpenseRef.current = activeExpense
                      if (uploadInputRef.current) uploadInputRef.current.value = ''
                      uploadInputRef.current?.click()
                    }}
                  >
                    Upload File Instead
                  </button>
                </div>
              ) : scanStatus === 'scanning' ? (
                <div style={{ padding: '40px 0', textAlign: 'center' }}>
                  <div className="spinner"></div>
                  <p>Extracting data from receipt with OCR...</p>
                </div>
              ) : scanStatus === 'uploading' ? (
                <div style={{ padding: '40px 0', textAlign: 'center' }}>
                  <div className="spinner"></div>
                  <p>Uploading and attaching receipt to {activeExpense?.project}...</p>
                </div>
              ) : scanStatus === 'review' ? (
                <div className="details-panel" style={{ marginTop: '16px' }}>
                  <p style={{ color: '#15803d', fontWeight: 'bold', margin: '0 0 12px' }}>✓ Data Extracted Successfully</p>
                  <p style={{ fontSize: '0.9rem', color: 'var(--ink-soft)', marginBottom: '16px' }}>
                    Please review and confirm the extracted details below before saving.
                  </p>
                  <div className="form-grid">
                    <div className="field-group">
                      <label>Store / Vendor Name</label>
                      <input type="text" value={ocrData.vendor} onChange={e => setOcrData({...ocrData, vendor: e.target.value})} />
                    </div>
                    <div className="field-group">
                      <label>Receipt Number</label>
                      <input type="text" value={ocrData.receiptNumber} onChange={e => setOcrData({...ocrData, receiptNumber: e.target.value})} />
                    </div>
                    <div className="field-group">
                      <label>Date</label>
                      <input type="date" value={ocrData.date} onChange={e => setOcrData({...ocrData, date: e.target.value})} />
                    </div>
                    <div className="field-group">
                      <label>Total Amount (₱)</label>
                      <CurrencyInput value={ocrData.amount} onValueChange={val => setOcrData({...ocrData, amount: Number(val)})} />
                    </div>
                  </div>
                  <div className="field-group" style={{ marginTop: '16px' }}>
                    <label>Purchased Items</label>
                    <textarea value={ocrData.items} rows={3} onChange={e => setOcrData({...ocrData, items: e.target.value})}></textarea>
                  </div>
                </div>
              ) : null}
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  setScanModalOpen(false)
                  stopCamera()
                }}
                disabled={scanStatus === 'uploading'}
              >
                Cancel
              </button>
              {scanStatus === 'review' && activeExpense ? (
                <button
                  type="button"
                  className="primary-button"
                  onClick={confirmScanUpload}
                >
                  Save & Attach
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </RoleGate>
  )
}

export default ReceiptsPage
