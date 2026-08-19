import { MAX_PROCESS_DIMENSION, createCanvas, yieldToBrowser } from './imageUtils'

/**
 * Four-point perspective correction.
 *
 * Solves the homography that maps the user's quad onto an upright rectangle,
 * then inverse-maps every destination pixel back into the source with bilinear
 * sampling. Inverse mapping is what avoids the holes a forward map leaves.
 *
 * The output rectangle takes the longer of each pair of opposing sides, so a
 * receipt photographed at an angle keeps its real proportions rather than
 * being squashed to the foreshortened edge.
 */

/**
 * @param {ImageBitmap|HTMLImageElement} source
 * @param {Array<{x: number, y: number}>} corners clockwise from top-left
 * @param {{maxDimension?: number, onProgress?: (ratio: number) => void}} [options]
 * @returns {Promise<ImageData>}
 */
export async function perspectiveTransform(source, corners, options = {}) {
  const { maxDimension = MAX_PROCESS_DIMENSION, onProgress } = options
  const [topLeft, topRight, bottomRight, bottomLeft] = corners

  const widthTop = distance(topLeft, topRight)
  const widthBottom = distance(bottomLeft, bottomRight)
  const heightLeft = distance(topLeft, bottomLeft)
  const heightRight = distance(topRight, bottomRight)

  let targetWidth = Math.max(widthTop, widthBottom)
  let targetHeight = Math.max(heightLeft, heightRight)

  if (!Number.isFinite(targetWidth) || !Number.isFinite(targetHeight) || targetWidth < 8 || targetHeight < 8) {
    throw new Error('The selected area is too small to straighten.')
  }

  const longest = Math.max(targetWidth, targetHeight)
  if (longest > maxDimension) {
    const scale = maxDimension / longest
    targetWidth *= scale
    targetHeight *= scale
  }

  targetWidth = Math.max(1, Math.round(targetWidth))
  targetHeight = Math.max(1, Math.round(targetHeight))

  // A modern phone camera hands us 12MP or more, which is 48MB of RGBA before
  // a single pixel is transformed. Since the output is capped well below that,
  // the source is read at a bounded size and the corners are scaled to match.
  // Sampling quality is unaffected: we never magnify beyond the source detail
  // the output can actually carry.
  const sourceLimit = Math.max(maxDimension * 1.5, 2048)
  const { data: src, width: srcWidth, height: srcHeight, scale: sourceScale } = readSource(source, sourceLimit)

  const scaledCorners = [topLeft, topRight, bottomRight, bottomLeft].map(point => ({
    x: point.x * sourceScale,
    y: point.y * sourceScale,
  }))

  // The homography is solved destination -> source, so sampling is a direct
  // lookup with no matrix inversion needed per pixel.
  const matrix = solveHomography(
    [
      { x: 0, y: 0 },
      { x: targetWidth, y: 0 },
      { x: targetWidth, y: targetHeight },
      { x: 0, y: targetHeight },
    ],
    scaledCorners,
  )

  if (!matrix) throw new Error('The corners could not be straightened. Try adjusting them.')

  const output = new ImageData(targetWidth, targetHeight)
  const dst = output.data

  const [a, b, c, d, e, f, g, h] = matrix

  // Chunked by rows with a yield between chunks. A 1800px scan is ~3M pixels;
  // done in one synchronous pass that is a visible freeze on a phone.
  const rowsPerChunk = Math.max(1, Math.floor(120000 / targetWidth))

  for (let yStart = 0; yStart < targetHeight; yStart += rowsPerChunk) {
    const yEnd = Math.min(targetHeight, yStart + rowsPerChunk)

    for (let y = yStart; y < yEnd; y += 1) {
      for (let x = 0; x < targetWidth; x += 1) {
        const denominator = g * x + h * y + 1
        const sx = (a * x + b * y + c) / denominator
        const sy = (d * x + e * y + f) / denominator

        const target = (y * targetWidth + x) * 4
        sampleBilinear(src, srcWidth, srcHeight, sx, sy, dst, target)
      }
    }

    if (onProgress) onProgress(yEnd / targetHeight)
    if (yEnd < targetHeight) await yieldToBrowser()
  }

  return output
}

