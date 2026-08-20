// analytics.js — Deterministic financial calculation layer for the Analysis module.
// These functions are the single source of truth. AI only *interprets* these numbers;
// it never recalculates or invents values.

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
// These are the literal values of the design tokens in index.css: the
// category ramp is --c1…--c8, and the semantic roles map to --accent,
// --warn, --negative, --line-strong and --surface-2.
//
// They stay literal rather than var(): the PDF export rasterises the chart
// with html2canvas, which does not resolve custom properties inside SVG
// presentation attributes, so a var() here exports as a black shape.
//
// The ramp is one hue family stepping down in lightness, so a chart still
// reads in grayscale and for every kind of colour vision.
export const CATEGORY_COLORS = [
  '#02353C', '#0B5A44', '#12805C', '#2EAF7D', '#6FCFB4', '#A5E3D4', '#C9EFE7', '#B9CBC7',
]

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

export function colorForCategory(name, index = 0) {
  return CATEGORY_COLORS[index % CATEGORY_COLORS.length]
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

export function isMissingReceipt(expense) {
  return !expense.receiptUrl && !expense.receiptName
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
  return (expenses || []).filter(
    (e) => isActiveExpense(e) && isInPeriod(expenseDate(e), filters)
  )
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
    map.set(key, (map.get(key) || 0) + normalizeAmount(e.amount))
  })
  const total = Array.from(map.values()).reduce((a, b) => a + b, 0)
  return Array.from(map, ([name, value]) => ({
    name,
    value,
    percent: total > 0 ? (value / total) * 100 : 0,
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
  ;(expenses || []).forEach((e) => {
    if (!isActiveExpense(e)) return
    const d = parseDate(expenseDate(e))
    if (!d || d.getFullYear() !== Number(year)) return
    const m = d.getMonth()
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
  ;(budgets || []).forEach((b) => {
    if (Number(b.year) !== Number(year)) return
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
