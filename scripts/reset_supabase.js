import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const envPath = resolve(__dirname, '../.env.local');
const envFile = readFileSync(envPath, 'utf-8');

let supabaseUrl = '';
let supabaseKey = '';

envFile.split('\n').forEach(line => {
  if (line.startsWith('VITE_SUPABASE_URL=')) supabaseUrl = line.split('=')[1].trim();
  if (line.startsWith('VITE_SUPABASE_ANON_KEY=')) supabaseKey = line.split('=')[1].trim();
});

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase env variables");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const tables = [
  'expenses',
  'requests',
  'budgets',
  'projects',
  'documents',
  'document_counters',
  'report_summaries',
  'audit_trail',
  'backups',
  'restore_history'
];

async function resetSupabase() {
  console.log("Starting reset...");
  for (const table of tables) {
    console.log(`Deleting all rows from ${table}...`);
    const { error } = await supabase.from(table).delete().neq('id', 'xxxxxx');
    
    if (error) {
      console.warn(`Could not delete from ${table}:`, error.message);
    } else {
      console.log(`Deleted rows from ${table}`);
    }
  }
  console.log("Finished resetting Supabase.");
}

resetSupabase();
