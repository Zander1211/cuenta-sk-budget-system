import { useEffect, useState } from 'react'
import { supabase } from '../supabase/supabaseClient'

// Fetches the current ACTIVE SK Chairman's full name from the account
// directory, for use as an editable default value in document templates.
// Always queries fresh (never cached) so a Chairman's profile update is
// reflected the next time someone opens a new document, and a disabled
// Chairman's stale name is never used.
export function useActiveSkChairmanName() {
  const [name, setName] = useState('')

  useEffect(() => {
    let mounted = true

    supabase
      .from('created_accounts')
      .select('full_name')
      .eq('role', 'SK Chairman')
      .eq('is_active', true)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!mounted || error) return
        if (data?.full_name?.trim()) setName(data.full_name.trim())
      })

    return () => {
      mounted = false
    }
  }, [])

  return name
}
