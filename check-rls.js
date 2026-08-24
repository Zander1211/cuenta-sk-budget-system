import { createAdminClient } from './scripts/supabaseAdminClient.js'

/**
 * Inspects the RLS policies on public.expenses.
 *
 * Uses the shared admin client so the service role key stays in the
 * git-ignored .env.local instead of this file. See scripts/supabaseAdminClient.js.
 */

const supabase = createAdminClient()

async function checkPolicies() {
  const { data, error } = await supabase
    .rpc('get_policies_for_table', { table_name: 'expenses' })

  if (error) {
    // Fallback: try raw query via postgrest if we have a view or RPC, but we probably don't.
    console.log("RPC failed", error)
  } else {
    console.log(data)
  }
}

checkPolicies()
