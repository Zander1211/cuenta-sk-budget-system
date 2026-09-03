// analytics.js — Deterministic financial calculation layer for the Analysis module.
// These functions are the single source of truth. AI only *interprets* these numbers;
// it never recalculates or invents values.
import { getRecordPeriod } from './budgetUtils'

export const MONTHS_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

export const MONTHS_FULL = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export const monthOptions = MONTHS_FULL.map((label, i) => ({ value: i + 1, label }))

// ---------- Chart palette ----------
// These are literal values: category hues are intentionally separated, while
// the semantic roles map to --accent, --warn, --negative, --line-strong and
// --surface-2.
//
// They stay literal rather than var(): the PDF export rasterises the chart
// with html2canvas, which does not resolve custom properties inside SVG
// presentation attributes, so a var() here exports as a black shape.
//
// Category charts need hue as well as lightness separation. These tones are
// deliberately dark enough to support white data labels inside pie slices.
// 14 slots so a barangay-scale budget (a handful of real categories today,
// room for several more later) never has to repeat a hue before every slot
// is used.
export const CATEGORY_COLORS = [
  '#2563EB', // blue
  '#16A34A', // green
  '#EA580C', // orange
  '#0D9488', // teal
  '#DC2626', // red
  '#7C3AED', // purple
  '#CA8A04', // amber
  '#DB2777', // pink
  '#78350F', // brown
  '#64748B', // gray
  '#0891B2', // cyan
  '#4338CA', // indigo
  '#65A30D', // lime
  '#9333EA', // violet
]

// Every category name Cuenta actually produces — the SK budget request
// dropdown (Sports/Education/Community Programs/Environment/Other),
// Payroll (set as the literal category for payroll requests, see
// NewRequestPage), and the extra buckets from the original spec's example
// table — gets a hand-picked, PERMANENT color here. That's what keeps a
// category's color identical everywhere (dashboard, every Analysis chart,
// the exported PDF) and across every refresh/month/year: the color is keyed
// to the name, never to the category's rank or position in whichever list
// happens to be rendered this time.
//
// Matched case-insensitively. Every value below is unique — including the
// legacy synonym rows — except where two keys are literally the same
// concept (a plural, or "other"/"uncategorized" naming the same misc
// bucket), which intentionally share a color since they're never two
// distinct slices on the same chart.
const CATEGORY_COLOR_BY_NAME = {
  sports: '#2563EB',
  education: '#16A34A',
  'community programs': '#EA580C',
  environment: '#0D9488',
  payroll: '#0891B2',
  health: '#DC2626',
  livelihood: '#7C3AED',
  'disaster preparedness': '#CA8A04',
  'youth development': '#DB2777',
  'culture & arts': '#78350F',
  'culture and arts': '#78350F',
  other: '#64748B',
  others: '#64748B',
  uncategorized: '#4338CA',
  // Legacy category strings from older records/exports.
  project: '#2563EB',
  projects: '#2563EB',
  event: '#16A34A',
  events: '#16A34A',
  'additional expense': '#DC2626',
  'additional expenses': '#DC2626',
  'remaining budget': '#0D9488',
}

// Stable string hash (djb2-ish) used only as a fallback for a category name
// with no hand-picked color above — e.g. a brand-new category added to the
// request form later. Hashing the NAME (not its position in whatever list
// happens to be rendered) is what makes the fallback color permanent too:
// the same unrecognized name always lands on the same palette slot, on
// every refresh and for every month/year, instead of drifting with sort
// order the way an index-based pick would.
function hashCategoryName(name) {
  let hash = 5381
  for (let i = 0; i < name.length; i += 1) {
    hash = ((hash * 33) ^ name.charCodeAt(i)) | 0
  }
  return Math.abs(hash)
}

// Fixed semantic roles across Budget vs Actual / Monthly Trend / Utilization.
// Budget and actual sit at opposite ends of the ramp so the pair separates
// even at bar widths of a few pixels.
export const CHART_COLORS = {
  budget: '#02353C',      // --c1
  actual: '#2EAF7D',      // --c4
  primaryLine: '#0E6B4D', // --accent
  averageLine: '#B4CBC5', // --line-strong
  remaining: '#EAF2EF',   // --surface-2, the unfilled track
  warning: '#9A5B12',     // --warn
  danger: '#A32C1C',      // --negative
}

