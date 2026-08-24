import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Camera, ImageUp, X } from 'lucide-react'
import {
  applyFilter,
  defaultQuad,
  detectDocumentEdges,
  detectSkewAngle,
  imageDataToBlob,
  imageDataToObjectURL,
  loadBitmap,
  perspectiveTransform,
  recommendFilter,
  releaseBitmap,
  rotateByAngle,
  rotateQuarterTurns,
} from '../../utils/receiptScanner'
import { parseReceiptText } from '../../utils/ocr/receiptParser'
import ReceiptCropEditor from './ReceiptCropEditor'
import ReceiptScanPreview from './ReceiptScanPreview'
import ReceiptOCRReview from './ReceiptOCRReview'
import './ReceiptScanner.css'

/**
 * Receipt scanning workflow.
 *
 * capture -> adjust edges -> correct and enhance -> review scan -> OCR ->
 * verify -> save.
 *
 * Two outputs leave this component and they are kept distinct throughout: the
 * processed scan image, which becomes the receipt Cuenta displays, and the
 * verified OCR metadata, which is supplementary. The original photograph is
 * carried along untouched so it can be stored alongside the scan.
 */

const STEPS = {
  SOURCE: 'source',
  CAMERA: 'camera',
  CROP: 'crop',
  PROCESSING: 'processing',
  REVIEW: 'review',
  OCR: 'ocr',
  VERIFY: 'verify',
  SAVING: 'saving',
}

const EMPTY_VALUES = {
  receiptNumber: '',
  receivedFrom: '',
  organization: '',
  address: '',
  telephone: '',
  tin: '',
  time: '',
  receiver: '',
  bank: '',
  chequeNumber: '',
  date: '',
  totalAmount: '',
  subtotal: '',
  vatAmount: '',
  discount: '',
  cashAmount: '',
  chequeAmount: '',
  totalCashAndCheque: '',
  particularsText: '',
}

