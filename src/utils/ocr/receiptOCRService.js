/**
 * OCR text recognition.
 *
 * Kept strictly separate from the scanner: this module receives an already
 * corrected and enhanced image and returns text. It knows nothing about
 * cropping, filters or storage, and the scanner knows nothing about Tesseract.
 *
 * Tesseract ships a worker plus a language model of roughly 15MB. It is loaded
 * on first use and never as part of the main bundle, so a user who only views
 * receipts never downloads it.
 */

let workerPromise = null

/**
 * Creates (or reuses) the Tesseract worker.
 *
 * The worker is cached for the page's lifetime because initialisation is the
 * expensive part; recognising a second receipt afterwards is fast.
 *
 * @param {(status: string, progress: number) => void} [onProgress]
 */
async function getWorker(onProgress) {
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker } = await import('tesseract.js')
      return createWorker('eng', 1, {
        logger: message => {
          if (!onProgress) return
          if (typeof message.progress === 'number') {
            onProgress(message.status || 'recognizing text', message.progress)
          }
        },
      })
    })().catch(error => {
      // Do not cache a failed init, or every retry inherits the failure.
      workerPromise = null
      throw error
    })
  }
  return workerPromise
}

/**
 * Runs OCR over a scan.
 *
 * @param {Blob|HTMLCanvasElement|string} image the processed scan
 * @param {{onProgress?: (status: string, progress: number) => void}} [options]
 * @returns {Promise<{text: string, confidence: number, words: Array}>}
 */
export async function recognizeReceipt(image, { onProgress } = {}) {
  const worker = await getWorker(onProgress)
  const { data } = await worker.recognize(image)

  return {
    text: data.text || '',
    confidence: typeof data.confidence === 'number' ? data.confidence : 0,
    words: data.words || [],
  }
}

/**
 * Recognises against the enhanced scan, and falls back to the minimally
 * processed image when the enhanced pass reads poorly.
 *
 * Enhancement usually helps OCR a great deal, but on a faint carbon copy an
 * aggressive filter can thin strokes past the point of recognition. Comparing
 * the two and keeping the better result costs one extra pass and removes that
 * failure mode entirely.
 *
 * @param {{enhanced: Blob, fallback?: Blob}} images
 * @param {{onProgress?: Function, confidenceFloor?: number}} [options]
 * @returns {Promise<{text: string, confidence: number, usedFallback: boolean}>}
 */
export async function recognizeWithFallback({ enhanced, fallback }, options = {}) {
  const { onProgress, confidenceFloor = 55 } = options

  const primary = await recognizeReceipt(enhanced, { onProgress })

  const looksWeak =
    primary.confidence < confidenceFloor || primary.text.replace(/\s/g, '').length < 12

  if (!looksWeak || !fallback) {
    return { ...primary, usedFallback: false }
  }

  try {
    const secondary = await recognizeReceipt(fallback, { onProgress })
    if (secondary.confidence > primary.confidence) {
      return { ...secondary, usedFallback: true }
    }
  } catch (error) {
    console.warn('Fallback OCR pass failed; keeping the enhanced result.', error)
  }

  return { ...primary, usedFallback: false }
}

/**
 * Shuts the worker down. Called when the scanner closes so the wasm heap and
 * its thread are not held for the rest of the session.
 */
export async function terminateOCR() {
  if (!workerPromise) return
  const pending = workerPromise
  workerPromise = null
  try {
    const worker = await pending
    await worker.terminate()
  } catch {
    /* Already gone; nothing to release. */
  }
}
