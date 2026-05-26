import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabase/supabaseClient'

const AuthContext = createContext(null)

function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let isMounted = true

    async function loadSession() {
      const { data } = await supabase.auth.getSession()
      if (isMounted) {
        setSession(data.session ?? null)
        setIsLoading(false)
      }
    }

    loadSession()

    const { data: subscription } = supabase.auth.onAuthStateChange(
      (_event, nextSession) => {
        if (isMounted) {
          setSession(nextSession ?? null)
          setIsLoading(false)
        }
      }
    )

    return () => {
      isMounted = false
      subscription?.subscription?.unsubscribe()
    }
  }, [])

  const role =
    session?.user?.user_metadata?.role ||
    session?.user?.app_metadata?.role ||
    'SK Chairman'

  const value = useMemo(
    () => ({
      session,
      user: session?.user ?? null,
      role,
      isLoading,
      isAuthenticated: Boolean(session?.user),
    }),
    [session, role, isLoading]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}

export { AuthProvider, useAuth }
