// Deterministic builder for the GLOBAL financial-risk awareness system.
//
// This reuses the same financial facts the Analysis module already computes
// (budget totals, utilization, missing receipts, pending approvals, category
// concentration, spending trend). It NEVER calls AI and NEVER invents amounts —
// every figure comes straight from the deterministic summary passed in.
import { formatCurrency, formatPercentage } from './analytics'

export const ALL_ROLES = ['SK Chairman', 'SK Treasurer', 'SK Kagawad', 'Barangay Treasurer']

// Route → roles allowed, mirroring the sidebar navItems permission model so a
// warning never links a user to a page their role cannot open (no dead ends).
const ROUTE_ROLES = {
  '/dashboard': ALL_ROLES,
  '/dashboard/budgets': ALL_ROLES,
  '/dashboard/projects': ALL_ROLES,
  '/dashboard/documents': ALL_ROLES,
  '/dashboard/expenses': ['SK Chairman', 'SK Treasurer'],
  '/dashboard/expense-summary': ['SK Kagawad', 'Barangay Treasurer'],
  '/dashboard/approvals': ['SK Chairman'],
  '/dashboard/request': ['SK Treasurer'],
  '/dashboard/receipts': ['SK Chairman', 'SK Treasurer'],
  '/dashboard/analysis': ['SK Chairman', 'SK Treasurer'],
  '/dashboard/analysis/budget-utilization': ['SK Chairman', 'SK Treasurer'],
  '/dashboard/analysis/expenses-by-category': ['SK Chairman', 'SK Treasurer'],
  '/dashboard/analysis/monthly-spending': ['SK Chairman', 'SK Treasurer'],
}

export function routeAllowed(path, role) {
  if (!path) return false
  const roles = ROUTE_ROLES[path]
  return roles ? roles.includes(role) : true
}

// Return `path` if the role may open it, otherwise the first allowed fallback,
// otherwise null (the UI then simply hides the action — never a dead button).
export function resolveRoute(path, role, fallbacks = []) {
  if (routeAllowed(path, role)) return path
  for (const fb of fallbacks) {
    if (routeAllowed(fb, role)) return fb
  }
  return null
}

export const SEVERITY_RANK = { high: 3, medium: 2, low: 1 }

export function highestSeverity(warnings) {
  return warnings.reduce((acc, w) => (SEVERITY_RANK[w.severity] > SEVERITY_RANK[acc] ? w.severity : acc), 'low')
}

export function countBySeverity(warnings) {
  return warnings.reduce(
    (acc, w) => {
      acc[w.severity] = (acc[w.severity] || 0) + 1
      return acc
    },
    { high: 0, medium: 0, low: 0 }
  )
}

// Which roles may SEE a given warning category. Kept conservative so read-only /
// certification roles are not shown management-only risks.
const TYPE_ROLE_VISIBILITY = {
  'budget-over-limit': ['SK Chairman', 'SK Treasurer', 'Barangay Treasurer'],
  'budget-near-limit': ['SK Chairman', 'SK Treasurer', 'Barangay Treasurer'],
  'budget-healthy': ALL_ROLES,
  'missing-receipts': ALL_ROLES, // compliance / certification relevant to everyone
  'pending-approvals': ['SK Chairman', 'SK Treasurer'],
  'spending-trend-up': ['SK Chairman', 'SK Treasurer', 'Barangay Treasurer'],
  'concentrated-spending': ['SK Chairman', 'SK Treasurer'],
  'top-category': ALL_ROLES,
}

