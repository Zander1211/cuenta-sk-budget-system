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