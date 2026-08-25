import { supabase } from '../supabase/supabaseClient'

function apiError(result, fallback) {
  const candidate = result?.error || result?.message
  const message = typeof candidate === 'string' ? candidate.trim() : ''
  return new Error(message && message !== '{}' && message !== '[object Object]' ? message : fallback)
}

async function readApiResponse(response) {
  const text = await response.text()
  if (!text) return {}
  try {
    return JSON.parse(text)
  } catch {
    return { error: response.ok ? '' : text }
  }
}

// LOGIN
export async function loginUser(email, password, recaptchaToken) {
  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, recaptchaToken }),
    })
    const data = await res.json()
    if (!res.ok) {
      return { error: new Error(data.error || 'Login failed') }
    }
    // Set the session
    const { error: sessionError } = await supabase.auth.setSession({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    })
    if (sessionError) {
      return { error: sessionError }
    }
    return { data }
  } catch (error) {
    return { error }
  }
}

// REGISTER
export async function registerUser(
  email,
  password,
  options = {}
) {

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options,
  })

  return { data, error }
}

// LOGOUT
export async function logoutUser() {
  const { error } = await supabase.auth.signOut()

  if (!error) {
    sessionStorage.removeItem('chatbotWelcomeShown')
  }

  return { error }
}

// UPDATE PASSWORD
export async function updatePassword(newPassword) {
  const { data, error } = await supabase.auth.updateUser({
    password: newPassword,
  })

  return { data, error }
}

// EMAIL UPDATE OTP — uses the application's configured Gmail mailer.
export async function sendEmailUpdateOtp(email) {
  try {
    const response = await fetch('/api/send-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })
    const result = await readApiResponse(response)
    if (!response.ok) {
      return { data: null, error: apiError(result, 'Unable to send the verification code. Please try again.') }
    }
    return { data: result, error: null }
  } catch {
    return { data: null, error: new Error('Unable to reach the email service. Check your connection and try again.') }
  }
}

// PROFILE DETAILS — authenticated, server-side synchronization.
export async function saveProfileDetails(profile) {
  try {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
    const accessToken = sessionData?.session?.access_token
    if (sessionError || !accessToken) {
      return { data: null, error: new Error('Your session has expired. Please log in again.') }
    }

    const response = await fetch('/api/update-profile', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(profile),
    })
    const result = await readApiResponse(response)
    if (!response.ok) {
      return { data: null, error: apiError(result, 'Unable to update the profile. Please try again.') }
    }
    return { data: result, error: null }
  } catch {
    return { data: null, error: new Error('Unable to reach the profile service. Check your connection and try again.') }
  }
}

// PASSWORD UPDATE OTP
export async function sendEmailOtp(email) {
  const { data, error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: false,
    },
  })

  return { data, error }
}

// VERIFY EMAIL OTP
export async function verifyEmailOtp(email, token) {
  const { data, error } = await supabase.auth.verifyOtp({
    email,
    token,
    type: 'magiclink',
  })

  return { data, error }
}

// VERIFY SIGNUP OTP
export async function verifySignupOtp(email, token) {
  const { data, error } = await supabase.auth.verifyOtp({
    email,
    token,
    type: 'signup',
  })

  return { data, error }
}

// RESEND SIGNUP OTP
export async function resendSignupOtp(email) {
  const { data, error } = await supabase.auth.resend({
    type: 'signup',
    email,
  })

  return { data, error }
}

// VERIFY EMAIL UPDATE OTP
export async function verifyEmailUpdateOtp(email, token) {
  try {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
    const accessToken = sessionData?.session?.access_token
    if (sessionError || !accessToken) {
      return { data: null, error: new Error('Your session has expired. Please log in again.') }
    }

    const response = await fetch('/api/verify-otp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ email, code: token, purpose: 'email_change' }),
    })
    const result = await readApiResponse(response)
    if (!response.ok) {
      return { data: null, error: apiError(result, 'Unable to verify the code or update the email address.') }
    }
    return { data: result, error: null }
  } catch {
    return { data: null, error: new Error('Unable to reach the verification service. Check your connection and try again.') }
  }
}
