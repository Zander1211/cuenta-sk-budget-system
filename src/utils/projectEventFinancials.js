const RECORDED_EXPENSE_STATUSES = new Set(['approved', 'released', 'recorded', 'paid'])

function normalizeId(value) {
  if (value === null || value === undefined || value === '') return ''
  return String(value)
}

function positiveAmount(value) {
  const amount = Number(value)
  return Number.isFinite(amount) && amount > 0 ? amount : 0
}

export function isRecordedProjectExpense(expense) {
  if (!expense?.isAdditional || expense.archivedAt) return false
  return RECORDED_EXPENSE_STATUSES.has(String(expense.status || '').toLowerCase())
}

export function isExpenseLinkedToProjectEvent(expense, projectEvent) {
  if (!isRecordedProjectExpense(expense)) return false

  const parentId = normalizeId(expense.parentProjectId)
  if (!parentId) return false

  return [projectEvent?.id, projectEvent?.requestId]
    .map(normalizeId)
    .filter(Boolean)
    .includes(parentId)
}

export function buildVerifiedReceiptTotals(receiptRows = []) {
  return (receiptRows || []).reduce((totals, receipt) => {
    if (!receipt?.ocr_verified_at && !receipt?.ocrVerifiedAt) return totals

    const recordId = normalizeId(receipt.record_id ?? receipt.recordId)
    const requisitionId = normalizeId(receipt.requisition_id ?? receipt.requisitionId)
    const metadata = receipt.ocr_metadata ?? receipt.ocrMetadata
    const amount = positiveAmount(metadata?.totalAmount)
    if (!recordId || amount <= 0) return totals

    totals[recordId] = (totals[recordId] || 0) + amount
    const scopeKey = requisitionId
      ? `requisition:${requisitionId}`
      : `parent:${recordId}`
    totals[scopeKey] = (totals[scopeKey] || 0) + amount
    return totals
  }, {})
}

/**
 * Returns the single financial truth used by Projects & Events, Expenses and AI.
 *
 * Every receipt remains in the approved parent's collection, with an optional
 * requisition scope. Unscoped parent receipts are original spending. A scoped
 * receipt total replaces that requisition's entered amount, preventing the
 * same requisition from being counted twice.
 *
 * When receipts are attached to individual child expenses instead, each child
 * is resolved independently: its verified receipt total replaces its entered
 * amount, while children without receipts retain their saved amount.
 */
export function calculateProjectEventFinancials(projectEvent, expenses = [], verifiedReceiptTotals = {}) {
  const linkedExpenses = (expenses || []).filter((expense) =>
    isExpenseLinkedToProjectEvent(expense, projectEvent)
  )
  const recordedExpenseTotal = linkedExpenses.reduce(
    (sum, expense) => sum + positiveAmount(expense.amount),
    0,
  )

  const receiptReferenceIds = [...new Set([projectEvent?.id, projectEvent?.requestId]
    .map(normalizeId)
    .filter(Boolean))]
  const hasScopedReceiptTotals = receiptReferenceIds.some(id => (
    Object.prototype.hasOwnProperty.call(verifiedReceiptTotals || {}, `parent:${id}`)
  )) || linkedExpenses.some(expense => (
    Object.prototype.hasOwnProperty.call(
      verifiedReceiptTotals || {},
      `requisition:${normalizeId(expense.id)}`,
    )
  ))
  const directVerifiedReceiptTotal = receiptReferenceIds.reduce(
    (sum, id) => sum + positiveAmount(
      hasScopedReceiptTotals
        ? verifiedReceiptTotals?.[`parent:${id}`]
        : verifiedReceiptTotals?.[id],
    ),
    0,
  )

  const linkedVerifiedReceiptTotal = linkedExpenses.reduce(
    (sum, expense) => sum + positiveAmount(
      verifiedReceiptTotals?.[`requisition:${normalizeId(expense.id)}`]
      ?? verifiedReceiptTotals?.[normalizeId(expense.id)],
    ),
    0,
  )
  const resolvedLinkedExpenseTotal = linkedExpenses.reduce((sum, expense) => {
    const receiptTotal = positiveAmount(
      verifiedReceiptTotals?.[`requisition:${normalizeId(expense.id)}`]
      ?? verifiedReceiptTotals?.[normalizeId(expense.id)],
    )
    return sum + (receiptTotal > 0 ? receiptTotal : positiveAmount(expense.amount))
  }, 0)
  const verifiedReceiptTotal = directVerifiedReceiptTotal + linkedVerifiedReceiptTotal

  const approvedBudget = positiveAmount(
    projectEvent?.approvedBudget ?? projectEvent?.amount,
  )
  const totalExpenses = directVerifiedReceiptTotal + resolvedLinkedExpenseTotal
  const remainingBudget = approvedBudget - totalExpenses
  const utilization = approvedBudget > 0
    ? (totalExpenses / approvedBudget) * 100
    : 0

  return {
    approvedBudget,
    linkedExpenses,
    recordedExpenseTotal,
    directVerifiedReceiptTotal,
    linkedVerifiedReceiptTotal,
    resolvedLinkedExpenseTotal,
    verifiedReceiptTotal,
    totalExpenses,
    remainingBudget,
    utilization,
    source: directVerifiedReceiptTotal > 0 && linkedVerifiedReceiptTotal > 0
      ? 'verified-receipts-and-recorded-expenses'
      : directVerifiedReceiptTotal > 0
        ? 'verified-receipts'
        : linkedVerifiedReceiptTotal > 0
        ? 'verified-receipts-and-recorded-expenses'
        : recordedExpenseTotal > 0
          ? 'recorded-expenses'
          : 'none',
  }
}

