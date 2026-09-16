import { useEffect, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  FileQuestion,
  Pencil,
  ShieldCheck,
  X,
} from 'lucide-react'
import {
  calculateProjectEventFinancials,
  formatUtilization,
} from '../../utils/projectEventFinancials'
import CurrencyInput from '../CurrencyInput'

const currency = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

function hasValue(value) {
  return value !== null && value !== undefined && value !== ''
}

function displayText(value) {
  return hasValue(value) ? String(value) : 'Not detected'
}

function displayMoney(value) {
  return hasValue(value) && Number.isFinite(Number(value))
    ? currency.format(Number(value))
    : 'Not detected'
}

function displayDate(value) {
  if (!hasValue(value)) return 'Not detected'
  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function DetailField({ label, value, missing = false }) {
  return (
    <div className={`receipt-ocr-field${missing ? ' is-missing' : ''}`}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}

const editInputStyle = {
  width: '100%',
  padding: '6px 8px',
  borderRadius: 'var(--radius-control, 6px)',
  border: '1px solid var(--line)',
  fontSize: '0.85rem',
  background: 'var(--surface)',
  color: 'var(--ink)',
}

function EditField({ label, value, onChange, type = 'text', money = false, wide = false, multiline = false }) {
  return (
    <label className={`receipt-ocr-field${wide ? ' receipt-ocr-field--wide' : ''}`}>
      <span style={{ display: 'block', margin: '0 0 5px', fontSize: '0.75rem', fontWeight: 700, color: 'var(--ink-2)' }}>{label}</span>
      {money ? (
        <CurrencyInput value={value ?? ''} onValueChange={(v) => onChange(v === '' ? '' : Number(v))} style={editInputStyle} />
      ) : multiline ? (
        <textarea rows={3} value={value ?? ''} onChange={(event) => onChange(event.target.value)} style={editInputStyle} />
      ) : (
        <input type={type} value={value ?? ''} onChange={(event) => onChange(event.target.value)} style={editInputStyle} />
      )}
    </label>
  )
}

function resolveLinkedRecord(expense, expenses) {
  if (!expense?.isAdditional || !expense.parentProjectId) return expense
  return (expenses || []).find((candidate) =>
    !candidate.isAdditional
    && (
      String(candidate.id) === String(expense.parentProjectId)
      || String(candidate.requestId) === String(expense.parentProjectId)
    )
  ) || expense
}

function getExtractionStatus(metadata, confidence) {
  const merchant = metadata?.organization || metadata?.merchantName || metadata?.storeName || metadata?.receivedFrom
  const required = [
    ['Receipt number', metadata?.receiptNumber],
    ['Receipt date', metadata?.date],
    ['Store or merchant', merchant],
    ['Total amount', metadata?.totalAmount],
  ]
  const missingFields = required.filter(([, value]) => !hasValue(value)).map(([label]) => label)
  const detectedCount = Object.values(metadata || {}).filter(hasValue).length

  if (!metadata || detectedCount === 0 || !hasValue(metadata.totalAmount) || (hasValue(confidence) && Number(confidence) < 70)) {
    return {
      label: 'Needs Manual Review',
      tone: 'review',
      Icon: FileQuestion,
      missingFields,
    }
  }
  if (missingFields.length > 0) {
    return {
      label: 'Partially Extracted',
      tone: 'partial',
      Icon: AlertTriangle,
      missingFields,
    }
  }
  return {
    label: 'Successfully Extracted',
    tone: 'success',
    Icon: CheckCircle2,
    missingFields: [],
  }
}

function editValuesFromMetadata(metadata) {
  const particulars = Array.isArray(metadata?.particulars)
    ? metadata.particulars.map((item) => item?.description || String(item)).filter(Boolean).join(', ')
    : (metadata?.particulars ?? '')

  return {
    receiptNumber: metadata?.receiptNumber ?? '',
    date: metadata?.date ?? '',
    time: metadata?.time ?? '',
    organization: metadata?.organization ?? '',
    address: metadata?.address ?? '',
    tin: metadata?.tin ?? '',
    telephone: metadata?.telephone ?? '',
    receivedFrom: metadata?.receivedFrom ?? '',
    receiver: metadata?.receiver ?? '',
    bank: metadata?.bank ?? '',
    chequeNumber: metadata?.chequeNumber ?? '',
    subtotal: metadata?.subtotal ?? '',
    vatAmount: metadata?.vatAmount ?? '',
    discount: metadata?.discount ?? '',
    totalAmount: metadata?.totalAmount ?? '',
    cashAmount: metadata?.cashAmount ?? '',
    chequeAmount: metadata?.chequeAmount ?? '',
    totalCashAndCheque: metadata?.totalCashAndCheque ?? '',
    particulars,
  }
}

// Mirrors ReceiptScanModal's normaliseMetadata: a field left blank is recorded
// as unknown (null), never as an empty string or a zero that later reads as a
// real value.
function metadataFromEditValues(editValues, previousMetadata) {
  const text = (value) => {
    const trimmed = (value ?? '').toString().trim()
    return trimmed.length ? trimmed : null
  }
  const amount = (value) => {
    if (value === '' || value === null || value === undefined) return null
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }

  return {
    ...(previousMetadata || {}),
    receiptNumber: text(editValues.receiptNumber),
    date: text(editValues.date),
    time: text(editValues.time),
    organization: text(editValues.organization),
    address: text(editValues.address),
    tin: text(editValues.tin),
    telephone: text(editValues.telephone),
    receivedFrom: text(editValues.receivedFrom),
    receiver: text(editValues.receiver),
    bank: text(editValues.bank),
    chequeNumber: text(editValues.chequeNumber),
    subtotal: amount(editValues.subtotal),
    vatAmount: amount(editValues.vatAmount),
    discount: amount(editValues.discount),
    totalAmount: amount(editValues.totalAmount),
    cashAmount: amount(editValues.cashAmount),
    chequeAmount: amount(editValues.chequeAmount),
    totalCashAndCheque: amount(editValues.totalCashAndCheque),
    particulars: text(editValues.particulars),
  }
}

export default function ReceiptOCRDetailsModal({
  expense,
  receipt,
  expenses,
  verifiedReceiptTotals,
  canVerify = false,
  onVerify,
  onSaveDetails,
  onClose,
}) {
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const [verifyAmount, setVerifyAmount] = useState(
    hasValue(receipt?.ocrMetadata?.totalAmount) ? String(receipt.ocrMetadata.totalAmount) : ''
  )
  const [verifying, setVerifying] = useState(false)
  const [verifyError, setVerifyError] = useState('')

  const [isEditing, setIsEditing] = useState(false)
  const [editValues, setEditValues] = useState(null)
  const [savingDetails, setSavingDetails] = useState(false)
  const [editError, setEditError] = useState('')

  async function handleVerify() {
    const amount = Number(verifyAmount)
    if (!Number.isFinite(amount) || amount <= 0) {
      setVerifyError('Enter the total amount shown on the receipt.')
      return
    }
    setVerifyError('')
    setVerifying(true)
    try {
      await onVerify(amount)
    } catch (error) {
      setVerifyError(error?.message || 'Could not verify this receipt.')
    } finally {
      setVerifying(false)
    }
  }

  function startEditing() {
    setEditValues(editValuesFromMetadata(receipt?.ocrMetadata))
    setEditError('')
    setIsEditing(true)
  }

  function cancelEditing() {
    setIsEditing(false)
    setEditValues(null)
    setEditError('')
  }

  function setEditField(key, value) {
    setEditValues((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSaveDetails() {
    setEditError('')
    setSavingDetails(true)
    try {
      const nextMetadata = metadataFromEditValues(editValues, receipt?.ocrMetadata)
      await onSaveDetails(nextMetadata)
      setIsEditing(false)
      setEditValues(null)
    } catch (error) {
      setEditError(error?.message || 'Could not save these changes.')
    } finally {
      setSavingDetails(false)
    }
  }

  const metadata = receipt?.ocrMetadata || null
  const scanSettings = receipt?.scanSettings || {}
  const confidence = scanSettings.ocrConfidence ?? metadata?.ocrConfidence ?? null
  const linkedRecord = resolveLinkedRecord(expense, expenses)
  const financials = calculateProjectEventFinancials(
    linkedRecord,
    expenses,
    verifiedReceiptTotals,
  )
  const status = getExtractionStatus(metadata, confidence)
  const StatusIcon = status.Icon
  const previewUrl = receipt?.originalUrl || receipt?.url
  const previewLabel = receipt?.originalUrl ? 'Original receipt' : 'Stored receipt'
  const isPdf = String(receipt?.type || '').includes('pdf')
    || String(receipt?.name || '').toLowerCase().endsWith('.pdf')
  const merchant = metadata?.organization
    || metadata?.merchantName
    || metadata?.storeName
    || metadata?.receivedFrom
  const receiptAmount = hasValue(metadata?.totalAmount) ? Number(metadata.totalAmount) : null
  const savedExpenseAmount = expense?.isAdditional ? Number(expense.amount || 0) : null
  const hasAmountMismatch = receiptAmount !== null
    && savedExpenseAmount !== null
    && Math.abs(receiptAmount - savedExpenseAmount) > 0.01
  const sourceLabel = financials.source === 'recorded-expenses'
    ? 'Saved expense records'
    : financials.source === 'verified-receipts'
      ? 'Verified receipt totals'
      : financials.source === 'verified-receipts-and-recorded-expenses'
        ? 'Verified receipts with saved expense records'
        : 'No recorded expenses yet'

  const particulars = Array.isArray(metadata?.particulars)
    ? metadata.particulars.map((item) => item?.description || String(item)).filter(Boolean).join(', ')
    : metadata?.particulars

  // Mirrors the rule buildVerifiedReceiptTotals uses: a verification
  // timestamp alone isn't enough — it only counts toward spending once a
  // positive confirmed total is attached too.
  const isCountedTowardSpending = Boolean(receipt?.ocrVerifiedAt) && Number(metadata?.totalAmount) > 0
  const isLegacyReceipt = String(receipt?.id || '').startsWith('legacy-')

  return (
    <div className="modal-overlay receipt-ocr-overlay" onClick={onClose}>
      <div
        className="receipt-ocr-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="receipt-ocr-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="receipt-ocr-header">
          <div>
            <p className="eyebrow">OCR Details</p>
            <h2 id="receipt-ocr-title">Extracted Receipt Information</h2>
            <p>{receipt?.name || 'Uploaded receipt'}</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {canVerify && onSaveDetails && !isLegacyReceipt && !isEditing ? (
              <button type="button" className="secondary-button" onClick={startEditing} style={{ padding: '6px 12px', fontSize: '0.82rem', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                <Pencil size={14} aria-hidden="true" /> Edit Details
              </button>
            ) : null}
            <button type="button" className="receipt-ocr-close" onClick={onClose} aria-label="Close OCR details">
              <X size={20} aria-hidden="true" />
            </button>
          </div>
        </header>

        <div className="receipt-ocr-status-row">
          <span className={`receipt-ocr-status is-${status.tone}`}>
            <StatusIcon size={16} aria-hidden="true" />
            {status.label}
          </span>
          {hasValue(confidence) ? (
            <span className="receipt-ocr-confidence">OCR accuracy: {Math.round(Number(confidence))}%</span>
          ) : (
            <span className="receipt-ocr-confidence">OCR accuracy unavailable</span>
          )}
        </div>

        <div className="receipt-ocr-body">
          <section className="receipt-ocr-preview" aria-labelledby="receipt-preview-heading">
            <div className="receipt-ocr-section-heading">
              <h3 id="receipt-preview-heading">{previewLabel}</h3>
              {previewUrl ? (
                <a href={previewUrl} target="_blank" rel="noreferrer">
                  Open full size <ExternalLink size={14} aria-hidden="true" />
                </a>
              ) : null}
            </div>
            <div className="receipt-ocr-preview-frame">
              {previewUrl && isPdf ? (
                <iframe src={previewUrl} title="Original receipt PDF preview" />
              ) : previewUrl ? (
                <img src={previewUrl} alt="Original receipt used for OCR comparison" />
              ) : (
                <div className="receipt-ocr-preview-empty">
                  <FileQuestion size={28} aria-hidden="true" />
                  <span>Receipt preview unavailable</span>
                </div>
              )}
            </div>
            {receipt?.originalUrl ? (
              <p className="receipt-ocr-caption">Showing the unprocessed photograph used to create the stored scan.</p>
            ) : null}
          </section>

          <div className="receipt-ocr-details">
            {isEditing ? (
              <>
                <section className="receipt-ocr-section" aria-labelledby="edit-receipt-info-heading">
                  <h3 id="edit-receipt-info-heading">Edit Receipt Information</h3>
                  <div className="receipt-ocr-field-grid">
                    <EditField label="Receipt number" value={editValues.receiptNumber} onChange={(v) => setEditField('receiptNumber', v)} />
                    <EditField label="Receipt date" type="date" value={editValues.date} onChange={(v) => setEditField('date', v)} />
                    <EditField label="Receipt time" value={editValues.time} onChange={(v) => setEditField('time', v)} />
                    <EditField label="Store or merchant" value={editValues.organization} onChange={(v) => setEditField('organization', v)} />
                    <EditField label="Store address" value={editValues.address} onChange={(v) => setEditField('address', v)} />
                    <EditField label="TIN" value={editValues.tin} onChange={(v) => setEditField('tin', v)} />
                    <EditField label="Telephone" value={editValues.telephone} onChange={(v) => setEditField('telephone', v)} />
                  </div>
                </section>

                <section className="receipt-ocr-section" aria-labelledby="edit-financial-info-heading">
                  <h3 id="edit-financial-info-heading">Edit Financial Information</h3>
                  <div className="receipt-ocr-field-grid">
                    <EditField label="Subtotal" money value={editValues.subtotal} onChange={(v) => setEditField('subtotal', v)} />
                    <EditField label="VAT amount" money value={editValues.vatAmount} onChange={(v) => setEditField('vatAmount', v)} />
                    <EditField label="Discount" money value={editValues.discount} onChange={(v) => setEditField('discount', v)} />
                    <EditField label="Total amount" money value={editValues.totalAmount} onChange={(v) => setEditField('totalAmount', v)} />
                    <EditField label="Cash amount" money value={editValues.cashAmount} onChange={(v) => setEditField('cashAmount', v)} />
                    <EditField label="Cheque amount" money value={editValues.chequeAmount} onChange={(v) => setEditField('chequeAmount', v)} />
                    <EditField label="Cash and cheque total" money value={editValues.totalCashAndCheque} onChange={(v) => setEditField('totalCashAndCheque', v)} />
                  </div>
                </section>

                <section className="receipt-ocr-section" aria-labelledby="edit-additional-info-heading">
                  <h3 id="edit-additional-info-heading">Edit Additional Information</h3>
                  <div className="receipt-ocr-field-grid">
                    <EditField label="Received from" value={editValues.receivedFrom} onChange={(v) => setEditField('receivedFrom', v)} />
                    <EditField label="Receiver" value={editValues.receiver} onChange={(v) => setEditField('receiver', v)} />
                    <EditField label="Bank" value={editValues.bank} onChange={(v) => setEditField('bank', v)} />
                    <EditField label="Cheque number" value={editValues.chequeNumber} onChange={(v) => setEditField('chequeNumber', v)} />
                    <EditField label="Particulars" wide multiline value={editValues.particulars} onChange={(v) => setEditField('particulars', v)} />
                  </div>
                </section>

                {editError ? (
                  <p className="receipt-ocr-warning" role="alert">
                    <AlertTriangle size={16} aria-hidden="true" />
                    {editError}
                  </p>
                ) : null}

                <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                  <button type="button" className="secondary-button" onClick={cancelEditing} disabled={savingDetails}>
                    Cancel
                  </button>
                  <button type="button" className="primary-button" onClick={handleSaveDetails} disabled={savingDetails}>
                    {savingDetails ? 'Saving…' : 'Save Changes'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <section className="receipt-ocr-section" aria-labelledby="receipt-info-heading">
                  <h3 id="receipt-info-heading">Receipt Information</h3>
                  <dl className="receipt-ocr-field-grid">
                    <DetailField label="Receipt number" value={displayText(metadata?.receiptNumber)} missing={!hasValue(metadata?.receiptNumber)} />
                    <DetailField label="Receipt date" value={displayDate(metadata?.date)} missing={!hasValue(metadata?.date)} />
                    <DetailField label="Receipt time" value={displayText(metadata?.time)} missing={!hasValue(metadata?.time)} />
                    <DetailField label="Store or merchant" value={displayText(merchant)} missing={!hasValue(merchant)} />
                    <DetailField label="Store address" value={displayText(metadata?.address)} missing={!hasValue(metadata?.address)} />
                    <DetailField label="TIN" value={displayText(metadata?.tin)} missing={!hasValue(metadata?.tin)} />
                    <DetailField label="Telephone" value={displayText(metadata?.telephone)} missing={!hasValue(metadata?.telephone)} />
                  </dl>
                </section>

                <section className="receipt-ocr-section" aria-labelledby="financial-info-heading">
                  <h3 id="financial-info-heading">Financial Information</h3>
                  <dl className="receipt-ocr-field-grid">
                    <DetailField label="Subtotal" value={displayMoney(metadata?.subtotal)} missing={!hasValue(metadata?.subtotal)} />
                    <DetailField label="VAT amount" value={displayMoney(metadata?.vatAmount)} missing={!hasValue(metadata?.vatAmount)} />
                    <DetailField label="Discount" value={displayMoney(metadata?.discount)} missing={!hasValue(metadata?.discount)} />
                    <DetailField label="Total amount" value={displayMoney(metadata?.totalAmount)} missing={!hasValue(metadata?.totalAmount)} />
                    <DetailField label="Cash amount" value={displayMoney(metadata?.cashAmount)} missing={!hasValue(metadata?.cashAmount)} />
                    <DetailField label="Cheque amount" value={displayMoney(metadata?.chequeAmount)} missing={!hasValue(metadata?.chequeAmount)} />
                    <DetailField label="Cash and cheque total" value={displayMoney(metadata?.totalCashAndCheque)} missing={!hasValue(metadata?.totalCashAndCheque)} />
                  </dl>
                </section>

                {(hasValue(metadata?.receivedFrom) || hasValue(metadata?.receiver) || hasValue(metadata?.bank) || hasValue(metadata?.chequeNumber) || hasValue(particulars)) ? (
                  <section className="receipt-ocr-section" aria-labelledby="additional-info-heading">
                    <h3 id="additional-info-heading">Additional Extracted Information</h3>
                    <dl className="receipt-ocr-field-grid">
                      <DetailField label="Received from" value={displayText(metadata?.receivedFrom)} />
                      <DetailField label="Receiver" value={displayText(metadata?.receiver)} />
                      <DetailField label="Bank" value={displayText(metadata?.bank)} />
                      <DetailField label="Cheque number" value={displayText(metadata?.chequeNumber)} />
                      <div className="receipt-ocr-field receipt-ocr-field--wide">
                        <dt>Particulars</dt>
                        <dd className="receipt-ocr-multiline">{displayText(particulars)}</dd>
                      </div>
                    </dl>
                  </section>
                ) : null}
              </>
            )}

            <section className="receipt-ocr-section receipt-ocr-linked" aria-labelledby="linked-info-heading">
              <div className="receipt-ocr-section-heading">
                <h3 id="linked-info-heading">Linked {linkedRecord?.type || 'Record'}</h3>
                <span>{sourceLabel}</span>
              </div>
              <p className="receipt-ocr-record-title">{linkedRecord?.event || linkedRecord?.project || 'Untitled record'}</p>
              <dl className="receipt-ocr-metrics">
                <DetailField label="Approved budget" value={currency.format(financials.approvedBudget)} />
                <DetailField label="Current total expenses" value={currency.format(financials.totalExpenses)} />
                <DetailField label="Remaining budget" value={currency.format(financials.remainingBudget)} />
                <DetailField label="Budget utilization" value={`${formatUtilization(financials.utilization)}%`} />
              </dl>
              <p className="receipt-ocr-calculation-note">
                Utilization uses the same calculation shown throughout Cuenta: total recorded expenses divided by the approved budget.
              </p>
              {hasAmountMismatch ? (
                <p className="receipt-ocr-warning" role="status">
                  <AlertTriangle size={16} aria-hidden="true" />
                  The extracted receipt total ({currency.format(receiptAmount)}) does not match the saved expense amount ({currency.format(savedExpenseAmount)}). Review the source records.
                </p>
              ) : null}
            </section>

            {!isEditing && status.missingFields.length > 0 ? (
              <section className="receipt-ocr-review-note" aria-labelledby="manual-review-heading">
                <h3 id="manual-review-heading">Manual verification needed</h3>
                <p>The following key fields were not confidently available: {status.missingFields.join(', ')}.</p>
              </section>
            ) : null}

            {!isEditing && !isCountedTowardSpending && canVerify ? (
              <section className="receipt-ocr-review-note" aria-labelledby="manual-verify-heading">
                <h3 id="manual-verify-heading">This receipt isn't counted toward spending yet</h3>
                {isLegacyReceipt ? (
                  <p>
                    This receipt predates receipt tracking and has no verification record to update.
                    Re-upload it using Scan & Upload so a confirmed total can be attached.
                  </p>
                ) : (
                  <>
                    <p>
                      {receipt?.ocrVerifiedAt
                        ? 'It was verified without a confirmed total amount, so it has not been added to Total Recorded Expenses or Budget Utilization.'
                        : 'It was uploaded without OCR verification, so it has not been added to Total Recorded Expenses or Budget Utilization.'}
                      {' '}Confirm the amount printed on the receipt to verify it.
                    </p>
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '10px', flexWrap: 'wrap', marginTop: '10px' }}>
                      <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.82rem', fontWeight: 600 }}>
                        Verified total amount
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={verifyAmount}
                          onChange={(event) => setVerifyAmount(event.target.value)}
                          disabled={verifying}
                          placeholder="0.00"
                          style={{ padding: '8px 10px', borderRadius: 'var(--radius-control, 8px)', border: '1px solid var(--line)' }}
                        />
                      </label>
                      <button
                        type="button"
                        className="primary-button"
                        onClick={handleVerify}
                        disabled={verifying}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                      >
                        <ShieldCheck size={16} aria-hidden="true" />
                        {verifying ? 'Verifying…' : 'Mark as Verified'}
                      </button>
                    </div>
                    {verifyError ? (
                      <p className="receipt-ocr-warning" role="alert" style={{ marginTop: '8px' }}>
                        <AlertTriangle size={16} aria-hidden="true" />
                        {verifyError}
                      </p>
                    ) : null}
                  </>
                )}
              </section>
            ) : null}
          </div>
        </div>

        <footer className="receipt-ocr-footer">
          <div>
            {receipt?.ocrVerifiedAt ? `Verified ${new Date(receipt.ocrVerifiedAt).toLocaleString('en-PH')}` : 'No OCR verification timestamp'}
            {receipt?.ocrVerifiedBy ? ` by ${receipt.ocrVerifiedBy}` : ''}
            {!isCountedTowardSpending ? ' — not counted toward spending' : ''}
          </div>
          <button type="button" className="secondary-button" onClick={onClose}>Close</button>
        </footer>
      </div>
    </div>
  )
}
