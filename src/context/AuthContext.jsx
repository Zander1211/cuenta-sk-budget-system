import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabase/supabaseClient'

const AuthContext = createContext(null)

function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [profileName, setProfileName] = useState('')
  const [profileSurname, setProfileSurname] = useState('')
  const [role, setRole] = useState('SK Chairman')

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

    const initialName = metadataName || emailFallbackName
    const initialSurname =
      metadataSurname || getSurnameFromName(metadataName) || emailFallbackSurname
    const metadataRole =
      session?.user?.app_metadata?.role || session?.user?.user_metadata?.role

    setProfileName(initialName)
    setProfileSurname(initialSurname)
    if (metadataRole) {
      setRole(metadataRole)
    }

    async function loadProfileAndRole() {
      if (!session?.user) {
        if (isMounted) {
          setProfileName('')
          setProfileSurname('')
          setRole('SK Chairman')
        }
        return
      }

      const userId = session.user.id
      const userEmail = session.user.email
      let resolvedName = metadataName || ''
      let resolvedRole = metadataRole || ''

      if (userId) {
        const { data, error } = await supabase
          .from('created_accounts')
          .select('full_name, role')
          .eq('id', userId)
          .maybeSingle()

        if (!error && data) {
          if (data.full_name?.trim()) resolvedName = data.full_name.trim()
          if (data.role?.trim()) resolvedRole = data.role.trim()
        }
      }

      if ((!resolvedName || !resolvedRole) && userEmail) {
        const { data, error } = await supabase
          .from('created_accounts')
          .select('full_name, role')
          .eq('email', userEmail)
          .maybeSingle()

        if (!error && data) {
          if (!resolvedName && data.full_name?.trim()) resolvedName = data.full_name.trim()
          if (!resolvedRole && data.role?.trim()) resolvedRole = data.role.trim()
        }
      }

      if (!isMounted) return

      const finalRole = resolvedRole || metadataRole || 'SK Chairman'
      const finalName = resolvedName || initialName
      const finalSurname = getSurnameFromName(finalName) || initialSurname

      setRole(finalRole)
      setProfileName(finalName)
      setProfileSurname(finalSurname)

      // Sync role and name to Supabase Auth user_metadata if not already in sync
      const currentMeta = session.user.user_metadata || {}
      if (
        currentMeta.role !== finalRole ||
        currentMeta.full_name !== finalName ||
        currentMeta.last_name !== finalSurname
      ) {
        try {
          await supabase.auth.updateUser({
            data: {
              role: finalRole,
              full_name: finalName,
              last_name: finalSurname,
            },
          })
        } catch (err) {
          console.warn('Could not sync user_metadata to auth:', err)
        }
      }
    }

    loadProfileAndRole()
    return () => {
      isMounted = false
    }
  }, [
    session?.user?.id,
    session?.user?.email,
    session?.user?.user_metadata?.full_name,
    session?.user?.user_metadata?.role,
  ])

  const effectiveRole =
    role ||
    session?.user?.app_metadata?.role ||
    session?.user?.user_metadata?.role ||
    'SK Chairman'

  const value = useMemo(
    () => ({
      session,
      user: session?.user ?? null,
      role: effectiveRole,
      profileName,
      profileSurname,
      refreshSession,
      isLoading,
      isAuthenticated: Boolean(session?.user),
    }),
    [session, effectiveRole, profileName, profileSurname, refreshSession, isLoading]
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
