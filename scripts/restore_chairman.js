import { createAdminClient } from './supabaseAdminClient.js'

// Credentials come from the git-ignored .env.local. The service role key
// is never written into this file.
const supabase = createAdminClient()
async function cleanupAndRestore() {
  const incorrectChairmanId = '52792f12-ecbc-4692-a744-59ca9030d197' // singco
  const originalChairmanId = '80d255a8-ef5a-45de-a360-ee5e6be61474' // john zander zerrudo
  const originalEmail = 'johnzanderzerrudo@gmail.com'
  const originalName = 'John Zander Zerrudo'

  console.log('1. Deleting incorrect SK Chairman from created_accounts...')
  const { error: delError } = await supabase
    .from('created_accounts')
    .delete()
    .eq('id', incorrectChairmanId)
  
  if (delError) {
    console.error('Error deleting from created_accounts:', delError.message)
  } else {
    console.log('Successfully deleted incorrect chairman from created_accounts.')
  }

  console.log('2. Restoring original SK Chairman in created_accounts...')
  const { error: insertError } = await supabase
    .from('created_accounts')
    .upsert({
      id: originalChairmanId,
      email: originalEmail,
      full_name: originalName,
      role: 'SK Chairman',
      is_active: true
    })
  
  if (insertError) {
    console.error('Error inserting original chairman:', insertError.message)
  } else {
    console.log('Successfully restored original SK Chairman in created_accounts.')
  }
}

cleanupAndRestore()
