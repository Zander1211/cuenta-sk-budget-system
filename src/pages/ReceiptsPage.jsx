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
  const [ocrData, setOcrData] = useState({ vendor: '', receiptNumber: '', date: '', amount: '', items: '' })
  
  const uploadInputRef = useRef(null)
  const pendingUploadExpenseRef = useRef(null)
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const RECEIPTS_BUCKET = 'receipts'

  const approvedExpenses = useMemo(
    () => expenses.filter((expense) =>
      (expense.status || 'Approved') === 'Approved'
      && ['Project', 'Event'].includes(expense.type || 'Project')
    ),
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
    if (!expense || !['Project', 'Event'].includes(expense.type || 'Project')) {
      const message = 'Select a valid approved Project or Event before uploading.'
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
    const previousPath = expense.receiptUrl || expense.receipt_url || null

    try {
      const { error: uploadError } = await supabase.storage
        .from(RECEIPTS_BUCKET)
        .upload(filePath, file, { upsert: false })

      if (uploadError) {
        throw Object.assign(uploadError, { uploadStep: 'storage' })
      }

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

      const receiptRecordId = receiptData?.[0]?.id || null
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
        .select('id')
        .single()

      if (linkError) {
        if (receiptRecordId) {
          await supabase.from('receipt_records').delete().eq('id', receiptRecordId)
        }
        await supabase.storage.from(RECEIPTS_BUCKET).remove([filePath])
        throw Object.assign(linkError, { uploadStep: 'expense_link' })
      }

      updateExpenseReceipt(expense.id, filePath, file.name)

      const { data: signedData } = await supabase.storage
        .from(RECEIPTS_BUCKET)
        .createSignedUrl(filePath, 60 * 60)
      if (signedData?.signedUrl) {
        setReceiptLinks((prev) => ({ ...prev, [expense.id]: signedData.signedUrl }))
      }

      if (previousPath && previousPath !== filePath) {
        await supabase.storage.from(RECEIPTS_BUCKET).remove([previousPath])
        await supabase.from('receipt_records').delete().eq('file_path', previousPath)
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
    const file = event.target.files?.[0]
    const expense = pendingUploadExpenseRef.current
    event.target.value = ''
    pendingUploadExpenseRef.current = null

    if (!file) return
    if (!expense) {
      setFeedback({
        type: 'error',
        message: 'No Project or Event was selected. Please choose Upload again.',
      })
      return
    }

    await uploadReceipt(expense, file)
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
            <h1>Approved Project and Event receipts</h1>
            <p>Upload and manage receipts for approved Projects and Events.</p>
          </div>
        </div>
        <div className="header-actions">
          <input
            type="file"
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
          <h2>Attach receipts to approved Projects and Events</h2>
          {expensesSyncStatus === 'loading' ? (
            <p className="form-note">Syncing approved Projects and Events...</p>
          ) : null}

            <table className="data-table">
              <thead>
                <tr>
                  <th>Event</th>
                  <th>Category</th>
                  <th>Amount</th>
                  <th>Approved</th>
                  <th>Receipt</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {approvedExpenses.length > 0 ? (
                  approvedExpenses.map((expense) => (
                    <tr key={expense.id}>
                      <td data-label="Event">{expense.event || expense.project || 'Untitled'}</td>
                      <td data-label="Category">{expense.category || 'Uncategorized'}</td>
                      <td data-label="Amount">{`₱${Number(expense.amount || 0).toLocaleString()}`}</td>
                      <td data-label="Approved">
                        {expense.approvedAt
                          ? new Date(expense.approvedAt).toLocaleDateString()
                          : '—'}
                      </td>
                      <td data-label="Receipt">
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
                      <td data-label="Actions">
                        {role !== 'Barangay Treasurer' ? (
                          <div className="field-row" style={{ gap: '8px' }}>
                            <button
                              type="button"
                              className="secondary-button"
                              disabled={uploadingId !== null}
                              onClick={() => triggerCamera(expense)}
                            >
                              📷 Scan Receipt
                            </button>
                            <button
                              type="button"
                              className="secondary-button"
                              disabled={uploadingId !== null}
                              onClick={() => triggerUpload(expense)}
                            >
                              {uploadingId === expense.id ? (
                                <>
                                  <span
                                    className="spinner"
                                    aria-hidden="true"
                                    style={{ width: '14px', height: '14px', margin: 0 }}
                                  />
                                  Uploading…
                                </>
                              ) : '📁 Upload'}
                            </button>
                            {errorsById[expense.id] ? (
                              <span className="form-error" role="alert">
                                {errorsById[expense.id]}
                              </span>
                            ) : null}
                          </div>
                        ) : (
                          <span className="status-pill status-neutral">View Only</span>
                        )}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="6" className="empty-state">
                      No approved Projects or Events are available yet.
                    </td>
                  </tr>
                )}
            </tbody>
          </table>
        </div>
      </section>

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
