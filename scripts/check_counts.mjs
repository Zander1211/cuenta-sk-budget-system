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
const supabase = createClient(supabaseUrl, keyToUse);

async function checkAllTables() {
  const candidateTables = [
    'expenses', 'requests', 'budget_requests', 'budgets', 'projects',
    'project_photos', 'documents', 'document_counters', 'report_summaries',
    'receipt_records', 'chat_history', 'audit_trail', 'backups',
    'restore_history', 'notifications', 'created_accounts', 'member_biodata'
  ];

  console.log("=== SUPABASE TABLE ROW COUNTS ===");
  for (const t of candidateTables) {
    try {
      const { count, error } = await supabase.from(t).select('*', { count: 'exact', head: true });
      if (error) {
        console.log(`Table "${t}": Error (${error.message})`);
      } else {
        console.log(`Table "${t}": ${count} rows`);
      }
    } catch (e) {
      console.log(`Table "${t}": ExCP (${e.message})`);
    }
  }
}

checkAllTables();
