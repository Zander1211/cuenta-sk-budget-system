import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabase/supabaseClient'

const AuthContext = createContext(null)

function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [profileName, setProfileName] = useState('')
  const [profileSurname, setProfileSurname] = useState('')

  async function refreshSession() {
    const { data, error } = await supabase.auth.getSession()
    if (!error) {
      setSession(data.session ?? null)
    }
    return { data, error }
  }

  function getMetadataName(user) {
    const metadata = user?.user_metadata || {}
    const directName = metadata.full_name || metadata.name
    if (directName?.trim()) {
      return directName.trim()
    }

    const combinedName = [metadata.first_name, metadata.last_name]
      .filter(Boolean)
      .join(' ')
      .trim()

    return combinedName
  }

  function getSurnameFromName(name) {
    if (!name) return ''
    return name.split(/\s+/).filter(Boolean).slice(-1)[0] || ''
  }

  function getMetadataSurname(user) {
    const metadata = user?.user_metadata || {}
    const directSurname = metadata.last_name || metadata.surname
    if (directSurname?.trim()) {
      return directSurname.trim()
    }

    return getSurnameFromName(getMetadataName(user))
  }

  function formatNameFromEmail(email) {
    const localPart = email?.split('@')[0]?.trim()
    if (!localPart) return ''

    const readable = localPart.replace(/[._-]+/g, ' ').trim()
    if (!readable) return ''

    return readable
      .split(' ')
      .filter(Boolean)
      .map((segment) => segment[0].toUpperCase() + segment.slice(1))
      .join(' ')
  }

  function getSurnameFromEmail(email) {
    const localPart = email?.split('@')[0]?.trim()
    if (!localPart) return ''

    const parts = localPart.split(/[._-]+/).filter(Boolean)
    if (!parts.length) return ''

    const surname = parts[parts.length - 1]
    return surname[0].toUpperCase() + surname.slice(1)
  }

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

  useEffect(() => {
    let isMounted = true
    const metadataName = getMetadataName(session?.user)
    const metadataSurname = getMetadataSurname(session?.user)
    const emailFallbackName = formatNameFromEmail(session?.user?.email)
    const emailFallbackSurname =
      getSurnameFromEmail(session?.user?.email) ||
      getSurnameFromName(emailFallbackName)

    if (metadataName || metadataSurname) {
      setProfileName(metadataName || emailFallbackName)
      setProfileSurname(
        metadataSurname || getSurnameFromName(metadataName) || emailFallbackSurname
      )
      return () => {
        isMounted = false
      }
    }

    async function loadProfileName() {
      if (!session?.user) {
        if (isMounted) {
          setProfileName('')
          setProfileSurname('')
        }
        return
      }

      const userId = session.user.id
      const userEmail = session.user.email
      let resolvedName = ''

      if (userId) {
        const { data, error } = await supabase
          .from('created_accounts')
          .select('full_name')
          .eq('id', userId)
          .maybeSingle()

        if (!error) {
          resolvedName = data?.full_name?.trim() || ''
        }
      }

      if (!resolvedName && userEmail) {
        const { data, error } = await supabase
          .from('created_accounts')
          .select('full_name')
          .eq('email', userEmail)
          .maybeSingle()

        if (!error) {
          resolvedName = data?.full_name?.trim() || ''
        }
      }

      if (!isMounted) return

      if (resolvedName) {
        setProfileName(resolvedName)
        const resolvedSurname = getSurnameFromName(resolvedName)
        setProfileSurname(resolvedSurname)
        await supabase.auth.updateUser({
          data: {
            full_name: resolvedName,
            last_name: resolvedSurname,
          },
        })
      } else {
        setProfileName(emailFallbackName)
        setProfileSurname(emailFallbackSurname)
      }
    }

    loadProfileName()
    return () => {
      isMounted = false
    }
  }, [
    session?.user?.id,
    session?.user?.email,
    session?.user?.user_metadata?.full_name,
    session?.user?.user_metadata?.name,
    session?.user?.user_metadata?.first_name,
    session?.user?.user_metadata?.last_name,
  ])

  const role =
    session?.user?.app_metadata?.role ||
    session?.user?.user_metadata?.role ||
    'SK Chairman'

  const value = useMemo(
    () => ({
      session,
      user: session?.user ?? null,
      role,
      profileName,
      profileSurname,
      refreshSession,
      isLoading,
      isAuthenticated: Boolean(session?.user),
    }),
    [session, role, profileName, profileSurname, refreshSession, isLoading]
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
