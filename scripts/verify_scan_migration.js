import { createClient } from '@supabase/supabase-js'
import { existsSync, readFileSync } from 'fs'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'
import { createAdminClient } from './supabaseAdminClient.js'

/**
 * Read-only verification that the receipt-scan migrations are live.
 *
 * Checks three things, in the order they would break:
 *   1. receipt_records has the scan columns  (20260819160000)
 *   2. public_projects exposes the new expenditure columns  (20260819170000)
 *   3. anon can still read public_projects, which is what the public portal
 *      actually uses. A migration that drops and recreates a view loses its
 *      grants, so this is the step most likely to be silently wrong.
 *
 * Performs no writes.
 */

const admin = createAdminClient()

const SCAN_COLUMNS = 'original_path, ocr_metadata, scan_settings, is_scanned, ocr_verified_at, ocr_verified_by'
const VIEW_COLUMNS =
  'id, name, category, approved_allocation, actual_expenditure, expenditure_reported, verified_receipt_count, remaining_amount, progress_percent'

const tick = ok => (ok ? 'PASS' : 'FAIL')
let failures = 0

function report(label, ok, detail) {
  if (!ok) failures += 1
  console.log(`[${tick(ok)}] ${label}${detail ? ` - ${detail}` : ''}`)
}

// ── 1. receipt_records scan columns ────────────────────────────────────────
const receiptProbe = await admin.from('receipt_records').select(SCAN_COLUMNS).limit(1)
report(
  'receipt_records has scan columns (20260819160000)',
  !receiptProbe.error,
  receiptProbe.error?.message,
)

// ── 2. public_projects expenditure columns ─────────────────────────────────
const viewProbe = await admin.from('public_projects').select(VIEW_COLUMNS).limit(50)
report(
  'public_projects has expenditure columns (20260819170000)',
  !viewProbe.error,
  viewProbe.error?.message,
)

// ── 3. anon can still read the public view ─────────────────────────────────
const here = dirname(fileURLToPath(import.meta.url))
const envPath = resolve(here, '../.env.local')
let anonKey = ''
let url = ''

if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const t = line.trim()
    if (t.startsWith('VITE_SUPABASE_ANON_KEY=')) anonKey = t.slice(t.indexOf('=') + 1).trim()
    if (t.startsWith('VITE_SUPABASE_URL=')) url = t.slice(t.indexOf('=') + 1).trim()
  }
}

if (anonKey && url) {
  const anon = createClient(url, anonKey, { auth: { persistSession: false } })
  const anonProbe = await anon.from('public_projects').select('id').limit(1)
  report('anon can SELECT public_projects (portal works)', !anonProbe.error, anonProbe.error?.message)

  // RLS does not error on a blocked read; it returns an empty set. So the
  // only meaningful test is whether any row actually came back.
  const leak = await anon.from('receipt_records').select('id, file_path').limit(5)
  const leakedRows = leak.data?.length || 0
  report(
    'anon CANNOT read receipt_records (scans stay private)',
    leakedRows === 0,
    leak.error
      ? `blocked with error: ${leak.error.message}`
      : leakedRows === 0
        ? 'blocked by RLS, returned 0 rows'
        : `EXPOSED: ${leakedRows} row(s) readable by anon`,
  )

  // Same question for the underlying financial table.
  const expenseLeak = await anon.from('expenses').select('id').limit(5)
  const expenseRows = expenseLeak.data?.length || 0
  report(
    'anon CANNOT read expenses directly',
    expenseRows === 0,
    expenseLeak.error
      ? `blocked with error: ${expenseLeak.error.message}`
      : expenseRows === 0
        ? 'blocked, returned 0 rows'
        : `EXPOSED: ${expenseRows} row(s) readable by anon`,
  )
} else {
  report('anon checks', false, 'VITE_SUPABASE_ANON_KEY or VITE_SUPABASE_URL missing from .env.local')
}

// ── What the portal will actually display ──────────────────────────────────
if (!viewProbe.error) {
  const rows = viewProbe.data || []
  console.log(`\nPublished projects: ${rows.length}`)
  for (const row of rows) {
    const spent = row.expenditure_reported
      ? `spent ${row.actual_expenditure}`
      : 'spent NOT REPORTED (card shows "Not yet reported")'
    console.log(
      `  ${row.name}\n    approved ${row.approved_allocation} | ${spent} | verified receipts: ${row.verified_receipt_count}`,
    )
  }
  if (rows.length && rows.every(r => !r.expenditure_reported)) {
    console.log(
      '\nNo project has a verified receipt yet, so every card reads "Not yet reported".\nScan a receipt against one of these projects to see a figure appear.',
    )
  }
}

console.log(`\n${failures === 0 ? 'All checks passed.' : `${failures} check(s) failed.`}`)
process.exit(failures === 0 ? 0 : 1)
