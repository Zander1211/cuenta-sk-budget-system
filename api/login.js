import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { email, password, recaptchaToken } = req.body

  if (!email || !password || !recaptchaToken) {
    return res.status(400).json({ error: 'Missing required fields' })
  }

  // Verify Google reCAPTCHA
  const secret = process.env.RECAPTCHA_SECRET_KEY
  if (!secret) {
    return res.status(500).json({ error: 'Server configuration missing RECAPTCHA_SECRET_KEY' })
  }

  const verifyResponse = await fetch('https://www.google.com/recaptcha/api/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `secret=${secret}&response=${recaptchaToken}`,
  })

  const verifyData = await verifyResponse.json()
  if (!verifyData.success) {
    const errorCodes = Array.isArray(verifyData['error-codes'])
      ? verifyData['error-codes'].join(', ')
      : 'unknown-error'
    console.warn('reCAPTCHA verification failed:', errorCodes)
    return res.status(400).json({
      error: `reCAPTCHA verification failed (${errorCodes}). Please try again.`,
    })
  }

  // CAPTCHA verified, now authenticate with Supabase
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    return res.status(500).json({ error: 'Supabase configuration is missing on the server' })
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey)

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) {
    return res.status(401).json({ error: error.message })
  }

  res.status(200).json({ session: data.session })
}
