/**
 * Structured extraction from official receipt text.
 *
 * The single hard rule: a field that is blank or unreadable on the paper comes
 * back as null. This module never substitutes today's date for a missing date,
 * never falls back to the expense's own amount, and never guesses a payee. A
 * null tells the reviewer "read this off the scan yourself", which is correct;
 * a plausible invention would quietly become verified financial metadata.
 */

/** Line labels as they appear on Philippine official receipt forms. */
const LABELS = {
  receiptNumber: /(?:^|\b)(?:no|nº|num|number)\s*[.:]?\s*([A-Z0-9][A-Z0-9/-]{1,19})\b/i,
  receivedFrom: /received\s*from\s*[:.]?\s*(.+)/i,
  date: /\bdate\s*[:.]?\s*(.+)/i,
  telephone: /(?:tel|telephone|phone|contact)\s*(?:no)?\s*[.:]?\s*([0-9()+\-\s]{7,20})/i,
  address: /\baddress\s*[:.]?\s*(.+)/i,
  total: /\btotal\b(?!\s*in\s*cash)[^0-9-]{0,24}([0-9][0-9,\s]*(?:\.\d{1,2})?)/i,
  totalCashCheque: /total\s+in\s+cash\s+and\s+che(?:que|ck)[^0-9-]{0,24}([0-9][0-9,\s]*(?:\.\d{1,2})?)/i,
  cash: /\bcash\b(?!\s*and)[^0-9-]{0,24}([0-9][0-9,\s]*(?:\.\d{1,2})?)/i,
  cheque: /\bche(?:que|ck)\b(?:\s*(?:amount|amt))?[^0-9-]{0,24}([0-9][0-9,\s]*(?:\.\d{1,2})?)/i,
  chequeNumber: /che(?:que|ck)\s*(?:no|number|#)\s*[.:]?\s*([A-Z0-9-]{3,20})/i,
  bank: /\bbank\s*[:.]?\s*([A-Za-z][A-Za-z .&'-]{2,40})/i,
  receiver: /\breceiv(?:ed\s*by|er)\s*[:.]?\s*(.+)/i,
}

/** Words that mean "this line is a blank ruled field", not a value. */
const BLANK_PATTERN = /^[\s._\-–—=|:]*$/

const MONTHS = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
  may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8,
  sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11,
  dec: 12, december: 12,
}

/**
 * @typedef {object} ParsedReceipt
 * @property {string|null} organization
 * @property {string|null} address
 * @property {string|null} telephone
 * @property {string|null} receiptNumber
 * @property {string|null} receivedFrom
 * @property {string|null} date ISO yyyy-mm-dd
 * @property {Array<{description: string, amount: number|null}>} particulars
 * @property {number|null} totalAmount
 * @property {number|null} cashAmount
 * @property {string|null} bank
 * @property {string|null} chequeNumber
 * @property {number|null} chequeAmount
 * @property {number|null} totalCashAndCheque
 * @property {string|null} receiver
 * @property {string[]} lowConfidenceFields fields the reviewer should check
 */

/**
 * Parses recognised text into receipt fields.
 *
 * @param {string} rawText
 * @param {{confidence?: number}} [meta]
 * @returns {ParsedReceipt}
 */
export function parseReceiptText(rawText, meta = {}) {
  const text = (rawText || '').replace(/\r/g, '')
  const lines = text
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)

  const result = {
    organization: findOrganization(lines),
    address: cleanValue(matchFirst(lines, LABELS.address)),
    telephone: cleanValue(matchFirst(lines, LABELS.telephone)),
    receiptNumber: cleanValue(findReceiptNumber(lines)),
    receivedFrom: cleanValue(matchFirst(lines, LABELS.receivedFrom)),
    date: parseDate(cleanValue(matchFirst(lines, LABELS.date))),
    particulars: findParticulars(lines),
    totalAmount: parseAmount(matchFirst(lines, LABELS.total)),
    cashAmount: parseAmount(matchFirst(lines, LABELS.cash)),
    bank: cleanValue(matchFirst(lines, LABELS.bank)),
    chequeNumber: cleanValue(matchFirst(lines, LABELS.chequeNumber)),
    chequeAmount: parseAmount(matchFirst(lines, LABELS.cheque)),
    totalCashAndCheque: parseAmount(matchFirst(lines, LABELS.totalCashCheque)),
    receiver: cleanValue(matchFirst(lines, LABELS.receiver)),
    lowConfidenceFields: [],
  }

  // A cheque number matched by the generic cheque-amount pattern is a false
  // positive; drop the amount rather than record a receipt number as pesos.
  if (result.chequeAmount !== null && result.chequeNumber && String(result.chequeAmount) === result.chequeNumber) {
    result.chequeAmount = null
  }

  result.lowConfidenceFields = flagForReview(result, meta.confidence)
  return result
}

/**
 * Fields worth a second look. This drives the review UI's highlighting; it
 * never changes a value.
 */
function flagForReview(parsed, confidence) {
  const flagged = []

  if (typeof confidence === 'number' && confidence < 70) flagged.push('all')
  if (parsed.receiptNumber === null) flagged.push('receiptNumber')
  if (parsed.receivedFrom === null) flagged.push('receivedFrom')
  if (parsed.date === null) flagged.push('date')
  if (parsed.totalAmount === null) flagged.push('totalAmount')

  // An arithmetic disagreement is the most useful signal we can surface: it
  // means OCR misread at least one of the two numbers.
  const { totalAmount, cashAmount, chequeAmount } = parsed
  if (totalAmount !== null && cashAmount !== null && chequeAmount !== null) {
    if (Math.abs(cashAmount + chequeAmount - totalAmount) > 0.5) flagged.push('totals-disagree')
  }

  return flagged
}

/** The organisation name is conventionally the first substantial line. */
function findOrganization(lines) {
  for (const line of lines.slice(0, 4)) {
    const normalized = line.replace(/[^A-Za-z0-9 &.,'-]/g, '').trim()
    if (normalized.length < 6) continue
    if (/official\s*receipt/i.test(normalized)) continue
    if (/^(?:no|date|address|tel)\b/i.test(normalized)) continue
    return normalized
  }
  return null
}

/**
 * Receipt numbers are searched near the "No." label only, and rejected when
 * they look like a date or a money amount, which are the two things this
 * pattern otherwise loves to capture.
 */
function findReceiptNumber(lines) {
  for (const line of lines) {
    if (/received\s*from/i.test(line)) continue
    const match = line.match(LABELS.receiptNumber)
    if (!match) continue

    const candidate = match[1].trim()
    if (/^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/.test(candidate)) continue
    if (/^\d{1,3}(,\d{3})+(\.\d{2})?$/.test(candidate)) continue
    if (/^\d+\.\d{2}$/.test(candidate)) continue
    return candidate
  }
  return null
}

/**
 * Rows of the particulars table: a description followed by a trailing amount.
 * Header, rule and total rows are excluded so the table body stays clean.
 */
function findParticulars(lines) {
  const rows = []
  let inTable = false

  for (const line of lines) {
    if (/particular/i.test(line) && /amount/i.test(line)) {
      inTable = true
      continue
    }
    if (!inTable) continue
    if (/\btotal\b/i.test(line)) break
    if (BLANK_PATTERN.test(line)) continue

    const match = line.match(/^(.*?[A-Za-z].*?)\s+([0-9][0-9,\s]*(?:\.\d{1,2})?)\s*$/)
    if (match) {
      const description = match[1].replace(/[|_]+/g, ' ').trim()
      if (description.length >= 2) {
        rows.push({ description, amount: parseAmount(match[2]) })
      }
      continue
    }

    const descriptionOnly = line.replace(/[|_]+/g, ' ').trim()
    if (descriptionOnly.length >= 3 && /[A-Za-z]{3}/.test(descriptionOnly)) {
      rows.push({ description: descriptionOnly, amount: null })
    }
  }

  return rows.slice(0, 12)
}

function matchFirst(lines, pattern) {
  for (const line of lines) {
    const match = line.match(pattern)
    if (match && match[1]) return match[1]
  }
  return null
}

/** Strips ruled-line filler and rejects values that are only punctuation. */
function cleanValue(value) {
  if (value === null || value === undefined) return null
  const cleaned = String(value)
    .replace(/[_]{2,}/g, ' ')
    .replace(/[.]{3,}/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s:._\-–—|]+|[\s:._\-–—|]+$/g, '')
    .trim()

  if (!cleaned || BLANK_PATTERN.test(cleaned)) return null
  if (cleaned.length < 2) return null
  return cleaned
}

/**
 * Amount parsing. Returns null rather than 0 for an unreadable figure, because
 * zero is a legitimate value and must not be manufactured.
 */
export function parseAmount(value) {
  if (value === null || value === undefined) return null

  const cleaned = String(value)
    .replace(/[₱P]/gi, '')
    .replace(/[,\s]/g, '')
    .trim()

  if (!cleaned || !/^\d+(\.\d{1,2})?$/.test(cleaned)) return null

  const amount = Number(cleaned)
  if (!Number.isFinite(amount)) return null
  // Beyond this a "total" is almost certainly a misread receipt or phone number.
  if (amount > 100_000_000) return null
  return amount
}

/**
 * Date parsing for the formats these receipts actually use. Anything not
 * confidently recognised returns null.
 *
 * @returns {string|null} ISO yyyy-mm-dd
 */
export function parseDate(value) {
  if (!value) return null
  const text = String(value).trim()

  // "August 19, 2026" / "19 August 2026"
  const named = text.match(/([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})/)
    || text.match(/(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\.?,?\s+(\d{4})/)

  if (named) {
    const isMonthFirst = Number.isNaN(Number(named[1]))
    const monthName = (isMonthFirst ? named[1] : named[2]).toLowerCase()
    const day = Number(isMonthFirst ? named[2] : named[1])
    const year = Number(named[3])
    const month = MONTHS[monthName]
    if (month && day >= 1 && day <= 31) return toISO(year, month, day)
  }

  // 19/08/2026 or 08-19-2026. Ambiguous when both parts are 12 or under, so
  // the day-first reading is preferred, matching Philippine convention.
  const numeric = text.match(/(\d{1,4})[/\-.](\d{1,2})[/\-.](\d{1,4})/)
  if (numeric) {
    let [, first, second, third] = numeric.map(Number)

    if (String(numeric[1]).length === 4) {
      return toISO(first, second, third)
    }
    if (String(numeric[3]).length === 4) {
      const day = first > 12 ? first : second > 12 ? second : first
      const month = first > 12 ? second : second > 12 ? first : second
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31) return toISO(third, month, day)
    }
  }

  return null
}

function toISO(year, month, day) {
  if (!year || !month || !day) return null
  if (year < 1900 || year > 2200) return null
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  const date = new Date(Date.UTC(year, month - 1, day))
  // Rejects impossible dates such as 31 February, which the constructor rolls over.
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}
