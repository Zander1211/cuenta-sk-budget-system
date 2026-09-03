// Deterministic (Layer 1) insight builders. These are the source of truth shown when
// the AI is loading/unavailable, and they also seed the payload the AI interprets.
import { formatCurrency, formatPercentage } from './analytics'

function push(list, cond, insight) {
  if (cond) list.push(insight)
  return list
}

// Short, human-readable justification for a computed budget/utilization severity.
// Keeps the "Why" line deterministic and consistent with the severity rules.
function budgetWhy(severity) {
  if (severity === 'high') return 'Spending has exceeded the selected budget threshold.'
  if (severity === 'medium') return 'Spending is approaching the approved budget limit.'
  return 'Budget usage is within a healthy range.'
}

export function buildOverviewInsights(summary) {
  const { utilizationRate, performance, remainingBalance, missingReceipts, pendingRequests, highestCategory, returnedBudget, returnedRecordCount } = summary
  const out = []
  const perfSeverity = performance.tone === 'danger' ? 'high' : performance.tone === 'warning' ? 'medium' : 'low'
  out.push({
    type: 'budget',
    severity: perfSeverity,
    title: `Budget performance: ${performance.label}`,
    why: budgetWhy(perfSeverity),
    detail: `${formatPercentage(utilizationRate)} of approved working budgets has been used. ${performance.message}`,
  })
  push(out, remainingBalance < 0, {
    type: 'budget', severity: 'high', title: 'Spending exceeds allocation',
    why: 'The period is over budget, which is a significant spending risk.',
    detail: `The period is over budget by ${formatCurrency(Math.abs(remainingBalance))}.`,
  })
  push(out, (returnedBudget || 0) > 0, {
    type: 'budget', severity: 'low', title: 'Unused budget recovered',
    why: 'This is a favorable recovery and does not indicate a risk.',
    detail: `${formatCurrency(returnedBudget)} was returned to the monthly budget from ${returnedRecordCount} completed project${returnedRecordCount === 1 ? '' : 's'}/event${returnedRecordCount === 1 ? '' : 's'} and is available for new requests.`,
  })
  push(out, highestCategory, {
    type: 'spending', severity: 'low', title: 'Largest spending category',
    why: 'This is informational only and does not currently indicate a risk condition.',
    detail: highestCategory ? `${highestCategory.name} accounts for ${formatCurrency(highestCategory.value)} (${formatPercentage(highestCategory.percent)}).` : '',
  })
  push(out, missingReceipts > 0, {
    type: 'documents', severity: 'high', title: 'Missing receipts detected',
    why: 'Approved expenses are missing required supporting receipts, which is a compliance risk.',
    detail: `${missingReceipts} approved expense${missingReceipts === 1 ? '' : 's'} in this period ${missingReceipts === 1 ? 'does' : 'do'} not have an attached receipt.`,
  })
  push(out, (pendingRequests?.length || 0) > 0, {
    type: 'approvals', severity: 'medium', title: 'Pending approvals',
    why: 'Requests are awaiting review and may affect the budget once approved.',
    detail: `${pendingRequests.length} budget request${pendingRequests.length === 1 ? '' : 's'} awaiting review.`,
  })
  return out.slice(0, 5)
}

