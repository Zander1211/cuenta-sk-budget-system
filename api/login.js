/* global process */
import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { email, password, recaptchaToken } = req.body || {}

  if (!email || !password || typeof recaptchaToken !== 'string' || !recaptchaToken.trim()) {
    return res.status(400).json({ error: 'Missing required fields' })
  }

  // Verify Google reCAPTCHA
  const secret = process.env.RECAPTCHA_SECRET_KEY?.trim()
  if (!secret) {
    return res.status(500).json({ error: 'Server configuration missing RECAPTCHA_SECRET_KEY' })
  }

  let verifyData
  try {
    const verifyResponse = await fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        secret,
        response: recaptchaToken.trim(),
      }).toString(),
    })

    if (!verifyResponse.ok) {
      throw new Error(`Google verification returned HTTP ${verifyResponse.status}`)
    }
    verifyData = await verifyResponse.json()
  } catch (error) {
    console.error('reCAPTCHA verification service error:', error)
    return res.status(502).json({
      error: 'The CAPTCHA verification service is temporarily unavailable. Please try again.',
    })
  }

  if (!verifyData.success) {
    const errorCodes = Array.isArray(verifyData['error-codes'])
      ? verifyData['error-codes'].join(', ')
      : 'unknown-error'
    console.warn('reCAPTCHA verification failed:', errorCodes)
    return res.status(400).json({
      error: `reCAPTCHA verification failed (${errorCodes}). Please try again.`,
    })
  }

  const allowedHosts = (process.env.RECAPTCHA_ALLOWED_HOSTNAMES
    || 'cuenta-sk-budget-system.vercel.app,localhost')
    .split(',')
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean)

  if (verifyData.hostname && !allowedHosts.includes(verifyData.hostname.toLowerCase())) {
    console.warn('reCAPTCHA hostname rejected:', verifyData.hostname)
    return res.status(400).json({
      error: 'reCAPTCHA was completed for an unauthorized website hostname.',
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
