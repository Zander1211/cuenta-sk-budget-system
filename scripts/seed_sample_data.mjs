// scripts/seed_sample_data.mjs
//
// Seeds realistic sample budgets + expenses into Supabase so the Financial
// Analysis module has real data to render (charts, tables, AI insights all
// read from these tables — nothing in the UI is faked).
//
// Requires a SERVICE ROLE key because `budgets`/`expenses` RLS policies only
// allow the `authenticated` Postgres role to write, and this script runs
// outside a browser session. Add SUPABASE_SERVICE_ROLE_KEY to .env.local
// (Project Settings -> API -> service_role key in your Supabase dashboard)
// before running. NEVER commit that key or expose it to the frontend.
//
// Usage:
//   node scripts/seed_sample_data.mjs          # seed sample data
//   node scripts/seed_sample_data.mjs --clean  # remove previously seeded rows only
//
// Safe to re-run: it only ever deletes rows it previously tagged as sample
// data (budgets.source ending in "(Sample)", expenses.notes containing the
// SEED_TAG below) before inserting fresh ones. It never touches real rows.

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const envPath = resolve(__dirname, '../.env.local');
const envFile = readFileSync(envPath, 'utf-8');

let supabaseUrl = '';
let serviceRoleKey = '';
envFile.split('\n').forEach((line) => {
  const trimmed = line.trim();
  if (trimmed.startsWith('VITE_SUPABASE_URL=')) supabaseUrl = trimmed.split('=').slice(1).join('=').trim();
  if (trimmed.startsWith('SUPABASE_SERVICE_ROLE_KEY=')) serviceRoleKey = trimmed.split('=').slice(1).join('=').trim();
});

