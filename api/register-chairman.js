// /api/register-chairman.js
// Registers the very first SK Chairman account after OTP verification.
// This is the one self-service signup path in the system (every other
// account is admin-created via /api/create-user.js) — no authenticated
// caller exists yet, so authorization instead comes from:
//   1. A verified OTP for the target email.
//   2. has_sk_chairman() being false (no active chairman already).
//
// Runs server-side with the service role key via auth.admin.createUser()
// rather than the public auth.signUp() the browser would otherwise call,
// because public signup on this project reliably fails with an opaque
// AuthRetryableFetchError (likely GoTrue's own confirmation-email step) —
// the admin API creates the user directly with email_confirm: true and
// never triggers that email at all. The existing auto_insert_sk_chairman
// trigger on auth.users then creates the created_accounts row automatically.

import { createClient } from '@supabase/supabase-js'

function cleanEmail(value) {
  return String(value || '').trim().toLowerCase()
}

function isPasswordValid(value) {
  return /^(?=.*[A-Za-z])(?=.*\d).{6,}$/.test(String(value || ''))
}

function safeErrorMessage(error, fallback) {
  const candidates = [
    typeof error === 'string' ? error : null,
    error?.message,
    error?.error_description,
    error?.error,
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

export async function registerChairmanRequest({
  fullName,
  email,
  password,
  code,
  supabaseUrl,
  serviceKey,
}) {
  const name = String(fullName || '').trim()
  const normalizedEmail = cleanEmail(email)
  const pass = String(password || '').trim()
  const normalizedCode = String(code || '').trim()

  if (!name || !normalizedEmail || !pass) {
    return { status: 400, body: { error: 'Full name, email, and password are required.' } }
  }
  if (!/^[a-zA-Z0-9._%+-]+@gmail\.com$/i.test(normalizedEmail)) {
    return { status: 400, body: { error: 'Only Gmail addresses are allowed.' } }
  }
  if (!isPasswordValid(pass)) {
    return { status: 400, body: { error: 'Password must be at least 6 characters and include a letter and a number.' } }
  }
  if (!normalizedCode) {
    return { status: 400, body: { error: 'Verification code is required.' } }
  }
  if (!supabaseUrl || !serviceKey) {
    return { status: 500, body: { error: 'The account service is not configured.' } }
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // ── Confirm the OTP was verified for this email ─────────────────────────
  const { data: verification } = await supabase
    .from('verification_codes')
    .select('id, verified')
    .eq('email', normalizedEmail)
    .eq('code', normalizedCode)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!verification || !verification.verified) {
    return { status: 400, body: { error: 'The verification code has not been confirmed. Please verify it again.' } }
  }

  // ── Enforce the SK Chairman singleton (authoritative, race-safe) ───────
  const { data: hasChairman, error: hasChairmanError } = await supabase.rpc('has_sk_chairman')
  if (hasChairmanError) {
    console.error('[register-chairman] has_sk_chairman check failed:', hasChairmanError)
    return { status: 500, body: { error: 'Unable to verify chairman availability. Please try again.' } }
  }
  if (hasChairman) {
    return { status: 409, body: { error: 'An SK Chairman account already exists. Only one SK Chairman is allowed.' } }
  }

  // ── Create the Auth user (auto_insert_sk_chairman trigger adds the
  //    created_accounts row automatically on insert) ─────────────────────
  const { data: created, error: createError } = await supabase.auth.admin.createUser({
    email: normalizedEmail,
    password: pass,
    email_confirm: true,
    user_metadata: { full_name: name, role: 'SK Chairman' },
  })

  if (createError || !created?.user?.id) {
    return {
      status: 400,
      body: { error: safeErrorMessage(createError, 'Unable to create the account. Please try again.') },
    }
  }

  // Consume the verification code so it cannot be reused.
  await supabase.from('verification_codes').delete().eq('id', verification.id)

  return {
    status: 200,
    body: {
      success: true,
      message: 'SK Chairman account registered successfully.',
      user: { id: created.user.id, full_name: name, email: normalizedEmail, role: 'SK Chairman' },
    },
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const result = await registerChairmanRequest({
      ...req.body,
      supabaseUrl: process.env.VITE_SUPABASE_URL,
      serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    })
    return res.status(result.status).json(result.body)
  } catch (error) {
    console.error('[register-chairman] Error:', error)
    return res.status(500).json({ error: 'Account registration failed. Please try again.' })
  }
}
