import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { Camera, Eye, Search, Trash2, X } from 'lucide-react'
import { useBudget } from '../../context/BudgetContext'
import { useAuth } from '../../context/AuthContext'
import { useAuditLog } from '../../context/AuditLogContext'
import { useNotifications } from '../../context/NotificationContext'
import { supabase } from '../../supabase/supabaseClient'
import {
  validateReceiptFile,
  getUploadErrorMessage,
  generateReceiptScanPaths,
  logUploadDebugInfo,
  insertScannedReceiptRecord,
  formatOcrMetadataNote,
  deleteReceiptRecord,
} from '../../utils/uploadUtils'
import ReceiptOCRDetailsModal from './ReceiptOCRDetailsModal'
import PaginationControls from '../PaginationControls'

// The scanner pulls in the image pipeline and, on demand, the OCR engine —
// same split as the main Receipts page, so opening this modal doesn't cost
// that weight until someone actually scans.
const ReceiptScanModal = lazy(() => import('./ReceiptScanModal'))

const RECEIPTS_BUCKET = 'receipts'
const PAGE_SIZE = 6

const currency = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  maximumFractionDigits: 2,
})

function formatDate(value) {
  if (!value) return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function receiptStatus(receipt) {
  const isVerified = Boolean(receipt.ocrVerifiedAt)
  const hasAmount = Number.isFinite(Number(receipt.ocrMetadata?.totalAmount)) && Number(receipt.ocrMetadata?.totalAmount) > 0
  if (isVerified && hasAmount) return { label: 'Processed', tone: 'positive' }
  if (receipt.isScanned) return { label: 'Scanned', tone: 'neutral' }
  return { label: 'Uploaded', tone: 'neutral' }
}

// Generate-from-record entry point for receipts, opened from a Project or
// Event's own "Receipts" button. `record` is the approved expenses row —
// everything here is scoped to it (and its linked additional requisitions),
// so nothing asks the user to pick a Project/Event again. It reads and
// writes the exact same `receipt_records` rows and `receipts` storage bucket
// as the main Receipts page, so a receipt added from either place appears in
// both — there is only one source of data.
function RecordReceiptsModal({ record, onClose }) {
  const { user, role } = useAuth()
  const { addNotification } = useNotifications()
  const { addLog } = useAuditLog()
  const { expenses, verifiedReceiptTotals, refreshExpensesFromSupabase, updateExpenseReceipt } = useBudget()

  const canManage = ['SK Chairman', 'SK Treasurer'].includes(role)

  const [receipts, setReceipts] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [feedback, setFeedback] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [page, setPage] = useState(1)
  const [scanModalOpen, setScanModalOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [ocrViewer, setOcrViewer] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deletingId, setDeletingId] = useState(null)

  const recordName = record.event || record.project || 'this record'
  const recordTypeLabel = record.type || 'Project'

  // A receipt can be filed under the record's own id, the original request id
  // (receipts uploaded before the request finished approving), or one of its
  // linked additional requisitions — the same ownership resolution the main
  // Receipts page uses, scoped to just this one record.
  const ownerIds = useMemo(() => {
    const ids = new Set([String(record.id)])
    if (record.requestId) ids.add(String(record.requestId))
    expenses
      .filter((e) => e.isAdditional && String(e.parentProjectId) === String(record.id))
      .forEach((requisition) => ids.add(String(requisition.id)))
    return ids
  }, [record, expenses])

  useEffect(() => {
    let mounted = true
    // `isLoading` starts true, which covers the initial fetch. If `ownerIds`
    // later changes (an additional requisition gets linked while this modal
    // is open, say), the previous list stays on screen until the re-fetch
    // resolves instead of flashing back to a loading state.

    ;(async () => {
      const recordIds = Array.from(ownerIds)
      let receiptRows
      const scanAware = await supabase
        .from('receipt_records')
        .select('id, record_id, requisition_id, file_path, original_path, is_scanned, ocr_metadata, scan_settings, ocr_verified_at, ocr_verified_by, file_name, file_type, uploaded_at')
        .in('record_id', recordIds)
        .order('uploaded_at', { ascending: false })

      if (scanAware.error) {
        const legacy = await supabase
          .from('receipt_records')
          .select('id, record_id, file_path, file_name, file_type, uploaded_at')
          .in('record_id', recordIds)
          .order('uploaded_at', { ascending: false })
        receiptRows = legacy.data
        if (legacy.error) console.error('Could not load receipt records:', legacy.error)
      } else {
        receiptRows = scanAware.data
      }

      const resolved = []
      await Promise.all((receiptRows || []).map(async (receipt) => {
        const { data } = await supabase.storage
          .from(RECEIPTS_BUCKET)
          .createSignedUrl(receipt.file_path, 60 * 60)
        if (!data?.signedUrl) return

        let originalUrl = null
        if (receipt.original_path) {
          const { data: originalData } = await supabase.storage
            .from(RECEIPTS_BUCKET)
            .createSignedUrl(receipt.original_path, 60 * 60)
          originalUrl = originalData?.signedUrl || null
        }

        resolved.push({
          id: receipt.id,
          url: data.signedUrl,
          path: receipt.file_path,
          originalPath: receipt.original_path || null,
          name: receipt.file_name || 'Receipt',
          type: receipt.file_type,
          isScanned: Boolean(receipt.is_scanned),
          originalUrl,
          ocrMetadata: receipt.ocr_metadata || null,
          scanSettings: receipt.scan_settings || null,
          ocrVerifiedAt: receipt.ocr_verified_at || null,
          ocrVerifiedBy: receipt.ocr_verified_by || null,
          uploadedAt: receipt.uploaded_at || null,
          requisitionId: receipt.requisition_id || null,
        })
      }))

      // A receipt uploaded before receipt_records existed lives only in the
      // expense's own receipt_url column — surface it the same way the main
      // Receipts page does, so nothing that was previously visible vanishes.
      const legacyPath = record.receiptUrl || record.receipt_url
      if (legacyPath && !resolved.some((r) => r.path === legacyPath)) {
        const { data } = await supabase.storage
          .from(RECEIPTS_BUCKET)
          .createSignedUrl(legacyPath, 60 * 60)
        if (data?.signedUrl) {
          resolved.push({
            id: `legacy-${record.id}`,
            url: data.signedUrl,
            path: legacyPath,
            originalPath: null,
            name: record.receiptName || record.receipt_name || 'Receipt',
            type: null,
            isScanned: false,
            originalUrl: null,
            ocrMetadata: null,
            scanSettings: null,
            ocrVerifiedAt: null,
            ocrVerifiedBy: null,
            uploadedAt: null,
            requisitionId: null,
          })
        }
      }

      resolved.sort((a, b) => new Date(b.uploadedAt || 0) - new Date(a.uploadedAt || 0))

      if (mounted) {
        setReceipts(resolved)
        setIsLoading(false)
      }
    })()

    return () => {
      mounted = false
    }
    // record.receiptUrl/receiptName are read once above per fetch — re-running
    // this effect on every keystroke elsewhere in the app is unnecessary, so
    // only the identity of the record and its computed owner ids matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerIds])

  // Merge in totals this modal has verified locally but the global context
  // (refreshed on an interval / after other actions) may not have caught up
  // to yet — same reasoning as the main Receipts page.
  const scopedVerifiedTotals = useMemo(() => {
    const totals = { ...(verifiedReceiptTotals || {}) }
    const verifiedSum = receipts.reduce((sum, r) => {
      const amount = Number(r.ocrMetadata?.totalAmount)
      return r.ocrVerifiedAt && Number.isFinite(amount) && amount > 0 ? sum + amount : sum
    }, 0)
    if (verifiedSum > 0) totals[String(record.id)] = verifiedSum
    return totals
  }, [receipts, verifiedReceiptTotals, record.id])

  const filteredReceipts = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) return receipts
    return receipts.filter((r) => {
      const haystack = [
        r.name,
        r.ocrMetadata?.organization,
        r.ocrMetadata?.receivedFrom,
        r.ocrMetadata?.receiptNumber,
        formatDate(r.ocrMetadata?.date || r.uploadedAt),
        r.ocrMetadata?.totalAmount != null ? currency.format(r.ocrMetadata.totalAmount) : '',
      ].filter(Boolean).join(' ').toLowerCase()
      return haystack.includes(query)
    })
  }, [receipts, searchQuery])

  const totalPages = Math.max(1, Math.ceil(filteredReceipts.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const pagedReceipts = filteredReceipts.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  function triggerScan() {
    if (record.archivedAt) {
      addNotification({
        type: 'error',
        title: 'Record Archived',
        message: `"${recordName}" has been archived and can no longer accept new receipts.`,
      })
      return
    }
    setFeedback(null)
    setScanModalOpen(true)
  }

  async function saveScannedReceipt({ scanFile, originalFile, metadata, scanSettings }) {
    const validationError = validateReceiptFile(scanFile, role)
    if (validationError) throw new Error(validationError)

    const { scanPath, originalPath } = generateReceiptScanPaths(record, scanFile, originalFile)
    setIsSaving(true)

    let scanUploaded = false
    let originalUploaded = false

    try {
      const { error: scanError } = await supabase.storage
        .from(RECEIPTS_BUCKET)
        .upload(scanPath, scanFile, { upsert: false })
      if (scanError) throw Object.assign(scanError, { uploadStep: 'storage' })
      scanUploaded = true

      let storedOriginalPath = originalPath
      const { error: originalError } = await supabase.storage
        .from(RECEIPTS_BUCKET)
        .upload(originalPath, originalFile, { upsert: false })
      if (originalError) {
        console.warn('The original photograph could not be stored.', originalError)
        storedOriginalPath = null
      } else {
        originalUploaded = true
      }

      const { data: receiptData, error: dbError } = await insertScannedReceiptRecord(supabase, {
        record,
        scanFile,
        scanPath,
        originalPath: storedOriginalPath,
        ocrMetadata: metadata,
        scanSettings,
        user,
        userRole: role,
      })
      if (dbError) throw Object.assign(dbError, { uploadStep: 'receipt_record' })

      const appendedNotes = formatOcrMetadataNote(metadata)
      const updatePayload = { receipt_url: scanPath, receipt_name: scanFile.name }
      if (appendedNotes) {
        updatePayload.remarks = record.remarks ? `${record.remarks}\n\n${appendedNotes}` : appendedNotes
      }

      const { error: linkError } = await supabase
        .from('expenses')
        .update(updatePayload)
        .eq('id', record.id)
      if (linkError) console.warn('Could not link the scan to the expense record:', linkError)

      updateExpenseReceipt(record.id, scanPath, scanFile.name)

      const { data: signedData } = await supabase.storage
        .from(RECEIPTS_BUCKET)
        .createSignedUrl(scanPath, 60 * 60)

      let originalUrl = null
      if (storedOriginalPath) {
        const { data: originalSigned } = await supabase.storage
          .from(RECEIPTS_BUCKET)
          .createSignedUrl(storedOriginalPath, 60 * 60)
        originalUrl = originalSigned?.signedUrl || null
      }

      if (signedData?.signedUrl) {
        setReceipts((prev) => [
          {
            id: receiptData?.[0]?.id || scanPath,
            url: signedData.signedUrl,
            path: scanPath,
            originalPath: storedOriginalPath,
            name: scanFile.name,
            type: scanFile.type,
            isScanned: true,
            originalUrl,
            ocrMetadata: metadata,
            scanSettings,
            ocrVerifiedAt: new Date().toISOString(),
            ocrVerifiedBy: user?.user_metadata?.full_name || user?.email || 'Unknown',
            uploadedAt: new Date().toISOString(),
            requisitionId: null,
          },
          ...prev,
        ])
      }

      await refreshExpensesFromSupabase()

      const message = `Scanned receipt saved and attached to ${recordName}.`
      setFeedback({ type: 'success', message })
      addNotification({ type: 'system', title: 'Receipt Scanned', message })
      addLog({
        action: 'Receipt Scanned',
        actionType: 'Receipt Uploaded',
        module: 'Receipts',
        recordType: recordTypeLabel,
        recordId: String(record.id),
        description: `Scanned receipt attached to ${recordName}`,
        status: 'Success',
        remarks: metadata?.receiptNumber ? `Receipt no: ${metadata.receiptNumber}` : '',
      })

      setScanModalOpen(false)
      setPage(1)
    } catch (error) {
      if (scanUploaded) await supabase.storage.from(RECEIPTS_BUCKET).remove([scanPath])
      if (originalUploaded) await supabase.storage.from(RECEIPTS_BUCKET).remove([originalPath])

      logUploadDebugInfo(error, { recordId: record.id, filePath: scanPath, step: error.uploadStep || 'unknown' })

      const message = error.uploadStep === 'receipt_record'
        ? `The scan uploaded, but its receipt record could not be saved: ${error.message}`
        : getUploadErrorMessage(error)
      setFeedback({ type: 'error', message })
      throw new Error(message, { cause: error })
    } finally {
      setIsSaving(false)
    }
  }

  async function verifyReceipt(receipt, amount) {
    if (String(receipt.id).startsWith('legacy-')) {
      throw new Error('This receipt predates receipt tracking and cannot be verified here. Re-upload it via Scan & Upload instead.')
    }

    const mergedMetadata = { ...(receipt.ocrMetadata || {}), totalAmount: amount }
    const verifiedAt = new Date().toISOString()
    const verifiedBy = user?.user_metadata?.full_name || user?.email || 'Unknown'

    const { error } = await supabase
      .from('receipt_records')
      .update({ ocr_metadata: mergedMetadata, ocr_verified_at: verifiedAt, ocr_verified_by: verifiedBy })
      .eq('id', receipt.id)
    if (error) throw new Error(error.message || 'Could not verify this receipt.')

    setReceipts((prev) => prev.map((entry) =>
      entry.id === receipt.id
        ? { ...entry, ocrMetadata: mergedMetadata, ocrVerifiedAt: verifiedAt, ocrVerifiedBy: verifiedBy }
        : entry
    ))
    setOcrViewer((prev) => (
      prev && prev.receipt.id === receipt.id
        ? { ...prev, receipt: { ...prev.receipt, ocrMetadata: mergedMetadata, ocrVerifiedAt: verifiedAt, ocrVerifiedBy: verifiedBy } }
        : prev
    ))

    await refreshExpensesFromSupabase()

    const message = `Receipt verified for ${recordName} at ${currency.format(amount)}.`
    setFeedback({ type: 'success', message })
    addNotification({ type: 'system', title: 'Receipt Verified', message })
    addLog({
      action: 'Receipt Verified',
      actionType: 'Receipt Verified',
      module: 'Receipts',
      recordType: recordTypeLabel,
      recordId: String(record.id),
      description: `Manually verified receipt for ${recordName}`,
      status: 'Success',
      remarks: `Verified amount: ${currency.format(amount)}`,
    })
  }

  async function confirmDelete() {
    const receipt = deleteTarget
    if (!receipt) return
    setDeletingId(receipt.id)

    try {
      const { error } = await deleteReceiptRecord(supabase, {
        id: receipt.id,
        path: receipt.path,
        originalPath: receipt.originalPath,
      })
      if (error) throw error

      // If the deleted receipt was the one `expenses.receipt_url` points at —
      // true for every legacy receipt, and true for a scan if it was the most
      // recently uploaded one — relink that column to whatever remains so a
      // plain "does this record have a receipt" check elsewhere in the app
      // does not keep pointing at a file that no longer exists.
      const remaining = receipts.filter((r) => r.id !== receipt.id)
      const wasPrimary = (record.receiptUrl || record.receipt_url) === receipt.path
      if (wasPrimary) {
        const next = remaining[0] || null
        const { error: relinkError } = await supabase
          .from('expenses')
          .update({ receipt_url: next?.path || null, receipt_name: next?.name || null })
          .eq('id', record.id)
        if (relinkError) console.warn('Could not update the record after deleting its receipt:', relinkError)
        updateExpenseReceipt(record.id, next?.path || null, next?.name || null)
      }

      setReceipts(remaining)
      await refreshExpensesFromSupabase()

      const message = `Receipt removed from ${recordName}.`
      setFeedback({ type: 'success', message })
      addNotification({ type: 'system', title: 'Receipt Deleted', message })
      addLog({
        action: 'Receipt Deleted',
        actionType: 'Receipt Deleted',
        module: 'Receipts',
        recordType: recordTypeLabel,
        recordId: String(record.id),
        description: `Deleted receipt "${receipt.name || 'Receipt'}" from ${recordName}`,
        status: 'Success',
      })
    } catch (error) {
      setFeedback({ type: 'error', message: error?.message || 'Could not delete this receipt. Please try again.' })
    } finally {
      setDeletingId(null)
      setDeleteTarget(null)
    }
  }

  return (
    <>
      <div className="modal-overlay" onClick={onClose}>
        <div
          className="modal-content"
          onClick={(e) => e.stopPropagation()}
          style={{ width: 'min(880px, 100%)', maxWidth: '880px' }}
        >
          <div
            className="modal-header"
            style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px' }}
          >
            <div>
              <p className="eyebrow" style={{ margin: '0 0 4px' }}>{recordTypeLabel} &middot; Receipts</p>
              <h2 style={{ margin: 0 }}>{recordName}</h2>
            </div>
            <button type="button" className="icon-button" onClick={onClose} aria-label="Close">
              <X size={20} />
            </button>
          </div>

          <div className="modal-body">
            {feedback ? (
              <div
                className={feedback.type === 'success' ? 'form-success' : 'form-error'}
                role={feedback.type === 'error' ? 'alert' : 'status'}
                style={{ marginBottom: '16px' }}
              >
                {feedback.message}
              </div>
            ) : null}

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div className="receipts-search-box" style={{ flex: '1 1 240px', maxWidth: '360px' }}>
                <span className="receipts-search-icon"><Search size={16} /></span>
                <input
                  type="text"
                  placeholder="Search this record's receipts…"
                  value={searchQuery}
                  onChange={(e) => { setSearchQuery(e.target.value); setPage(1) }}
                />
              </div>

              {canManage ? (
                <button
                  type="button"
                  className="primary-button"
                  disabled={isSaving || Boolean(record.archivedAt)}
                  onClick={triggerScan}
                  title={record.archivedAt ? 'This record has been archived and can no longer accept new receipts' : undefined}
                >
                  <Camera size={16} />
                  {record.archivedAt ? 'Archived' : 'Scan & Upload'}
                </button>
              ) : (
                <span className="status-pill status-neutral">View Only</span>
              )}
            </div>

            {isLoading ? (
              <p className="form-note">Loading receipts…</p>
            ) : filteredReceipts.length === 0 ? (
              <div className="empty-state" style={{ textAlign: 'center', padding: '36px 16px' }}>
                {searchQuery ? 'No receipts match your search.' : `No receipts uploaded for ${recordName} yet.`}
              </div>
            ) : (
              <>
                {/* A plain scroll wrapper, not the shared `.table-scroll` —
                    that class forces a 940px minimum sized for the seven-
                    column Projects & Events table, which would make this
                    five-column list scroll horizontally even in a modal
                    with room to spare. */}
                <div style={{ maxWidth: '100%', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Receipt</th>
                        <th>Date</th>
                        <th>Amount</th>
                        <th>Status</th>
                        <th style={{ textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagedReceipts.map((receipt, idx) => {
                        const status = receiptStatus(receipt)
                        const displayDate = formatDate(receipt.ocrMetadata?.date) || formatDate(receipt.uploadedAt)
                        const amount = Number(receipt.ocrMetadata?.totalAmount)
                        return (
                          <tr key={receipt.id}>
                            <td data-label="Receipt">
                              <strong title={receipt.name}>{receipt.name || `Receipt #${idx + 1}`}</strong>
                              {receipt.requisitionId ? (
                                <div style={{ fontSize: '0.78rem', color: 'var(--ink-3)' }}>Additional requisition</div>
                              ) : null}
                            </td>
                            <td data-label="Date">{displayDate || '—'}</td>
                            <td data-label="Amount">{Number.isFinite(amount) && amount > 0 ? currency.format(amount) : '—'}</td>
                            <td data-label="Status">
                              <span className={`status-pill status-${status.tone === 'positive' ? 'completed' : 'neutral'}`}>
                                {status.label}
                              </span>
                            </td>
                            <td data-label="Actions" className="table-actions" style={{ justifyContent: 'flex-end' }}>
                              <button
                                type="button"
                                className="secondary-button"
                                style={{ padding: '6px 12px', fontSize: '0.82rem' }}
                                onClick={() => setOcrViewer({ receipt })}
                              >
                                <Eye size={14} /> View
                              </button>
                              {canManage ? (
                                <button
                                  type="button"
                                  className="icon-button"
                                  disabled={deletingId === receipt.id}
                                  onClick={() => setDeleteTarget(receipt)}
                                  title="Delete this receipt"
                                  aria-label={`Delete ${receipt.name || 'receipt'}`}
                                  style={{ color: 'var(--negative)' }}
                                >
                                  <Trash2 size={16} />
                                </button>
                              ) : null}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                {totalPages > 1 ? (
                  <PaginationControls
                    currentPage={safePage}
                    totalPages={totalPages}
                    totalItems={filteredReceipts.length}
                    pageSize={PAGE_SIZE}
                    onPageChange={setPage}
                    isFiltered={Boolean(searchQuery)}
                    idPrefix="record-receipts"
                  />
                ) : null}
              </>
            )}
          </div>
        </div>
      </div>

      {ocrViewer ? (
        <ReceiptOCRDetailsModal
          expense={record}
          receipt={ocrViewer.receipt}
          expenses={expenses}
          verifiedReceiptTotals={scopedVerifiedTotals}
          canVerify={canManage}
          onVerify={(amount) => verifyReceipt(ocrViewer.receipt, amount)}
          onClose={() => setOcrViewer(null)}
        />
      ) : null}

      {scanModalOpen ? (
        <Suspense fallback={null}>
          <ReceiptScanModal
            expense={record}
            onSave={saveScannedReceipt}
            onClose={() => setScanModalOpen(false)}
          />
        </Suspense>
      ) : null}

      {deleteTarget ? (
        <div className="modal-overlay" onClick={() => (deletingId ? null : setDeleteTarget(null))}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '440px', padding: '24px' }}>
            <div className="modal-header" style={{ marginBottom: '16px' }}>
              <h2 style={{ fontSize: '1.25rem', margin: 0, color: 'var(--text-primary)' }}>Delete Receipt</h2>
            </div>
            <div className="modal-body" style={{ marginBottom: '24px' }}>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', margin: 0, lineHeight: '1.5' }}>
                Delete "{deleteTarget.name || 'this receipt'}" from {recordName}? This removes the file and its OCR
                data permanently and cannot be undone.
              </p>
            </div>
            <div className="modal-footer" style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button type="button" className="secondary-button" onClick={() => setDeleteTarget(null)} disabled={Boolean(deletingId)}>
                Cancel
              </button>
              <button
                type="button"
                // .is-danger, not an inline backgroundColor: system-components.css
                // paints .primary-button with the accent gradient using the
                // `background` shorthand, which always wins over an inline
                // backgroundColor (a different property) — the button would
                // render green instead of red. See DocumentsPanel's archive
                // confirm, which has the same bug uncorrected.
                className="primary-button is-danger"
                onClick={confirmDelete}
                disabled={Boolean(deletingId)}
              >
                {deletingId ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}

export default RecordReceiptsModal
