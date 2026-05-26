import { supabase } from '../supabase/supabaseClient'

// LOGIN
export async function loginUser(email, password) {

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  return { data, error }
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

// PASSWORD RESET EMAIL (OTP/LINK)
export async function sendPasswordReset(email) {
  const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: typeof window !== 'undefined' ? window.location.origin : undefined,
  })

  return { data, error }
}

// VERIFY RECOVERY OTP
export async function verifyRecoveryOtp(email, token) {
  const { data, error } = await supabase.auth.verifyOtp({
    email,
    token,
    type: 'recovery',
  })

  return { data, error }
}