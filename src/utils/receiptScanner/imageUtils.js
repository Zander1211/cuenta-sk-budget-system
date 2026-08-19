/**
 * Shared canvas helpers for the receipt scanner.
 *
 * Everything here is plain Canvas 2D and typed arrays. OpenCV.js would give us
 * the same operations, but it ships roughly 9MB of WASM, which is a poor trade
 * on the mid-range Android phones this module has to run on. The handful of
 * operations we actually need (Sobel, Otsu, homography, box blur, adaptive
 * threshold) are implemented directly and stay well under 30KB.
 */

/** Longest edge we keep for OCR. Beyond this, detail gains stop paying for the
 *  processing time and memory, and Tesseract does not read any better. */
export const MAX_PROCESS_DIMENSION = 1800

/** Working size for analysis passes. Detection does not need full resolution,
 *  and running it small is what keeps the interface responsive. */
export const ANALYSIS_DIMENSION = 480

/**
 * Loads a File, Blob or object URL into an ImageBitmap, honouring EXIF
 * orientation where the browser supports it.
 *
 * @param {File|Blob} source
 * @returns {Promise<ImageBitmap>}
 */
export async function loadBitmap(source) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(source, { imageOrientation: 'from-image' })
    } catch {
      // Safari below 17 rejects the options bag; fall through to the plain call.
      try {
        return await createImageBitmap(source)
      } catch {
        /* fall through to the <img> path */
      }
    }
  }

  const url = URL.createObjectURL(source)
  try {
    const image = await new Promise((resolve, reject) => {
      const element = new Image()
      element.onload = () => resolve(element)
      element.onerror = () => reject(new Error('The image could not be decoded.'))
      element.src = url
    })
    return image
  } finally {
    // Revoked on the next tick so the decode has certainly finished reading it.
    setTimeout(() => URL.revokeObjectURL(url), 0)
  }
}

/**
 * Creates a canvas, preferring OffscreenCanvas where it exists.
 *
 * @param {number} width
 * @param {number} height
 * @returns {HTMLCanvasElement|OffscreenCanvas}
 */
export function createCanvas(width, height) {
  if (typeof OffscreenCanvas === 'function') {
    return new OffscreenCanvas(Math.max(1, Math.round(width)), Math.max(1, Math.round(height)))
  }
  return createDomCanvas(width, height)
}

/**
 * A real DOM canvas, for the operations OffscreenCanvas cannot do.
 *
 * `OffscreenCanvas` has no `toDataURL`; it only offers the async
 * `convertToBlob`. Anything that needs a synchronous data URL has to go
 * through here instead of `createCanvas`.
 *
 * @param {number} width
 * @param {number} height
 * @returns {HTMLCanvasElement}
 */
export function createDomCanvas(width, height) {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width))
  canvas.height = Math.max(1, Math.round(height))
  return canvas
}

/**
 * Draws a source into ImageData at a bounded size.
 *
 * @param {ImageBitmap|HTMLImageElement|HTMLCanvasElement} source
 * @param {number} maxDimension
 * @returns {{imageData: ImageData, scale: number}} `scale` maps result
 *   coordinates back onto the source.
 */
export function toImageData(source, maxDimension) {
  const sourceWidth = source.width
  const sourceHeight = source.height
  const longest = Math.max(sourceWidth, sourceHeight)
  const scale = maxDimension && longest > maxDimension ? maxDimension / longest : 1

  const width = Math.max(1, Math.round(sourceWidth * scale))
  const height = Math.max(1, Math.round(sourceHeight * scale))

  const canvas = createCanvas(width, height)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(source, 0, 0, width, height)

  return { imageData: ctx.getImageData(0, 0, width, height), scale }
}

/**
 * Renders ImageData to a Blob.
 *
 * @param {ImageData} imageData
 * @param {{type?: string, quality?: number}} [options]
 * @returns {Promise<Blob>}
 */
export async function imageDataToBlob(imageData, { type = 'image/jpeg', quality = 0.92 } = {}) {
  const canvas = createCanvas(imageData.width, imageData.height)
  const ctx = canvas.getContext('2d')
  ctx.putImageData(imageData, 0, 0)

  if (typeof canvas.convertToBlob === 'function') {
    return canvas.convertToBlob({ type, quality })
  }
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      blob => (blob ? resolve(blob) : reject(new Error('The scan could not be encoded.'))),
      type,
      quality,
    )
  })
}

/**
 * Renders ImageData to an object URL for an `<img>` preview.
 *
 * Object URLs rather than data URLs: a 1800px scan encodes to well over a
 * megabyte of base64, and holding several of those as JavaScript strings on a
 * phone is wasteful. The caller owns the returned URL and must revoke it.
 *
 * @param {ImageData} imageData
 * @param {{type?: string, quality?: number}} [options]
 * @returns {Promise<string>}
 */
