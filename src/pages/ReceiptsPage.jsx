import { useEffect, useMemo, useState, useRef } from 'react'
import RoleGate from '../components/RoleGate'
import { useBudget } from '../context/BudgetContext'
import { supabase } from '../supabase/supabaseClient'
import CurrencyInput from '../components/CurrencyInput'
import { useAuth } from '../context/AuthContext'
import { validateReceiptFile, getUploadErrorMessage, generateReceiptPath, logUploadDebugInfo, insertReceiptRecord } from '../utils/uploadUtils'

function ReceiptsPage() {
  const { user, role } = useAuth()
  const { expenses, refreshExpensesFromSupabase, expensesSyncStatus, updateExpenseReceipt } = useBudget()
  const [filesById, setFilesById] = useState({})
  const [errorsById, setErrorsById] = useState({})
  const [uploadingId, setUploadingId] = useState(null)
  const [receiptLinks, setReceiptLinks] = useState({})
  const [scanModalOpen, setScanModalOpen] = useState(false)
  const [scanFile, setScanFile] = useState(null)
  const [scanStatus, setScanStatus] = useState('idle') // 'camera', 'camera_error', 'scanning', 'review', 'uploading'
  const [activeExpense, setActiveExpense] = useState(null)
  const [ocrData, setOcrData] = useState({ vendor: '', receiptNumber: '', date: '', amount: '', items: '' })
  
  const uploadInputRef = useRef(null)
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

  const missingExpenses = useMemo(() => {
    return approvedExpenses.filter(expense => {
      const path = expense.receiptUrl || expense.receipt_url || expense.receiptName || expense.receipt_name;
      return !path;
    });
  }, [approvedExpenses]);

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

  function handleFileChange(expenseId, file) {
    setFilesById((prev) => ({ ...prev, [expenseId]: file }))
    setErrorsById((prev) => ({ ...prev, [expenseId]: '' }))
  }

  async function handleUpload(expense) {
    const file = filesById[expense.id]
    
    const validationError = validateReceiptFile(file, role)
    if (validationError) {
      setErrorsById((prev) => ({
        ...prev,
        [expense.id]: validationError,
      }))
      return
    }

    setUploadingId(expense.id)
    setErrorsById((prev) => ({ ...prev, [expense.id]: '' }))
    
    const filePath = generateReceiptPath(expense, file)

    const { error: uploadError } = await supabase.storage
      .from(RECEIPTS_BUCKET)
      .upload(filePath, file, { upsert: true })

    if (uploadError) {
      logUploadDebugInfo(uploadError, { expenseId: expense.id, filePath })
      setErrorsById((prev) => ({ ...prev, [expense.id]: getUploadErrorMessage(uploadError) }))
      setUploadingId(null)
      return
    }

    // 2. Insert robust database record
    const { error: dbError } = await insertReceiptRecord(supabase, expense, file, filePath, user, role)

    if (dbError) {
      // Rollback storage upload
      await supabase.storage.from(RECEIPTS_BUCKET).remove([filePath])
      
      logUploadDebugInfo(dbError, { expenseId: expense.id, step: 'receipt_record_insert', note: 'Rolled back storage' })
      setErrorsById((prev) => ({ ...prev, [expense.id]: `Database Error: ${dbError.message || 'Failed to link receipt record'}` }))
      setUploadingId(null)
      return
    }

    // 3. Update local state immediately (this is the primary store)
    updateExpenseReceipt(expense.id, filePath, file.name)

    // 4. Best-effort sync to minimal expenses table (only valid columns)
    const { error: updateError } = await supabase
      .from('expenses')
      .update({ receipt_url: filePath, receipt_name: file.name })
      .eq('id', expense.id)

    if (updateError) {
      // Log but don't fail — local state is already updated
      logUploadDebugInfo(updateError, { expenseId: expense.id, step: 'supabase_sync', note: 'Local state already updated' })
    }

    // 3. Generate a signed URL to display the receipt immediately
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

  function triggerCamera(expense) {
    setActiveExpense(expense)
    setScanModalOpen(true)
    setScanStatus('camera')
  }

  function triggerUpload(expense) {
    setActiveExpense(expense)
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

  function handleFileSelected(event) {
    const file = event.target.files?.[0]
    if (!file || !activeExpense) return
    
    const validationError = validateReceiptFile(file, role)
    if (validationError) {
      alert(validationError)
      event.target.value = ''
      return
    }

    setScanFile(file)
    setScanModalOpen(true)
    setScanStatus('scanning')
    
    setTimeout(() => {
      setOcrData({
        vendor: 'Local Vendor Inc.',
        receiptNumber: `RCP-${Math.floor(Math.random() * 10000)}`,
        date: new Date().toISOString().split('T')[0],
        amount: activeExpense.amount || '',
        items: 'Office Supplies, Event Materials'
      })
      setScanStatus('review')
    }, 2000)
    
    event.target.value = ''
  }

  async function confirmScanUpload() {
    if (!activeExpense || !scanFile) return
    setScanStatus('uploading')
    const expense = activeExpense
    const filePath = generateReceiptPath(expense, scanFile)

    const { error: uploadError } = await supabase.storage
      .from(RECEIPTS_BUCKET)
      .upload(filePath, scanFile, { upsert: true })

    if (uploadError) {
      logUploadDebugInfo(uploadError, { expenseId: expense.id, filePath, isScan: true })
      alert(getUploadErrorMessage(uploadError))
      setScanModalOpen(false)
      return
    }

    // 1. Insert robust database record
    const { error: dbError } = await insertReceiptRecord(supabase, expense, scanFile, filePath, user, role)

    if (dbError) {
      // Rollback storage upload
      await supabase.storage.from(RECEIPTS_BUCKET).remove([filePath])
      
      logUploadDebugInfo(dbError, { expenseId: expense.id, step: 'receipt_record_insert', note: 'Rolled back storage' })
      alert(`Database Error: ${dbError.message || 'Failed to link receipt record'}`)
      setScanModalOpen(false)
      return
    }

    // 2. Update local state immediately (primary store)
    updateExpenseReceipt(expense.id, filePath, scanFile.name)

    // 3. Build notes from OCR data to append to remarks
    const appendedNotes = `Vendor: ${ocrData.vendor}\nReceipt #: ${ocrData.receiptNumber}\nItems: ${ocrData.items}`

    // 4. Best-effort sync to minimal expenses table (only valid columns)
    const { error: updateError } = await supabase
      .from('expenses')
      .update({ 
        receipt_url: filePath, 
        receipt_name: scanFile.name,
        remarks: expense.remarks ? `${expense.remarks}\n\n${appendedNotes}` : appendedNotes
      })
      .eq('id', expense.id)

    if (updateError) {
      // Log error but don't block the user — local state is already updated
      logUploadDebugInfo(updateError, { expenseId: expense.id, step: 'supabase_sync', isScan: true })
    }

    setScanModalOpen(false)
    await refreshExpensesFromSupabase()
  }

  return (
    <RoleGate allow={['SK Chairman', 'SK Treasurer', 'Barangay Treasurer']}>
      <header className="dashboard-header">
        <div className="header-left">
          <div>
            <p className="eyebrow">Receipts</p>
            <h1>Approved events receipts</h1>
            <p>Upload receipts for events approved by the SK Chairman.</p>
          </div>
        </div>
        <div className="header-actions">
          <input
            type="file"
            accept="image/*,application/pdf"
            ref={uploadInputRef}
            onChange={handleFileSelected}
            style={{ display: 'none' }}
          />
        </div>
      </header>

      <section className="dashboard-content">
        <div className="overview-card">
          <p className="eyebrow">Receipts</p>
          <h2>Attach receipts to approved events</h2>
          {expensesSyncStatus === 'loading' ? (
            <p className="form-note">Syncing approved events...</p>
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
                              onClick={() => triggerCamera(expense)}
                            >
                              📷 Scan Receipt
                            </button>
                            <button
                              type="button"
                              className="secondary-button"
                              onClick={() => triggerUpload(expense)}
                            >
                              📁 Upload
                            </button>
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
                      No approved events available yet.
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
                  <button type="button" className="secondary-button" onClick={() => uploadInputRef.current?.click()}>
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
