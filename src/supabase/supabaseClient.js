import { createClient } from '@supabase/supabase-js'

export const supabaseUrl = 'https://imxwgkwlxjqadwigjuxz.supabase.co'
export const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlteHdna3dseGpxYWR3aWdqdXh6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzNTMxNzAsImV4cCI6MjA5NDkyOTE3MH0.v2nac-HGkjaM862-AFoa8YyWp3ZPqn_5weJXX1ZRCY4'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)