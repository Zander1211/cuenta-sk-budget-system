// Deterministic (Layer 1) insight builders. These are the source of truth shown when
// the AI is loading/unavailable, and they also seed the payload the AI interprets.
import { formatCurrency, formatPercentage } from './analytics'

function push(list, cond, insight) {
  if (cond) list.push(insight)
  return list
}

// Short, human-readable justification for a computed budget/utilization severity.
// Keeps the "Why" line deterministic and consistent with financial severity rules.
export function budgetWhy(severity) {
  if (severity === 'high') return 'Spending has exceeded the approved budget limit or created a deficit.'
  if (severity === 'medium') return 'Budget utilization is approaching limit or spending velocity is accelerating.'
  return 'Spending is within approved budget and utilization is well managed.'
}

// The one place a performance tone becomes an insight severity. Every builder
// goes through this so the same utilization rate cannot be graded "high" on
// one screen and "medium" on another.
export function severityForTone(tone) {
  if (tone === 'danger') return 'high'
  if (tone === 'warning') return 'medium'
  return 'low'
}

// Deterministic Financial Risk Classification.
// Classifies financial status exclusively using financial indicators:
// - Low Risk (🟢): Spending within approved budget, utilization well managed, no unusual patterns, sufficient remaining balance.
// - Medium Risk (🟡): Utilization approaching limit (>= 80%), spending accelerating, remaining balance limited, or notable concentration/variance.
// - High Risk (🔴): Budget fully utilized or exceeded, overspending detected, remaining budget critically low (>= 95%), or significant financial anomalies.
// Pending approvals, requests, reviews, workflow status, and user activities are strictly excluded.

export const RISK_DEFINITIONS = {
  high: {
    level: 'high',
    label: 'High Risk',
    emoji: '🔴',
    tone: 'danger',
    colorClass: 'high',
    chipTone: 'danger',
    description:
      'The approved budget has been fully utilized, exceeded, or significant financial anomalies have been detected. Immediate financial review and corrective action are recommended.',
    recommendation:
      'Immediate financial review and corrective action are recommended. Reduce unnecessary expenditures and evaluate budget allocations to prevent overspending.',
  },
  medium: {
    level: 'medium',
    label: 'Medium Risk',
    emoji: '🟡',
    tone: 'warning',
    colorClass: 'medium',
    chipTone: 'warning',
    description:
      'Budget utilization is increasing and should be monitored closely. While spending remains within the approved budget, the remaining budget is becoming limited or spending is increasing faster than expected.',
    recommendation:
      'Review current spending trends, prioritize essential expenses, and continue monitoring the remaining budget to avoid reaching a high-risk financial condition.',
  },
  low: {
    level: 'low',
    label: 'Low Risk',
    emoji: '🟢',
    tone: 'positive',
    colorClass: 'low',
    chipTone: 'positive',
    description:
      'Financial performance is stable. Spending is well within the approved budget, sufficient funds remain available, and no unusual financial activity has been detected.',
    recommendation:
      'Continue monitoring expenses and maintain responsible budget utilization.',
  },
}

export function rollUpHealth({
  severityCounts = { high: 0, medium: 0, low: 0 },
  remainingBalance = 0,
  utilizationRate = 0,
  totalBudget = 0,
  totalExpenses = 0,
  spendingTrend = 'Stable',
  returnedBudget = 0,
  largestVariance = null,
}) {
  const isOverBudget = remainingBalance < 0 || (totalBudget > 0 && totalExpenses > totalBudget) || (totalBudget > 0 && utilizationRate >= 100)
  const isCriticallyLow = (totalBudget > 0 && utilizationRate >= 95) || (totalBudget > 0 && remainingBalance <= 0)
  const hasHighAnomalies = (severityCounts.high || 0) > 0 || (largestVariance && largestVariance.status === 'Over Budget')

  if (isOverBudget || isCriticallyLow || hasHighAnomalies) {
    return {
      ...RISK_DEFINITIONS.high,
      isOverBudget,
      isCriticallyLow,
      hasHighAnomalies,
    }
  }

  const isApproachingLimit = utilizationRate >= 80
  const isAccelerating = spendingTrend === 'Increasing'
  const hasMediumAnomalies = (severityCounts.medium || 0) > 0

  if (isApproachingLimit || isAccelerating || hasMediumAnomalies) {
    return {
      ...RISK_DEFINITIONS.medium,
      isApproachingLimit,
      isAccelerating,
      hasMediumAnomalies,
    }
  }

  return {
    ...RISK_DEFINITIONS.low,
  }
}

