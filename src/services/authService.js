import { supabase } from '../supabase/supabaseClient'

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
  password
) {

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
  })

  return { data, error }
}

// LOGOUT
export async function logoutUser() {

  const { error } = await supabase.auth.signOut()

  return { error }
}

// UPDATE PASSWORD
export async function updatePassword(newPassword) {
  const { data, error } = await supabase.auth.updateUser({
    password: newPassword,
  })

  return { data, error }
}

// UPDATE EMAIL
export async function updateEmail(newEmail) {
  const { data, error } = await supabase.auth.updateUser({
    email: newEmail,
  })

  return { data, error }
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