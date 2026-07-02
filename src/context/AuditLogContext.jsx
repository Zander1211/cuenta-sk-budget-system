/**
 * AuditLogContext.jsx
 *
 * Provides audit trail functionality backed by Supabase.
 * - addLog({ action, module, description }) — writes to audit_trail table
 * - logs — array of audit trail records (fetched from Supabase)
 * - fetchLogs() — re-fetches logs from Supabase
 * - clearLogs() — deletes all audit trail records (SK Chairman only)
 * - isLoadingLogs — loading state for the logs query
 *
 * Export names (useAuditLog, AuditLogProvider) are preserved for backward
 * compatibility with dozens of existing consumers.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useAuth } from './AuthContext'
import { supabase } from '../supabase/supabaseClient'
import { logAuditEvent } from '../utils/auditLogger'

const AuditLogContext = createContext(null)

function AuditLogProvider({ children }) {
  const [logs, setLogs] = useState([])
  const [isLoadingLogs, setIsLoadingLogs] = useState(false)
  const { user, profileName, role, isAuthenticated } = useAuth()

  // ── Fetch logs from Supabase ─────────────────────────────────
  const fetchLogs = useCallback(async (filters = {}) => {
    setIsLoadingLogs(true)
    try {
      let query = supabase
        .from('audit_trail')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500)

      // Apply optional filters
      if (filters.search) {
        query = query.or(
          `action.ilike.%${filters.search}%,user_name.ilike.%${filters.search}%,description.ilike.%${filters.search}%,module.ilike.%${filters.search}%`
        )
      }
      if (filters.userRole && filters.userRole !== 'All') {
        query = query.eq('user_role', filters.userRole)
      }
      if (filters.userName && filters.userName !== 'All') {
        query = query.eq('user_name', filters.userName)
      }
      if (filters.dateFrom) {
        query = query.gte('created_at', filters.dateFrom)
      }
      if (filters.dateTo) {
        // Add one day to include the full end date
        const endDate = new Date(filters.dateTo)
        endDate.setDate(endDate.getDate() + 1)
        query = query.lt('created_at', endDate.toISOString())
      }

      const { data, error } = await query

      if (error) {
        console.warn('[AuditLogContext] Fetch failed:', error.message)
      } else {
        setLogs(data || [])
      }
    } catch (err) {
      console.warn('[AuditLogContext] Fetch error:', err)
    } finally {
      setIsLoadingLogs(false)
    }
  }, [])

  // Load logs when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      fetchLogs()
    } else {
      setLogs([])
    }
  }, [isAuthenticated, fetchLogs])

  // ── Add a log entry to Supabase ──────────────────────────────
  // Preserves backward compatibility: addLog({ action }) still works
  // New signature: addLog({ action, module, description })
  function addLog({ action, module = '', description = '', actor }) {
    if (!action) return

    const resolvedName = actor || profileName || role || 'System'
    const resolvedRole = role || ''
    const resolvedUserId = user?.id || null

    // Optimistically add to local state for instant UI feedback
    const optimisticEntry = {
      id: crypto?.randomUUID?.() || `${Date.now()}`,
      user_id: resolvedUserId,
      user_name: resolvedName,
      user_role: resolvedRole,
      action,
      module,
      description,
      created_at: new Date().toISOString(),
    }
    setLogs((prev) => [optimisticEntry, ...prev])

    // Use shared utility (fire-and-forget)
    logAuditEvent({
      userId: resolvedUserId,
      userName: resolvedName,
      userRole: resolvedRole,
      action,
      module,
      description
    })
  }

  // ── Clear all logs (SK Chairman only) ────────────────────────
  async function clearLogs() {
    try {
      const STORAGE_KEY = 'cuenta.auditLogData.v4'
      const { error } = await supabase
        .from('audit_trail')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000') // delete all rows

      if (error) {
        console.warn('[AuditLogContext] Clear failed:', error.message)
      } else {
        setLogs([])
      }
    } catch (err) {
      console.warn('[AuditLogContext] Clear error:', err)
    }
  }

  const value = useMemo(
    () => ({ logs, addLog, clearLogs, fetchLogs, isLoadingLogs }),
    [logs, fetchLogs, isLoadingLogs]
  )

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
