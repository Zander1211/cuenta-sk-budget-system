import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabase/supabaseClient'
import { saveProfileDetails } from '../services/authService'

const AuthContext = createContext(null)

function getMetadataName(user) {
  const metadata = user?.user_metadata || {}
  const directName = metadata.full_name || metadata.name
  if (directName?.trim()) return directName.trim()

  return [metadata.first_name, metadata.middle_name, metadata.last_name]
    .filter(Boolean)
    .join(' ')
    .trim()
}

function getSurnameFromName(name) {
  if (!name) return ''
  return name.split(/\s+/).filter(Boolean).slice(-1)[0] || ''
}

function getMetadataSurname(user) {
  const metadata = user?.user_metadata || {}
  const directSurname = metadata.last_name || metadata.surname
  return directSurname?.trim() || getSurnameFromName(getMetadataName(user))
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

function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [profileName, setProfileName] = useState('')
  const [profileSurname, setProfileSurname] = useState('')
  const [role, setRole] = useState('SK Chairman')

  const refreshSession = useCallback(async () => {
    const { data, error } = await supabase.auth.getSession()
    if (!error) {
      setSession(data.session ?? null)
    }
    return { data, error }
  }, [])

  const updateProfileDetails = useCallback(async (profile) => {
    const { data, error } = await saveProfileDetails(profile)
    if (error || !data?.profile) return { data, error }

    const nextProfile = data.profile
    setProfileName(nextProfile.full_name)
    setProfileSurname(nextProfile.last_name)
    setSession((current) => {
      if (!current?.user) return current
      return {
        ...current,
        user: {
          ...current.user,
          user_metadata: data.user_metadata || {
            ...current.user.user_metadata,
            ...nextProfile,
          },
        },
      }
    })

    // Admin metadata writes do not emit a client auth event. Refreshing the
    // token makes every Auth consumer and JWT-backed database policy current.
    const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession()
    if (!refreshError && refreshed?.session) setSession(refreshed.session)

    return { data, error: null, refreshError }
  }, [])

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
      let directoryName = ''

      if (userId) {
        const { data, error } = await supabase
          .from('created_accounts')
          .select('full_name, role')
          .eq('id', userId)
          .maybeSingle()

        if (!error && data) {
          if (data.full_name?.trim()) directoryName = data.full_name.trim()
          if (data.role?.trim()) resolvedRole = data.role.trim()
        }
      }

      if ((!directoryName || !resolvedRole) && userEmail) {
        // A disabled account can share its email with a newer active one
        // (disabling frees the email up), so prefer the active row and cap
        // at one result — .maybeSingle() errors if more than one row matches.
        const { data, error } = await supabase
          .from('created_accounts')
          .select('full_name, role')
          .eq('email', userEmail)
          .order('is_active', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (!error && data) {
          if (!directoryName && data.full_name?.trim()) directoryName = data.full_name.trim()
          if (!resolvedRole && data.role?.trim()) resolvedRole = data.role.trim()
        }
      }

      const metadata = session.user.user_metadata || {}
      const componentName = [metadata.first_name, metadata.middle_name, metadata.last_name]
        .map((part) => part?.trim())
        .filter(Boolean)
        .join(' ')
      const hasEditableName = Boolean(metadata.first_name?.trim() && metadata.last_name?.trim())

      // Repair profiles saved by the previous implementation, which updated
      // Auth metadata but left created_accounts.full_name stale.
      if (hasEditableName && componentName) {
        resolvedName = componentName
        if (directoryName !== componentName) {
          const { error: repairError } = await saveProfileDetails({
            firstName: metadata.first_name,
            middleName: metadata.middle_name || '',
            lastName: metadata.last_name,
            nickname: metadata.nickname || '',
          })
          if (repairError) console.warn('Could not repair the profile directory name:', repairError.message)
        }
      } else {
        resolvedName = directoryName || resolvedName
      }

      if (!isMounted) return

      const finalRole = resolvedRole || metadataRole || 'SK Chairman'
      const finalName = resolvedName || initialName
      const finalSurname = metadataSurname || initialSurname || getSurnameFromName(finalName)

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
  }, [session])

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
      updateProfileDetails,
      isLoading,
      isAuthenticated: Boolean(session?.user),
    }),
    [session, effectiveRole, profileName, profileSurname, refreshSession, updateProfileDetails, isLoading]
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

// Context hooks intentionally live beside their provider.
// eslint-disable-next-line react-refresh/only-export-components
export { AuthProvider, useAuth }