export function formatUtilization(value) {
  const utilization = Number(value) || 0
  return utilization.toLocaleString('en-PH', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  })
}

function getFinancialRecordPeriod(record = {}) {
  const month = Number(record.month)
  const year = Number(record.year)
  if (month >= 1 && month <= 12 && Number.isFinite(year)) {
    return { month, year }
  }

  const raw = record.eventDate || record.event_date || record.date
    || record.approvedAt || record.approved_at || record.createdAt || record.created_at
  if (!raw) return null

  const dateOnly = String(raw).match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (dateOnly) return { year: Number(dateOnly[1]), month: Number(dateOnly[2]) }

  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) return null
  return { month: date.getMonth() + 1, year: date.getFullYear() }
}

export function isApprovedBudgetRecord(expense) {
  if (!expense || expense.isAdditional || expense.archivedAt) return false
  return ['approved', 'released'].includes(String(expense.status || 'Approved').toLowerCase())
}

export function getApprovedBudgetFinancialRows(expenses = [], verifiedReceiptTotals = {}) {
  return (expenses || [])
    .filter(isApprovedBudgetRecord)
    .map((record) => {
      const financials = calculateProjectEventFinancials(record, expenses, verifiedReceiptTotals)
      return {
        ...record,
        approvedBudget: financials.approvedBudget,
        totalExpenses: financials.totalExpenses,
        remainingBudget: financials.remainingBudget,
        budgetUtilization: financials.utilization,
        linkedExpenses: financials.linkedExpenses,
        actualExpenseSource: financials.source,
      }
    })
}

export function summarizeApprovedBudgetFinancials(
  expenses = [],
  verifiedReceiptTotals = {},
  filters = {},
) {
  const targetYear = filters.year === null || filters.year === undefined
    ? null
    : Number(filters.year)
  const targetMonth = filters.month === null || filters.month === undefined
    || filters.view === 'yearly'
    ? null
    : Number(filters.month)
  const targetProject = filters.project && filters.project !== 'all'
    ? String(filters.project)
    : null
  const targetCategory = filters.category && filters.category !== 'all'
    ? String(filters.category)
    : null

  const records = getApprovedBudgetFinancialRows(expenses, verifiedReceiptTotals)
    .filter((record) => {
      const period = getFinancialRecordPeriod(record)
      if (targetYear !== null && period?.year !== targetYear) return false
      if (targetMonth !== null && period?.month !== targetMonth) return false

      const title = String(record.event || record.project || 'Unlabeled')
      if (targetProject && title !== targetProject) return false
      if (targetCategory && String(record.category || 'Uncategorized') !== targetCategory) return false
      return true
    })

  const totalApprovedBudget = records.reduce(
    (sum, record) => sum + positiveAmount(record.approvedBudget),
    0,
  )
  const totalExpenses = records.reduce(
    (sum, record) => sum + positiveAmount(record.totalExpenses),
    0,
  )
  const remainingBudget = totalApprovedBudget - totalExpenses
  const utilization = totalApprovedBudget > 0
    ? (totalExpenses / totalApprovedBudget) * 100
    : 0

  return {
    records,
    totalApprovedBudget,
    totalExpenses,
    remainingBudget,
    utilization,
  }
}

export function getActualExpenseRowsForApprovedRecords(
  expenses = [],
  verifiedReceiptTotals = {},
  approvedRecords = [],
) {
  const parentIds = new Set()
  const requestIds = new Set()
  approvedRecords.forEach((record) => {
    if (record.id !== null && record.id !== undefined) parentIds.add(normalizeId(record.id))
    if (record.requestId) requestIds.add(normalizeId(record.requestId))
  })

  return materializeActualExpenseRows(expenses, verifiedReceiptTotals)
    .filter((row) => {
      if (positiveAmount(row.amount) <= 0) return false
      if (row.isRequisition || row.actualExpenseKind === 'requisition') {
        return parentIds.has(normalizeId(row.parentProjectId))
      }
      return parentIds.has(normalizeId(row.id))
        || (row.requestId && requestIds.has(normalizeId(row.requestId)))
    })
}

