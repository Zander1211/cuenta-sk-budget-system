// documentPdfCapture.js — captures a generated document's printable DOM
// (the `.print-page` div(s) rendered by each *Preview component, inside its
// `.print-preview-container`) into a PDF blob, so it can be uploaded and
// listed under its Project/Event's Generated Documents history. Uses the
// same html2canvas approach already used for chart PDFs in exportPdf.js —
// there is no backend rendering service in this app, and window.print() (the
// parallel native print path) cannot expose PDF bytes.
import { jsPDF } from 'jspdf'
import html2canvas from 'html2canvas'

const PAGE_W_MM = 210 // A4 width
const PAGE_H_MM = 297 // A4 height

/**
 * Captures every `.print-page` element found under `rootEl` (or `rootEl`
 * itself, if it is one) into a single PDF. Most documents render exactly one
 * `.print-page`, but multi-section documents (e.g. Narrative & Photo
 * Documentation) render several as siblings — each becomes its own PDF
 * page(s). Any single `.print-page` taller than one A4 page is sliced across
 * as many PDF pages as it needs, so long/overflowing content isn't clipped.
 *
 * Returns null on failure — callers must treat that as non-fatal (the
 * document record still saves; it just has no file attached).
 * @param {HTMLElement} rootEl
 * @returns {Promise<Blob|null>}
 */
export async function capturePrintPagesToPdfBlob(rootEl) {
  if (!rootEl) return null

  try {
    const pageEls = rootEl.matches?.('.print-page')
      ? [rootEl]
      : Array.from(rootEl.querySelectorAll('.print-page'))
    if (!pageEls.length) return null

    const doc = new jsPDF('portrait', 'mm', 'a4')
    let isFirstPage = true

    for (const pageEl of pageEls) {
      const canvas = await html2canvas(pageEl, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
      })

      const imgWidthMm = PAGE_W_MM
      const imgHeightMm = (canvas.height * imgWidthMm) / canvas.width
      const imgData = canvas.toDataURL('image/jpeg', 0.92)

      let heightLeft = imgHeightMm
      let position = 0
      for (;;) {
        if (!isFirstPage) doc.addPage()
        isFirstPage = false
        doc.addImage(imgData, 'JPEG', 0, position, imgWidthMm, imgHeightMm)
        heightLeft -= PAGE_H_MM
        if (heightLeft <= 0) break
        position -= PAGE_H_MM
      }
    }

    return doc.output('blob')
  } catch (err) {
    console.warn('Could not capture document PDF:', err)
    return null
  }
}
