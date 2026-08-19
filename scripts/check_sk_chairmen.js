import { createAdminClient } from './supabaseAdminClient.js'

// Credentials come from the git-ignored .env.local. The service role key
// is never written into this file.
const supabase = createAdminClient()
async function check() {
  const { data: accounts, error } = await supabase
    .from('created_accounts')
    .select('*')
    .eq('role', 'SK Chairman')
    .order('created_at', { ascending: true })

  if (error) {
    console.error('Error fetching accounts:', error)
    return
  }

  console.log('SK Chairman Accounts Found:', accounts.length)
  accounts.forEach((acc, i) => {
    console.log(`[${i+1}] ID: ${acc.id} | Email: ${acc.email} | Name: ${acc.full_name} | Created: ${acc.created_at}`)
  })
}

check()
