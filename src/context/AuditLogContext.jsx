/**
 * AuditLogContext.jsx
 *
 * Provides audit trail functionality backed by Supabase.
 *
 * Public API:
 *   addLog(params)   — Write to audit_trail table (append-only, fire-and-forget)
 *   logs             — Array of audit trail records fetched from Supabase
 *   fetchLogs()      — Re-fetch with optional server-side filters + pagination
 *   isLoadingLogs    — Loading state
 *   totalCount       — Total records matching current filters (for pagination)
 *   currentPage      — Current page number (1-based)
 *   setCurrentPage   — Navigate to a different page
 *   activeFilters    — Current filter state
 *   setActiveFilters — Apply new filters (resets to page 1)
 *
 * Security note:
 *   clearLogs() has been intentionally removed. Audit records are append-only
 *   and must never be deleted through the application. The DELETE RLS policy
 *   has also been removed in the v2 SQL migration.
 *
 * Export names (useAuditLog, AuditLogProvider) are preserved for backward
 * compatibility with all existing consumers.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from './AuthContext'
import { supabase } from '../supabase/supabaseClient'
import { logAuditEvent } from '../utils/auditLogger'
import { getDeviceInfo } from '../utils/deviceInfo'

const AuditLogContext = createContext(null)

const PAGE_SIZE = 15

const DEFAULT_FILTERS = {
  search:     '',
  userName:   'All',
  userRole:   'All',
  actionType: 'All',
  module:     'All',
  recordType: 'All',
  status:     'All',
  dateFrom:   '',
  dateTo:     '',
}

function AuditLogProvider({ children }) {
  const [logs, setLogs]               = useState([])
  const [isLoadingLogs, setIsLoading] = useState(false)
  const [totalCount, setTotalCount]   = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [activeFilters, setActiveFiltersState] = useState(DEFAULT_FILTERS)

  const { user, profileName, role, isAuthenticated } = useAuth()

  // Cache the device info string so we only parse UA once per session
  const deviceInfoRef = useRef(getDeviceInfo())

  // ── Fetch logs from Supabase ─────────────────────────────────
  const fetchLogs = useCallback(async (filters = activeFilters, page = 1) => {
    setIsLoading(true)
    try {
      const from = (page - 1) * PAGE_SIZE
      const to   = from + PAGE_SIZE - 1

      let query = supabase
        .from('audit_trail')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(from, to)

      // ── Full-text search ─────────────────────────────
      if (filters.search) {
        const s = filters.search
        query = query.or(
          [
            `action.ilike.%${s}%`,
            `user_name.ilike.%${s}%`,
            `description.ilike.%${s}%`,
            `record_id.ilike.%${s}%`,
            `action_type.ilike.%${s}%`,
          ].join(',')
        )
      }

      // ── Dropdown filters ──────────────────────────────
      if (filters.userRole && filters.userRole !== 'All') {
        query = query.eq('user_role', filters.userRole)
      }
      if (filters.userName && filters.userName !== 'All') {
        query = query.eq('user_name', filters.userName)
      }
      if (filters.actionType && filters.actionType !== 'All') {
        query = query.ilike('action_type', `%${filters.actionType}%`)
      }
      if (filters.module && filters.module !== 'All') {
        query = query.eq('module', filters.module)
      }
      if (filters.recordType && filters.recordType !== 'All') {
        query = query.eq('record_type', filters.recordType)
      }
      if (filters.status && filters.status !== 'All') {
        query = query.eq('status', filters.status)
      }

      // ── Date range ────────────────────────────────────
      if (filters.dateFrom) {
        const fromDate = new Date(filters.dateFrom)
        fromDate.setHours(0, 0, 0, 0)
        query = query.gte('created_at', fromDate.toISOString())
      }
      if (filters.dateTo) {
        const toDate = new Date(filters.dateTo)
        toDate.setHours(23, 59, 59, 999)
        query = query.lte('created_at', toDate.toISOString())
      }

      const { data, error, count } = await query

      if (error) {
        console.warn('[AuditLogContext] Fetch failed:', error.message)
      } else {
        setLogs(data || [])
        setTotalCount(count ?? 0)
        setCurrentPage(page)
      }
    } catch (err) {
      console.warn('[AuditLogContext] Fetch error:', err)
    } finally {
      setIsLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Apply new filters and reset to page 1
  const setActiveFilters = useCallback((newFilters) => {
    setActiveFiltersState(newFilters)
    fetchLogs(newFilters, 1)
  }, [fetchLogs])

  // Load logs when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      fetchLogs(DEFAULT_FILTERS, 1)
    } else {
      setLogs([])
      setTotalCount(0)
      setCurrentPage(1)
    }

    const handleRollback = () => {
      if (isAuthenticated) {
        fetchLogs(DEFAULT_FILTERS, 1)
      }
    }
    window.addEventListener('cuenta:rollback-complete', handleRollback)
    return () => {
      window.removeEventListener('cuenta:rollback-complete', handleRollback)
    }
  }, [isAuthenticated, fetchLogs])

  // ── Add a log entry ──────────────────────────────────────────
  /**
   * addLog — Append-only audit record writer.
   *
   * Accepts all fields supported by the v2 schema.
   * Legacy callers using only { action } still work.
   *
   * @param {Object} params
   * @param {string}  params.action
   * @param {string}  [params.actionType]
   * @param {string}  [params.module]
   * @param {string}  [params.recordType]
   * @param {string}  [params.recordId]
   * @param {string}  [params.description]
   * @param {Object}  [params.previousValue]
   * @param {Object}  [params.newValue]
   * @param {string}  [params.ipAddress]
   * @param {string}  [params.status]    — "Success" | "Failed"
   * @param {string}  [params.remarks]
   * @param {string}  [params.actor]     — Override user name (legacy compat)
   */
  function addLog({
    action,
    actionType = '',
    module = '',
    recordType = '',
    recordId = '',
    description = '',
    previousValue = null,
    newValue = null,
    ipAddress = '',
    status = 'Success',
    remarks = '',
    actor,
  }) {
    if (!action) return

    const resolvedName   = actor || profileName || role || 'System'
    const resolvedRole   = role || ''
    const resolvedUserId = user?.id || null
    const resolvedDevice = deviceInfoRef.current

    // Optimistically prepend to local state for instant UI feedback
    const optimisticEntry = {
      id:             crypto?.randomUUID?.() || `${Date.now()}`,
      user_id:        resolvedUserId,
      user_name:      resolvedName,
      user_role:      resolvedRole,
      action,
      action_type:    actionType || action,
      module,
      record_type:    recordType,
      record_id:      String(recordId || ''),
      description,
      previous_value: previousValue || null,
      new_value:      newValue || null,
      ip_address:     ipAddress || '',
      device_info:    resolvedDevice || '',
      status,
      remarks,
      created_at:     new Date().toISOString(),
    }
    setLogs((prev) => [optimisticEntry, ...prev])
    setTotalCount((prev) => prev + 1)

    // Persist to Supabase (fire-and-forget)
    logAuditEvent({
      userId:        resolvedUserId,
      userName:      resolvedName,
      userRole:      resolvedRole,
      action,
      actionType:    actionType || action,
      module,
      recordType,
      recordId:      String(recordId || ''),
      description,
      previousValue,
      newValue,
      ipAddress,
      deviceInfo:    resolvedDevice,
      status,
      remarks,
    })
  }

  // ── Page navigation ──────────────────────────────────────────
  const goToPage = useCallback((page) => {
    fetchLogs(activeFilters, page)
  }, [fetchLogs, activeFilters])

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))

  const value = useMemo(
    () => ({
      logs,
      addLog,
      fetchLogs,
      isLoadingLogs,
      totalCount,
      totalPages,
      currentPage,
      goToPage,
      activeFilters,
      setActiveFilters,
      PAGE_SIZE,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [logs, fetchLogs, isLoadingLogs, totalCount, totalPages, currentPage, goToPage, activeFilters, setActiveFilters]
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
