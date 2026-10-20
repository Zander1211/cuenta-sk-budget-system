// documentPdfCapture.js — captures a generated document's printable DOM
// into an exact, pixel-perfect PDF matching the on-screen preview.
// Supports multi-page sections, landscape documents (Payroll), smart row-aware slicing,
// lossless rendering, and direct download/blob extraction.
import { jsPDF } from 'jspdf'
import html2canvas from 'html2canvas'

const A4_PORTRAIT_W_MM = 210
const A4_PORTRAIT_H_MM = 297
const A4_LANDSCAPE_W_MM = 297
const A4_LANDSCAPE_H_MM = 210

/**
 * Ensures all image elements inside rootEl are fully loaded and decoded.
 */
async function ensureImagesLoaded(rootEl) {
  if (!rootEl) return
  const imgs = Array.from(rootEl.querySelectorAll('img'))
  await Promise.all(
    imgs.map((img) => {
      if (img.complete && img.naturalWidth !== 0) return Promise.resolve()
      return new Promise((resolve) => {
        const done = () => resolve()
        img.addEventListener('load', done, { once: true })
        img.addEventListener('error', done, { once: true })
        setTimeout(done, 2500)
      })
    })
  )
  if (document.fonts?.ready) {
    try {
      await document.fonts.ready
    } catch {
      // Non-fatal if font loading check fails
    }
  }
}

/**
 * Searches near targetY upwards for a clean break point (a horizontal band
 * of white or uniform pixels) to avoid slicing across table rows or image lines.
 */
function findBestSliceCut(canvas, targetY, searchRange = 60) {
  try {
    const ctx = canvas.getContext('2d')
    const startY = Math.max(0, targetY - searchRange)
    const scanHeight = targetY - startY
    if (scanHeight <= 0) return targetY

    // Sample a horizontal strip across the canvas width
    const sampleWidth = Math.min(canvas.width, 1200)
    const imgData = ctx.getImageData(0, startY, sampleWidth, scanHeight)
    const data = imgData.data

    let bestY = targetY
    let minNonWhite = Infinity

    // Check each line from targetY backwards
    for (let r = scanHeight - 1; r >= 0; r--) {
      let nonWhiteCount = 0
      const rowOffset = r * sampleWidth * 4

      // Sample every 4th pixel for speed
      for (let c = 0; c < sampleWidth; c += 4) {
        const idx = rowOffset + c * 4
        const red = data[idx]
        const green = data[idx + 1]
        const blue = data[idx + 2]
        const alpha = data[idx + 3]

        // Check if pixel is visibly non-white/non-transparent
        if (alpha > 30 && (red < 245 || green < 245 || blue < 245)) {
          nonWhiteCount++
        }
      }

      if (nonWhiteCount === 0) {
        // Completely clear row found! Perfect cut point.
        return startY + r
      }

      if (nonWhiteCount < minNonWhite) {
        minNonWhite = nonWhiteCount
        bestY = startY + r
      }
    }

    // If a relatively clear row was found (e.g. less than 2% colored pixels)
    if (minNonWhite < (sampleWidth / 4) * 0.02) {
      return bestY
    }

    return targetY
  } catch {
    return targetY
  }
}

/**
 * Core engine: renders the DOM element(s) into a jsPDF instance.
 * @param {HTMLElement} rootEl
 * @param {Object} options
 * @returns {Promise<jsPDF|null>}
 */