/**
 * Reads the source once into a flat buffer, bounded by `limit`.
 *
 * @returns {{data: Uint8ClampedArray, width: number, height: number, scale: number}}
 *   `scale` maps source coordinates into the buffer that was actually read.
 */
function readSource(source, limit) {
  const longest = Math.max(source.width, source.height)
  const scale = longest > limit ? limit / longest : 1

  const width = Math.max(1, Math.round(source.width * scale))
  const height = Math.max(1, Math.round(source.height * scale))

  const canvas = createCanvas(width, height)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(source, 0, 0, width, height)

  const imageData = ctx.getImageData(0, 0, width, height)
  return { data: imageData.data, width, height, scale }
}

/**
 * Bilinear sample with edge clamping, written straight into the destination.
 *
 * Clamping rather than returning transparent matters: a corner dragged a pixel
 * outside the photo should smear the edge colour, not punch a hole in the scan.
 */
function sampleBilinear(src, width, height, x, y, dst, target) {
  const cx = Math.min(width - 1, Math.max(0, x))
  const cy = Math.min(height - 1, Math.max(0, y))

  const x0 = Math.floor(cx)
  const y0 = Math.floor(cy)
  const x1 = Math.min(width - 1, x0 + 1)
  const y1 = Math.min(height - 1, y0 + 1)

  const fx = cx - x0
  const fy = cy - y0
  const fx1 = 1 - fx
  const fy1 = 1 - fy

  const i00 = (y0 * width + x0) * 4
  const i10 = (y0 * width + x1) * 4
  const i01 = (y1 * width + x0) * 4
  const i11 = (y1 * width + x1) * 4

  const w00 = fx1 * fy1
  const w10 = fx * fy1
  const w01 = fx1 * fy
  const w11 = fx * fy

  for (let channel = 0; channel < 3; channel += 1) {
    dst[target + channel] =
      src[i00 + channel] * w00 +
      src[i10 + channel] * w10 +
      src[i01 + channel] * w01 +
      src[i11 + channel] * w11
  }
  dst[target + 3] = 255
}

/**
 * Direct linear transform for four point correspondences.
 *
 * Builds the 8x8 system for the eight unknown homography coefficients (the
 * ninth is fixed at 1) and solves it by Gaussian elimination with partial
 * pivoting. Returns null when the points are degenerate, e.g. three of them
 * collinear, which is what a badly dragged corner produces.
 *
 * @returns {number[]|null} [a, b, c, d, e, f, g, h]
 */
export function solveHomography(from, to) {
  const matrix = []
  const vector = []

  for (let i = 0; i < 4; i += 1) {
    const { x, y } = from[i]
    const { x: u, y: v } = to[i]
    matrix.push([x, y, 1, 0, 0, 0, -x * u, -y * u])
    vector.push(u)
    matrix.push([0, 0, 0, x, y, 1, -x * v, -y * v])
    vector.push(v)
  }

  return gaussianSolve(matrix, vector)
}

function gaussianSolve(matrix, vector) {
  const size = vector.length
  const augmented = matrix.map((row, index) => [...row, vector[index]])

  for (let column = 0; column < size; column += 1) {
    let pivotRow = column
    for (let row = column + 1; row < size; row += 1) {
      if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivotRow][column])) pivotRow = row
    }

    if (Math.abs(augmented[pivotRow][column]) < 1e-10) return null
    ;[augmented[column], augmented[pivotRow]] = [augmented[pivotRow], augmented[column]]

    const pivot = augmented[column][column]
    for (let k = column; k <= size; k += 1) augmented[column][k] /= pivot

    for (let row = 0; row < size; row += 1) {
      if (row === column) continue
      const factor = augmented[row][column]
      if (factor === 0) continue
      for (let k = column; k <= size; k += 1) {
        augmented[row][k] -= factor * augmented[column][k]
      }
    }
  }

  return augmented.map(row => row[size])
}

function distance(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y)
}
