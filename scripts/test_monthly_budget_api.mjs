// Integration test of the actual PostgREST write path. Uses an unused period
// and removes only the fixture created by this run; never edits real budgets.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { createAdminClient } from './supabaseAdminClient.js'
import { saveMonthlyBudget } from '../src/services/monthlyBudget.js'

const client = createAdminClient()
const period = { month: 8, year: 2097 }
const marker = `Monthly budget API verification ${randomUUID()}`
let fixtureId
const operationIds = Array.from({ length: 4 }, () => randomUUID())
try {
  const existing = await client.from('budgets').select('id').match(period)
  if (existing.error) throw existing.error
  assert.equal(existing.data.length, 0, 'Test period occupied; do not change existing records')
  const first = await saveMonthlyBudget(client, { ...period, amount: 50000, description: marker, operationId: operationIds[0] })
  if (first.error) throw first.error
  fixtureId = first.data.id
  console.log('Initial API save:', JSON.stringify(first.data))
  const secondInput = { ...period, amount: 50000, description: marker, operationId: operationIds[1] }
  const updated = await saveMonthlyBudget(client, secondInput)
  if (updated.error) throw updated.error
  console.log('Updated API save:', JSON.stringify(updated.data))
  assert.equal(updated.data.amount, 100000)
  assert.equal(updated.data.id, fixtureId)
  const retry = await saveMonthlyBudget(client, secondInput)
  if (retry.error) throw retry.error
  assert.equal(retry.data.amount, 100000)
  assert.equal(retry.replayed, true)
  const concurrent = await Promise.all(operationIds.slice(2).map(operationId =>
    saveMonthlyBudget(client, { ...period, amount: 500, description: marker, operationId })))
  for (const result of concurrent) if (result.error) throw result.error
  const reloaded = await client.from('budgets').select('*').match(period).single()
  if (reloaded.error) throw reloaded.error
  assert.equal(Number(reloaded.data.amount), 101000)
  console.log('PASS: 50,000 + 50,000 = 100,000; retry adds nothing; two concurrent 500 additions produce 101,000')
} finally {
  if (fixtureId) {
    const cleanup = await client.from('budgets').delete().eq('id', fixtureId).eq('description', marker)
    if (cleanup.error) throw cleanup.error
    const historyCleanup = await client.from('monthly_budget_additions').delete().in('operation_id', operationIds).eq('description', marker)
    if (historyCleanup.error) throw historyCleanup.error
    console.log('Removed API test fixture')
  }
}
