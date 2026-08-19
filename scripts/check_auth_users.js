import { createAdminClient } from './supabaseAdminClient.js'

// Credentials come from the git-ignored .env.local. The service role key
// is never written into this file.
const supabase = createAdminClient()
async function checkEmailSettings() {
  // Check if there are any recent auth users and their confirmation status
  const { data: { users }, error } = await supabase.auth.admin.listUsers()

  if (error) {
    console.error('Error:', error)
    return
  }

  console.log('Total users:', users.length)
  users.forEach((user, i) => {
    console.log(`[${i+1}] ${user.email}`)
    console.log(`     confirmed_at: ${user.confirmed_at || 'NOT CONFIRMED'}`)
    console.log(`     email_confirmed_at: ${user.email_confirmed_at || 'NOT CONFIRMED'}`)
    console.log(`     created_at: ${user.created_at}`)
    console.log(`     last_sign_in_at: ${user.last_sign_in_at || 'NEVER'}`)
    console.log(`     role: ${user.user_metadata?.role || 'none'}`)
    console.log('')
  })
}

checkEmailSettings()
