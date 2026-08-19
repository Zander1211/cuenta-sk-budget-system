// /api/verify-otp.js
// Verifies a 6-digit OTP code against the verification_codes table.

import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { email, code } = req.body

  if (!email || !code) {
    return res.status(400).json({ error: 'Email and code are required.' })
  }

  try {
    const supabaseUrl = process.env.VITE_SUPABASE_URL
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Look up the latest code for this email
    const { data, error: dbError } = await supabase
      .from('verification_codes')
      .select('*')
      .eq('email', email)
      .eq('code', code.trim())
      .eq('verified', false)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (dbError || !data) {
      return res.status(400).json({ error: 'Invalid verification code. Please try again.' })
    }

    // Check expiry
    if (new Date(data.expires_at) < new Date()) {
      return res.status(400).json({ error: 'Verification code has expired. Please request a new one.' })
    }

    // Mark as verified
    await supabase
      .from('verification_codes')
      .update({ verified: true })
      .eq('id', data.id)

    return res.status(200).json({ success: true, message: 'Verification successful.' })
  } catch (err) {
    console.error('[verify-otp] Error:', err)
    return res.status(500).json({ error: 'Verification failed: ' + err.message })
  }
}
