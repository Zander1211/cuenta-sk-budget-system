import { ANALYSIS_DIMENSION, toGrayscale, toImageData, yieldToBrowser } from './imageUtils'

/**
 * Rotation and deskew for the processing copy.
 *
 * Nothing in this file touches the source photograph. Rotations are applied to
 * the corrected copy only, and the original file is uploaded untouched, so the
 * stored evidence is never destructively modified.
 */

/**
 * Rotates ImageData by a multiple of 90 degrees.
 *
 * Right angles are handled as an index remap rather than a canvas transform:
 * it is exact, allocation-light, and cannot introduce resampling blur, which
 * matters when the user rotates a few times while deciding.
 *
 * @param {ImageData} imageData
 * @param {number} quarterTurns positive is clockwise
 * @returns {ImageData}
 */
export function rotateQuarterTurns(imageData, quarterTurns) {
  const turns = ((quarterTurns % 4) + 4) % 4
  if (turns === 0) return imageData

  const { width, height, data } = imageData
  const swapped = turns % 2 === 1
  const outWidth = swapped ? height : width
  const outHeight = swapped ? width : height

  const output = new ImageData(outWidth, outHeight)
  const dst = output.data

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let targetX
      let targetY

      if (turns === 1) {
        targetX = height - 1 - y
        targetY = x
      } else if (turns === 2) {
        targetX = width - 1 - x
        targetY = height - 1 - y
      } else {
        targetX = y
        targetY = width - 1 - x
      }

      const from = (y * width + x) * 4
      const to = (targetY * outWidth + targetX) * 4
      dst[to] = data[from]
      dst[to + 1] = data[from + 1]
      dst[to + 2] = data[from + 2]
      dst[to + 3] = data[from + 3]
    }
  }

  return output
}

/**
 * Estimates residual tilt by maximising the variance of the horizontal
 * projection profile.
 *
 * Text lines produce dark bands in the row sums. When the page is square to
 * the frame those bands are crisp and the variance across rows peaks; when it
 * is tilted they smear together and the variance drops. Sweeping a small angle
 * range and keeping the best is a standard, cheap deskew that does not need
 * line detection.
 *
 * Perspective correction already removes most tilt, so the search stays
 * narrow. A wide search here would be a liability: it invites the algorithm to
 * "correct" a receipt whose printing is genuinely crooked.
 *
 * @param {ImageData} imageData
 * @returns {number} degrees to rotate, positive clockwise. 0 when unsure.
 */
export function detectSkewAngle(imageData) {
  try {
    const { imageData: small } = toImageData(toCanvasSource(imageData), ANALYSIS_DIMENSION)
    const { width, height } = small
    const gray = toGrayscale(small)

    // Ink mask: darker than the page average. Cheap and adequate here.
    let total = 0
    for (let i = 0; i < gray.length; i += 1) total += gray[i]
    const average = total / gray.length
    const cut = average * 0.88

    let bestAngle = 0
    let bestScore = -1

    for (let angle = -6; angle <= 6; angle += 0.5) {
      const radians = (angle * Math.PI) / 180
      const tangent = Math.tan(radians)
      const profile = new Float64Array(height)

      for (let y = 0; y < height; y += 1) {
        let sum = 0
        for (let x = 0; x < width; x += 2) {
          const shifted = y + Math.round((x - width / 2) * tangent)
          if (shifted < 0 || shifted >= height) continue
          if (gray[shifted * width + x] < cut) sum += 1
        }
        profile[y] = sum
      }

      let mean = 0
      for (let y = 0; y < height; y += 1) mean += profile[y]
      mean /= height

      let variance = 0
      for (let y = 0; y < height; y += 1) variance += (profile[y] - mean) ** 2

      if (variance > bestScore) {
        bestScore = variance
        bestAngle = angle
      }
    }

    // Under half a degree the correction is not worth the resample.
    return Math.abs(bestAngle) < 0.5 ? 0 : bestAngle
  } catch (error) {
    console.warn('Skew detection failed; leaving rotation unchanged.', error)
    return 0
  }
}

/**
 * Rotates by an arbitrary angle, expanding the canvas so nothing is clipped.
 * The exposed corners are filled with paper white rather than transparency, so
 * the scan still reads as a document.
 *
 * @param {ImageData} imageData
 * @param {number} degrees positive clockwise
 * @returns {Promise<ImageData>}
 */
export async function rotateByAngle(imageData, degrees) {
  if (!degrees) return imageData

  const radians = (degrees * Math.PI) / 180
  const { width, height } = imageData
  const cos = Math.abs(Math.cos(radians))
  const sin = Math.abs(Math.sin(radians))

  const outWidth = Math.round(width * cos + height * sin)
  const outHeight = Math.round(width * sin + height * cos)

  const source = toCanvasSource(imageData)
  const canvas = document.createElement('canvas')
  canvas.width = outWidth
  canvas.height = outHeight
  const ctx = canvas.getContext('2d', { willReadFrequently: true })

  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(0, 0, outWidth, outHeight)
  ctx.translate(outWidth / 2, outHeight / 2)
  ctx.rotate(radians)
  ctx.drawImage(source, -width / 2, -height / 2)

  await yieldToBrowser()
  return ctx.getImageData(0, 0, outWidth, outHeight)
}

/** Wraps ImageData in a canvas so it can be used as a drawImage source. */
function toCanvasSource(imageData) {
  const canvas = document.createElement('canvas')
  canvas.width = imageData.width
  canvas.height = imageData.height
  canvas.getContext('2d').putImageData(imageData, 0, 0)
  return canvas
}