export function buildCategoryInsights(cat) {
  const out = []
  push(out, cat.highest, {
    type: 'spending', severity: 'medium', title: `${cat.highest?.name} leads spending`,
    why: 'One category dominates spending and is worth monitoring.',
    detail: cat.highest ? `It represents ${formatPercentage(cat.highest.percent)} of expenses (${formatCurrency(cat.highest.value)}).` : '',
  })
  const fastest = cat.categories.filter((c) => c.changePct != null).sort((a, b) => (b.changePct || 0) - (a.changePct || 0))[0]
  push(out, fastest && fastest.changePct > 10, {
    type: 'spending', severity: 'high', title: `${fastest?.name} is rising fast`,
    why: 'Spending in this category is rising sharply versus the previous period.',
    detail: fastest ? `Up ${formatPercentage(fastest.changePct)} versus the previous period.` : '',
  })
  const declining = cat.categories.filter((c) => c.changePct != null).sort((a, b) => (a.changePct || 0) - (b.changePct || 0))[0]
  push(out, declining && declining.changePct < -10, {
    type: 'spending', severity: 'low', title: `${declining?.name} is declining`,
    why: 'This is a favorable, informational trend and does not indicate a risk.',
    detail: declining ? `Down ${formatPercentage(Math.abs(declining.changePct))} versus the previous period.` : '',
  })
  const dominant = cat.highest && cat.highest.percent > 50
  push(out, dominant, {
    type: 'risk', severity: 'medium', title: 'Concentrated spending',
    why: 'Spending is concentrated in one category, which reduces budget flexibility.',
    detail: cat.highest ? `${cat.highest.name} exceeds half of all spending — consider diversifying allocation.` : '',
  })
  push(out, cat.missingReceipts > 0, {
    type: 'documents', severity: 'high', title: 'Receipts missing',
    why: 'Missing documentation creates a compliance issue.',
    detail: `${cat.missingReceipts} expense${cat.missingReceipts === 1 ? '' : 's'} still need supporting receipts.`,
  })
  return out.slice(0, 5)
}

export function buildTrendInsights(trend) {
  const out = []
  const increasing = trend.trend.direction === 'Increasing'
  out.push({
    type: 'trend',
    severity: increasing ? 'medium' : 'low',
    title: `Spending is ${trend.trend.direction.toLowerCase()}`,
    why: increasing
      ? 'Spending is rising faster than the earlier trend, but has not yet exceeded a critical threshold.'
      : 'Spending is stable or decreasing, which is a healthy trend.',
    detail: `Recent months are ${formatPercentage(Math.abs(trend.trend.changePct))} ${trend.trend.direction === 'Decreasing' ? 'lower' : 'higher'} than earlier in the period (computed observation).`,
  })
  const spike = trend.activeRows.find((r) => r.total > trend.average * 1.5 && trend.average > 0)
  push(out, spike, {
    type: 'trend', severity: 'high', title: `Spike in ${spike?.monthFull}`,
    why: 'This month is far above the monthly average, indicating unusual spending.',
    detail: spike ? `${formatCurrency(spike.total)} spent — well above the ${formatCurrency(trend.average)} monthly average.` : '',
  })
  const dip = trend.activeRows.find((r) => r.total > 0 && r.total < trend.average * 0.5 && trend.average > 0)
  push(out, dip, {
    type: 'trend', severity: 'low', title: `Below-average month: ${dip?.monthFull}`,
    why: 'Lower-than-average spending is informational and does not indicate a risk.',
    detail: dip ? `Only ${formatCurrency(dip.total)} spent, under the ${formatCurrency(trend.average)} average.` : '',
  })
  return out.slice(0, 5)
}

export function buildUtilizationInsights(util) {
  const out = []
  const utilSeverity = util.performance.tone === 'danger' ? 'high' : util.performance.tone === 'warning' ? 'medium' : 'low'
  out.push({
    type: 'budget',
    severity: utilSeverity,
    title: `Overall utilization: ${util.performance.label}`,
    why: budgetWhy(utilSeverity),
    detail: `${formatPercentage(util.utilizationRate)} of the budget is used. ${util.performance.message}`,
  })
  push(out, util.remainingBudget < 0, {
    type: 'budget', severity: 'high', title: 'Over budget',
    why: 'The period has exceeded its allocation, which is a significant spending risk.',
    detail: `The period is over its allocation by ${formatCurrency(Math.abs(util.remainingBudget))}.`,
  })
  push(out, util.utilizationRate < 25 && util.totalBudget > 0, {
    type: 'budget', severity: 'medium', title: 'Low utilization',
    why: 'A large share of funds remains unused and may be reallocated to active projects.',
    detail: `Only ${formatPercentage(util.utilizationRate)} used — funds may be reallocated to active projects.`,
  })
  push(out, util.missingReceipts > 0, {
    type: 'documents', severity: 'high', title: 'Compliance gap',
    why: 'Utilized expenses lack receipts, which is a compliance risk.',
    detail: `${util.missingReceipts} utilized expense${util.missingReceipts === 1 ? '' : 's'} lack receipts.`,
  })
  return out.slice(0, 5)
}

