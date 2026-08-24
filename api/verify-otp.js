// /api/verify-otp.js
// Verifies a custom Gmail OTP. For email changes, it also authenticates the
// caller and updates both Supabase Auth and the application's user directory.

import { createClient } from '@supabase/supabase-js'

function cleanEmail(value) {
  return String(value || '').trim().toLowerCase()
}

function errorMessage(error, fallback) {
  const candidates = [
    error?.message,
    error?.error_description,
    error?.error,
    typeof error === 'string' ? error : '',
  ]
  const message = candidates.find((value) => (
    typeof value === 'string'
    && value.trim()
    && value.trim() !== '{}'
    && value.trim() !== '[object Object]'
  ))

  if (!message) return fallback
  if (/already (been )?registered|already exists|email.*exists|duplicate/i.test(message)) {
    return 'That email address is already used by another account.'
  }
  return message
}

function bearerToken(authorization) {
  const match = String(authorization || '').match(/^Bearer\s+(.+)$/i)
  return match?.[1]?.trim() || ''
}

export async function verifyOtpRequest({
  email,
  code,
  purpose,
  authorization,
  supabaseUrl,
  serviceKey,
}) {
  const normalizedEmail = cleanEmail(email)
  const normalizedCode = String(code || '').trim()

  if (!normalizedEmail || !normalizedCode) {
    return { status: 400, body: { error: 'Email and code are required.' } }
  }
  if (!supabaseUrl || !serviceKey) {
    return { status: 500, body: { error: 'The verification service is not configured.' } }
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  let authenticatedUser = null
  if (purpose === 'email_change') {
    const token = bearerToken(authorization)
    if (!token) {
      return { status: 401, body: { error: 'Your session could not be verified. Please log in again.' } }
    }

    const { data: userData, error: userError } = await supabase.auth.getUser(token)
    authenticatedUser = userData?.user || null
    if (userError || !authenticatedUser) {
      return { status: 401, body: { error: 'Your session has expired. Please log in again.' } }
    }
    if (cleanEmail(authenticatedUser.email) === normalizedEmail) {
      return { status: 400, body: { error: 'Enter a different email address.' } }
    }
  }

  const { data: verification, error: verificationError } = await supabase
    .from('verification_codes')
    .select('id, expires_at')
    .eq('email', normalizedEmail)
    .eq('code', normalizedCode)
    .eq('verified', false)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (verificationError || !verification) {
    return { status: 400, body: { error: 'Invalid verification code. Please try again.' } }
  }
  if (new Date(verification.expires_at).getTime() < Date.now()) {
    return { status: 400, body: { error: 'Verification code has expired. Please request a new one.' } }
  }

  if (purpose === 'email_change') {
    const previousEmail = cleanEmail(authenticatedUser.email)
    const { error: authUpdateError } = await supabase.auth.admin.updateUserById(
      authenticatedUser.id,
      { email: normalizedEmail, email_confirm: true }
    )

    if (authUpdateError) {
      return {
        status: 400,
        body: { error: errorMessage(authUpdateError, 'Unable to update the email address. Please try another address.') },
      }
    }

    const { data: directoryRow, error: directoryError } = await supabase
      .from('created_accounts')
      .update({ email: normalizedEmail })
      .eq('id', authenticatedUser.id)
      .select('id')
      .maybeSingle()

    if (directoryError || !directoryRow) {
      const { error: rollbackError } = await supabase.auth.admin.updateUserById(
        authenticatedUser.id,
        { email: previousEmail, email_confirm: true }
      )
      if (rollbackError) console.error('[verify-otp] Email rollback failed:', rollbackError)
      console.error('[verify-otp] Directory email update failed:', directoryError)
      return { status: 500, body: { error: 'The account directory could not be updated. Please try again.' } }
    }
  }

  const { error: markError } = await supabase
    .from('verification_codes')
    .update({ verified: true })
    .eq('id', verification.id)

  if (markError) console.error('[verify-otp] Could not mark code as used:', markError)

  return {
    status: 200,
    body: {
      success: true,
      message: purpose === 'email_change'
        ? 'Email address updated successfully.'
        : 'Verification successful.',
      email: purpose === 'email_change' ? normalizedEmail : undefined,
    },
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const result = await verifyOtpRequest({
      ...req.body,
      authorization: req.headers?.authorization,
      supabaseUrl: process.env.VITE_SUPABASE_URL,
      serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    })
    return res.status(result.status).json(result.body)
  } catch (error) {
    console.error('[verify-otp] Error:', error)
    return res.status(500).json({ error: 'Verification failed. Please try again.' })
  }
}