// Build the full deterministic warning set (role-agnostic). Callers filter by role.
// `inputs`: { summary, category, trend } from the existing analysis hooks.
export function buildGlobalWarnings({ summary, category, trend }, generatedAt = new Date().toISOString()) {
  const out = []
  const push = (w) => out.push({ generatedAt, roles: TYPE_ROLE_VISIBILITY[w.id] || ALL_ROLES, ...w })

  const {
    totalBudget = 0,
    totalExpenses = 0,
    remainingBalance = 0,
    utilizationRate = 0,
    missingReceipts = 0,
    pendingRequests = [],
    hasBudgetData = false,
  } = summary || {}

  const amountOverBudget = Math.max(totalExpenses - totalBudget, 0)
  const pendingCount = pendingRequests?.length || 0
  const period = summary?.periodLabel || 'the selected period'

  // ---- Budget utilization (HIGH over / MEDIUM near / LOW healthy) ----
  if (hasBudgetData && utilizationRate > 100) {
    push({
      id: 'budget-over-limit',
      type: 'budget',
      severity: 'high',
      title: 'Spending exceeds allocation',
      why: 'Approved spending has exceeded the budget allocated for this period, which is an immediate financial risk.',
      description: `Budget utilization is currently ${formatPercentage(utilizationRate)}, placing ${period} ${formatCurrency(amountOverBudget)} over budget.`,
      recommendation: 'Review recent approved expenses and postpone non-essential requests until spending is back within budget.',
      amount: amountOverBudget,
      percentage: Number(utilizationRate.toFixed(1)),
      relatedPage: '/dashboard/analysis/budget-utilization',
      affectedPageKeys: ['dashboard', 'budgets', 'expenses', 'request-review', 'analysis'],
    })
  } else if (hasBudgetData && utilizationRate >= 80) {
    push({
      id: 'budget-near-limit',
      type: 'budget',
      severity: 'medium',
      title: 'Budget utilization nearing its limit',
      why: 'Budget utilization is approaching its approved limit, but spending has not yet exceeded the budget.',
      description: `Utilization is at ${formatPercentage(utilizationRate)} of the allocated budget for ${period}. ${formatCurrency(Math.max(remainingBalance, 0))} remains.`,
      recommendation: 'Monitor upcoming approvals carefully — additional spending may place the period over budget.',
      amount: Math.max(remainingBalance, 0),
      percentage: Number(utilizationRate.toFixed(1)),
      relatedPage: '/dashboard/analysis/budget-utilization',
      affectedPageKeys: ['dashboard', 'budgets', 'request-review', 'analysis'],
    })
  } else if (hasBudgetData && utilizationRate > 0) {
    push({
      id: 'budget-healthy',
      type: 'budget',
      severity: 'low',
      title: 'Budget remains healthy',
      why: 'This is an informational observation and does not currently indicate a financial risk.',
      description: `Utilization is at ${formatPercentage(utilizationRate)} for ${period}, with ${formatCurrency(remainingBalance)} still available.`,
      recommendation: 'No action needed. Continue tracking spending against the allocated budget.',
      amount: remainingBalance,
      percentage: Number(utilizationRate.toFixed(1)),
      relatedPage: '/dashboard/analysis/budget-utilization',
      affectedPageKeys: ['dashboard', 'analysis'],
    })
  }

  // ---- Missing receipts for approved expenses (HIGH compliance) ----
  if (missingReceipts > 0) {
    push({
      id: 'missing-receipts',
      type: 'documents',
      severity: 'high',
      title: 'Missing receipts detected',
      why: 'Approved expenses are missing required supporting receipts, which is a compliance risk.',
      description: `${missingReceipts} approved expense${missingReceipts === 1 ? '' : 's'} in ${period} ${missingReceipts === 1 ? 'does' : 'do'} not have an attached receipt.`,
      recommendation: 'Attach the missing supporting receipts to keep records audit-ready and compliant.',
      amount: missingReceipts,
      percentage: null,
      relatedPage: '/dashboard/receipts',
      affectedPageKeys: ['dashboard', 'expenses', 'receipts', 'documents', 'analysis'],
    })
  }

  // ---- Pending approvals affecting planning (MEDIUM) ----
  if (pendingCount > 0) {
    push({
      id: 'pending-approvals',
      type: 'approvals',
      severity: 'medium',
      title: 'Pending approvals awaiting review',
      why: 'Requests are awaiting review and may affect the budget once approved.',
      description: `${pendingCount} budget request${pendingCount === 1 ? '' : 's'} ${pendingCount === 1 ? 'is' : 'are'} awaiting review and may change the remaining balance once approved.`,
      recommendation: 'Review pending requests, considering their impact on the remaining budget before approving.',
      amount: pendingCount,
      percentage: null,
      relatedPage: '/dashboard/approvals',
      affectedPageKeys: ['dashboard', 'request-review', 'request', 'analysis'],
    })
  }

  // ---- Spending trend rising significantly (MEDIUM) ----
  const changePct = trend?.trend?.changePct
  if (trend?.trend?.direction === 'Increasing' && Number.isFinite(changePct) && changePct > 15) {
    push({
      id: 'spending-trend-up',
      type: 'trend',
      severity: 'medium',
      title: 'Spending trend increasing',
      why: 'Spending is rising faster than the recent average, but has not yet exceeded a critical threshold.',
      description: `Recent months are ${formatPercentage(Math.abs(changePct))} higher than earlier in the period.`,
      recommendation: 'Watch the monthly trend and confirm the increase is planned rather than an anomaly.',
      amount: null,
      percentage: Number(changePct.toFixed(1)),
      relatedPage: '/dashboard/analysis/monthly-spending',
      affectedPageKeys: ['dashboard', 'analysis'],
    })
  }

  // ---- Category concentration (MEDIUM) or largest category (LOW) ----
  const highestCat = category?.highest
  if (highestCat && highestCat.percent > 50) {
    push({
      id: 'concentrated-spending',
      type: 'risk',
      severity: 'medium',
      title: 'Spending is concentrated in one category',
      why: 'Most spending sits in a single category, which reduces budget flexibility and is worth monitoring.',
      description: `${highestCat.name} accounts for ${formatPercentage(highestCat.percent)} of spending (${formatCurrency(highestCat.value)}) in ${period}.`,
      recommendation: 'Review whether the allocation across categories or projects should be rebalanced.',
      amount: highestCat.value,
      percentage: Number(highestCat.percent.toFixed(1)),
      relatedPage: '/dashboard/analysis/expenses-by-category',
      affectedPageKeys: ['dashboard', 'projects', 'expenses', 'analysis'],
    })
  } else if (highestCat) {
    push({
      id: 'top-category',
      type: 'spending',
      severity: 'low',
      title: 'Largest spending category',
      why: 'This is an informational summary and does not currently indicate a risk condition.',
      description: `${highestCat.name} is the largest category at ${formatCurrency(highestCat.value)} (${formatPercentage(highestCat.percent)}) in ${period}.`,
      recommendation: 'No action needed. Provided for financial awareness.',
      amount: highestCat.value,
      percentage: Number(highestCat.percent.toFixed(1)),
      relatedPage: '/dashboard/analysis/expenses-by-category',
      affectedPageKeys: ['dashboard', 'projects', 'analysis'],
    })
  }

  return out
}

// Filter a warning set to what a role is permitted to see.
export function filterWarningsByRole(warnings, role) {
  return warnings.filter((w) => (w.roles || ALL_ROLES).includes(role))
}

// A stable signature of the current warnings (ids + severities). When this changes
// we treat the risk picture as "changed" — used to expire dismissals and stamp the
// updated time, without depending on object identity.
export function warningsSignature(warnings) {
  return warnings
    .map((w) => `${w.id}:${w.severity}`)
    .sort()
    .join('|')
}
