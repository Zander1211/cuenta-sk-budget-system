// /api/create-user.js
// Creates an admin-provisioned account (SK Treasurer, SK Kagawad, or
// Barangay Treasurer) after OTP verification. Runs server-side with the
// service role key so it works regardless of the project's public signup
// settings, and enforces the active-account role limits authoritatively
// (client-side checks are only a fast pre-check to avoid sending needless OTPs).

import { createClient } from '@supabase/supabase-js'

const ROLE_LIMITS = {
  'SK Treasurer': 1,
  'Barangay Treasurer': 1,
  'SK Kagawad': 8,
}

function cleanEmail(value) {
  return String(value || '').trim().toLowerCase()
}

function bearerToken(authorization) {
  const match = String(authorization || '').match(/^Bearer\s+(.+)$/i)
  return match?.[1]?.trim() || ''
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

function roleLimitMessage(role, limit) {
  if (limit === 1) {
    return `An active ${role} account already exists. Please disable the existing ${role} account before creating a new one.`
  }
  return `The maximum number of active ${role} accounts (${limit}) has already been reached. Please disable an existing ${role} account before creating a new one.`
}

export async function createUserRequest({
  fullName,
  email,
  password,
  role,
  code,
  authorization,
  supabaseUrl,
  serviceKey,
}) {
  const name = String(fullName || '').trim()
  const normalizedEmail = cleanEmail(email)
  const pass = String(password || '').trim()
  const normalizedCode = String(code || '').trim()

  if (!name || !normalizedEmail || !pass || !role) {
    return { status: 400, body: { error: 'Name, email, password, and role are required.' } }
  }
  if (!Object.prototype.hasOwnProperty.call(ROLE_LIMITS, role)) {
    return { status: 400, body: { error: 'Invalid role selected.' } }
  }
  if (!/^[a-zA-Z0-9._%+-]+@gmail\.com$/i.test(normalizedEmail)) {
    return { status: 400, body: { error: 'Only Gmail addresses are allowed.' } }
  }
  if (!normalizedCode) {
    return { status: 400, body: { error: 'Verification code is required.' } }
  }
  if (!supabaseUrl || !serviceKey) {
    return { status: 500, body: { error: 'The account service is not configured.' } }
  }

  const token = bearerToken(authorization)
  if (!token) {
    return { status: 401, body: { error: 'Your session could not be verified. Please log in again.' } }
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // ── Authorize: only an active SK Chairman may create accounts ──────────
  const { data: callerData, error: callerError } = await supabase.auth.getUser(token)
  const caller = callerData?.user || null
  if (callerError || !caller) {
    return { status: 401, body: { error: 'Your session has expired. Please log in again.' } }
  }

  const { data: callerAccount } = await supabase
    .from('created_accounts')
    .select('role, is_active')
    .eq('id', caller.id)
    .maybeSingle()

  if (!callerAccount || callerAccount.role !== 'SK Chairman' || callerAccount.is_active === false) {
    return { status: 403, body: { error: 'Only the SK Chairman can create user accounts.' } }
  }

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

  // ── Enforce the active-account role limit (authoritative, race-safe) ───
  const { count, error: countError } = await supabase
    .from('created_accounts')
    .select('id', { count: 'exact', head: true })
    .eq('role', role)
    .eq('is_active', true)

  if (countError) {
    console.error('[create-user] Role count failed:', countError)
    return { status: 500, body: { error: 'Unable to verify role availability. Please try again.' } }
  }

  const limit = ROLE_LIMITS[role]
  if ((count ?? 0) >= limit) {
    return { status: 409, body: { error: roleLimitMessage(role, limit) } }
  }

  // ── Create the Auth user ────────────────────────────────────────────────
  const { data: created, error: createError } = await supabase.auth.admin.createUser({
    email: normalizedEmail,
    password: pass,
    email_confirm: true,
    user_metadata: { full_name: name, role },
  })

  if (createError || !created?.user?.id) {
    return {
      status: 400,
      body: { error: safeErrorMessage(createError, 'Unable to create the account. Please try again.') },
    }
  }

  const newUserId = created.user.id

  // ── Insert the directory row ────────────────────────────────────────────
  const { error: insertError } = await supabase.from('created_accounts').insert({
    id: newUserId,
    full_name: name,
    email: normalizedEmail,
    role,
  })

  if (insertError) {
    const { error: rollbackError } = await supabase.auth.admin.deleteUser(newUserId)
    if (rollbackError) console.error('[create-user] Rollback failed:', rollbackError)
    console.error('[create-user] Directory insert failed:', insertError)
    return { status: 500, body: { error: 'The account could not be saved. Please try again.' } }
  }

  // Consume the verification code so it cannot be reused.
  await supabase.from('verification_codes').delete().eq('id', verification.id)

  return {
    status: 200,
    body: {
      success: true,
      message: 'Account created successfully.',
      user: { id: newUserId, full_name: name, email: normalizedEmail, role },
    },
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const result = await createUserRequest({
      ...req.body,
      authorization: req.headers?.authorization,
      supabaseUrl: process.env.VITE_SUPABASE_URL,
      serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    })
    return res.status(result.status).json(result.body)
  } catch (error) {
    console.error('[create-user] Error:', error)
    return res.status(500).json({ error: 'Account creation failed. Please try again.' })
  }
}