export default function ReceiptScanModal({ expense, onClose, onSave }) {
  const [step, setStep] = useState(STEPS.SOURCE)
  const [error, setError] = useState('')
  const [progress, setProgress] = useState({ label: '', value: 0 })

  const [originalFile, setOriginalFile] = useState(null)
  const [originalSrc, setOriginalSrc] = useState('')
  const [corners, setCorners] = useState(null)
  const [detectionFailed, setDetectionFailed] = useState(false)
  const [sourceRotation, setSourceRotation] = useState(0)

  const [filter, setFilter] = useState('auto')
  const [scanSrc, setScanSrc] = useState('')
  const [enhancementFailed, setEnhancementFailed] = useState(false)
  const [handwritingWarning, setHandwritingWarning] = useState(false)
  const [recommendationNote, setRecommendationNote] = useState('')

  const [values, setValues] = useState(EMPTY_VALUES)
  const [ocrFlags, setOcrFlags] = useState([])
  const [ocrConfidence, setOcrConfidence] = useState(null)
  const [rawText, setRawText] = useState('')
  const [ocrDiagnostics, setOcrDiagnostics] = useState(null)

  const bitmapRef = useRef(null)
  const correctedRef = useRef(null)
  const filteredRef = useRef(null)
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const fileInputRef = useRef(null)
  const objectUrlsRef = useRef([])
  const previewUrlRef = useRef(null)

  const trackUrl = useCallback(url => {
    objectUrlsRef.current.push(url)
    return url
  }, [])

  /* ── Resource cleanup ─────────────────────────────────────────────────
     Bitmaps, streams and object URLs all leak silently if left, and this
     modal can be opened repeatedly in a session. */
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }
  }, [])

  useEffect(() => {
    return () => {
      stopCamera()
      releaseBitmap(bitmapRef.current)
      bitmapRef.current = null
      correctedRef.current = null
      filteredRef.current = null
      objectUrlsRef.current.forEach(url => URL.revokeObjectURL(url))
      objectUrlsRef.current = []
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current)
        previewUrlRef.current = null
      }
      // The OCR worker holds a wasm heap and a thread; release it with the UI.
      import('../../utils/ocr/receiptOCRService')
        .then(module => module.terminateOCR())
        .catch(() => {})
    }
  }, [stopCamera])

  /* ── Camera ───────────────────────────────────────────────────────── */
  useEffect(() => {
    if (step !== STEPS.CAMERA) {
      stopCamera()
      return undefined
    }

    let cancelled = false
    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 2560 } } })
      .then(stream => {
        if (cancelled) {
          stream.getTracks().forEach(track => track.stop())
          return
        }
        streamRef.current = stream
        if (videoRef.current) videoRef.current.srcObject = stream
      })
      .catch(() => {
        if (cancelled) return
        setError('The camera is unavailable or permission was denied. You can upload a photo instead.')
        setStep(STEPS.SOURCE)
      })

    return () => {
      cancelled = true
      stopCamera()
    }
  }, [step, stopCamera])

  /* ── Ingest ───────────────────────────────────────────────────────── */
  const ingest = useCallback(
    async file => {
      setError('')
      setProgress({ label: 'Detecting the receipt', value: 0.2 })
      setStep(STEPS.PROCESSING)

      try {
        releaseBitmap(bitmapRef.current)
        const bitmap = await loadBitmap(file)
        bitmapRef.current = bitmap

        setOriginalFile(file)
        setOriginalSrc(trackUrl(URL.createObjectURL(file)))
        setSourceRotation(0)

        const detection = detectDocumentEdges(bitmap)
        setCorners(detection.corners)
        setDetectionFailed(!detection.confident)
        setStep(STEPS.CROP)
      } catch (cause) {
        console.error('Receipt ingest failed', cause)
        setError('That image could not be opened. Try another photo or a different file.')
        setStep(STEPS.SOURCE)
      }
    },
    [trackUrl],
  )

  function handleFilePicked(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file) ingest(file)
  }

  async function capturePhoto() {
    const video = videoRef.current
    if (!video || !video.videoWidth) return

    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d').drawImage(video, 0, 0)

    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.95))
    if (!blob) {
      setError('The photo could not be captured. Try again.')
      return
    }

    stopCamera()
    await ingest(new File([blob], `receipt-${Date.now()}.jpg`, { type: 'image/jpeg' }))
  }

  /* ── Correction and enhancement ───────────────────────────────────── */

  /**
   * Renders a filter to the preview. A failure here degrades to the corrected
   * original rather than blocking the workflow.
   */
  const renderFilter = useCallback(async (filterId, base) => {
    const corrected = base || correctedRef.current
    if (!corrected) return

    /* Replaces the visible preview and releases the one it supersedes. The
       previews are full-size JPEGs, so leaving them attached to the document
       while the user tries each filter is a real cost on a phone. */
    const showPreview = async imageData => {
      const url = await imageDataToObjectURL(imageData)
      const previous = previewUrlRef.current
      previewUrlRef.current = url
      setScanSrc(url)
      if (previous) URL.revokeObjectURL(previous)
    }

    try {
      const filtered = await applyFilter(corrected, filterId)
      filteredRef.current = filtered
      await showPreview(filtered)
      setEnhancementFailed(false)
    } catch (cause) {
      console.error('Filter failed; falling back to the corrected image.', cause)
      filteredRef.current = corrected
      try {
        await showPreview(corrected)
      } catch (previewCause) {
        console.error('The corrected image could not be previewed either.', previewCause)
        setScanSrc('')
      }
      setEnhancementFailed(true)
    }
  }, [])

  const runCorrection = useCallback(async () => {
    const bitmap = bitmapRef.current
    if (!bitmap || !corners) return

    setStep(STEPS.PROCESSING)
    setError('')
    setEnhancementFailed(false)

    try {
      setProgress({ label: 'Straightening the document', value: 0.1 })
      let corrected = await perspectiveTransform(bitmap, corners, {
        onProgress: ratio => setProgress({ label: 'Straightening the document', value: ratio * 0.6 }),
      })

      if (sourceRotation) {
        corrected = rotateQuarterTurns(corrected, sourceRotation)
      }

      // Residual tilt only. Perspective correction has already done the heavy
      // lifting, so anything found here is a small print misalignment.
      setProgress({ label: 'Checking alignment', value: 0.7 })
      const skew = detectSkewAngle(corrected)
      if (skew) corrected = await rotateByAngle(corrected, -skew)

      correctedRef.current = corrected

      const recommendation = recommendFilter(corrected)
      setHandwritingWarning(recommendation.analysis.likelyHandwriting)
      setRecommendationNote(recommendation.reason)
      setFilter(recommendation.filterId)

      setProgress({ label: 'Enhancing', value: 0.85 })
      await renderFilter(recommendation.filterId, corrected)
      setStep(STEPS.REVIEW)
    } catch (cause) {
      console.error('Perspective correction failed', cause)
      setError(
        cause?.message || 'The receipt could not be straightened. Adjust the corners and try again.',
      )
      setStep(STEPS.CROP)
    }
  }, [corners, sourceRotation, renderFilter])

  async function changeFilter(filterId) {
    setFilter(filterId)
    setStep(STEPS.PROCESSING)
    setProgress({ label: 'Applying filter', value: 0.5 })
    await renderFilter(filterId)
    setStep(STEPS.REVIEW)
  }

  async function rotatePreview(quarterTurns) {
    if (!correctedRef.current) return
    setStep(STEPS.PROCESSING)
    setProgress({ label: 'Rotating', value: 0.5 })
    correctedRef.current = rotateQuarterTurns(correctedRef.current, quarterTurns)
    await renderFilter(filter)
    setStep(STEPS.REVIEW)
  }

  /* ── OCR ──────────────────────────────────────────────────────────── */
  async function runOCR() {
    const filtered = filteredRef.current
    const corrected = correctedRef.current
    if (!filtered) return

    setStep(STEPS.OCR)
    setError('')
    setProgress({ label: 'Reading the receipt', value: 0 })

    try {
      const { recognizeWithFallback } = await import('../../utils/ocr/receiptOCRService')

      const enhancedBlob = await imageDataToBlob(filtered, { type: 'image/png' })

      // The second pass is a grayscale rendition rather than the untouched
      // corrected image. Tesseract reads flat high-contrast grey far better
      // than a colour-preserving enhance, so when the display filter reads
      // poorly this is the pass most likely to rescue it. The engine keeps
      // whichever result scores higher, so this can only help.
      let fallbackBlob = null
      if (corrected) {
        try {
          const forOcr = await applyFilter(corrected, 'grayscale')
          fallbackBlob = await imageDataToBlob(forOcr, { type: 'image/png' })
        } catch (cause) {
          console.warn('Could not build the grayscale OCR pass.', cause)
        }
      }

      const result = await recognizeWithFallback(
        { enhanced: enhancedBlob, fallback: fallbackBlob },
        {
          onProgress: (label, value) => setProgress({ label: 'Reading the receipt', value }),
        },
      )

      const parsed = parseReceiptText(result.text, { confidence: result.confidence })

      setValues({
        receiptNumber: parsed.receiptNumber ?? '',
        receivedFrom: parsed.receivedFrom ?? '',
        organization: parsed.organization ?? '',
        address: parsed.address ?? '',
        telephone: parsed.telephone ?? '',
        tin: parsed.tin ?? '',
        time: parsed.time ?? '',
        receiver: parsed.receiver ?? '',
        bank: parsed.bank ?? '',
        chequeNumber: parsed.chequeNumber ?? '',
        date: parsed.date ?? '',
        totalAmount: parsed.totalAmount ?? '',
        subtotal: parsed.subtotal ?? '',
        vatAmount: parsed.vatAmount ?? '',
        discount: parsed.discount ?? '',
        cashAmount: parsed.cashAmount ?? '',
        chequeAmount: parsed.chequeAmount ?? '',
        totalCashAndCheque: parsed.totalCashAndCheque ?? '',
        particularsText: parsed.particulars
          .map(row => (row.amount === null ? row.description : `${row.description} - ${row.amount}`))
          .join('\n'),
      })
      setOcrFlags(parsed.lowConfidenceFields)
      setOcrConfidence(result.confidence)
      // Kept so the reviewer can read what the engine actually saw. When the
      // parser recognises nothing, empty fields alone give them no way to tell
      // a bad scan from an unreadable receipt.
      setRawText(result.text || '')
      setOcrDiagnostics({
        rawText: String(result.text || '').slice(0, 12000),
        monetaryCandidates: parsed.amountCandidates || [],
        selectedGrandTotal: parsed.selectedTotalCandidate || null,
        recognitionConfidence: result.confidence,
        usedFallbackPass: Boolean(result.usedFallback),
      })
      setStep(STEPS.VERIFY)
    } catch (cause) {
      console.error('OCR failed', cause)
      // The scan is still good and is the thing that actually matters, so the
      // user goes to verification with empty fields rather than being blocked.
      setValues(EMPTY_VALUES)
      setOcrFlags(['all'])
      setOcrConfidence(null)
      setRawText('')
      setOcrDiagnostics(null)
      setError('Text could not be read from this receipt. Enter and confirm the Grand Total from the scan before saving.')
      setStep(STEPS.VERIFY)
    }
  }

  /* ── Save ─────────────────────────────────────────────────────────── */
  async function handleSave() {
    if (!filteredRef.current || !originalFile) return

    setError('')

    const confirmedTotal = Number(values.totalAmount)
    if (!Number.isFinite(confirmedTotal) || confirmedTotal <= 0) {
      setError('Confirm or correct the detected Grand Total before saving this receipt.')
      return
    }

    setStep(STEPS.SAVING)

    try {
      const scanBlob = await imageDataToBlob(filteredRef.current, { type: 'image/jpeg', quality: 0.92 })
      const scanFile = new File([scanBlob], `scan-${Date.now()}.jpg`, { type: 'image/jpeg' })

      await onSave({
        scanFile,
        originalFile,
        metadata: normaliseMetadata(values),
        scanSettings: {
          filter,
          corners,
          rotation: sourceRotation,
          ocrConfidence,
          ocrDiagnostics: {
            ...(ocrDiagnostics || {}),
            confirmedTotal,
            correctedByReviewer: ocrDiagnostics?.selectedGrandTotal?.amount != null
              ? Math.abs(Number(ocrDiagnostics.selectedGrandTotal.amount) - confirmedTotal) > 0.01
              : true,
            confirmedAt: new Date().toISOString(),
          },
          enhancementFailed,
          scannerVersion: 1,
        },
      })
    } catch (cause) {
      console.error('Saving the scan failed', cause)
      setError(cause?.message || 'The scan could not be saved. Please try again.')
      setStep(STEPS.VERIFY)
    }
  }

  const busy = step === STEPS.PROCESSING
  const title = useMemo(() => {
    if (step === STEPS.VERIFY || step === STEPS.SAVING) return 'Verify receipt'
    if (step === STEPS.REVIEW) return 'Review scan'
    if (step === STEPS.CROP) return 'Adjust edges'
    return 'Scan receipt'
  }, [step])

  const recordName = expense?.event || expense?.project || 'this record'

  return (
    <div className="modal-overlay scan-overlay" role="dialog" aria-modal="true" aria-label={title}>
      <div className="scan-modal">
        <header className="scan-modal-header">
          <div>
            <h2>{title}</h2>
            <p>{recordName}</p>
          </div>
          <button type="button" className="scan-close" onClick={onClose} aria-label="Close scanner">
            <X size={20} />
          </button>
        </header>

        <div className="scan-modal-body">
          {error && (
            <p className="scan-notice scan-notice--error" role="alert">
              {error}
            </p>
          )}

          {step === STEPS.SOURCE && (
            <div className="scan-source">
              <p>Photograph the receipt, or choose an existing photo. Cuenta will straighten and clean it before reading it.</p>
              <div className="scan-source-actions">
                <button type="button" className="scan-btn-primary" onClick={() => setStep(STEPS.CAMERA)}>
                  <Camera size={18} aria-hidden="true" />
                  Take photo
                </button>
                <button type="button" className="scan-btn-secondary" onClick={() => fileInputRef.current?.click()}>
                  <ImageUp size={18} aria-hidden="true" />
                  Upload photo
                </button>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleFilePicked}
                hidden
              />
            </div>
          )}

          {step === STEPS.CAMERA && (
            <div className="scan-camera">
              <video ref={videoRef} autoPlay playsInline muted />
              <button type="button" className="scan-btn-primary scan-shutter" onClick={capturePhoto}>
                <Camera size={18} aria-hidden="true" />
                Capture
              </button>
            </div>
          )}

          {step === STEPS.CROP && corners && (
            <ReceiptCropEditor
              imageSrc={originalSrc}
              corners={corners}
              onChange={setCorners}
              onRotate={() => setSourceRotation(value => (value + 1) % 4)}
              onReset={() => {
                const bitmap = bitmapRef.current
                setCorners(bitmap ? defaultQuad(bitmap.width, bitmap.height) : corners)
                setSourceRotation(0)
              }}
              detectionFailed={detectionFailed}
            />
          )}

          {busy && (
            <div className="scan-progress" role="status" aria-live="polite">
              <span className="scan-spinner" aria-hidden="true" />
              <span>{progress.label}</span>
              <div className="scan-progress-track">
                <div className="scan-progress-fill" style={{ width: `${Math.round(progress.value * 100)}%` }} />
              </div>
            </div>
          )}

          {step === STEPS.REVIEW && (
            <ReceiptScanPreview
              scanSrc={scanSrc}
              filter={filter}
              onFilterChange={changeFilter}
              onRotateLeft={() => rotatePreview(-1)}
              onRotateRight={() => rotatePreview(1)}
              onAdjustCrop={() => setStep(STEPS.CROP)}
              busy={busy}
              enhancementFailed={enhancementFailed}
              handwritingWarning={handwritingWarning}
              recommendationNote={recommendationNote}
            />
          )}

          {step === STEPS.OCR && (
            <div className="scan-progress scan-progress--large" role="status" aria-live="polite">
              <span className="scan-spinner" aria-hidden="true" />
              <span>{progress.label}</span>
              <div className="scan-progress-track">
                <div className="scan-progress-fill" style={{ width: `${Math.round(progress.value * 100)}%` }} />
              </div>
              <small>Reading text from the cleaned scan. This runs on your device.</small>
            </div>
          )}

          {(step === STEPS.VERIFY || step === STEPS.SAVING) && (
            <ReceiptOCRReview
              scanSrc={scanSrc}
              values={values}
              onChange={setValues}
              flags={ocrFlags}
              confidence={ocrConfidence}
              rawText={rawText}
            />
          )}
        </div>

        <footer className="scan-modal-footer">
          <button type="button" className="scan-btn-secondary" onClick={onClose} disabled={step === STEPS.SAVING}>
            Cancel
          </button>

          {step === STEPS.CROP && (
            <button type="button" className="scan-btn-primary" onClick={runCorrection}>
              Continue
            </button>
          )}

          {step === STEPS.REVIEW && (
            <div className="scan-footer-group">
              <button type="button" className="scan-btn-secondary" onClick={() => setStep(STEPS.SOURCE)}>
                Retake
              </button>
              <button type="button" className="scan-btn-primary" onClick={runOCR} disabled={busy}>
                Continue
              </button>
            </div>
          )}

          {step === STEPS.VERIFY && (
            <button type="button" className="scan-btn-primary" onClick={handleSave}>
              Confirm total and save
            </button>
          )}

          {step === STEPS.SAVING && (
            <button type="button" className="scan-btn-primary" disabled>
              <span className="scan-spinner" aria-hidden="true" />
              Saving
            </button>
          )}
        </footer>
      </div>
    </div>
  )
}

/**
 * Converts the review form into stored metadata.
 *
 * Empty stays null. A blank field on the paper must be recorded as unknown,
 * not as zero or an empty string that later reads as a real value.
 */
function normaliseMetadata(values) {
  const text = key => {
    const value = (values[key] ?? '').toString().trim()
    return value.length ? value : null
  }
  const amount = key => {
    const value = values[key]
    if (value === '' || value === null || value === undefined) return null
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }

  return {
    receiptNumber: text('receiptNumber'),
    receivedFrom: text('receivedFrom'),
    organization: text('organization'),
    address: text('address'),
    telephone: text('telephone'),
    tin: text('tin'),
    time: text('time'),
    receiver: text('receiver'),
    bank: text('bank'),
    chequeNumber: text('chequeNumber'),
    date: text('date'),
    totalAmount: amount('totalAmount'),
    subtotal: amount('subtotal'),
    vatAmount: amount('vatAmount'),
    discount: amount('discount'),
    cashAmount: amount('cashAmount'),
    chequeAmount: amount('chequeAmount'),
    totalCashAndCheque: amount('totalCashAndCheque'),
    particulars: text('particularsText'),
    verifiedAt: new Date().toISOString(),
  }
}
