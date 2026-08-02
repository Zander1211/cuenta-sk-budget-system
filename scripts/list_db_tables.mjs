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

async function inspectAllPublicTables() {
  console.log("=== CHECKING ALL TABLES IN SUPABASE ===");
  const tables = [
    'expenses',
    'budgets',
    'documents',
    'document_counters',
    'receipt_records',
    'report_summaries',
    'chat_history',
    'audit_trail',
    'backups',
    'restore_history',
    'notifications',
    'projects',
    'requests',
    'budget_requests',
    'project_photos',
    'created_accounts',
    'member_biodata'
  ];

  for (const table of tables) {
    try {
      const { data, count, error } = await supabase.from(table).select('*', { count: 'exact' }).limit(5);
      if (error) {
        console.log(`Table "${table}": DOES NOT EXIST or ${error.message}`);
      } else {
        console.log(`Table "${table}": ${count} total rows.`);
        if (data && data.length > 0) {
          console.log(`  Sample row:`, JSON.stringify(data[0]));
        }
      }
    } catch (e) {
      console.log(`Table "${table}": Exception ${e.message}`);
    }
  }
}

inspectAllPublicTables();
