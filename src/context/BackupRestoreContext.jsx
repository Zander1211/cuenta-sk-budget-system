import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useAuth } from './AuthContext'
import { supabase } from '../supabase/supabaseClient'
import { logAuditEvent } from '../utils/auditLogger'
import { useAuditLog } from './AuditLogContext'

const BackupRestoreContext = createContext(null)

// ── Constants ──────────────────────────────────────────────────
const BACKUP_FORMAT_VERSION = '2.0'

// All Supabase tables the system uses
const SUPABASE_TABLES = [
  'created_accounts',
  'projects',
  'budgets',
  'expenses',
  'document_counters',
  'report_summaries',
  'project_photos',
  'audit_trail',
  'backups',
  'restore_history',
]

// localStorage keys that hold operational data
const LOCAL_STORAGE_KEYS = [
  'cuenta.budgetData.v4',       // requests, expenses, budgets (BudgetContext)
  'cuenta.documentHistory.v2',  // generated documents (DocumentContext)
  'cuenta.notifications.v2',    // notifications (NotificationContext)
]

// Restore order for Supabase tables (FK-safe: parents before children)
const RESTORE_TABLE_ORDER = [
  'created_accounts',
  'projects',
  'budgets',
  'document_counters',
  'report_summaries',
  'project_photos',
  'expenses',
  'audit_trail',
  'backups',
  'restore_history',
]

