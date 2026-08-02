import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const envPath = resolve(__dirname, '../.env.local');
let supabaseUrl = '';
let serviceRoleKey = '';
let anonKey = '';

if (existsSync(envPath)) {
  const envFile = readFileSync(envPath, 'utf-8');
  envFile.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed.startsWith('VITE_SUPABASE_URL=')) supabaseUrl = trimmed.split('=').slice(1).join('=').trim();
    if (trimmed.startsWith('SUPABASE_SERVICE_ROLE_KEY=')) serviceRoleKey = trimmed.split('=').slice(1).join('=').trim();
    if (trimmed.startsWith('VITE_SUPABASE_ANON_KEY=')) anonKey = trimmed.split('=').slice(1).join('=').trim();
  });
}

const keyToUse = serviceRoleKey || anonKey;

if (!supabaseUrl || !keyToUse) {
  console.error("Missing Supabase URL or Key in .env.local");
  process.exit(1);
}

console.log("Connecting to Supabase using:", serviceRoleKey ? "SERVICE ROLE KEY (RLS Bypassed)" : "ANON KEY");
const supabase = createClient(supabaseUrl, keyToUse, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const targetTables = [
  'expenses',
  'requests',
  'budget_requests',
  'budgets',
  'projects',
  'project_photos',
  'documents',
  'report_summaries',
  'receipt_records',
  'chat_history',
  'audit_trail',
  'backups',
  'restore_history',
  'notifications',
];

async function deleteFromTable(table) {
  // Try 1: numeric filter (bigint PK tables like expenses, budgets)
  let res = await supabase.from(table).delete().neq('id', -999999999);
  if (!res.error) return { status: 'success' };

  // If error is invalid input for bigint (means id is text or uuid), try uuid filter
  if (res.error.code === '22P02') {
    // Try 2: UUID filter (UUID PK tables like documents, audit_trail, backups, restore_history, receipt_records)
    res = await supabase.from(table).delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (!res.error) return { status: 'success' };

    // Try 3: text filter
    if (res.error.code === '22P02') {
      res = await supabase.from(table).delete().neq('id', '__dummy_id__');
      if (!res.error) return { status: 'success' };
    }
  }

  // If table does not exist (PGRST204 / PGRST200 / 42P01)
  if (res.error.code === 'PGRST204' || res.error.code === 'PGRST200' || res.error.code === '42P01' || res.error.message.includes('schema cache')) {
    return { status: 'skipped', message: res.error.message };
  }

  return { status: 'error', message: res.error.message };
}

async function resetSupabase() {
  console.log("Starting full system data cleanup...");

  // 1. Delete rows from operational tables
  for (const table of targetTables) {
    console.log(`Clearing operational table "${table}"...`);
    const res = await deleteFromTable(table);
    
    if (res.status === 'success') {
      console.log(`  Successfully cleared table "${table}".`);
    } else if (res.status === 'skipped') {
      console.log(`  Table "${table}" does not exist in database.`);
    } else {
      console.warn(`  Notice for table "${table}": ${res.message}`);
    }
  }

  // 2. Reset document counters
  console.log("Resetting document counter sequence...");
  try {
    const { error: counterError } = await supabase
      .from('document_counters')
      .update({ last_number: 0 })
      .neq('id', '__dummy__');

    if (counterError) {
      if (counterError.message.includes('schema cache') || counterError.code === 'PGRST204') {
        console.log("  Table document_counters does not exist.");
      } else {
        console.warn("  Notice for document_counters:", counterError.message);
      }
    } else {
      console.log("  Reset document_counters to 0.");
    }
  } catch (err) {
    console.warn("  Notice for document_counters:", err.message);
  }

  // 3. Clear storage buckets (receipts & project_photos)
  const bucketsToClear = ['receipts', 'project_photos'];
  for (const bucketName of bucketsToClear) {
    console.log(`Cleaning storage bucket "${bucketName}"...`);
    try {
      const { data: fileList, error: listErr } = await supabase.storage.from(bucketName).list('', { limit: 1000 });
      if (listErr) {
        console.warn(`  Notice for bucket "${bucketName}":`, listErr.message);
      } else if (fileList && fileList.length > 0) {
        const pathsToDelete = fileList.map(f => f.name);
        const { error: delErr } = await supabase.storage.from(bucketName).remove(pathsToDelete);
        if (delErr) {
          console.warn(`  Notice for bucket "${bucketName}":`, delErr.message);
        } else {
          console.log(`  Deleted ${pathsToDelete.length} file(s) from bucket "${bucketName}".`);
        }
      } else {
        console.log(`  Bucket "${bucketName}" is empty.`);
      }
    } catch (err) {
      console.warn(`  Notice for bucket "${bucketName}":`, err.message);
    }
  }

  console.log("Finished resetting Supabase system data.");
}

resetSupabase().catch((err) => {
  console.error("System reset failed:", err);
  process.exit(1);
});
