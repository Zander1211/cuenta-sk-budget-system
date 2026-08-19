import { AlertTriangle } from 'lucide-react'
import { SCAN_FILTERS } from '../../utils/receiptScanner'

/**
 * Scan mode picker.
 *
 * Rendered as a radio group rather than buttons because the modes are mutually
 * exclusive settings, which is what a radio group means to a screen reader and
 * what arrow-key navigation expects.
 */
export default function ReceiptFilterSelector({ value, onChange, busy, handwritingWarning }) {
  return (
    <fieldset className="scan-filters" disabled={busy}>
      <legend>Filter</legend>

      {SCAN_FILTERS.map(filter => {
        const risky = filter.id === 'bw' && handwritingWarning
        return (
          <label key={filter.id} className="scan-filter-option" data-active={value === filter.id}>
            <input
              type="radio"
              name="scan-filter"
              value={filter.id}
              checked={value === filter.id}
              onChange={() => onChange(filter.id)}
            />
            <span className="scan-filter-body">
              <strong>{filter.label}</strong>
              <small>{filter.description}</small>
              {risky && (
                <small className="scan-filter-warning">
                  <AlertTriangle size={13} aria-hidden="true" />
                  Handwriting detected on this page. Check it survives before saving.
                </small>
              )}
            </span>
          </label>
        )
      })}
    </fieldset>
  )
}