export function BackupRestoreProvider({ children }) {
  const [backups, setBackups] = useState([])
  const [restoreHistory, setRestoreHistory] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const { user, profileName, role, isAuthenticated } = useAuth()
  const { addLog } = useAuditLog()

  const fetchBackups = useCallback(async () => {
    setIsLoading(true)
    const { data, error } = await supabase
      .from('backups')
      .select('*')
      .order('created_at', { ascending: false })

    if (!error && data) {
      setBackups(data)
    }
    setIsLoading(false)
  }, [])

  const fetchRestoreHistory = useCallback(async () => {
    setIsLoading(true)
    const { data, error } = await supabase
      .from('restore_history')
      .select('*')
      .order('restored_at', { ascending: false })

    if (!error && data) {
      setRestoreHistory(data)
    }
    setIsLoading(false)
  }, [])

  useEffect(() => {
    if (isAuthenticated) {
      fetchBackups()
      fetchRestoreHistory()
    } else {
      setBackups([])
      setRestoreHistory([])
    }
  }, [isAuthenticated, fetchBackups, fetchRestoreHistory])

  // ── Export: fetch ALL data from Supabase + localStorage ──────
  const exportAllData = async () => {
    const supabaseData = {}

    for (const table of SUPABASE_TABLES) {
      try {
        const { data, error } = await supabase.from(table).select('*')
        if (!error && data) {
          supabaseData[table] = data
        } else if (error) {
          console.warn(`[Backup] Skipping table "${table}":`, error.message)
          supabaseData[table] = []
        }
      } catch (err) {
        console.warn(`[Backup] Failed to fetch "${table}":`, err)
        supabaseData[table] = []
      }
    }

    // Export localStorage data
    const localStorageData = {}
    for (const key of LOCAL_STORAGE_KEYS) {
      try {
        const raw = window.localStorage.getItem(key)
        if (raw) {
          localStorageData[key] = JSON.parse(raw)
        }
      } catch (err) {
        console.warn(`[Backup] Failed to read localStorage key "${key}":`, err)
      }
    }

    return {
      meta: {
        version: BACKUP_FORMAT_VERSION,
        appName: 'Cuenta',
        createdAt: new Date().toISOString(),
        createdBy: profileName || role || 'System',
      },
      supabase: supabaseData,
      localStorage: localStorageData,
    }
  }

  // ── Create Backup ────────────────────────────────────────────
  const createBackup = async () => {
    try {
      setIsLoading(true)
      const data = await exportAllData()
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      const filename = `cuenta_backup_${timestamp}.json`

      const jsonStr = JSON.stringify(data, null, 2)
      const blob = new Blob([jsonStr], { type: 'application/json' })
      const sizeBytes = blob.size

      // Download locally
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)

      // Record backup metadata
      const { error } = await supabase.from('backups').insert({
        filename,
        backup_size: sizeBytes,
        created_by_id: user?.id,
        created_by_name: profileName || role || 'System',
      })

      if (!error) {
        addLog({
          action: 'Created system backup',
          module: 'Backup & Restore',
          description: `File: ${filename}, Size: ${(sizeBytes / 1024).toFixed(1)} KB`
        })
        fetchBackups()
      }
    } catch (err) {
      console.error('Backup creation failed', err)
      throw err
    } finally {
      setIsLoading(false)
    }
  }

  // ── Helpers: detect backup format ────────────────────────────
  function isNewFormat(parsed) {
    return parsed && parsed.meta && parsed.meta.version && (parsed.supabase || parsed.localStorage)
  }

  // Convert old flat format { budgets: [...], expenses: [...] } into new format
  function normalizeBackupData(parsed) {
    if (isNewFormat(parsed)) return parsed

    // Old format: flat object with table names as keys
    return {
      meta: {
        version: '1.0',
        appName: 'Cuenta',
        createdAt: new Date().toISOString(),
        createdBy: 'Unknown (legacy backup)',
      },
      supabase: parsed,
      localStorage: {},
    }
  }

  // ── Restore from Backup ──────────────────────────────────────
  const restoreFromBackup = async (fileObj, rawParsedData) => {
    setIsLoading(true)
    let status = 'failed'
    let details = ''
    const tableResults = []

    try {
      const backup = normalizeBackupData(rawParsedData)
      const supabaseData = backup.supabase || {}
      const localStoragePayload = backup.localStorage || {}

      // 1. Restore Supabase tables in FK-safe order
      for (const table of RESTORE_TABLE_ORDER) {
        const rows = supabaseData[table]
        if (!rows || !Array.isArray(rows) || rows.length === 0) {
          continue
        }

        try {
          const { error } = await supabase.from(table).upsert(rows, { onConflict: 'id' })
          if (error) {
            console.warn(`[Restore] Error restoring "${table}":`, error.message)
            tableResults.push(`${table}: FAILED (${error.message})`)
          } else {
            tableResults.push(`${table}: ${rows.length} rows restored`)
          }
        } catch (err) {
          console.warn(`[Restore] Exception restoring "${table}":`, err)
          tableResults.push(`${table}: FAILED (${err.message})`)
        }
      }

      // Also handle any extra tables in the backup that aren't in RESTORE_TABLE_ORDER
      for (const table of Object.keys(supabaseData)) {
        if (RESTORE_TABLE_ORDER.includes(table)) continue
        const rows = supabaseData[table]
        if (!rows || !Array.isArray(rows) || rows.length === 0) continue

        try {
          const { error } = await supabase.from(table).upsert(rows, { onConflict: 'id' })
          if (error) {
            tableResults.push(`${table}: FAILED (${error.message})`)
          } else {
            tableResults.push(`${table}: ${rows.length} rows restored`)
          }
        } catch (err) {
          tableResults.push(`${table}: FAILED (${err.message})`)
        }
      }

      // 2. Restore localStorage data
      let localStorageRestored = 0
      for (const key of LOCAL_STORAGE_KEYS) {
        if (localStoragePayload[key] !== undefined) {
          try {
            window.localStorage.setItem(key, JSON.stringify(localStoragePayload[key]))
            localStorageRestored++
            tableResults.push(`localStorage[${key}]: restored`)
          } catch (err) {
            console.warn(`[Restore] Failed to write localStorage key "${key}":`, err)
            tableResults.push(`localStorage[${key}]: FAILED`)
          }
        }
      }

      status = 'success'
      details = tableResults.join('\n')

      addLog({
        action: 'Restored system from backup',
        module: 'Backup & Restore',
        description: `File: ${fileObj.name}. ${tableResults.length} items processed.`
      })
    } catch (err) {
      status = 'failed'
      details = err.message + '\n' + tableResults.join('\n')
      console.error('Restore failed', err)
      throw err
    } finally {
      // Record restore history
      await supabase.from('restore_history').insert({
        filename: fileObj.name,
        restored_by_id: user?.id,
        restored_by_name: profileName || role || 'System',
        restore_status: status,
        details: details
      })
      fetchRestoreHistory()
      setIsLoading(false)
    }
  }

  const backupStats = useMemo(() => {
    const totalBackups = backups.length
    const lastBackup = backups[0]
    return {
      total: totalBackups,
      lastDate: lastBackup?.created_at || null,
      lastSize: lastBackup?.backup_size || 0,
      lastCreator: lastBackup?.created_by_name || '—'
    }
  }, [backups])

  const value = useMemo(
    () => ({
      backups,
      restoreHistory,
      isLoading,
      fetchBackups,
      fetchRestoreHistory,
      createBackup,
      restoreFromBackup,
      backupStats
    }),
    [backups, restoreHistory, isLoading, fetchBackups, fetchRestoreHistory, backupStats]
  )

  return (
    <BackupRestoreContext.Provider value={value}>
      {children}
    </BackupRestoreContext.Provider>
  )
}

export function useBackupRestore() {
  const context = useContext(BackupRestoreContext)
  if (!context) {
    throw new Error('useBackupRestore must be used within BackupRestoreProvider')
  }
  return context
}
