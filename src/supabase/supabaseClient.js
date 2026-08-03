import { createClient } from '@supabase/supabase-js'

const fallbackUrl = 'https://imxwgkwlxjqadwigjuxz.supabase.co'
const fallbackAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlteHdna3dseGpxYWR3aWdqdXh6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzNTMxNzAsImV4cCI6MjA5NDkyOTE3MH0.v2nac-HGkjaM862-AFoa8YyWp3ZPqn_5weJXX1ZRCY4'

export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim() || fallbackUrl
export const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() || fallbackAnonKey

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})
