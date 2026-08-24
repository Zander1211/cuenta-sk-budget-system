import { AlertTriangle, Info } from 'lucide-react'
import CurrencyInput from '../CurrencyInput'

/**
 * Verification step.
 *
 * Every field starts at exactly what OCR read, including empty when the field
 * was blank or unreadable. Nothing is pre-filled from the expense record: an
 * amount that the user did not read off the scan must not arrive here looking
 * like it came from the receipt.
 *
 * Values only become metadata once the user submits this form, which is what
 * makes them verified rather than extracted.
 */

const TEXT_FIELDS = [
  { key: 'receiptNumber', label: 'Receipt number', placeholder: 'Not detected' },
  { key: 'receivedFrom', label: 'Received from', placeholder: 'Not detected' },
  { key: 'organization', label: 'Organization', placeholder: 'Not detected' },
  { key: 'address', label: 'Store address', placeholder: 'Not detected' },
  { key: 'telephone', label: 'Telephone', placeholder: 'Not detected' },
  { key: 'tin', label: 'TIN', placeholder: 'Not detected' },
  { key: 'time', label: 'Receipt time', placeholder: 'Not detected' },
  { key: 'receiver', label: 'Receiver', placeholder: 'Not detected' },
  { key: 'bank', label: 'Bank', placeholder: 'Not detected' },
  { key: 'chequeNumber', label: 'Cheque number', placeholder: 'Not detected' },
]

const AMOUNT_FIELDS = [
  { key: 'subtotal', label: 'Subtotal' },
  { key: 'vatAmount', label: 'VAT amount' },
  { key: 'discount', label: 'Discount' },
  { key: 'cashAmount', label: 'Cash amount' },
  { key: 'chequeAmount', label: 'Cheque amount' },
  { key: 'totalCashAndCheque', label: 'Cash and cheque total' },
]

export default function ReceiptOCRReview({ scanSrc, values, onChange, flags, confidence, rawText }) {
  const flagged = new Set(flags || [])
  const lowConfidence = flagged.has('all')
  const totalsDisagree = flagged.has('totals-disagree')

  // Nothing recognised at all is a different situation from a few blank
  // fields, and it needs a different explanation.
  const nothingParsed = !Object.entries(values).some(
    ([key, value]) => key !== 'particularsText' && value !== '' && value !== null && value !== undefined,
  )

  function setField(key, value) {
    onChange({ ...values, [key]: value })
  }

  return (
    <div className="scan-verify">
      <div className="scan-verify-image">
        <h3>Receipt scan</h3>
        {scanSrc ? (
          <img src={scanSrc} alt="The scan these values were read from" />
        ) : (
          <div className="scan-review-placeholder" aria-hidden="true" />
        )}
        <p className="scan-verify-caption">
          This scan is the record Cuenta stores. The values beside it are supplementary.
        </p>
      </div>

      <div className="scan-verify-fields">
        <h3>Extracted information</h3>

        {lowConfidence && (
          <p className="scan-notice scan-notice--warning" role="status">
            <AlertTriangle size={15} aria-hidden="true" />
            Text recognition confidence was low
            {typeof confidence === 'number' ? ` (${Math.round(confidence)}%)` : ''}. Check every field
            against the scan before saving.
          </p>
        )}

        {totalsDisagree && (
          <p className="scan-notice scan-notice--warning" role="status">
            <AlertTriangle size={15} aria-hidden="true" />
            Cash plus cheque does not equal the total. At least one figure was misread.
          </p>
        )}

        {nothingParsed ? (
          <p className="scan-notice scan-notice--warning" role="status">
            <AlertTriangle size={15} aria-hidden="true" />
            No fields could be read from this scan. Type the values from the receipt yourself, or go
            back and retake the photo in better light with the receipt flat and filling the frame.
          </p>
        ) : (
          <p className="scan-notice">
            <Info size={15} aria-hidden="true" />
            Blank fields were not readable on the receipt. Leave them empty rather than guessing.
          </p>
        )}

        {rawText?.trim() ? (
          <details className="scan-rawtext">
            <summary>Show the text the scanner read</summary>
            <pre>{rawText}</pre>
            <small>
              This is the raw recognition output, shown so you can tell a poor scan from an
              unreadable receipt. It is retained in the receipt's OCR diagnostics for auditing.
            </small>
          </details>
        ) : null}

        <label className="scan-grand-total" data-flagged={flagged.has('totalAmount')}>
          <span>Detected Grand Total</span>
          <CurrencyInput
            value={values.totalAmount ?? ''}
            onValueChange={value => setField('totalAmount', value === '' ? '' : Number(value))}
          />
          <small>
            Confirm this against the receipt's Grand Total or Amount Due. Correct it here if OCR
            selected cash tendered, change, VAT, or another amount.
          </small>
        </label>

        <div className="scan-field-grid">
          {TEXT_FIELDS.map(field => (
            <label key={field.key} className="scan-field" data-flagged={flagged.has(field.key)}>
              <span>{field.label}</span>
              <input
                type="text"
                value={values[field.key] ?? ''}
                placeholder={field.placeholder}
                onChange={event => setField(field.key, event.target.value)}
              />
            </label>
          ))}

          <label className="scan-field" data-flagged={flagged.has('date')}>
            <span>Date on receipt</span>
            <input
              type="date"
              value={values.date ?? ''}
              onChange={event => setField('date', event.target.value)}
            />
          </label>

          {AMOUNT_FIELDS.map(field => (
            <label key={field.key} className="scan-field" data-flagged={flagged.has(field.key)}>
              <span>{field.label}</span>
              <CurrencyInput
                value={values[field.key] ?? ''}
                onValueChange={value => setField(field.key, value === '' ? '' : Number(value))}
              />
            </label>
          ))}
        </div>

        <label className="scan-field scan-field--wide">
          <span>Particulars</span>
          <textarea
            rows={4}
            value={values.particularsText ?? ''}
            placeholder="Not detected"
            onChange={event => setField('particularsText', event.target.value)}
          />
        </label>
      </div>
    </div>
  )
}
