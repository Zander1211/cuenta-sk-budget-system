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

const supabase = createClient(supabaseUrl, serviceRoleKey || anonKey);

async function check() {
  const { data, error } = await supabase.from('budget_requests').select('id, event, type, breakdown').eq('type', 'Payroll').limit(5);
  console.log('Payroll Requests:', JSON.stringify(data, null, 2), error);
}

check();