export function buildDistributionInsights(dist) {
  const out = []
  const highest = dist.distribution[0]
  const lowest = dist.distribution[dist.distribution.length - 1]
  const highestPercent = highest ? (highest.value / dist.total) * 100 : 0
  push(out, highest, {
    type: 'budget', severity: highestPercent > 50 ? 'medium' : 'low',
    title: `${highest?.name} leads budget allocation`,
    why: highestPercent > 50
      ? 'One category holds more than half of the approved budget, which reduces flexibility.'
      : 'This is informational only and does not currently indicate a risk condition.',
    detail: highest ? `${highest.name} accounts for ${formatCurrency(highest.value)} (${formatPercentage(highestPercent)}) across ${highest.count} project${highest.count === 1 ? '' : 's'}/event${highest.count === 1 ? '' : 's'}.` : '',
  })
  push(out, lowest && lowest.name !== highest?.name, {
    type: 'budget', severity: 'low', title: `${lowest?.name} has the smallest allocation`,
    why: 'This is informational only and does not currently indicate a risk condition.',
    detail: lowest ? `${lowest.name} received ${formatCurrency(lowest.value)} (${formatPercentage((lowest.value / dist.total) * 100)}).` : '',
  })
  push(out, dist.distribution.length === 1, {
    type: 'risk', severity: 'medium', title: 'Single-category concentration',
    why: 'All approved budget currently sits in one category, which reduces diversification.',
    detail: `${highest?.name} is the only category with an approved allocation for this period.`,
  })
  push(out, dist.distribution.length > 1, {
    type: 'budget', severity: 'low', title: 'Category coverage',
    why: 'This is informational only and does not currently indicate a risk condition.',
    detail: `${dist.distribution.length} categories share ${formatCurrency(dist.total)} in approved budget across ${dist.totalProjectsEvents} project${dist.totalProjectsEvents === 1 ? '' : 's'}/event${dist.totalProjectsEvents === 1 ? '' : 's'}.`,
  })
  return out.slice(0, 5)
}

export function buildVarianceInsights(bva) {
  const out = []
  const varOver = bva.largestVariance?.status === 'Over Budget'
  push(out, bva.largestVariance, {
    type: 'variance', severity: varOver ? 'high' : 'low',
    title: `Largest variance: ${bva.largestVariance?.label}`,
    why: varOver
      ? 'This period exceeded its budget, which is a spending risk.'
      : 'This variance is within budget and is informational only.',
    detail: bva.largestVariance ? `${bva.largestVariance.status} by ${formatCurrency(Math.abs(bva.largestVariance.variance))}.` : '',
  })
  out.push({
    type: 'variance', severity: bva.overCount > 0 ? 'medium' : 'low',
    title: 'Budget coverage',
    why: bva.overCount > 0
      ? 'Some periods exceeded their budget and may need review.'
      : 'All periods stayed within budget, a healthy condition.',
    detail: `${bva.underCount} period(s) under budget, ${bva.overCount} over budget.`,
  })
  const highUtilSeverity = bva.highestUtilization?.percentUsed > 100 ? 'high' : 'medium'
  push(out, bva.highestUtilization && bva.highestUtilization.percentUsed >= 80, {
    type: 'budget', severity: highUtilSeverity,
    title: `Highest utilization: ${bva.highestUtilization?.label}`,
    why: highUtilSeverity === 'high'
      ? 'This period exceeded its allocation, which is a spending risk.'
      : 'This period is nearing its allocation limit and is worth monitoring.',
    detail: bva.highestUtilization ? `${formatPercentage(bva.highestUtilization.percentUsed)} of allocation used.` : '',
  })
  return out.slice(0, 5)
}
