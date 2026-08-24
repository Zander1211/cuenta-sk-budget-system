// /api/update-profile.js
// Authenticated profile-name synchronization for Auth metadata and the
// created_accounts directory. Role, email, status, password and avatar are
// deliberately never accepted from the request.

import { createClient } from '@supabase/supabase-js'

function cleanName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ')
}

function bearerToken(authorization) {
  const match = String(authorization || '').match(/^Bearer\s+(.+)$/i)
  return match?.[1]?.trim() || ''
}

function safeErrorMessage(error, fallback) {
  const message = typeof error?.message === 'string' ? error.message.trim() : ''
  return message && message !== '{}' && message !== '[object Object]' ? message : fallback
}

export async function updateProfileRequest({
  firstName,
  middleName,
  lastName,
  nickname,
  authorization,
  supabaseUrl,
  serviceKey,
}) {
  const first = cleanName(firstName)
  const middle = cleanName(middleName)
  const last = cleanName(lastName)
  const nick = cleanName(nickname)

  if (!first || !last) {
    return { status: 400, body: { error: 'First name and surname are required.' } }
  }
  if ([first, middle, last, nick].some((value) => value.length > 100)) {
    return { status: 400, body: { error: 'Each name field must be 100 characters or fewer.' } }
  }
  if (!supabaseUrl || !serviceKey) {
    return { status: 500, body: { error: 'The profile service is not configured.' } }
  }

  const token = bearerToken(authorization)
  if (!token) {
    return { status: 401, body: { error: 'Your session could not be verified. Please log in again.' } }
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: userData, error: userError } = await supabase.auth.getUser(token)
  const user = userData?.user || null
  if (userError || !user) {
    return { status: 401, body: { error: 'Your session has expired. Please log in again.' } }
  }

  const fullName = [first, middle, last].filter(Boolean).join(' ')
  const previousMetadata = user.user_metadata || {}
  const nextMetadata = {
    ...previousMetadata,
    first_name: first,
    middle_name: middle,
    last_name: last,
    surname: last,
    nickname: nick,
    full_name: fullName,
    name: fullName,
  }

  const { error: authUpdateError } = await supabase.auth.admin.updateUserById(user.id, {
    user_metadata: nextMetadata,
  })
  if (authUpdateError) {
    return {
      status: 400,
      body: { error: safeErrorMessage(authUpdateError, 'Unable to update the account profile.') },
    }
  }

  const { data: directoryRow, error: directoryError } = await supabase
    .from('created_accounts')
    .update({ full_name: fullName })
    .eq('id', user.id)
    .select('id')
    .maybeSingle()

  if (directoryError || !directoryRow) {
    const { error: rollbackError } = await supabase.auth.admin.updateUserById(user.id, {
      user_metadata: previousMetadata,
    })
    if (rollbackError) console.error('[update-profile] Metadata rollback failed:', rollbackError)
    console.error('[update-profile] Directory update failed:', directoryError || 'Account row not found')
    return { status: 500, body: { error: 'The user directory could not be synchronized. Please try again.' } }
  }

  return {
    status: 200,
    body: {
      success: true,
      profile: {
        first_name: first,
        middle_name: middle,
        last_name: last,
        nickname: nick,
        full_name: fullName,
      },
      user_metadata: nextMetadata,
    },
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const result = await updateProfileRequest({
      ...req.body,
      authorization: req.headers?.authorization,
      supabaseUrl: process.env.VITE_SUPABASE_URL,
      serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    })
    return res.status(result.status).json(result.body)
  } catch (error) {
    console.error('[update-profile] Error:', error)
    return res.status(500).json({ error: 'Profile update failed. Please try again.' })
  }
}
