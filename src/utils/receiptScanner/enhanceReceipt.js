import { boxBlur, toGrayscale, yieldToBrowser } from './imageUtils'

/**
 * Scanner-style enhancement.
 *
 * The core operation is illumination division: estimate the paper's own
 * brightness with a very large blur, then divide the image by that estimate.
 * A shadow across the page is a low-frequency brightness change, so dividing
 * it out flattens the lighting while leaving high-frequency detail (print,
 * pen strokes, stamp edges) untouched. This is why the result reads as a flat
 * scan rather than a photo of paper.
 *
 * Everything here is tuned conservatively. Aggressive thresholding is what
 * makes faint pencil and light-blue ballpoint vanish from scanned documents,
 * and on a financial record a disappearing handwritten amount is a far worse
 * outcome than a slightly grey background.
 */

/** How dark a pixel must be, relative to its local paper level, before we
 *  treat it as ink rather than shading. Deliberately generous. */
const INK_RATIO = 0.93

/**
 * Measures how much of the image is mid-tone: neither paper-white nor
 * solid-print-black. Pencil, faded carbon copy, ink stamps and signatures all
 * live in this band, so a high reading is the signal that hard thresholding
 * would destroy content.
 *
 * @param {ImageData} imageData
 * @returns {{midtoneRatio: number, likelyHandwriting: boolean}}
 */
export function analyseDocument(imageData) {
  const gray = toGrayscale(imageData)
  let midtone = 0
  let ink = 0

  // Sampled rather than exhaustive: a 1-in-7 stride is statistically ample and
  // keeps this instant even on a large scan.
  const stride = 7
  let sampled = 0

  for (let i = 0; i < gray.length; i += stride) {
    const value = gray[i]
    sampled += 1
    if (value < 205 && value > 60) midtone += 1
    if (value <= 60) ink += 1
  }

  const midtoneRatio = sampled ? midtone / sampled : 0
  const inkRatio = sampled ? ink / sampled : 0

  return {
    midtoneRatio,
    inkRatio,
    // Plenty of soft grey but little hard black is the signature of pen and
    // pencil rather than laser print.
    likelyHandwriting: midtoneRatio > 0.06 && midtoneRatio > inkRatio * 1.4,
  }
}

/**
 * Estimates the paper background so lighting can be divided out.
 *
 * @param {ImageData} imageData
 * @returns {Float32Array} per-pixel paper luminance
 */
function estimateIllumination(imageData) {
  const { width, height } = imageData
  const gray = toGrayscale(imageData)

  // Radius scales with the page so the estimate follows shadows without
  // following the text. Roughly a twentieth of the short edge works across
  // receipt sizes; the floor keeps it sane on small crops.
  const radius = Math.max(8, Math.round(Math.min(width, height) / 20))

  // A max-filter approximation first: take the blurred plane, then bias it
  // upwards toward the brighter local values so dense blocks of text do not
  // pull the "paper" estimate down and get bleached out in the division.
  const blurred = boxBlur(gray, width, height, radius)
  const wide = boxBlur(blurred, width, height, Math.round(radius / 2))

  const background = new Float32Array(gray.length)
  for (let i = 0; i < background.length; i += 1) {
    background[i] = Math.max(blurred[i], wide[i], 1)
  }
  return background
}

/**
 * Percentile pair from a plane, used for contrast stretching without letting
 * a single blown highlight or dust speck define the range.
 */
function percentiles(plane, lowP, highP) {
  const histogram = new Uint32Array(256)
  for (let i = 0; i < plane.length; i += 1) {
    histogram[Math.min(255, Math.max(0, Math.round(plane[i])))] += 1
  }

  const total = plane.length
  const lowTarget = total * lowP
  const highTarget = total * highP

  let cumulative = 0
  let low = 0
  let high = 255

  for (let i = 0; i < 256; i += 1) {
    cumulative += histogram[i]
    if (cumulative >= lowTarget) { low = i; break }
  }

  cumulative = 0
  for (let i = 0; i < 256; i += 1) {
    cumulative += histogram[i]
    if (cumulative >= highTarget) { high = i; break }
  }

  return { low, high: Math.max(high, low + 1) }
}

/**
 * Flattens lighting and lifts the paper to near-white while protecting ink.
 *
 * @param {ImageData} imageData source, not mutated
 * @param {{strength?: number, keepColour?: boolean}} [options]
 * @returns {Promise<ImageData>}
 */
export async function enhanceReceipt(imageData, options = {}) {
  const { strength = 1, keepColour = true } = options
  const { width, height } = imageData

  const background = estimateIllumination(imageData)
  const output = new ImageData(width, height)
  const src = imageData.data
  const dst = output.data

  // Contrast targets are derived from the corrected luminance, not the raw
  // one, otherwise the shadow still skews the range we stretch into.
  const corrected = new Float32Array(width * height)
  for (let p = 0; p < corrected.length; p += 1) {
    const i = p * 4
    const luminance = (src[i] * 299 + src[i + 1] * 587 + src[i + 2] * 114) / 1000
    corrected[p] = Math.min(255, (luminance / background[p]) * 235)
  }

  const { low, high } = percentiles(corrected, 0.02, 0.985)
  const range = Math.max(1, high - low)

  const rowsPerChunk = Math.max(1, Math.floor(160000 / width))

  for (let yStart = 0; yStart < height; yStart += rowsPerChunk) {
    const yEnd = Math.min(height, yStart + rowsPerChunk)

    for (let y = yStart; y < yEnd; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const p = y * width + x
        const i = p * 4
        const paper = background[p]

        // Ratio of this pixel to its local paper level. At or above 1 the
        // pixel *is* paper; well below it, the pixel is ink.
        const luminance = (src[i] * 299 + src[i + 1] * 587 + src[i + 2] * 114) / 1000
        const ratio = luminance / paper

        if (ratio >= INK_RATIO) {
          // Paper. Push it to white so shadows and paper tint disappear.
          dst[i] = dst[i + 1] = dst[i + 2] = 255
          dst[i + 3] = 255
          continue
        }

        // Ink, handwriting or stamp. Correct its lighting, stretch contrast
        // gently, and keep the hue so blue pen and red stamps stay themselves.
        for (let channel = 0; channel < 3; channel += 1) {
          const flattened = Math.min(255, (src[i + channel] / paper) * 235)
          const stretched = ((flattened - low) / range) * 255
          const blended = flattened + (stretched - flattened) * strength
          dst[i + channel] = keepColour
            ? clamp8(blended)
            : clamp8(blended * 0.999)
        }
        dst[i + 3] = 255
      }
    }

    if (yEnd < height) await yieldToBrowser()
  }

  return output
}

function clamp8(value) {
  return value < 0 ? 0 : value > 255 ? 255 : value
}
