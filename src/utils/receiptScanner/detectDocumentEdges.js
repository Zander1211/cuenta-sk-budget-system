import { ANALYSIS_DIMENSION, boxBlur, otsuThreshold, toGrayscale, toImageData } from './imageUtils'

/**
 * Automatic document corner detection.
 *
 * The approach is deliberately simple and predictable rather than clever:
 *
 *   1. Work on a ~480px copy. Detection does not need full resolution and the
 *      small copy is what keeps this off the main thread's critical path.
 *   2. Blur, then Otsu-threshold the luminance. A receipt is nearly always the
 *      brighter region against a darker desk or table.
 *   3. Keep the largest connected bright component, so a bright window or a
 *      pale sleeve in the corner of frame does not drag the quad outwards.
 *   4. Take the extreme points of that component along the four diagonals.
 *      For a roughly rectangular sheet, min(x+y) is the top-left corner,
 *      max(x+y) the bottom-right, max(x-y) the top-right and min(x-y) the
 *      bottom-left. This is far more robust on crumpled or partially occluded
 *      receipts than contour approximation, which tends to return a polygon
 *      with the wrong number of vertices and then has to be repaired anyway.
 *   5. Sanity-check the result. Detection that is not confident returns null
 *      so the caller can show the manual-adjustment message instead of
 *      silently cropping the document wrongly.
 *
 * Corners come back in source-image pixel coordinates, clockwise from
 * top-left, which is the order `perspectiveTransform` expects.
 */

/** Detection is rejected outside this share of the frame. Too small means we
 *  latched onto a highlight; too large means we just found the whole photo. */
const MIN_AREA_RATIO = 0.12
const MAX_AREA_RATIO = 0.985

/**
 * @typedef {{x: number, y: number}} Point
 * @typedef {[Point, Point, Point, Point]} Quad
 */

/**
 * @param {ImageBitmap|HTMLImageElement} source
 * @returns {{corners: Quad, confident: boolean}} `confident` is false when the
 *   caller should prompt the user to adjust the corners by hand.
 */
export function detectDocumentEdges(source) {
  const fallback = defaultQuad(source.width, source.height)

  try {
    const { imageData, scale } = toImageData(source, ANALYSIS_DIMENSION)
    const { width, height } = imageData
    const gray = toGrayscale(imageData)

    // Blur before thresholding so print and table texture do not fragment the
    // mask into thousands of specks.
    const blurred = boxBlur(gray, width, height, Math.max(1, Math.round(Math.min(width, height) / 100)))
    const threshold = otsuThreshold(blurred)

    const mask = new Uint8Array(width * height)
    for (let i = 0; i < mask.length; i += 1) {
      mask[i] = blurred[i] > threshold ? 1 : 0
    }

    const component = largestComponent(mask, width, height)
    if (!component) return { corners: fallback, confident: false }

    const areaRatio = component.size / (width * height)
    if (areaRatio < MIN_AREA_RATIO || areaRatio > MAX_AREA_RATIO) {
      return { corners: fallback, confident: false }
    }

    const corners = extremePoints(component, width)
    if (!corners) return { corners: fallback, confident: false }

    // Reject degenerate quads: near-zero area, or a quad whose own area is a
    // poor match for the component it came from (a strongly non-convex blob).
    const quadArea = polygonArea(corners)
    if (quadArea <= 0) return { corners: fallback, confident: false }
    const fillRatio = component.size / quadArea
    if (fillRatio < 0.55) return { corners: fallback, confident: false }

    const scaled = corners.map(point => ({
      x: clamp(point.x / scale, 0, source.width),
      y: clamp(point.y / scale, 0, source.height),
    }))

    if (!hasUsableSideLengths(scaled)) return { corners: fallback, confident: false }

    return { corners: scaled, confident: true }
  } catch (error) {
    console.warn('Document edge detection failed; falling back to manual corners.', error)
    return { corners: fallback, confident: false }
  }
}

/** A gentle inset rectangle, used whenever detection declines to commit. */
export function defaultQuad(width, height) {
  const insetX = width * 0.08
  const insetY = height * 0.08
  return [
    { x: insetX, y: insetY },
    { x: width - insetX, y: insetY },
    { x: width - insetX, y: height - insetY },
    { x: insetX, y: height - insetY },
  ]
}

/**
 * Largest 4-connected component of the mask, found with an explicit stack.
 * Recursion would blow the call stack on a full-frame document.
 */
function largestComponent(mask, width, height) {
  const labels = new Int32Array(mask.length).fill(-1)
  const stack = new Int32Array(mask.length)
  let best = null

  for (let start = 0; start < mask.length; start += 1) {
    if (mask[start] !== 1 || labels[start] !== -1) continue

    let stackSize = 0
    stack[stackSize++] = start
    labels[start] = start

    const pixels = []
    while (stackSize > 0) {
      const index = stack[--stackSize]
      pixels.push(index)

      const x = index % width
      const y = (index / width) | 0

      if (x > 0) pushNeighbour(index - 1)
      if (x < width - 1) pushNeighbour(index + 1)
      if (y > 0) pushNeighbour(index - width)
      if (y < height - 1) pushNeighbour(index + width)
    }

    if (!best || pixels.length > best.size) {
      best = { pixels, size: pixels.length }
    }

    function pushNeighbour(neighbour) {
      if (mask[neighbour] === 1 && labels[neighbour] === -1) {
        labels[neighbour] = start
        stack[stackSize++] = neighbour
      }
    }
  }

  return best
}

/** Corner extraction by diagonal extremes. See the module comment. */
function extremePoints(component, width) {
  let minSum = Infinity
  let maxSum = -Infinity
  let minDiff = Infinity
  let maxDiff = -Infinity
  let topLeft = null
  let bottomRight = null
  let bottomLeft = null
  let topRight = null

  for (const index of component.pixels) {
    const x = index % width
    const y = (index / width) | 0
    const sum = x + y
    const diff = x - y

    if (sum < minSum) { minSum = sum; topLeft = { x, y } }
    if (sum > maxSum) { maxSum = sum; bottomRight = { x, y } }
    if (diff > maxDiff) { maxDiff = diff; topRight = { x, y } }
    if (diff < minDiff) { minDiff = diff; bottomLeft = { x, y } }
  }

  if (!topLeft || !topRight || !bottomRight || !bottomLeft) return null
  return [topLeft, topRight, bottomRight, bottomLeft]
}

/** Shoelace formula. Sign is discarded; we only compare magnitudes. */
function polygonArea(points) {
  let area = 0
  for (let i = 0; i < points.length; i += 1) {
    const current = points[i]
    const next = points[(i + 1) % points.length]
    area += current.x * next.y - next.x * current.y
  }
  return Math.abs(area) / 2
}

/** Guards against a "quad" that is really a sliver. */
function hasUsableSideLengths(corners) {
  const minimum = 24
  for (let i = 0; i < corners.length; i += 1) {
    const a = corners[i]
    const b = corners[(i + 1) % corners.length]
    if (Math.hypot(b.x - a.x, b.y - a.y) < minimum) return false
  }
  return true
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}
