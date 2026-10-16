export const getBreakdownTotal = (breakdown = [], isPayroll = false) => {
  if (isPayroll) {
    return breakdown.reduce((sum, item) => {
      const hon = Number(item.honoraria) || 0;
      const cbc = Number(item.cbcLbf) || 0;
      return sum + (hon - cbc);
    }, 0);
  }
  
  return breakdown.reduce((sum, item) => {
    const qty = Number(item.quantity) || 0;
    const unit = Number(item.unitCost) || 0;
    return sum + (qty * unit);
  }, 0);
};

export function getRecordPeriod(record = {}) {
  const explicitMonth = Number(record.month)
  const explicitYear = Number(record.year)
  if (explicitMonth >= 1 && explicitMonth <= 12 && Number.isFinite(explicitYear)) {
    return { month: explicitMonth, year: explicitYear }
  }

  const raw = record.eventDate || record.event_date || record.date || record.approvedAt || record.approved_at || record.createdAt || record.created_at
  if (!raw) return null

  const dateOnly = String(raw).match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (dateOnly) {
    return { year: Number(dateOnly[1]), month: Number(dateOnly[2]) }
  }

  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) return null
  return { month: date.getMonth() + 1, year: date.getFullYear() }
}

export function isRecordInPeriod(record, month, year) {
  const period = getRecordPeriod(record)
  if (!period) return false
  if (year !== null && year !== undefined && period.year !== Number(year)) return false
  return month === null || month === undefined || period.month === Number(month)
}

// Each row is the total for one month/year. Summing also supports annual
// reports; identical row ids are ignored if query results are merged twice.
export function getBudgetTotalForPeriod(budgets = [], month, year) {
  const seen = new Set()
  return budgets.reduce((sum, budget) => {
    if (year !== null && year !== undefined && Number(budget.year) !== Number(year)) return sum
    if (month !== null && month !== undefined && Number(budget.month) !== Number(month)) return sum
    const key = budget.id === null || budget.id === undefined ? budget : String(budget.id)
    if (seen.has(key)) return sum
    seen.add(key)
    return sum + (Number(budget.amount) || 0)
  }, 0)
}

export function getApprovedAllocations(expenses = [], month, year) {
  const seen = new Set()
  return expenses.filter((expense) => {
    if (expense.archivedAt || expense.status === 'Cancelled' || expense.isAdditional) return false
    if (!['Approved', 'Released'].includes(expense.status || 'Approved')) return false
    if (!isRecordInPeriod(expense, month, year)) return false

    const key = expense.requestId ? `request:${expense.requestId}` : `expense:${expense.id}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function getApprovedAllocationTotal(expenses = [], month, year) {
  return getApprovedAllocations(expenses, month, year)
    .reduce((sum, expense) => sum + Number(expense.approvedBudget ?? expense.amount ?? 0), 0)
}

export function getCommittedRequestTotal(requests = [], month, year, excludeRequestId = null) {
  const seen = new Set()
  return requests.reduce((sum, request) => {
    if (excludeRequestId && String(request.id) === String(excludeRequestId)) return sum
    if (request.archivedAt || request.archived_at || !['Pending', 'Approved'].includes(request.status || 'Pending')) return sum
    if (!isRecordInPeriod(request, month, year)) return sum
    const key = String(request.id)
    if (seen.has(key)) return sum
    seen.add(key)
    const amount = request.status === 'Approved'
      ? Number(request.approvedAmount ?? request.approved_amount ?? request.amount ?? 0)
      : Number(request.amount || 0)
    return sum + amount
  }, 0)
}

export function getApprovedRequestTotal(requests = [], month, year) {
  const seen = new Set()
  return requests.reduce((sum, request) => {
    if (request.archivedAt || request.archived_at || request.status !== 'Approved') return sum
    if (!isRecordInPeriod(request, month, year)) return sum
    const key = String(request.id)
    if (seen.has(key)) return sum
    seen.add(key)
    return sum + Number(request.approvedAmount ?? request.approved_amount ?? request.amount ?? 0)
  }, 0)
}

/**
 * Calculates the total unused (remaining) budget carried forward from completed
 * past months into a target month.
 *
 * Rules:
 * 1. Only completed past months strictly prior to targetMonth in targetYear (1 .. targetMonth - 1).
 * 2. Do not include targetMonth's balance.
 * 3. Exclude months that have no allocated budget (allocated <= 0).
 * 4. Only unused (remaining > 0) budget is carried forward.
 * 5. Automatically recalculates whenever past expenses, returned budgets, or adjustments change.
 */
export function calculateCarryForwardBudget(budgets = [], expenses = [], targetMonth, targetYear) {
  if (!targetMonth || !targetYear || Number(targetMonth) <= 1) return 0

  const mTarget = Number(targetMonth)
  const yTarget = Number(targetYear)
  let carryForward = 0

  for (let m = 1; m < mTarget; m++) {
    const allocated = getBudgetTotalForPeriod(budgets, m, yTarget)
    if (allocated <= 0) continue // Exclude months with no allocated budget

    const approvedExpenses = getApprovedAllocationTotal(expenses, m, yTarget)
    const remaining = allocated - approvedExpenses

    if (remaining > 0) {
      carryForward += remaining
    }
  }

  return carryForward
}

/**
 * Returns detailed breakdown of unspent budgets carried forward from completed past months.
 */
export function getCarryForwardBreakdown(budgets = [], expenses = [], targetMonth, targetYear) {
  if (!targetMonth || !targetYear || Number(targetMonth) <= 1) {
    return { total: 0, months: [] }
  }

  const mTarget = Number(targetMonth)
  const yTarget = Number(targetYear)
  const months = []
  let total = 0

  for (let m = 1; m < mTarget; m++) {
    const allocated = getBudgetTotalForPeriod(budgets, m, yTarget)
    if (allocated <= 0) continue

    const approvedExpenses = getApprovedAllocationTotal(expenses, m, yTarget)
    const remaining = allocated - approvedExpenses

    if (remaining > 0) {
      total += remaining
      const monthName = new Date(yTarget, m - 1, 1).toLocaleString('en-US', { month: 'long' })
      months.push({
        month: m,
        monthName,
        year: yTarget,
        allocatedBudget: allocated,
        approvedExpenses,
        remainingBudget: remaining,
      })
    }
  }

  return { total, months }
}

/**
 * Returns the effective total budget for a target period, adding carried-forward
 * unspent balances from prior months when scoped to a specific month.
 */
export function getBudgetWithCarryForward(budgets = [], expenses = [], targetMonth, targetYear) {
  const approvedBudget = getBudgetTotalForPeriod(budgets, targetMonth, targetYear)
  if (!targetMonth || !targetYear) {
    return approvedBudget
  }
  const carryForward = calculateCarryForwardBudget(budgets, expenses, targetMonth, targetYear)
  return approvedBudget + carryForward
}

