import { useEffect, useState } from 'react'
import { supabase } from '../supabase/supabaseClient'

// Shared module-level state so multiple instances of useActiveSkChairmanName
// share the same data and do NOT open conflicting duplicate Realtime channels.
let globalChairmanName = ''
let isFetching = false
let activeChannel = null
const subscribers = new Set()

async function fetchChairmanName() {
  if (isFetching) return
  isFetching = true

  let resolvedName = ''

  // 1. Try public server endpoint first (works for unauthenticated visitors)
  try {
    const res = await fetch('/api/sk-chairman')
    if (res.ok) {
      const json = await res.json()
      if (json?.fullName?.trim()) {
        resolvedName = json.fullName.trim()
      }
    }
  } catch {
    // Fall through to database queries
  }

  // 2. Try Supabase RPC get_active_sk_chairman_name
  if (!resolvedName) {
    try {
      const { data: rpcName, error: rpcError } = await supabase.rpc('get_active_sk_chairman_name')
      if (!rpcError && rpcName?.trim()) {
        resolvedName = rpcName.trim()
      }
    } catch {
      // Fall through
    }
  }

  // 3. Try direct table query (works for authenticated users)
  if (!resolvedName) {
    try {
      const { data, error } = await supabase
        .from('created_accounts')
        .select('full_name')
        .eq('role', 'SK Chairman')
        .eq('is_active', true)
        .maybeSingle()

      if (!error && data?.full_name?.trim()) {
        resolvedName = data.full_name.trim()
      }
    } catch {
      // Fall through
    }
  }

  isFetching = false

  const finalName = resolvedName || globalChairmanName || 'John Zander Zerrudo'
  globalChairmanName = finalName
  subscribers.forEach((cb) => cb(finalName))
}

function initChannel() {
  if (activeChannel) return

  try {
    const channelId = `sk_chair_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
    activeChannel = supabase
      .channel(channelId)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'created_accounts' },
        () => {
          fetchChairmanName()
        }
      )
      .subscribe()
  } catch (err) {
    console.warn('Realtime channel could not be initialized:', err)
  }
}

export function useActiveSkChairmanName() {
  const [name, setName] = useState(globalChairmanName || 'John Zander Zerrudo')

  useEffect(() => {
    subscribers.add(setName)

    if (globalChairmanName) {
      setName(globalChairmanName)
    } else {
      fetchChairmanName()
    }

    initChannel()

    const handleFocus = () => fetchChairmanName()
    window.addEventListener('focus', handleFocus)

    return () => {
      subscribers.delete(setName)
      window.removeEventListener('focus', handleFocus)
      if (subscribers.size === 0 && activeChannel) {
        try {
          supabase.removeChannel(activeChannel)
        } catch {
          // ignore cleanup error
        }
        activeChannel = null
      }
    }
  }, [])

  return name || globalChairmanName || 'John Zander Zerrudo'
}

