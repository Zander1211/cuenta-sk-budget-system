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

// Each row is an individual allocation. Same-month entries are intentionally
// cumulative; only an identical row id is ignored if a query result is merged
// into local state more than once.
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
