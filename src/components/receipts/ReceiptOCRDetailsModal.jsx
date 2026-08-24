import { useEffect } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  FileQuestion,
  X,
} from 'lucide-react'
import {
  calculateProjectEventFinancials,
  formatUtilization,
} from '../../utils/projectEventFinancials'

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

export default function ReceiptOCRDetailsModal({
  expense,
  receipt,
  expenses,
  verifiedReceiptTotals,
  onClose,
}) {
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

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
          <button type="button" className="receipt-ocr-close" onClick={onClose} aria-label="Close OCR details">
            <X size={20} aria-hidden="true" />
          </button>
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

            {status.missingFields.length > 0 ? (
              <section className="receipt-ocr-review-note" aria-labelledby="manual-review-heading">
                <h3 id="manual-review-heading">Manual verification needed</h3>
                <p>The following key fields were not confidently available: {status.missingFields.join(', ')}.</p>
              </section>
            ) : null}
          </div>
        </div>

        <footer className="receipt-ocr-footer">
          <div>
            {receipt?.ocrVerifiedAt ? `Verified ${new Date(receipt.ocrVerifiedAt).toLocaleString('en-PH')}` : 'No OCR verification timestamp'}
            {receipt?.ocrVerifiedBy ? ` by ${receipt.ocrVerifiedBy}` : ''}
          </div>
          <button type="button" className="secondary-button" onClick={onClose}>Close</button>
        </footer>
      </div>
    </div>
  )
}