// Chart furniture: axes, gridlines, dot centres, hover cursor. One set, so
// every chart in the module sits on the same grid at the same weight.
export const CHART_INK = {
  tick: '#5F7B79',        // --ink-3, 4.6:1 on white
  grid: '#D5E3DE',        // --line
  surface: '#FFFFFF',     // --surface
  muted: '#B4CBC5',       // --line-strong, for comparison series
  cursor: 'rgba(14, 107, 77, 0.06)',
}

// Peso axis ticks. Steps the unit with the magnitude so a barangay-scale
// chart keeps its precision instead of rendering an axis of zeros:
// `(v/1000).toFixed(0)` printed "₱0k" for every amount under a thousand.
export function pesoTick(v) {
  const n = Math.abs(v)
  if (n >= 1_000_000) return `₱${(v / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`
  if (n >= 1_000) return `₱${(v / 1_000).toFixed(n >= 10_000 ? 0 : 1)}k`
  return `₱${v}`
}

/**
 * Resolves a single, permanent color for one category name. `index` is kept
 * only as a last-resort fallback for a blank name — it must never be used
 * as the primary key, or the same category would recolor whenever its
 * rank/position shifts between different categories or a different
 * month/year's data (which is exactly the bug this replaced: two
 * categories could land on the same index, and therefore the same color,
 * purely by coincidence of sort order).
 *
 * For coloring several categories on the SAME chart, prefer
 * `assignCategoryColors` instead — it also guarantees no two of THOSE
 * categories collide, which a single name-hash lookup alone can't promise
 * for two unrecognized names.
 */
export function colorForCategory(name, index = 0) {
  const normalizedName = String(name || '').trim().toLowerCase()
  if (!normalizedName) return CATEGORY_COLORS[index % CATEGORY_COLORS.length]
  return CATEGORY_COLOR_BY_NAME[normalizedName]
    || CATEGORY_COLORS[hashCategoryName(normalizedName) % CATEGORY_COLORS.length]
}

/**
 * Resolves colors for a whole set of category names at once (one chart's
 * worth), returned as a Map keyed by the ORIGINAL (un-normalized) name so
 * callers can look a color up with the exact string they already have.
 *
 * Guarantees every name in `names` gets a distinct color as long as
 * `names` itself has no more entries than CATEGORY_COLORS — ties are
 * broken deterministically (alphabetical name order) so the same set of
 * categories always resolves the same way, never by first-seen/render order.
 */
export function assignCategoryColors(names) {
  const used = new Set()
  const result = new Map()

  const uniqueNames = Array.from(new Set(names || []))
  const ordered = [...uniqueNames].sort((a, b) => String(a).localeCompare(String(b)))

  ordered.forEach((name) => {
    const normalizedName = String(name || '').trim().toLowerCase()
    let color = normalizedName ? CATEGORY_COLOR_BY_NAME[normalizedName] : null

    if (!color || used.has(color)) {
      const start = hashCategoryName(normalizedName || String(name))
      for (let i = 0; i < CATEGORY_COLORS.length; i += 1) {
        const candidate = CATEGORY_COLORS[(start + i) % CATEGORY_COLORS.length]
        if (!used.has(candidate)) {
          color = candidate
          break
        }
      }
    }

    // Every palette slot is already taken (more categories than colors) —
    // fall back to the hash pick even though it repeats a color already in
    // use; there is nothing more distinct left to hand out.
    if (!color) color = CATEGORY_COLORS[hashCategoryName(normalizedName || String(name)) % CATEGORY_COLORS.length]

    used.add(color)
    result.set(name, color)
  })

  return result
}

// ---------- Normalization helpers ----------

export function normalizeAmount(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

export function parseDate(value) {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

const peso0 = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  maximumFractionDigits: 0,
})

const peso2 = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export function formatCurrency(value, { detailed = false } = {}) {
  const n = normalizeAmount(value)
  return detailed ? peso2.format(n) : peso0.format(n)
}

export function formatPercentage(value, digits = 1) {
  const n = Number(value)
  if (!Number.isFinite(n)) return '0%'
  return `${n.toFixed(digits)}%`
}

export function safeDivide(numerator, denominator) {
  const d = Number(denominator)
  if (!d || !Number.isFinite(d)) return 0
  const n = Number(numerator)
  if (!Number.isFinite(n)) return 0
  return n / d
}

// ---------- Period filtering ----------
// filters: { view: 'monthly' | 'yearly', year, month }

export function isInPeriod(dateValue, filters) {
  const date = parseDate(dateValue)
  if (!date) return false
  if (filters.view === 'monthly') {
    return date.getFullYear() === filters.year && date.getMonth() + 1 === filters.month
  }
  return date.getFullYear() === filters.year
}

