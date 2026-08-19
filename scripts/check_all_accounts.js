import { createAdminClient } from './supabaseAdminClient.js'

// Credentials come from the git-ignored .env.local. The service role key
// is never written into this file.
const supabase = createAdminClient()
async function checkAll() {
  const { data: accounts, error } = await supabase
    .from('created_accounts')
    .select('*')
    .order('created_at', { ascending: true })

  if (error) {
    console.error('Error fetching accounts:', error)
    return
  }

  console.log('All Accounts Found:', accounts.length)
  accounts.forEach((acc, i) => {
    console.log(`[${i+1}] ID: ${acc.id} | Email: ${acc.email} | Name: ${acc.full_name} | Role: ${acc.role} | Created: ${acc.created_at}`)
  })
}

checkAll()