if (!supabaseUrl || !serviceRoleKey) {
  console.error(
    'Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local.\n' +
    'Add this line to cuenta/.env.local (get the key from Supabase Dashboard -> Project Settings -> API -> service_role):\n\n' +
    '  SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here\n\n' +
    'This key bypasses Row Level Security — keep it out of git and never use it in frontend code.'
  );
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const SEED_TAG = 'Cuenta sample seed data — safe to delete';
const SOURCE_SUFFIX = '(Sample)';

const CATEGORIES = ['Sports', 'Education', 'Community Programs', 'Environment', 'Other'];

const PROJECTS = [
  { event: 'Barangay Youth Sports Festival', category: 'Sports', venue: 'Barangay Covered Court' },
  { event: 'Basketball League Season Opener', category: 'Sports', venue: 'Barangay Covered Court' },
  { event: 'SK Scholarship Program', category: 'Education', venue: 'Barangay Hall' },
  { event: 'Values Formation Seminar', category: 'Education', venue: 'Multipurpose Hall' },
  { event: 'Skills Training Workshop', category: 'Education', venue: 'Barangay Hall' },
  { event: 'Community Clean-up Drive', category: 'Environment', venue: 'Barangay Proper' },
  { event: 'Tree Planting Activity', category: 'Environment', venue: 'Riverside Area' },
  { event: 'Waste Segregation Campaign', category: 'Environment', venue: 'Barangay Proper' },
  { event: 'Christmas Outreach Program', category: 'Community Programs', venue: 'Barangay Plaza' },
  { event: 'Barangay Assembly Day', category: 'Community Programs', venue: 'Multipurpose Hall' },
  { event: 'Leadership Summit', category: 'Community Programs', venue: 'Barangay Hall' },
  { event: 'Feeding Program', category: 'Community Programs', venue: 'Day Care Center' },
  { event: 'Office Supplies Replenishment', category: 'Other', venue: 'Barangay Hall' },
  { event: 'SK Anniversary Celebration', category: 'Other', venue: 'Barangay Plaza' },
];

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// Deterministic pseudo-random so re-runs produce a stable, reviewable dataset.
function mulberry32(seed) {
  let a = seed;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260724);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const randInt = (min, max) => Math.floor(min + rand() * (max - min + 1));

function quarterOf(month) {
  return Math.floor((month - 1) / 3) + 1;
}

function pad(n) {
  return String(n).padStart(2, '0');
}

async function cleanSeededData() {
  console.log('Removing previously seeded sample rows...');

  const { data: budgetRows, error: bSelErr } = await supabase
    .from('budgets')
    .select('id, source')
    .ilike('source', `%${SOURCE_SUFFIX}`);
  if (bSelErr) {
    console.warn('  Could not query budgets for cleanup:', bSelErr.message);
  } else if (budgetRows?.length) {
    const ids = budgetRows.map((r) => r.id);
    const { error } = await supabase.from('budgets').delete().in('id', ids);
    if (error) console.warn('  Failed to delete sample budgets:', error.message);
    else console.log(`  Deleted ${ids.length} sample budget row(s).`);
  } else {
    console.log('  No sample budgets found.');
  }

  const { data: expenseRows, error: eSelErr } = await supabase
    .from('expenses')
    .select('id, notes')
    .eq('notes', SEED_TAG);
  if (eSelErr) {
    console.warn('  Could not query expenses for cleanup:', eSelErr.message);
  } else if (expenseRows?.length) {
    const ids = expenseRows.map((r) => r.id);
    const { error } = await supabase.from('expenses').delete().in('id', ids);
    if (error) console.warn('  Failed to delete sample expenses:', error.message);
    else console.log(`  Deleted ${ids.length} sample expense row(s).`);
  } else {
    console.log('  No sample expenses found.');
  }
}

function buildBudgetRows(years) {
  const rows = [];
  for (const year of years) {
    for (let month = 1; month <= 12; month++) {
      // A gentle seasonal wave so utilization/trend charts have visible shape,
      // not a flat line.
      const base = 90000 + Math.sin((month / 12) * Math.PI * 2) * 20000;
      const amount = Math.round((base + randInt(-8000, 8000)) / 500) * 500;
      rows.push({
        month,
        quarter: quarterOf(month),
        year,
        amount,
        source: `SK Fund Allocation ${SOURCE_SUFFIX}`,
      });
    }
  }
  return rows;
}

function buildExpenseRows(years) {
  const rows = [];
  for (const year of years) {
    for (let month = 1; month <= 12; month++) {
      const count = randInt(3, 7);
      for (let i = 0; i < count; i++) {
        const project = pick(PROJECTS);
        const day = randInt(1, 27);
        const approvedAt = new Date(Date.UTC(year, month - 1, day, randInt(8, 17), randInt(0, 59)));
        const amount = randInt(3, 45) * 1000 + pick([0, 250, 500, 750]);
        const hasReceipt = rand() > 0.22; // ~22% intentionally missing, for the missing-receipts insight

        rows.push({
          event: project.event,
          project: project.event,
          category: project.category,
          type: 'Project',
          amount,
          status: 'Approved',
          approved_at: approvedAt.toISOString(),
          event_date: approvedAt.toISOString().slice(0, 10),
          venue: project.venue,
          description: `${project.event} — approved expenditure for ${MONTHS[month - 1]} ${year}.`,
          notes: SEED_TAG,
          receipt_url: hasReceipt ? `https://example-receipts.local/sample/${year}-${pad(month)}-${pad(day)}-${i}.jpg` : null,
          receipt_name: hasReceipt ? `receipt-${year}${pad(month)}${pad(day)}-${i}.jpg` : null,
        });
      }
    }
  }
  return rows;
}

async function insertInChunks(table, rows, chunkSize = 200) {
  let inserted = 0;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { error } = await supabase.from(table).insert(chunk);
    if (error) {
      console.error(`  Insert failed for ${table} (rows ${i}-${i + chunk.length}):`, error.message);
      console.error('  First row in failing chunk:', JSON.stringify(chunk[0], null, 2));
      throw error;
    }
    inserted += chunk.length;
  }
  return inserted;
}

async function seed() {
  const currentYear = new Date().getFullYear();
  const years = [currentYear - 1, currentYear];

  await cleanSeededData();

  console.log(`\nInserting sample budgets for ${years.join(', ')}...`);
  const budgetRows = buildBudgetRows(years);
  const budgetCount = await insertInChunks('budgets', budgetRows);
  console.log(`  Inserted ${budgetCount} budget rows.`);

  console.log(`\nInserting sample expenses for ${years.join(', ')}...`);
  const expenseRows = buildExpenseRows(years);
  const expenseCount = await insertInChunks('expenses', expenseRows);
  console.log(`  Inserted ${expenseCount} expense rows.`);

  console.log('\nDone. Log in and visit /dashboard/analysis to see it rendered.');
  console.log('Re-run this script anytime to refresh the sample data, or run with --clean to remove it.');
}

const isCleanOnly = process.argv.includes('--clean');
if (isCleanOnly) {
  cleanSeededData().then(() => console.log('\nDone.'));
} else {
  seed().catch((err) => {
    console.error('\nSeed failed:', err.message || err);
    process.exit(1);
  });
}