export async function imageDataToObjectURL(imageData, options = {}) {
  const blob = await imageDataToBlob(imageData, { type: 'image/jpeg', quality: 0.9, ...options })
  return URL.createObjectURL(blob)
}

/**
 * Renders ImageData to a data URL.
 *
 * Uses a DOM canvas explicitly. `createCanvas` prefers OffscreenCanvas, which
 * has no `toDataURL` at all, so routing this through it silently returned null
 * on every modern browser.
 */
export function imageDataToDataURL(imageData, type = 'image/jpeg', quality = 0.9) {
  const canvas = createDomCanvas(imageData.width, imageData.height)
  const ctx = canvas.getContext('2d')
  ctx.putImageData(imageData, 0, 0)
  return canvas.toDataURL(type, quality)
}

/**
 * Luminance plane as a Uint8ClampedArray, using Rec. 601 weights.
 *
 * @param {ImageData} imageData
 * @returns {Uint8ClampedArray}
 */
export function toGrayscale(imageData) {
  const { data, width, height } = imageData
  const gray = new Uint8ClampedArray(width * height)
  for (let i = 0, p = 0; p < gray.length; i += 4, p += 1) {
    gray[p] = (data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000
  }
  return gray
}

/**
 * Separable box blur over a single plane. Two passes of this approximate a
 * Gaussian closely enough for illumination estimation, at a fraction of the
 * cost, and it is O(n) in the radius thanks to the running sum.
 *
 * @param {Uint8ClampedArray|Float32Array} plane
 * @param {number} width
 * @param {number} height
 * @param {number} radius
 * @returns {Float32Array}
 */
export function boxBlur(plane, width, height, radius) {
  if (radius < 1) return Float32Array.from(plane)

  const horizontal = new Float32Array(width * height)
  const output = new Float32Array(width * height)
  const window = radius * 2 + 1

  for (let y = 0; y < height; y += 1) {
    const row = y * width
    let sum = 0
    for (let x = -radius; x <= radius; x += 1) {
      sum += plane[row + Math.min(width - 1, Math.max(0, x))]
    }
    for (let x = 0; x < width; x += 1) {
      horizontal[row + x] = sum / window
      const outgoing = plane[row + Math.min(width - 1, Math.max(0, x - radius))]
      const incoming = plane[row + Math.min(width - 1, Math.max(0, x + radius + 1))]
      sum += incoming - outgoing
    }
  }

  for (let x = 0; x < width; x += 1) {
    let sum = 0
    for (let y = -radius; y <= radius; y += 1) {
      sum += horizontal[Math.min(height - 1, Math.max(0, y)) * width + x]
    }
    for (let y = 0; y < height; y += 1) {
      output[y * width + x] = sum / window
      const outgoing = horizontal[Math.min(height - 1, Math.max(0, y - radius)) * width + x]
      const incoming = horizontal[Math.min(height - 1, Math.max(0, y + radius + 1)) * width + x]
      sum += incoming - outgoing
    }
  }

  return output
}

/**
 * Otsu's method: the threshold that minimises intra-class variance.
 *
 * @param {Uint8ClampedArray|Float32Array} plane
 * @returns {number} threshold in 0..255
 */
export function otsuThreshold(plane) {
  const histogram = new Float64Array(256)
  for (let i = 0; i < plane.length; i += 1) {
    histogram[Math.min(255, Math.max(0, Math.round(plane[i])))] += 1
  }

  const total = plane.length
  let sum = 0
  for (let i = 0; i < 256; i += 1) sum += i * histogram[i]

  let sumBackground = 0
  let weightBackground = 0
  let best = 0
  let bestVariance = -1

  for (let t = 0; t < 256; t += 1) {
    weightBackground += histogram[t]
    if (weightBackground === 0) continue
    const weightForeground = total - weightBackground
    if (weightForeground === 0) break

    sumBackground += t * histogram[t]
    const meanBackground = sumBackground / weightBackground
    const meanForeground = (sum - sumBackground) / weightForeground
    const variance = weightBackground * weightForeground * (meanBackground - meanForeground) ** 2

    if (variance > bestVariance) {
      bestVariance = variance
      best = t
    }
  }

  return best
}

/** Yields to the event loop so long pixel passes never lock the interface. */
export function yieldToBrowser() {
  return new Promise(resolve => {
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => resolve())
    else setTimeout(resolve, 0)
  })
}

/** Releases an ImageBitmap if the platform supports explicit disposal. */
export function releaseBitmap(bitmap) {
  if (bitmap && typeof bitmap.close === 'function') bitmap.close()
}
