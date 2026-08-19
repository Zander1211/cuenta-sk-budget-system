import { boxBlur, toGrayscale, yieldToBrowser } from './imageUtils'
import { analyseDocument, enhanceReceipt } from './enhanceReceipt'

/**
 * The four scan modes offered after correction.
 *
 * `id` values are persisted with the receipt so a saved scan records how it
 * was produced.
 */
export const SCAN_FILTERS = [
  {
    id: 'original',
    label: 'Original',
    description: 'Straightened, with no enhancement applied.',
  },
  {
    id: 'auto',
    label: 'Auto Enhance',
    description: 'Flattens shadows and lifts the paper. Keeps colour stamps and pen.',
  },
  {
    id: 'grayscale',
    label: 'Grayscale',
    description: 'Neutral grey, detail retained.',
  },
  {
    id: 'bw',
    label: 'Black & White',
    description: 'Highest contrast. Faint handwriting can be lost.',
  },
]

export const DEFAULT_FILTER = 'auto'

/**
 * Applies a scan mode to a perspective-corrected image.
 *
 * @param {ImageData} corrected output of `perspectiveTransform`
 * @param {string} filterId one of SCAN_FILTERS
 * @returns {Promise<ImageData>}
 */
export async function applyFilter(corrected, filterId) {
  switch (filterId) {
    case 'original':
      return corrected

    case 'grayscale': {
      const enhanced = await enhanceReceipt(corrected, { strength: 0.85, keepColour: false })
      return toGrayscaleImage(enhanced)
    }

    case 'bw': {
      const enhanced = await enhanceReceipt(corrected, { strength: 1 })
      return adaptiveThreshold(enhanced)
    }

    case 'auto':
    default:
      return enhanceReceipt(corrected, { strength: 1, keepColour: true })
  }
}

/**
 * Chooses the mode to open on.
 *
 * Always Auto Enhance unless the analysis says enhancement would hurt: a page
 * that is already almost entirely mid-tone (a photocopy on grey stock, a very
 * dark photo) gets Original instead, because flattening it would crush the
 * content. Black & White is never chosen automatically, per the requirement
 * that handwriting must survive by default.
 *
 * @param {ImageData} corrected
 * @returns {{filterId: string, analysis: object, reason: string}}
 */
export function recommendFilter(corrected) {
  const analysis = analyseDocument(corrected)

  if (analysis.midtoneRatio > 0.72) {
    return {
      filterId: 'original',
      analysis,
      reason: 'This page is mostly mid-tone, so enhancement was left off to avoid losing detail.',
    }
  }

  return { filterId: DEFAULT_FILTER, analysis, reason: '' }
}

function toGrayscaleImage(imageData) {
  const { width, height } = imageData
  const output = new ImageData(width, height)
  const src = imageData.data
  const dst = output.data

  for (let i = 0; i < src.length; i += 4) {
    const value = (src[i] * 299 + src[i + 1] * 587 + src[i + 2] * 114) / 1000
    dst[i] = dst[i + 1] = dst[i + 2] = value
    dst[i + 3] = 255
  }
  return output
}

/**
 * Local-mean adaptive threshold.
 *
 * A single global threshold is what erases handwriting, because pencil sits
 * much closer to the paper level than print does. Comparing each pixel to its
 * own neighbourhood mean, with a small bias, keeps light strokes that a global
 * cut would drop, while still producing a true two-tone document.
 */
async function adaptiveThreshold(imageData) {
  const { width, height } = imageData
  const gray = toGrayscale(imageData)

  const radius = Math.max(6, Math.round(Math.min(width, height) / 60))
  const mean = boxBlur(gray, width, height, radius)

  const output = new ImageData(width, height)
  const dst = output.data

  // Bias is a fraction of the local mean rather than a fixed offset, so the
  // same setting behaves on both a bright and a dim region of the page.
  const bias = 0.86

  const rowsPerChunk = Math.max(1, Math.floor(200000 / width))
  for (let yStart = 0; yStart < height; yStart += rowsPerChunk) {
    const yEnd = Math.min(height, yStart + rowsPerChunk)

    for (let y = yStart; y < yEnd; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const p = y * width + x
        const value = gray[p] < mean[p] * bias ? 0 : 255
        const i = p * 4
        dst[i] = dst[i + 1] = dst[i + 2] = value
        dst[i + 3] = 255
      }
    }

    if (yEnd < height) await yieldToBrowser()
  }

  return output
}
