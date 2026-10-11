/* global process */
import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300')
  res.setHeader('Content-Type', 'application/json')

  try {
    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'https://imxwgkwlxjqadwigjuxz.supabase.co'
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    const anonKey = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlteHdna3dseGpxYWR3aWdqdXh6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzNTMxNzAsImV4cCI6MjA5NDkyOTE3MH0.v2nac-HGkjaM862-AFoa8YyWp3ZPqn_5weJXX1ZRCY4'

    const key = serviceRoleKey || anonKey
    const supabase = createClient(supabaseUrl, key)

    const { data, error } = await supabase
      .from('created_accounts')
      .select('full_name')
      .eq('role', 'SK Chairman')
      .eq('is_active', true)
      .maybeSingle()

    if (error) {
      console.warn('Error fetching active SK Chairman from database:', error.message)
      return res.status(200).json({ fullName: 'John Zander Zerrudo' })
    }

    const fullName = data?.full_name?.trim() || 'John Zander Zerrudo'
    return res.status(200).json({ fullName })
  } catch (err) {
    console.error('Unhandled error in /api/sk-chairman:', err)
    return res.status(200).json({ fullName: 'John Zander Zerrudo' })
  }
}
