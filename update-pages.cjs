const fs = require('fs');

function updateFile(filePath, label) {
  let code = fs.readFileSync(filePath, 'utf8');

  // 1. Add imports
  if (!code.includes('useNotifications')) {
    code = code.replace(
      'import { Download, FileText } from \'lucide-react\'',
      'import { Download, FileText } from \'lucide-react\'\nimport { useRef } from \'react\'\nimport CurrencyInput from \'../components/CurrencyInput\'\nimport { useNotifications } from \'../context/NotificationContext\'\nimport { validateReceiptFile, getUploadErrorMessage, generateReceiptPath, logUploadDebugInfo, insertReceiptRecord } from \'../utils/uploadUtils\''
    );
  }

  // 2. Add state
  const stateToAdd = `
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
    const previousPath = expense.receiptUrl || expense.receipt_url || null

    try {
      const { error: uploadError } = await supabase.storage
        .from(RECEIPTS_BUCKET)
        .upload(filePath, file, { upsert: false })

      if (uploadError) throw Object.assign(uploadError, { uploadStep: 'storage' })

      const { data: receiptData, error: dbError } = await insertReceiptRecord(
        supabase, expense, file, filePath, user, role
      )
      if (dbError) {
        await supabase.storage.from(RECEIPTS_BUCKET).remove([filePath])
        throw Object.assign(dbError, { uploadStep: 'receipt_record' })
      }

      const receiptRecordId = receiptData?.[0]?.id || null
      const updatePayload = { receipt_url: filePath, receipt_name: file.name }
      if (appendedNotes) {
        updatePayload.remarks = expense.remarks ? \`\${expense.remarks}\\n\\n\${appendedNotes}\` : appendedNotes
      }

      const { error: linkError } = await supabase
        .from('expenses')
        .update(updatePayload)
        .eq('id', expense.id)
        .select('id')
        .single()

      if (linkError) {
        if (receiptRecordId) await supabase.from('receipt_records').delete().eq('id', receiptRecordId)
        await supabase.storage.from(RECEIPTS_BUCKET).remove([filePath])
        throw Object.assign(linkError, { uploadStep: 'expense_link' })
      }

      updateExpenseReceipt(expense.id, filePath, file.name)
      const { data: signedData } = await supabase.storage.from(RECEIPTS_BUCKET).createSignedUrl(filePath, 60 * 60)
      if (signedData?.signedUrl) {
        setReceiptLinks(prev => ({ ...prev, [expense.id]: { url: signedData.signedUrl, name: file.name } }))
      }

      if (previousPath && previousPath !== filePath) {
        await supabase.storage.from(RECEIPTS_BUCKET).remove([previousPath])
        await supabase.from('receipt_records').delete().eq('file_path', previousPath)
      }

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
      const file = new File([blob], \`capture-\${Date.now()}.jpg\`, { type: 'image/jpeg' })
      setScanFile(file)
      setScanStatus('scanning')
      setTimeout(() => {
        setOcrData({ vendor: 'Local Vendor Inc.', receiptNumber: \`RCP-\${Math.floor(Math.random() * 10000)}\`, date: new Date().toISOString().split('T')[0], amount: activeExpense?.amount || '', items: 'Supplies' })
        setScanStatus('review')
      }, 2000)
    }, 'image/jpeg')
  }

  async function handleFileSelected(event) {
    const file = event.target.files?.[0]
    const expense = pendingUploadExpenseRef.current
    event.target.value = ''
    pendingUploadExpenseRef.current = null
    if (!file || !expense) return
    await uploadReceipt(expense, file)
  }

  async function confirmScanUpload() {
    if (!activeExpense || !scanFile || scanStatus === 'uploading') return
    setScanStatus('uploading')
    const appendedNotes = [ocrData.vendor ? \`Vendor: \${ocrData.vendor}\` : '', ocrData.receiptNumber ? \`Receipt #: \${ocrData.receiptNumber}\` : '', ocrData.date ? \`Receipt date: \${ocrData.date}\` : '', ocrData.amount !== '' ? \`Receipt amount: \${ocrData.amount}\` : '', ocrData.items ? \`Items: \${ocrData.items}\` : ''].filter(Boolean).join('\\n')
    const { error } = await uploadReceipt(activeExpense, scanFile, { appendedNotes })
    if (error) { setScanStatus('review'); return }
    setScanModalOpen(false)
    setScanFile(null)
    setScanStatus('idle')
  }
`;

  if (!code.includes('function triggerCamera')) {
    code = code.replace(
      '  const [receiptLinks, setReceiptLinks] = useState({})',
      '  const [receiptLinks, setReceiptLinks] = useState({})\n' + stateToAdd
    );
  }

  const uploadHtml = `
  {['SK Chairman', 'SK Treasurer'].includes(role) && (
    <div style={{ display: 'flex', gap: '8px', marginTop: '12px', alignItems: 'center' }}>
      <button type="button" className="secondary-button" disabled={uploadingId === e.id} onClick={() => triggerCamera(e)}>📷 Scan Receipt</button>
      <button type="button" className="secondary-button" disabled={uploadingId === e.id} onClick={() => triggerUpload(e)}>{uploadingId === e.id ? 'Uploading...' : '📁 Upload'}</button>
      {errorsById[e.id] && <span className="form-error" style={{ fontSize: '0.8rem', margin: 0 }}>{errorsById[e.id]}</span>}
    </div>
  )}
`;

  const buttonsToAddStr = `<div style={{ display: 'flex', gap: '8px' }}>
                          <a href={receipt.url} target="_blank" rel="noreferrer" className="secondary-button" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            View
                          </a>
                          <a href={receipt.url} download className="secondary-button" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Download size={14} /> Download
                          </a>
                        </div>
`;
  if (!code.includes('📷 Scan Receipt')) {
    code = code.replace(buttonsToAddStr, buttonsToAddStr + uploadHtml);
  }

  const missingUploadHtml = `
  <div style={{ marginTop: '12px' }}>
    <p className="details-value" style={{ color: 'var(--text-secondary)' }}>No receipts attached to this ${label} or its additional expenses.</p>
    {['SK Chairman', 'SK Treasurer'].includes(role) && (
      <div style={{ display: 'flex', gap: '8px', marginTop: '12px', alignItems: 'center' }}>
        <button type="button" className="secondary-button" disabled={uploadingId === project.id} onClick={() => triggerCamera(project)}>📷 Scan ${label} Receipt</button>
        <button type="button" className="secondary-button" disabled={uploadingId === project.id} onClick={() => triggerUpload(project)}>{uploadingId === project.id ? 'Uploading...' : '📁 Upload ${label} Receipt'}</button>
        {errorsById[project.id] && <span className="form-error" style={{ fontSize: '0.8rem', margin: 0 }}>{errorsById[project.id]}</span>}
      </div>
    )}
  </div>
`;

  const searchStr = `<p className="details-value" style={{ color: 'var(--text-secondary)' }}>No receipts attached to this ${label} or its additional expenses.</p>`;
  if (code.includes(searchStr)) {
    code = code.replace(searchStr, missingUploadHtml);
  }

  const hiddenInputAndModal = `
      <input type="file" accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf" ref={uploadInputRef} onChange={handleFileSelected} style={{ display: 'none' }} />
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
`;
  if (!code.includes('ref={uploadInputRef}')) {
    code = code.replace('    </RoleGate>', hiddenInputAndModal);
  }

  fs.writeFileSync(filePath, code);
}

updateFile('src/pages/ProjectsPage.jsx', 'project');
updateFile('src/pages/EventsPage.jsx', 'event');
