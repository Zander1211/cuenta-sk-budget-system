import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const envPath = resolve(__dirname, '../.env.local');
let supabaseUrl = '';
let serviceRoleKey = '';

if (existsSync(envPath)) {
  const envFile = readFileSync(envPath, 'utf-8');
  envFile.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed.startsWith('VITE_SUPABASE_URL=')) supabaseUrl = trimmed.split('=').slice(1).join('=').trim();
    if (trimmed.startsWith('SUPABASE_SERVICE_ROLE_KEY=')) serviceRoleKey = trimmed.split('=').slice(1).join('=').trim();
  });
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function runAudit() {
  // Get Monthly Budget
  const { data: budgets } = await supabase.from('budgets').select('*');
  console.log('--- ALL MONTHLY BUDGETS ---');
  console.log(budgets);

  // Get Budget Requests
  const { data: requests } = await supabase.from('budget_requests').select('*');
  const augRequests = requests.filter(r => {
    const d = new Date(r.event_date || r.submitted_at || r.created_at);
    return d.getMonth() === 7 && d.getFullYear() === 2026;
  });
  console.log('\n--- BUDGET REQUESTS (August 2026) ---');
  console.log(augRequests.map(r => ({ id: r.id, event: r.event, amount: r.amount, status: r.status, project_status: r.project_status, cancelled_at: r.cancelled_at })));

  // Get Expenses (Approved Allocations)
  const { data: expenses } = await supabase.from('expenses').select('*');
  const augExpenses = expenses.filter(e => {
    const d = new Date(e.date || e.approved_at || e.created_at);
    return d.getMonth() === 7 && d.getFullYear() === 2026;
  });
  console.log('\n--- EXPENSES (August 2026) ---');
  console.log(augExpenses.map(e => ({ id: e.id, request_id: e.request_id, event: e.project || e.event, amount: e.amount, status: e.status, project_status: e.project_status, archived_at: e.archived_at })));
}

runAudit();