// The date an expense should be counted on (mirrors useBudgetCalculations logic).
export function expenseDate(expense) {
  return expense.eventDate || expense.date || expense.approvedAt || expense.createdAt || null
}

// An expense counts toward spending if it isn't archived or cancelled.
export function isActiveExpense(expense) {
  return !expense.archivedAt && expense.status !== 'Cancelled'
}

export function isApprovedAllocation(expense) {
  return isActiveExpense(expense)
    && !expense.isAdditional
    && ['Approved', 'Released'].includes(expense.status || 'Approved')
    && (!expense.actualExpenseKind || normalizeAmount(expense.amount) > 0)
}

export function isMissingReceipt(expense) {
  return !expense.hasVerifiedReceipt && !expense.receiptUrl && !expense.receiptName
}

// Returns the previous period descriptor for comparison.
export function previousPeriod(filters) {
  if (filters.view === 'monthly') {
    const month = filters.month === 1 ? 12 : filters.month - 1
    const year = filters.month === 1 ? filters.year - 1 : filters.year
    return { view: 'monthly', year, month }
  }
  return { view: 'yearly', year: filters.year - 1, month: null }
}

// ---------- Core selectors ----------

export function filterExpenses(expenses, filters) {
  const seen = new Set()
  return (expenses || []).filter((expense) => {
    if (!isApprovedAllocation(expense)) return false
    const period = getRecordPeriod(expense)
    if (!period || period.year !== Number(filters.year)) return false
    if (filters.view === 'monthly' && period.month !== Number(filters.month)) return false

    const key = expense.requestId ? `request:${expense.requestId}` : `expense:${expense.id}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function filterBudgets(budgets, filters) {
  return (budgets || []).filter((b) => {
    if (Number(b.year) !== Number(filters.year)) return false
    if (filters.view === 'monthly') return Number(b.month) === Number(filters.month)
    return true
  })
}

export function sumAmount(rows) {
  return (rows || []).reduce((sum, r) => sum + normalizeAmount(r.amount), 0)
}

// ---------- Performance / status logic ----------

// utilizationRate 0..(>100). Thresholds per spec section 7.
export function getPerformance(utilizationRate) {
  const r = Number(utilizationRate) || 0
  if (r > 100) return { label: 'Over Budget', tone: 'danger', message: 'Spending has exceeded the selected budget.' }
  if (r >= 95) return { label: 'Critical', tone: 'danger', message: 'The selected period is critically close to its budget limit.' }
  if (r >= 80) return { label: 'Near Limit', tone: 'warning', message: 'The selected period is approaching its budget limit.' }
  if (r >= 60) return { label: 'Good', tone: 'positive', message: 'Spending is on a healthy track for the period.' }
  return { label: 'Healthy', tone: 'positive', message: 'You are well within the healthy budget range.' }
}

// Variance for a budget/spending pair. Positive variance = under budget (money left).
export function calculateVariance(budget, spending) {
  const b = normalizeAmount(budget)
  const s = normalizeAmount(spending)
  const amount = b - s // remaining
  const percentUsed = b > 0 ? (s / b) * 100 : (s > 0 ? Infinity : 0)
  let status
  if (b <= 0 && s > 0) status = 'Over Budget'
  else if (percentUsed > 100) status = 'Over Budget'
  else if (percentUsed >= 95) status = 'Near Limit'
  else if (percentUsed >= 98 && percentUsed <= 102) status = 'On Budget'
  else if (percentUsed >= 90) status = 'Near Limit'
  else status = 'Under Budget'
  return { amount, spending: s, budget: b, percentUsed: Number.isFinite(percentUsed) ? percentUsed : 100, status }
}

export function statusTone(status) {
  switch (status) {
    case 'Over Budget': return 'danger'
    case 'Near Limit': return 'warning'
    case 'On Budget': return 'neutral'
    case 'Fully Utilized': return 'warning'
    case 'Under Budget': return 'positive'
    default: return 'neutral'
  }
}

// Utilization status for progress bars (spec section 11).
export function utilizationStatus(rate) {
  const r = Number(rate) || 0
  if (r > 100) return 'Over Budget'
  if (r >= 100) return 'Fully Utilized'
  if (r >= 80) return 'Near Limit'
  return 'Under Budget'
}

// Exact fill color per utilization tier, for progress bars / gauges.
export function getUtilizationColor(rate) {
  const r = Number(rate) || 0
  if (r > 100) return '#df6858'
  if (r >= 95) return '#e66b26'
  if (r >= 80) return '#e89a2d'
  if (r >= 60) return '#2c986c'
  return '#469d5e'
}

// ---------- Grouping ----------

export function groupExpensesByCategory(expenses) {
  const map = new Map()
  ;(expenses || []).forEach((e) => {
    const key = (e.category && String(e.category).trim()) || 'Uncategorized'
    const current = map.get(key) || { value: 0, count: 0 }
    map.set(key, {
      value: current.value + normalizeAmount(e.amount),
      count: current.count + 1,
    })
  })
  const total = Array.from(map.values()).reduce((sum, row) => sum + row.value, 0)
  return Array.from(map, ([name, row]) => ({
    name,
    value: row.value,
    count: row.count,
    percent: total > 0 ? (row.value / total) * 100 : 0,
  })).sort((a, b) => b.value - a.value)
}

export function groupExpensesByProject(expenses) {
  const map = new Map()
  ;(expenses || []).forEach((e) => {
    const key = (e.project || e.event || 'Unlabeled').toString().trim() || 'Unlabeled'
    map.set(key, (map.get(key) || 0) + normalizeAmount(e.amount))
  })
  return Array.from(map, ([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
}

// Monthly totals for a given year (active expenses only). Returns 12 chronological rows.
export function groupExpensesByMonth(expenses, year) {
  const totals = new Array(12).fill(0)
  const counts = new Array(12).fill(0)
  const missing = new Array(12).fill(0)
  const seen = new Set()
  ;(expenses || []).forEach((e) => {
    if (!isApprovedAllocation(e)) return
    const key = e.requestId ? `request:${e.requestId}` : `expense:${e.id}`
    if (seen.has(key)) return
    seen.add(key)
    const period = getRecordPeriod(e)
    if (!period || period.year !== Number(year)) return
    const m = period.month - 1
    totals[m] += normalizeAmount(e.amount)
    counts[m] += 1
    if (isMissingReceipt(e)) missing[m] += 1
  })
  return MONTHS_SHORT.map((label, i) => ({
    monthIndex: i,
    month: label,
    monthFull: MONTHS_FULL[i],
    total: totals[i],
    count: counts[i],
    missing: missing[i],
  }))
}

// Budget allocation per month for a year.
export function budgetByMonth(budgets, year) {
  const totals = new Array(12).fill(0)
  const seen = new Set()
  ;(budgets || []).forEach((b) => {
    if (Number(b.year) !== Number(year)) return
    const key = b.id === null || b.id === undefined ? b : String(b.id)
    if (seen.has(key)) return
    seen.add(key)
    const m = Number(b.month)
    if (m >= 1 && m <= 12) totals[m - 1] += normalizeAmount(b.amount)
  })
  return totals
}

// ---------- Trend ----------
// Simple least-squares slope over a numeric series; classifies direction.
export function calculateTrend(series) {
  const pts = (series || []).filter((v) => Number.isFinite(v))
  const n = pts.length
  if (n < 2) return { direction: 'Stable', slope: 0, changePct: 0 }

  const xs = pts.map((_, i) => i)
  const meanX = xs.reduce((a, b) => a + b, 0) / n
  const meanY = pts.reduce((a, b) => a + b, 0) / n
  let num = 0
  let den = 0
  xs.forEach((x, i) => {
    num += (x - meanX) * (pts[i] - meanY)
    den += (x - meanX) ** 2
  })
  const slope = den === 0 ? 0 : num / den

  // Compare recent half vs earlier half for a robust % change.
  const half = Math.floor(n / 2)
  const earlier = pts.slice(0, half)
  const recent = pts.slice(n - half)
  const earlierAvg = earlier.reduce((a, b) => a + b, 0) / (earlier.length || 1)
  const recentAvg = recent.reduce((a, b) => a + b, 0) / (recent.length || 1)
  const changePct = earlierAvg > 0 ? ((recentAvg - earlierAvg) / earlierAvg) * 100 : 0

  let direction = 'Stable'
  if (Math.abs(changePct) >= 5) direction = changePct > 0 ? 'Increasing' : 'Decreasing'
  return { direction, slope, changePct }
}

export function periodLabel(filters) {
  if (filters.view === 'monthly') {
    return `${MONTHS_FULL[filters.month - 1]} ${filters.year}`
  }
  return `${filters.year}`
}
