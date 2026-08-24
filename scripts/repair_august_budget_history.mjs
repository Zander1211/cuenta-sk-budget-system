import { createAdminClient } from './supabaseAdminClient.js'

const supabase = createAdminClient()
const TARGET_MONTH = 8
const TARGET_YEAR = 2026
const ORIGINAL_ROW_ID = 28

const { data: restoreRows, error: restoreError } = await supabase
  .from('restore_history')
  .select('id, restored_at, snapshot')
  .order('restored_at', { ascending: true })
if (restoreError) throw restoreError

const snapshotVersions = (restoreRows || [])
  .flatMap((row) => row.snapshot?.supabase?.budgets || [])
  .filter((budget) => String(budget.id) === String(ORIGINAL_ROW_ID))
  .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))

const original = snapshotVersions[0]
if (!original || Number(original.month) !== TARGET_MONTH || Number(original.year) !== TARGET_YEAR) {
  throw new Error('The original August budget could not be verified from a restore snapshot; no changes were made.')
}

const { data: auditRows, error: auditError } = await supabase
  .from('audit_trail')
  .select('id, user_id, user_name, record_id, description, new_value, created_at')
  .eq('action_type', 'Budget Created')
  .eq('record_id', `${TARGET_YEAR}-${TARGET_MONTH}`)
  .order('created_at', { ascending: true })
if (auditError) throw auditError

const additions = (auditRows || []).map((row) => ({
  auditId: row.id,
  month: TARGET_MONTH,
  quarter: 3,
  year: TARGET_YEAR,
  amount: Number(row.new_value?.amount || 0),
  source: row.new_value?.source || '',
  description: row.new_value?.description || row.description || '',
  addedBy: row.user_id || null,
  addedByName: row.user_name || 'SK Treasurer',
  createdAt: row.created_at,
}))

if (!additions.length || additions.some((entry) => entry.amount <= 0)) {
  throw new Error('The August additions could not be verified from the audit trail; no changes were made.')
}

const { data: beforeRows, error: beforeError } = await supabase
  .from('budgets')
  .select('id, month, quarter, year, amount, source, created_at')
  .eq('month', TARGET_MONTH)
  .eq('year', TARGET_YEAR)
  .order('created_at', { ascending: true })
if (beforeError) throw beforeError

const currentOriginal = (beforeRows || []).find((row) => String(row.id) === String(ORIGINAL_ROW_ID))
if (!currentOriginal) throw new Error('Budget row 28 is missing; no changes were made.')

const insertedIds = []
let restoredOriginal = false

try {
  if (Number(currentOriginal.amount) !== Number(original.amount) || currentOriginal.source !== original.source) {
    const { error } = await supabase
      .from('budgets')
      .update({ amount: Number(original.amount), source: original.source || '' })
      .eq('id', ORIGINAL_ROW_ID)
    if (error) throw error
    restoredOriginal = true
  }

  for (const addition of additions) {
    const alreadyPresent = (beforeRows || []).some((row) =>
      String(row.id) !== String(ORIGINAL_ROW_ID)
      && Number(row.amount) === addition.amount
      && row.source === addition.source
      && new Date(row.created_at).getTime() === new Date(addition.createdAt).getTime()
    )
    if (alreadyPresent) continue

    const basePayload = {
      month: addition.month,
      quarter: addition.quarter,
      year: addition.year,
      amount: addition.amount,
      source: addition.source,
      created_at: addition.createdAt,
    }
    const metadataPayload = {
      ...basePayload,
      description: addition.description,
      added_by: addition.addedBy,
      added_by_name: addition.addedByName,
    }

    let result = await supabase.from('budgets').insert(metadataPayload).select('id').single()
    if (result.error && ['PGRST204', '42703'].includes(result.error.code)) {
      result = await supabase.from('budgets').insert(basePayload).select('id').single()
    }
    if (result.error) throw result.error
    insertedIds.push(result.data.id)
  }
} catch (error) {
  if (insertedIds.length) await supabase.from('budgets').delete().in('id', insertedIds)
  if (restoredOriginal) {
    await supabase
      .from('budgets')
      .update({ amount: currentOriginal.amount, source: currentOriginal.source || '' })
      .eq('id', ORIGINAL_ROW_ID)
  }
  throw error
}

const { data: repairedRows, error: verifyError } = await supabase
  .from('budgets')
  .select('id, month, year, amount, source, created_at')
  .eq('month', TARGET_MONTH)
  .eq('year', TARGET_YEAR)
  .order('created_at', { ascending: true })
if (verifyError) throw verifyError

const total = (repairedRows || []).reduce((sum, row) => sum + Number(row.amount || 0), 0)
console.table(repairedRows)
console.log(`Repaired August ${TARGET_YEAR} budget total: ${total}`)

if (total !== Number(original.amount) + additions.reduce((sum, row) => sum + row.amount, 0)) {
  throw new Error('Repair verification failed: the reconstructed monthly total is unexpected.')
}
