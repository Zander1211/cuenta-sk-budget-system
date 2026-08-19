import { useCallback, useEffect, useRef, useState } from 'react'
import { RotateCw, Undo2 } from 'lucide-react'

const CORNER_LABELS = ['Top left', 'Top right', 'Bottom right', 'Bottom left']

/**
 * Four-corner adjustment over the source photograph.
 *
 * Corners are stored in source-image pixels and projected into display space
 * on render, so the geometry stays correct through window resizes and never
 * accumulates rounding drift from repeated drags.
 *
 * Pointer Events are used rather than separate mouse and touch handlers, which
 * is what makes this work identically under a finger and a mouse. Each corner
 * is also a real focusable button driven by the arrow keys, so the crop can be
 * adjusted without a pointing device at all.
 */
export default function ReceiptCropEditor({
  imageSrc,
  corners,
  onChange,
  onRotate,
  onReset,
  detectionFailed,
}) {
  const frameRef = useRef(null)
  const imageRef = useRef(null)
  const draggingRef = useRef(null)
  const [layout, setLayout] = useState(null)

  /** Measures where the letterboxed image actually sits inside the frame. */
  const measure = useCallback(() => {
    const image = imageRef.current
    const frame = frameRef.current
    if (!image || !frame || !image.naturalWidth) return

    const frameRect = frame.getBoundingClientRect()
    const imageRect = image.getBoundingClientRect()

    setLayout({
      offsetX: imageRect.left - frameRect.left,
      offsetY: imageRect.top - frameRect.top,
      displayWidth: imageRect.width,
      displayHeight: imageRect.height,
      naturalWidth: image.naturalWidth,
      naturalHeight: image.naturalHeight,
    })
  }, [])

  useEffect(() => {
    measure()
    const observer = new ResizeObserver(measure)
    if (frameRef.current) observer.observe(frameRef.current)
    window.addEventListener('orientationchange', measure)
    return () => {
      observer.disconnect()
      window.removeEventListener('orientationchange', measure)
    }
  }, [measure, imageSrc])

  const toDisplay = useCallback(
    point => {
      if (!layout) return { x: 0, y: 0 }
      return {
        x: layout.offsetX + (point.x / layout.naturalWidth) * layout.displayWidth,
        y: layout.offsetY + (point.y / layout.naturalHeight) * layout.displayHeight,
      }
    },
    [layout],
  )

  const toSource = useCallback(
    (clientX, clientY) => {
      const frame = frameRef.current
      if (!frame || !layout) return null
      const rect = frame.getBoundingClientRect()

      const localX = clientX - rect.left - layout.offsetX
      const localY = clientY - rect.top - layout.offsetY

      return {
        x: clamp((localX / layout.displayWidth) * layout.naturalWidth, 0, layout.naturalWidth),
        y: clamp((localY / layout.displayHeight) * layout.naturalHeight, 0, layout.naturalHeight),
      }
    },
    [layout],
  )

  /**
   * Capture is taken on the handle so the drag survives the pointer leaving
   * the frame, which is the normal case when a finger overshoots the edge of a
   * phone screen. The captured element is remembered rather than read from
   * `currentTarget`, because move and up events bubble to the frame and
   * releasing from the wrong element silently leaves the capture in place.
   */
  function handlePointerDown(index, event) {
    event.preventDefault()
    const handle = event.currentTarget
    handle.setPointerCapture(event.pointerId)
    draggingRef.current = { index, handle, pointerId: event.pointerId }
  }

  function handlePointerMove(event) {
    const drag = draggingRef.current
    if (!drag) return
    const point = toSource(event.clientX, event.clientY)
    if (!point) return

    onChange(corners.map((corner, index) => (index === drag.index ? point : corner)))
  }

  function handlePointerUp(event) {
    const drag = draggingRef.current
    if (!drag) return
    if (drag.handle.hasPointerCapture?.(event.pointerId)) {
      drag.handle.releasePointerCapture(event.pointerId)
    }
    draggingRef.current = null
  }

  function handleKeyDown(index, event) {
    const step = event.shiftKey ? 20 : 4
    const deltas = {
      ArrowUp: { x: 0, y: -step },
      ArrowDown: { x: 0, y: step },
      ArrowLeft: { x: -step, y: 0 },
      ArrowRight: { x: step, y: 0 },
    }
    const delta = deltas[event.key]
    if (!delta || !layout) return

    event.preventDefault()
    const next = corners.map((corner, i) =>
      i === index
        ? {
            x: clamp(corner.x + delta.x, 0, layout.naturalWidth),
            y: clamp(corner.y + delta.y, 0, layout.naturalHeight),
          }
        : corner,
    )
    onChange(next)
  }

  const displayCorners = corners.map(toDisplay)
  const polygon = displayCorners.map(point => `${point.x},${point.y}`).join(' ')

  return (
    <div className="scan-crop">
      {detectionFailed && (
        <p className="scan-notice" role="status">
          We could not automatically detect the receipt edges. Drag the four corners to match the
          document.
        </p>
      )}

      <div
        className="scan-crop-frame"
        ref={frameRef}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <img ref={imageRef} src={imageSrc} alt="Receipt photograph awaiting edge adjustment" onLoad={measure} />

        {layout && (
          <>
            {/* The overlay is decorative; the draggable buttons below carry the
                actual interaction and the accessible names. */}
            <svg className="scan-crop-overlay" aria-hidden="true">
              <defs>
                <mask id="scan-crop-mask">
                  <rect x="0" y="0" width="100%" height="100%" fill="white" />
                  <polygon points={polygon} fill="black" />
                </mask>
              </defs>
              <rect x="0" y="0" width="100%" height="100%" fill="rgba(2,53,60,.55)" mask="url(#scan-crop-mask)" />
              <polygon points={polygon} className="scan-crop-polygon" />
            </svg>

            {displayCorners.map((point, index) => (
              <button
                key={CORNER_LABELS[index]}
                type="button"
                className="scan-crop-handle"
                style={{ left: `${point.x}px`, top: `${point.y}px` }}
                onPointerDown={event => handlePointerDown(index, event)}
                onKeyDown={event => handleKeyDown(index, event)}
                aria-label={`${CORNER_LABELS[index]} corner. Use the arrow keys to adjust.`}
              />
            ))}
          </>
        )}
      </div>

      <div className="scan-crop-tools">
        <button type="button" className="scan-btn-ghost" onClick={onReset}>
          <Undo2 size={16} aria-hidden="true" />
          Reset
        </button>
        <button type="button" className="scan-btn-ghost" onClick={onRotate}>
          <RotateCw size={16} aria-hidden="true" />
          Rotate
        </button>
      </div>
    </div>
  )
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}
