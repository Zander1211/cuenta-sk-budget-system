import { createAdminClient } from './supabaseAdminClient.js'

// Credentials come from the git-ignored .env.local. The service role key
// is never written into this file.
const supabase = createAdminClient()
async function testRpc() {
  const { data, error } = await supabase.rpc('has_sk_chairman')
  console.log('has_sk_chairman:', data, error)
}

testRpc()
