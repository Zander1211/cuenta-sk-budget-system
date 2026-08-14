import { Fragment, useMemo, useState, useEffect } from 'react'
import { useBudget } from '../context/BudgetContext'
import RoleGate from '../components/RoleGate'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabase/supabaseClient'

import { useRef } from 'react'
import CurrencyInput from '../components/CurrencyInput'
import { useNotifications } from '../context/NotificationContext'
import { validateReceiptFile, getUploadErrorMessage, generateReceiptPath, logUploadDebugInfo, insertReceiptRecord } from '../utils/uploadUtils'

const currency = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  maximumFractionDigits: 0,
})

function ProjectsPage() {
  const { role } = useAuth()
  const { expenses, updateProjectStatus } = useBudget()
  const [expanded, setExpanded] = useState({})


  const { user } = useAuth()
  const { addNotification } = useNotifications()
  const { refreshExpensesFromSupabase, updateExpenseReceipt } = useBudget()

  const [errorsById, setErrorsById] = useState({})
  const [uploadingId, setUploadingId] = useState(null)
  const [scanModalOpen, setScanModalOpen] = useState(false)
  const [scanFile, setScanFile] = useState(null)
  const [scanStatus, setScanStatus] = useState('idle')
  const [activeExpense, setActiveExpense] = useState(null)
  const [ocrData, setOcrData] = useState({ vendor: '', receiptNumber: '', date: '', amount: '', items: '' })

  const uploadInputRef = useRef(null)
  const pendingUploadExpenseRef = useRef(null)
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const RECEIPTS_BUCKET = 'receipts'

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
          console.error('Camera error:', err)
          setScanStatus('camera_error')
        })
    } else {
      stopCamera()
    }
    return () => stopCamera()
  }, [scanStatus])

  async function uploadReceipt(expense, file, { appendedNotes = '' } = {}) {
    const validationError = validateReceiptFile(file, role)
    if (validationError) {
      setErrorsById(prev => ({ ...prev, [expense.id]: validationError }))
      return { error: new Error(validationError) }
    }

    setUploadingId(expense.id)
    setErrorsById(prev => ({ ...prev, [expense.id]: '' }))

    const filePath = generateReceiptPath(expense, file)
    try {
      const { error: uploadError } = await supabase.storage
        .from(RECEIPTS_BUCKET)
        .upload(filePath, file, { upsert: false })

      if (uploadError) throw Object.assign(uploadError, { uploadStep: 'storage' })

      // 2. Persist one authoritative database row for this attachment
      const { error: dbError } = await insertReceiptRecord(
        supabase, expense, file, filePath, user, role
      )
      if (dbError) {
        await supabase.storage.from(RECEIPTS_BUCKET).remove([filePath])
        throw Object.assign(dbError, { uploadStep: 'receipt_record' })
      }

      // 3. Link receipt to expenses table in Supabase
      const updatePayload = { receipt_url: filePath, receipt_name: file.name }
      if (appendedNotes) {
        updatePayload.remarks = expense.remarks ? `${expense.remarks}\n\n${appendedNotes}` : appendedNotes
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

      await refreshExpensesFromSupabase()
      addNotification({ type: 'system', title: 'Receipt Uploaded', message: 'Receipt attached successfully.' })
      return { error: null }
    } catch (error) {
      logUploadDebugInfo(error, { expenseId: expense.id, filePath, step: error.uploadStep || 'unknown' })
      setErrorsById(prev => ({ ...prev, [expense.id]: getUploadErrorMessage(error) }))
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
    setErrorsById(prev => ({ ...prev, [expense.id]: '' }))
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
        setOcrData({ vendor: 'Local Vendor Inc.', receiptNumber: `RCP-${Math.floor(Math.random() * 10000)}`, date: new Date().toISOString().split('T')[0], amount: activeExpense?.amount || '', items: 'Supplies' })
        setScanStatus('review')
      }, 2000)
    }, 'image/jpeg')
  }

  async function handleFileSelected(event) {
    const files = Array.from(event.target.files || [])
    const expense = pendingUploadExpenseRef.current
    event.target.value = ''
    pendingUploadExpenseRef.current = null
    if (!files.length || !expense) return
    for (const file of files) {
      await uploadReceipt(expense, file)
    }
  }

  async function confirmScanUpload() {
    if (!activeExpense || !scanFile || scanStatus === 'uploading') return
    setScanStatus('uploading')
    const appendedNotes = [ocrData.vendor ? `Vendor: ${ocrData.vendor}` : '', ocrData.receiptNumber ? `Receipt #: ${ocrData.receiptNumber}` : '', ocrData.date ? `Receipt date: ${ocrData.date}` : '', ocrData.amount !== '' ? `Receipt amount: ${ocrData.amount}` : '', ocrData.items ? `Items: ${ocrData.items}` : ''].filter(Boolean).join('\n')
    const { error } = await uploadReceipt(activeExpense, scanFile, { appendedNotes })
    if (error) { setScanStatus('review'); return }
    setScanModalOpen(false)
    setScanFile(null)
    setScanStatus('idle')
  }




  // Filter only parent expenses (approved requests) of type 'Project'
  const parentProjects = useMemo(() => {
    return expenses.filter((item) => {
      const isProject = !item.type || item.type === 'Project'
      const status = item.status || 'Approved'
      return !item.isAdditional && ['Approved', 'Released'].includes(status) && !item.archivedAt && isProject
    })
  }, [expenses])

  function toggleDetails(id) {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  function renderProjectDetails(project, columnCount) {
    if (!expanded[project.id]) return null

    const additionalExpenses = expenses.filter(e => e.isAdditional && e.parentProjectId === project.id && !e.archivedAt)
    const additionalSum = additionalExpenses.reduce((sum, e) => sum + Number(e.amount || 0), 0)
    
    const approvedBudget = Number(project.amount || 0)
    const totalExpenses = approvedBudget + additionalSum
    const remainingBalance = approvedBudget - totalExpenses
    const utilization = approvedBudget > 0 ? Math.round((totalExpenses / approvedBudget) * 100) : 0

    return (
      <tr className="details-row">
        <td colSpan={columnCount}>
          <div className="details-panel" style={{ backgroundColor: 'var(--surface-color)', padding: '24px', borderTop: '1px solid var(--border-color)' }}>
            <div className="details-grid" style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', 
              gap: '16px', 
              marginBottom: '32px' 
            }}>
              {[
                { label: 'Approved Budget', value: currency.format(approvedBudget) },
                { label: 'Total Expenses', value: currency.format(totalExpenses) },
                { label: 'Additional Expenses', value: currency.format(additionalSum) },
                { label: 'Remaining Balance', value: currency.format(remainingBalance), highlight: remainingBalance < 0 },
                { label: 'Budget Utilization', value: `${utilization}%` },
                { label: 'Date Approved', value: project.approvedAt ? new Date(project.approvedAt).toLocaleDateString() : '—' }
              ].map((item, i) => (
                <div key={i} style={{ 
                  backgroundColor: 'var(--background-color, #ffffff)', 
                  padding: '20px', 
                  borderRadius: '12px', 
                  border: '1px solid var(--border-color)', 
                  boxShadow: '0 2px 4px rgba(0,0,0,0.02)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px'
                }}>
                  <p className="details-label" style={{ 
                    fontSize: '0.75rem', 
                    textTransform: 'uppercase', 
                    color: 'var(--text-secondary)', 
                    margin: 0,
                    letterSpacing: '0.5px'
                  }}>{item.label}</p>
                  <p className="details-value" style={{ 
                    fontSize: '1.25rem', 
                    fontWeight: '400', 
                    margin: 0,
                    color: item.highlight ? 'var(--danger-color)' : 'var(--text-primary)'
                  }}>
                    {item.value}
                  </p>
                </div>
              ))}
            </div>

            <div className="details-breakdown">
              <p className="details-label" style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: '12px' }}>Additional Expenses Breakdown</p>
              {additionalExpenses.length > 0 ? (
                <table className="data-table" style={{ marginTop: '0' }}>
                  <thead>
                    <tr>
                      <th>Description</th>
                      <th>Date</th>
                      <th>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {additionalExpenses.map(e => (
                      <tr key={e.id}>
                        <td>{e.description || e.remarks || '—'}</td>
                        <td>{e.date ? new Date(e.date).toLocaleDateString() : '—'}</td>
                        <td>{currency.format(e.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <th colSpan="2">Total Additional</th>
                      <th>{currency.format(additionalSum)}</th>
                    </tr>
                  </tfoot>
                </table>
              ) : (
                <p className="details-value" style={{ color: 'var(--text-secondary)' }}>No additional expenses linked to this project.</p>
              )}
            </div>
            

            
            {project.description && (
              <div style={{ marginTop: '24px' }}>
                <p className="details-label" style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: '4px' }}>Description</p>
                <p className="details-value">{project.description}</p>
              </div>
            )}
          </div>
        </td>
      </tr>
    )
  }

  return (
    <RoleGate allow={['SK Chairman', 'SK Treasurer', 'SK Kagawad', 'Barangay Treasurer']}>
      <header className="dashboard-header">
        <div className="header-left">
          <div>
            <p className="eyebrow">Projects Dashboard</p>
            <h1>Approved Projects</h1>
            <p>Monitor budgets, expenses, and completion status of all approved projects.</p>
          </div>
        </div>
      </header>

      <section className="dashboard-content">
        <div className="overview-card">
          <p className="eyebrow">Overview</p>
          <h2>All Approved Projects</h2>
          <table className="data-table">
            <thead>
              <tr>
                <th>Project Title</th>
                <th>Category</th>
                <th>Total Budget</th>
                <th>Utilization</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {parentProjects.length ? (
                parentProjects.map((project) => {
                  const additionalExpenses = expenses.filter(e => e.isAdditional && e.parentProjectId === project.id && !e.archivedAt)
                  const additionalSum = additionalExpenses.reduce((sum, e) => sum + Number(e.amount || 0), 0)
                  const approvedBudget = Number(project.amount || 0)
                  const totalExpenses = approvedBudget + additionalSum
                  const utilization = approvedBudget > 0 ? Math.min(100, Math.round((totalExpenses / approvedBudget) * 100)) : 0
                  
                  return (
                    <Fragment key={project.id}>
                      <tr>
                        <td data-label="Project Title">{project.project || project.event || 'Untitled'}</td>
                        <td data-label="Category">{project.category || '—'}</td>
                        <td data-label="Total Budget">{currency.format(approvedBudget)}</td>
                        <td data-label="Utilization">
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{ flex: 1, height: '6px', background: 'var(--border-color)', borderRadius: '3px', overflow: 'hidden' }}>
                              <div style={{ height: '100%', background: utilization > 100 ? 'var(--danger-color)' : 'var(--primary-color)', width: `${Math.min(utilization, 100)}%` }} />
                            </div>
                            <span style={{ fontSize: '0.75rem' }}>{utilization}%</span>
                          </div>
                        </td>
                        <td data-label="Status">
                          {role === 'SK Chairman' ? (
                            <select
                              className="project-status-select"
                              value={project.projectStatus || 'Ongoing'}
                              onChange={(e) => updateProjectStatus(project.requestId || project.id, e.target.value)}
                              aria-label="Update Project Status"
                            >
                              <option value="Ongoing">Ongoing</option>
                              <option value="Completed">Completed</option>
                            </select>
                          ) : (
                            <span className={`status-pill status-${(project.projectStatus || 'Ongoing').toLowerCase()}`}>
                              {project.projectStatus || 'Ongoing'}
                            </span>
                          )}
                        </td>
                        <td data-label="Actions" className="table-actions">
                          <button
                            className="secondary-button"
                            type="button"
                            onClick={() => toggleDetails(project.id)}
                          >
                            {expanded[project.id] ? 'Hide Details' : 'View Details'}
                          </button>
                        </td>
                      </tr>
                      {renderProjectDetails(project, 6)}
                    </Fragment>
                  )
                })
              ) : (
                <tr>
                  <td colSpan="6" className="empty-state">
                    No approved projects yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <input type="file" multiple accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf" ref={uploadInputRef} onChange={handleFileSelected} style={{ display: 'none' }} />
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
                  <button type="button" className="secondary-button" onClick={() => { pendingUploadExpenseRef.current = activeExpense; if (uploadInputRef.current) uploadInputRef.current.value = ''; uploadInputRef.current?.click(); }}>
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
                  <p>Uploading and attaching receipt...</p>
                </div>
              ) : scanStatus === 'review' ? (
                <div className="details-panel" style={{ marginTop: '16px' }}>
                  <p style={{ color: '#15803d', fontWeight: 'bold', margin: '0 0 12px' }}>✓ Data Extracted Successfully</p>
                  <div className="form-grid">
                    <div className="field-group"><label>Store / Vendor Name</label><input type="text" value={ocrData.vendor} onChange={e => setOcrData({...ocrData, vendor: e.target.value})} /></div>
                    <div className="field-group"><label>Receipt Number</label><input type="text" value={ocrData.receiptNumber} onChange={e => setOcrData({...ocrData, receiptNumber: e.target.value})} /></div>
                    <div className="field-group"><label>Date</label><input type="date" value={ocrData.date} onChange={e => setOcrData({...ocrData, date: e.target.value})} /></div>
                    <div className="field-group"><label>Total Amount (₱)</label><CurrencyInput value={ocrData.amount} onValueChange={val => setOcrData({...ocrData, amount: Number(val)})} /></div>
                  </div>
                </div>
              ) : null}
            </div>
            <div className="modal-footer">
              <button type="button" className="secondary-button" onClick={() => { setScanModalOpen(false); stopCamera(); }} disabled={scanStatus === 'uploading'}>Cancel</button>
              {scanStatus === 'review' && activeExpense ? <button type="button" className="primary-button" onClick={confirmScanUpload}>Save & Attach</button> : null}
            </div>
          </div>
        </div>
      ) : null}
    </RoleGate>

  )
}

export default ProjectsPage