export function buildOverviewInsights(summary = {}) {
  const {
    utilizationRate = 0,
    remainingBalance = 0,
    totalBudget = 0,
    totalExpenses = 0,
    highestCategory,
    returnedBudget = 0,
    returnedRecordCount = 0,
    spendingTrend,
    largestVariance,
  } = summary

  const out = []

  // 1. Budget Utilization & Overspending Condition
  const isOverBudget = remainingBalance < 0 || utilizationRate >= 100
  const isNearLimit = utilizationRate >= 80 && utilizationRate < 100

  if (isOverBudget) {
    out.push({
      type: 'budget',
      severity: 'high',
      title: 'Overspending detected: Budget exceeded',
      why: 'Spending has exceeded the approved budget allocation.',
      detail: `Total expenditures exceed allocation by ${formatCurrency(Math.abs(remainingBalance))} (${formatPercentage(utilizationRate)} utilized). Corrective financial controls required.`,
    })
  } else if (isNearLimit) {
    out.push({
      type: 'budget',
      severity: 'medium',
      title: 'Budget utilization approaching limit',
      why: 'Budget utilization is nearing the approved ceiling and remaining balance is limited.',
      detail: `${formatPercentage(utilizationRate)} of approved funds have been utilized, leaving ${formatCurrency(remainingBalance)}. Projects and events require closer financial monitoring.`,
    })
  } else {
    out.push({
      type: 'budget',
      severity: 'low',
      title: 'Budget utilization is well managed',
      why: 'Spending is within the approved budget and no overspending risk is detected.',
      detail: `${formatPercentage(utilizationRate)} utilized (${formatCurrency(totalExpenses)} spent of ${formatCurrency(totalBudget)}). Reserves remain in a healthy condition.`,
    })
  }

  // 2. Remaining Budget & Buffer Status
  if (remainingBalance > 0 && !isNearLimit) {
    out.push({
      type: 'budget',
      severity: 'low',
      title: 'Sufficient remaining budget available',
      why: 'Adequate uncommitted funds remain available to support ongoing and upcoming operations.',
      detail: `${formatCurrency(remainingBalance)} in remaining budget is available for planned essential activities.`,
    })
  } else if (remainingBalance > 0 && isNearLimit) {
    out.push({
      type: 'budget',
      severity: 'medium',
      title: 'Remaining budget is becoming limited',
      why: 'Available funds are constrained, requiring careful financial allocation.',
      detail: `Only ${formatCurrency(remainingBalance)} remaining before reaching the approved budget limit.`,
    })
  }

  // 3. Returned Budget & Fund Efficiency
  if ((returnedBudget || 0) > 0) {
    out.push({
      type: 'budget',
      severity: 'low',
      title: 'Unused budget recovered & optimized',
      why: 'Unspent funds were returned from completed activities, improving fund utilization efficiency.',
      detail: `${formatCurrency(returnedBudget)} was returned to the fund from ${returnedRecordCount || 1} completed project(s)/event(s) and is available for reallocation.`,
    })
  }

  // 4. Category Spending Pattern & Concentration
  if (highestCategory) {
    const isConcentrated = highestCategory.percent > 50
    out.push({
      type: 'spending',
      severity: isConcentrated ? 'medium' : 'low',
      title: isConcentrated ? `Spending concentration in ${highestCategory.name}` : `Top spending category: ${highestCategory.name}`,
      why: isConcentrated
        ? 'A single category represents over half of total expenses, which reduces budget flexibility.'
        : 'Normal distribution of expenditures across approved programs.',
      detail: `${highestCategory.name} accounts for ${formatCurrency(highestCategory.value)} (${formatPercentage(highestCategory.percent)}) of actual expenditures.`,
    })
  }

  // 5. Spending Trend Velocity
  if (spendingTrend === 'Increasing') {
    out.push({
      type: 'trend',
      severity: 'medium',
      title: 'Spending is increasing faster than expected',
      why: 'Spending velocity is accelerating compared to earlier periods.',
      detail: 'Expenditures have trended upward. Closer financial monitoring of ongoing projects is advised.',
    })
  } else if (spendingTrend === 'Decreasing' || spendingTrend === 'Stable') {
    out.push({
      type: 'trend',
      severity: 'low',
      title: 'Stable spending velocity',
      why: 'Spending patterns remain predictable and within expected historical baselines.',
      detail: 'No unusual spending spikes detected across the active period.',
    })
  }

  // 6. Budget Variance (if available)
  if (largestVariance && largestVariance.status === 'Over Budget') {
    out.push({
      type: 'variance',
      severity: 'high',
      title: `Budget variance alert: ${largestVariance.label}`,
      why: 'Actual spending has diverged unfavorably from the budget allocation.',
      detail: `Variance of ${formatCurrency(Math.abs(largestVariance.variance))} exceeds planned allocation.`,
    })
  }

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
