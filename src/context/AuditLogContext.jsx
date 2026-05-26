import { createContext, useContext, useEffect, useMemo, useState } from 'react'

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

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(logs))
    }
  }, [logs])

  function addLog({ action, actor = 'SK Chairman' }) {
    if (!action) {
      return
    }

    const id =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}`

    const nextEntry = {
      id,
      action,
      actor,
      timestamp: new Date().toISOString(),
    }

    setLogs((prev) => [nextEntry, ...prev])
  }

  const value = useMemo(() => ({ logs, addLog }), [logs])

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