export function materializeActualExpenseRows(expenses = [], verifiedReceiptTotals = {}) {
  const allExpenses = expenses || []
  const approvedParents = allExpenses.filter(isApprovedBudgetRecord)
  const primaryReferenceIds = new Set(
    approvedParents
      .flatMap(expense => [expense?.id, expense?.requestId])
      .map(normalizeId)
      .filter(Boolean),
  )
  const materializedRequisitionIds = new Set()
  const rows = []

  approvedParents.forEach((parent) => {
    const financials = calculateProjectEventFinancials(parent, allExpenses, verifiedReceiptTotals)

    // Only unscoped, verified receipts belong on the parent's scheduled period.
    // Requisitions are emitted below as their own transaction rows so their
    // recorded dates and categories are not lost when analysis is grouped by
    // month, year, category or project.
    rows.push({
      ...parent,
      amount: financials.directVerifiedReceiptTotal,
      approvedBudget: financials.approvedBudget,
      remainingBudget: financials.remainingBudget,
      budgetUtilization: financials.utilization,
      actualExpenseKind: 'parent-receipts',
      actualExpenseSource: financials.directVerifiedReceiptTotal > 0
        ? 'verified-receipts'
        : 'none',
      hasVerifiedReceipt: financials.directVerifiedReceiptTotal > 0,
    })

    financials.linkedExpenses.forEach((requisition) => {
      const requisitionId = normalizeId(requisition.id)
      if (!requisitionId || materializedRequisitionIds.has(requisitionId)) return
      materializedRequisitionIds.add(requisitionId)

      const verifiedAmount = positiveAmount(
        verifiedReceiptTotals?.[`requisition:${requisitionId}`]
        ?? verifiedReceiptTotals?.[requisitionId],
      )
      const amount = verifiedAmount > 0
        ? verifiedAmount
        : positiveAmount(requisition.amount)

      rows.push({
        ...requisition,
        event: parent.event || parent.project || requisition.event || requisition.project || '',
        project: parent.project || parent.event || requisition.project || requisition.event || '',
        type: parent.type || requisition.type,
        amount,
        requestedBudget: 0,
        approvedBudget: 0,
        status: 'Approved',
        isAdditional: false,
        isRequisition: true,
        requisitionId: requisition.id,
        requestId: null,
        scheduledDate: parent.eventDate || parent.date || null,
        eventDate: null,
        actualExpenseKind: 'requisition',
        actualExpenseSource: verifiedAmount > 0
          ? 'verified-receipts'
          : 'recorded-expenses',
        hasVerifiedReceipt: verifiedAmount > 0,
      })
    })
  })

  // Preserve genuinely standalone recorded expenses and legacy requisitions
  // that cannot be linked to an approved parent. Approved parent allocations
  // themselves are never treated as spending without a verified receipt.
  allExpenses.forEach((expense) => {
    if (expense?.archivedAt) return
    const status = String(expense?.status || '').toLowerCase()

    if (expense?.isAdditional) {
      const expenseId = normalizeId(expense.id)
      if (materializedRequisitionIds.has(expenseId)) return
      if (primaryReferenceIds.has(normalizeId(expense.parentProjectId))) return
      if (!RECORDED_EXPENSE_STATUSES.has(status)) return

      const verifiedAmount = positiveAmount(
        verifiedReceiptTotals?.[`requisition:${expenseId}`]
        ?? verifiedReceiptTotals?.[expenseId],
      )
      rows.push({
        ...expense,
        amount: verifiedAmount > 0 ? verifiedAmount : positiveAmount(expense.amount),
        status: 'Approved',
        isAdditional: false,
        isRequisition: true,
        requisitionId: expense.id,
        requestId: null,
        eventDate: null,
        actualExpenseKind: 'standalone-requisition',
        actualExpenseSource: verifiedAmount > 0 ? 'verified-receipts' : 'recorded-expenses',
        hasVerifiedReceipt: verifiedAmount > 0,
      })
      return
    }

    if (!['recorded', 'paid'].includes(status)) return
    rows.push({
      ...expense,
      amount: positiveAmount(expense.amount),
      status: 'Approved',
      actualExpenseKind: 'standalone-expense',
      actualExpenseSource: 'recorded-expenses',
      hasVerifiedReceipt: Boolean(expense.receiptUrl || expense.receiptName),
    })
  })

  return rows
}
