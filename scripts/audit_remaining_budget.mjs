import { createAdminClient } from './supabaseAdminClient.js'

const supabase = createAdminClient()

function periodOf(row) {
  if (Number(row.month) && Number(row.year)) return `${row.year}-${String(row.month).padStart(2, '0')}`
  const raw = row.event_date || row.date || row.approved_at || row.created_at
  const date = raw ? new Date(raw) : null
  return date && !Number.isNaN(date.getTime())
    ? `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
    : 'undated'
}

function addToPeriod(map, period, amount) {
  const current = map.get(period) || { count: 0, total: 0 }
  current.count += 1
  current.total += Number(amount || 0)
  map.set(period, current)
}

const [
  { data: budgets, error: budgetError },
  { data: expenses, error: expenseError },
  { data: requests, error: requestError },
  { data: auditRows, error: auditError },
  { data: restoreRows, error: restoreError },
] = await Promise.all([
  supabase.from('budgets').select('id, month, year, amount, source, created_at'),
  supabase.from('expenses').select('id, request_id, type, amount, approved_budget, status, archived_at, is_additional, event_date, date, approved_at, created_at'),
  supabase.from('budget_requests').select('id, type, amount, approved_amount, status, archived_at, event_date, approved_at, created_at'),
  supabase.from('audit_trail').select('id, user_name, action, action_type, module, record_type, record_id, description, new_value, created_at').order('created_at', { ascending: true }),
  supabase.from('restore_history').select('id, filename, restored_at, snapshot').order('restored_at', { ascending: true }),
])

for (const [label, error] of [['budgets', budgetError], ['expenses', expenseError], ['budget_requests', requestError], ['audit_trail', auditError], ['restore_history', restoreError]]) {
  if (error) throw new Error(`${label}: ${error.message}`)
}

const budgetPeriods = new Map()
for (const row of budgets || []) addToPeriod(budgetPeriods, periodOf(row), row.amount)

const allocationPeriods = new Map()
const additionalPeriods = new Map()
const activeExpenses = (expenses || []).filter((row) => !row.archived_at && row.status !== 'Cancelled')
for (const row of activeExpenses) {
  addToPeriod(row.is_additional ? additionalPeriods : allocationPeriods, periodOf(row), row.amount)
}

const approvedRequestPeriods = new Map()
for (const row of requests || []) {
  if (row.status === 'Approved' && !row.archived_at) {
    addToPeriod(approvedRequestPeriods, periodOf(row), row.approved_amount ?? row.amount)
  }
}

const requestIds = new Map()
for (const row of activeExpenses.filter((item) => item.request_id)) {
  requestIds.set(row.request_id, (requestIds.get(row.request_id) || 0) + 1)
}
const duplicateRequestIds = Array.from(requestIds.entries()).filter(([, count]) => count > 1)

const periods = Array.from(new Set([
  ...budgetPeriods.keys(),
  ...allocationPeriods.keys(),
  ...additionalPeriods.keys(),
  ...approvedRequestPeriods.keys(),
])).sort()

console.table(periods.map((period) => {
  const budget = budgetPeriods.get(period) || { count: 0, total: 0 }
  const allocations = allocationPeriods.get(period) || { count: 0, total: 0 }
  const additional = additionalPeriods.get(period) || { count: 0, total: 0 }
  const approved = approvedRequestPeriods.get(period) || { count: 0, total: 0 }
  return {
    period,
    budget_rows: budget.count,
    monthly_budget: budget.total,
    allocation_rows: allocations.count,
    approved_allocations: allocations.total,
    additional_rows: additional.count,
    additional_expenses: additional.total,
    current_dashboard_remaining: budget.total - approved.total,
    allocation_remaining: budget.total - allocations.total,
    approved_request_rows: approved.count,
    approved_request_total: approved.total,
  }
}))

console.log(`Duplicate non-null request_id groups in active expenses: ${duplicateRequestIds.length}`)
if (duplicateRequestIds.length) console.table(duplicateRequestIds.map(([request_id, count]) => ({ request_id, count })))

const negativePeriods = periods.filter((period) => {
  const budget = budgetPeriods.get(period)?.total || 0
  const allocations = allocationPeriods.get(period)?.total || 0
  return allocations > budget
})

for (const period of negativePeriods) {
  console.log(`Details for over-allocated period ${period}:`)
  console.table((budgets || []).filter((row) => periodOf(row) === period).map((row) => ({
    kind: 'budget',
    id: row.id,
    amount: Number(row.amount || 0),
    status: 'Recorded',
    effective_date: `${row.year}-${String(row.month).padStart(2, '0')}`,
    created_at: row.created_at,
  })))
  console.table(activeExpenses.filter((row) => !row.is_additional && periodOf(row) === period).map((row) => ({
    kind: row.type || 'allocation',
    id: row.id,
    request_id: row.request_id,
    amount: Number(row.amount || 0),
    status: row.status,
    effective_date: row.event_date || row.date,
    approved_at: row.approved_at,
  })))
}

const budgetAuditRows = (auditRows || []).filter((row) =>
  row.module === 'Monthly Budget'
  || row.record_type === 'Budget'
  || String(row.action_type || '').toLowerCase().includes('budget created')
)

console.log(`Budget-related audit rows: ${budgetAuditRows.length}`)
if (budgetAuditRows.length) {
  console.table(budgetAuditRows.map((row) => ({
    id: row.id,
    created_at: row.created_at,
    added_by: row.user_name,
    action: row.action,
    period: row.record_id,
    amount: Number(row.new_value?.amount || 0),
    source: row.new_value?.source || '',
    description: row.description,
  })))
}

const snapshotBudgets = (restoreRows || []).flatMap((row) =>
  (row.snapshot?.supabase?.budgets || []).map((budget) => ({
    snapshot_id: row.id,
    snapshot_file: row.filename,
    snapshot_created_at: row.restored_at,
    id: budget.id,
    month: Number(budget.month),
    year: Number(budget.year),
    amount: Number(budget.amount || 0),
    source: budget.source || '',
    created_at: budget.created_at,
  }))
)

console.log(`Budget rows found in restore snapshots: ${snapshotBudgets.length}`)
if (snapshotBudgets.length) console.table(snapshotBudgets)
