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
  time: /\btime\s*[:.]?\s*((?:[01]?\d|2[0-3]):[0-5]\d(?:\s*[ap]m)?)/i,
  telephone: /(?:tel|telephone|phone|contact)\s*(?:no)?\s*[.:]?\s*([0-9()+\-\s]{7,20})/i,
  address: /\baddress\s*[:.]?\s*(.+)/i,
  tin: /\b(?:tin|tax\s+identification\s+number)\s*(?:no|number)?\s*[.:#]?\s*([0-9][0-9\-\s]{7,24})/i,
  subtotal: /\bsub\s*total\b[^0-9-]{0,24}([0-9][0-9,\s]*(?:\.\d{1,2})?)/i,
  vat: /\b(?:vat(?:\s*amount)?|tax\s*amount)\b[^0-9-]{0,24}([0-9][0-9,\s]*(?:\.\d{1,2})?)/i,
  discount: /\bdiscount\b[^0-9-]{0,24}([0-9][0-9,\s]*(?:\.\d{1,2})?)/i,
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
 * @property {string|null} tin
 * @property {string|null} telephone
 * @property {string|null} receiptNumber
 * @property {string|null} receivedFrom
 * @property {string|null} date ISO yyyy-mm-dd
 * @property {string|null} time
 * @property {Array<{description: string, amount: number|null}>} particulars
 * @property {number|null} totalAmount
 * @property {number|null} subtotal
 * @property {number|null} vatAmount
 * @property {number|null} discount
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

  const totalResolution = resolveGrandTotal(lines)
  const result = {
    organization: findOrganization(lines),
    address: cleanValue(matchFirst(lines, LABELS.address)),
    tin: cleanValue(matchFirst(lines, LABELS.tin)),
    telephone: cleanValue(matchFirst(lines, LABELS.telephone)),
    receiptNumber: cleanValue(findReceiptNumber(lines)),
    receivedFrom: cleanValue(matchFirst(lines, LABELS.receivedFrom)),
    date: parseDate(cleanValue(matchFirst(lines, LABELS.date))),
    time: cleanValue(matchFirst(lines, LABELS.time)),
    particulars: findParticulars(lines),
    subtotal: parseAmount(matchFirst(lines, LABELS.subtotal)),
    vatAmount: parseAmount(matchFirst(lines, LABELS.vat)),
    discount: parseAmount(matchFirst(lines, LABELS.discount)),
    totalAmount: totalResolution.selected?.amount ?? null,
    cashAmount: parseAmount(matchFirst(lines, LABELS.cash)),
    bank: cleanValue(matchFirst(lines, LABELS.bank)),
    chequeNumber: cleanValue(matchFirst(lines, LABELS.chequeNumber)),
    chequeAmount: parseAmount(matchFirst(lines, LABELS.cheque)),
    totalCashAndCheque: parseAmount(matchFirst(lines, LABELS.totalCashCheque)),
    receiver: cleanValue(matchFirst(lines, LABELS.receiver)),
    amountCandidates: totalResolution.candidates,
    selectedTotalCandidate: totalResolution.selected,
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
  if (parsed.selectedTotalCandidate && parsed.selectedTotalCandidate.score < 100) {
    flagged.push('totalAmount')
  }

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

const MONEY_CONTEXT = /\b(?:grand\s+total|total|amount\s+due|balance\s+due|payable|cash|tendered|change|sub\s*total|vat|tax|discount|amount)\b/i
const EXCLUDED_TOTAL_CONTEXT = /\b(?:sub\s*total|cash|tendered|received|change|vat|tax|discount|quantity|qty|unit\s*price|che(?:que|ck))\b/i

/**
 * Selects only a clearly labelled final payable amount. A largest-number
 * fallback is intentionally forbidden because cash tendered, change, phone
 * numbers and TIN values are often larger than the actual receipt total.
 */
function resolveGrandTotal(lines) {
  const candidates = []

  lines.forEach((line, lineIndex) => {
    if (!MONEY_CONTEXT.test(line)) return

    const classification = classifyTotalLine(line)
    const matches = monetaryMatches(line)
    const afterLabel = matches.findIndex(match => (match.index ?? 0) >= classification.labelEnd)
    const selectedMatchIndex = afterLabel

    matches.forEach((match, amountIndex) => {
      const amount = parseAmount(match[1])
      if (amount === null || amount <= 0) return

      const eligible = classification.score > 0 && amountIndex === selectedMatchIndex
      candidates.push({
        lineIndex,
        amountIndex,
        line: line.slice(0, 240),
        amount,
        label: classification.label,
        score: eligible ? classification.score : 0,
        eligible,
      })
    })

    // OCR engines sometimes split a two-column "GRAND TOTAL | 6,222" row
    // across adjacent lines. A numeric-only following line is safe to pair
    // with the label; a labelled CASH/CHANGE/VAT line is deliberately rejected.
    if (classification.score > 0 && selectedMatchIndex < 0 && lineIndex + 1 < lines.length) {
      const followingLine = lines[lineIndex + 1]
      if (!EXCLUDED_TOTAL_CONTEXT.test(followingLine)) {
        const followingMatches = monetaryMatches(followingLine)
        const first = followingMatches[0]
        const amount = parseAmount(first?.[1])
        const nonAmountText = first
          ? followingLine.replace(first[0], '').replace(/[^A-Za-z]/g, '')
          : ''
        if (amount !== null && amount > 0 && !nonAmountText) {
          candidates.push({
            lineIndex: lineIndex + 1,
            amountIndex: 0,
            line: `${line.slice(0, 120)} | ${followingLine.slice(0, 120)}`,
            amount,
            label: classification.label,
            score: classification.score - 5,
            eligible: true,
          })
        }
      }
    }
  })

  const selected = candidates
    .filter(candidate => candidate.eligible)
    .sort((a, b) => (
      b.score - a.score
      || b.lineIndex - a.lineIndex
      || b.amountIndex - a.amountIndex
    ))[0] || null

  return { candidates, selected }
}

function classifyTotalLine(line) {
  const normalized = String(line || '').trim()
  const labelled = (pattern, label, score) => {
    const match = pattern.exec(normalized)
    return match
      ? {
          label,
          score,
          labelEnd: (match.index ?? 0) + match[0].length,
        }
      : null
  }

  return labelled(/\bgrand\s+total\b/i, 'grand-total', 130)
    || labelled(/\b(?:total\s+amount\s+due|total\s+due)\b/i, 'total-due', 125)
    || labelled(/\b(?:amount\s+due|balance\s+due)\b/i, 'amount-due', 120)
    || labelled(/\b(?:total\s+(?:amount\s+)?payable|amount\s+payable)\b/i, 'total-payable', 115)
    || labelled(/\b(?:net\s+total|net\s+amount)\b/i, 'net-total', 110)
    || (EXCLUDED_TOTAL_CONTEXT.test(normalized)
      ? { label: 'excluded-context', score: 0, labelEnd: normalized.length }
      : null)
    || labelled(/^(?:[^A-Za-z0-9]{0,4})total(?:\s+amount)?\b/i, 'total', 90)
    || { label: 'unclassified', score: 0, labelEnd: normalized.length }
}

function monetaryMatches(line) {
  return [...String(line || '').matchAll(/(?:₱|PHP|P)?\s*([0-9O][0-9O,\s]*(?:\.\s*[0-9O]{1,2})?)/gi)]
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
    .replace(/[Oo]/g, '0')
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