export async function generateDocumentPdf(rootEl, options = {}) {
  if (!rootEl) return null

  try {
    await ensureImagesLoaded(rootEl)

    // Detect landscape orientation (e.g. Payroll document)
    const isLandscape =
      options.orientation === 'landscape' ||
      Boolean(rootEl.querySelector('.payroll-document')) ||
      Boolean(rootEl.classList?.contains('payroll-document')) ||
      (rootEl.offsetWidth > 980 && rootEl.offsetWidth > rootEl.offsetHeight * 1.15)

    const pageWMm = isLandscape ? A4_LANDSCAPE_W_MM : A4_PORTRAIT_W_MM
    const pageHMm = isLandscape ? A4_LANDSCAPE_H_MM : A4_PORTRAIT_H_MM
    const doc = new jsPDF(isLandscape ? 'landscape' : 'portrait', 'mm', 'a4')

    // Find printable elements
    let pageEls = []
    
    // Special handling for Annual Report ABYIP + Resolution
    const abyipEl = rootEl.querySelector('.abyip-container')
    const resolutionEl = rootEl.querySelector('.resolution-section')
    if (abyipEl && resolutionEl) {
      pageEls = [abyipEl, resolutionEl]
    } else if (rootEl.matches?.('.print-page, .fsr-report-page')) {
      pageEls = [rootEl]
    } else {
      const queried = Array.from(rootEl.querySelectorAll('.print-page, .fsr-report-page'))
      pageEls = queried.length > 0 ? queried : [rootEl]
    }

    let isFirstPage = true

    for (const pageEl of pageEls) {
      // High-resolution canvas rendering with lossless settings
      const canvas = await html2canvas(pageEl, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        logging: false,
        scrollX: 0,
        scrollY: 0,
        windowWidth: isLandscape ? 1280 : 960,
      })

      if (!canvas.width || !canvas.height) continue

      const imgWidthMm = pageWMm
      const imgHeightMm = (canvas.height * imgWidthMm) / canvas.width

      // CASE 1: The element fits on a single A4 page (or is within 6% tolerance of single A4 page).
      // Scale slightly to fit cleanly on exactly ONE page so no 1mm blank trailing page is generated.
      if (imgHeightMm <= pageHMm * 1.06) {
        if (!isFirstPage) doc.addPage()
        isFirstPage = false

        if (imgHeightMm > pageHMm) {
          // Scale down by 1-5% so it fits 100% within the A4 page boundaries
          const scale = pageHMm / imgHeightMm
          const scaledW = imgWidthMm * scale
          const xOffset = (pageWMm - scaledW) / 2
          const imgData = canvas.toDataURL('image/png')
          doc.addImage(imgData, 'PNG', xOffset, 0, scaledW, pageHMm)
        } else {
          const imgData = canvas.toDataURL('image/png')
          doc.addImage(imgData, 'PNG', 0, 0, imgWidthMm, imgHeightMm)
        }
      } else {
        // CASE 2: Multi-page element (e.g. Photo Documentation with many photos or long data tables).
        // Slice using canvas sub-draws with smart row-boundary detection.
        const pageHeightPx = Math.floor((pageHMm / imgWidthMm) * canvas.width)
        let srcY = 0

        while (srcY < canvas.height) {
          let sliceH = Math.min(pageHeightPx, canvas.height - srcY)

          // Discard tiny residual slivers (under 20px) to prevent accidental blank pages
          if (sliceH <= 20) break

          // If not the last slice, look for a clean break point
          if (srcY + sliceH < canvas.height) {
            const cutY = findBestSliceCut(canvas, srcY + sliceH, 60)
            if (cutY > srcY + sliceH - 60) {
              sliceH = cutY - srcY
            }
          }

          const sliceCanvas = document.createElement('canvas')
          sliceCanvas.width = canvas.width
          sliceCanvas.height = sliceH
          const sCtx = sliceCanvas.getContext('2d')
          sCtx.drawImage(canvas, 0, srcY, canvas.width, sliceH, 0, 0, canvas.width, sliceH)

          const sliceData = sliceCanvas.toDataURL('image/png')
          const sliceHeightMm = (sliceH * imgWidthMm) / canvas.width

          if (!isFirstPage) doc.addPage()
          isFirstPage = false
          doc.addImage(sliceData, 'PNG', 0, 0, imgWidthMm, sliceHeightMm)

          srcY += sliceH
        }
      }
    }

    return doc
  } catch (err) {
    console.warn('Could not generate document PDF:', err)
    return null
  }
}

/**
 * Captures document DOM into a PDF Blob (used for saving/uploading to Supabase Storage).
 * @param {HTMLElement} rootEl
 * @param {Object} options
 * @returns {Promise<Blob|null>}
 */
export async function capturePrintPagesToPdfBlob(rootEl, options = {}) {
  const doc = await generateDocumentPdf(rootEl, options)
  if (!doc) return null
  return doc.output('blob')
}

/**
 * Generates and immediately downloads the PDF directly from the rendered preview DOM.
 * @param {HTMLElement} rootEl
 * @param {string} filename
 * @param {Object} options
 * @returns {Promise<Blob|null>}
 */
export async function saveDocumentAsPdf(rootEl, filename = 'document.pdf', options = {}) {
  const doc = await generateDocumentPdf(rootEl, options)
  if (!doc) throw new Error('Could not render document preview to PDF')
  const cleanName = filename.endsWith('.pdf') ? filename : `${filename}.pdf`
  doc.save(cleanName)
  return doc.output('blob')
}

