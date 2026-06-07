import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { useAuth } from './AuthContext'

const AuditLogContext = createContext(null)
const STORAGE_KEY = 'cuenta.auditLogs'

function getStoredLogs() {
  if (typeof window === 'undefined') {
    return []
  }

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    return stored ? JSON.parse(stored) : []
  } catch {
    return []
  }
}

function AuditLogProvider({ children }) {
  const [logs, setLogs] = useState(() => getStoredLogs())
  const { profileName, role } = useAuth()

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(logs))
    }
  }, [logs])

  function addLog({ action, actor }) {
    if (!action) {
      return
    }

    // Auto-detect actor from auth context if not provided
    const resolvedActor = actor || profileName || role || 'System'

    const id =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}`

    const nextEntry = {
      id,
      action,
      actor: resolvedActor,
      role: role || '',
      timestamp: new Date().toISOString(),
    }

    setLogs((prev) => [nextEntry, ...prev])
  }

  function clearLogs() {
    setLogs([])
  }

  const value = useMemo(() => ({ logs, addLog, clearLogs }), [logs])

  return (
    <AuditLogContext.Provider value={value}>
      {children}
    </AuditLogContext.Provider>
  )
}

function useAuditLog() {
  const context = useContext(AuditLogContext)
  if (!context) {
    throw new Error('useAuditLog must be used within AuditLogProvider')
  }
  return context
}

export { AuditLogProvider, useAuditLog }
