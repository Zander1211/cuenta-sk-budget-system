import { Crop, RotateCcw, RotateCw } from 'lucide-react'
import ReceiptFilterSelector from './ReceiptFilterSelector'

/**
 * Review step for the corrected scan.
 *
 * Two columns on desktop, stacked on mobile. The scan itself keeps its aspect
 * ratio and is bounded by the viewport rather than a fixed pixel size, so a
 * tall receipt does not force the dialog to scroll sideways.
 */
export default function ReceiptScanPreview({
  scanSrc,
  filter,
  onFilterChange,
  onRotateLeft,
  onRotateRight,
  onAdjustCrop,
  busy,
  enhancementFailed,
  handwritingWarning,
  recommendationNote,
}) {
  return (
    <div className="scan-review">
      <div className="scan-review-canvas">
        {scanSrc ? (
          <img src={scanSrc} alt="Enhanced receipt scan awaiting review" className="scan-review-image" />
        ) : (
          <div className="scan-review-placeholder" aria-hidden="true" />
        )}
        {busy && (
          <div className="scan-review-busy" role="status">
            <span className="scan-spinner" aria-hidden="true" />
            <span>Applying filter</span>
          </div>
        )}
      </div>

      <aside className="scan-review-panel">
        <h3>Scan settings</h3>

        {enhancementFailed && (
          <p className="scan-notice scan-notice--warning" role="status">
            The receipt could not be automatically enhanced. You can continue using the corrected
            original image.
          </p>
        )}

        {recommendationNote && (
          <p className="scan-notice" role="status">
            {recommendationNote}
          </p>
        )}

        <ReceiptFilterSelector
          value={filter}
          onChange={onFilterChange}
          busy={busy}
          handwritingWarning={handwritingWarning}
        />

        <div className="scan-panel-actions">
          <button type="button" className="scan-btn-ghost" onClick={onRotateLeft} disabled={busy}>
            <RotateCcw size={16} aria-hidden="true" />
            Rotate left
          </button>
          <button type="button" className="scan-btn-ghost" onClick={onRotateRight} disabled={busy}>
            <RotateCw size={16} aria-hidden="true" />
            Rotate right
          </button>
          <button type="button" className="scan-btn-ghost" onClick={onAdjustCrop} disabled={busy}>
            <Crop size={16} aria-hidden="true" />
            Adjust edges
          </button>
        </div>
      </aside>
    </div>
  )
}
