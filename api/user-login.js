/* global process */
import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { id } = req.query || {}
  
  if (!id) {
    return res.status(400).json({ error: 'Missing user ID' })
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseServiceKey) {
    return res.status(500).json({ error: 'Configuration missing' })
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  const { data, error } = await supabase.auth.admin.getUserById(id)

  if (error) {
    return res.status(400).json({ error: error.message })
  }

  res.status(200).json({ last_sign_in_at: data.user.last_sign_in_at })
}
