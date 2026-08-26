import { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react'
import { supabase } from '../supabase/supabaseClient'
import { useAuth } from './AuthContext'
import { useAuditLog } from './AuditLogContext'
import { useBudget } from './BudgetContext'
import { useNotifications } from './NotificationContext'
import { saveSnapshot, getSnapshot, removeSnapshot } from '../utils/snapshotStorage'

const BackupRestoreContext = createContext(null)

const BACKUP_FORMAT_VERSION = '2.0'

const SUPABASE_TABLES = [
  'created_accounts',
  'member_biodata',
  'budgets',
  'budget_requests',
  'expenses',
  'receipt_records',
  'documents',
  'document_counters',
  'report_summaries',
  'project_photos',
  'notifications',
  'chat_history',
  'audit_trail',
  'backups',
  'restore_history',
]

const OPERATIONAL_TABLES = [
  'budgets',
  'budget_requests',
  'expenses',
  'receipt_records',
  'documents',
  'document_counters',
  'report_summaries',
  'project_photos',
  'notifications',
  'chat_history',
]

const LOCAL_STORAGE_KEYS = [
  'cuenta.budgetData.v4',       // requests, expenses, budgets (BudgetContext)
  'cuenta.documentHistory.v2',  // generated documents (DocumentContext)
  'cuenta.notifications.v2',    // notifications (NotificationContext)
]

// FK-Safe Table Insertion Order (parents before children)
const RESTORE_TABLE_ORDER = [
  'budgets',
  'documents',
  'document_counters',
  'budget_requests',
  'expenses',
  'receipt_records',
  'project_photos',
  'report_summaries',
  'notifications',
  'chat_history',
]

// FK-Safe Table Deletion Order (children before parents)
const ROLLBACK_DELETE_ORDER = [
  'project_photos',
  'report_summaries',
  'receipt_records',
  'expenses',
  'budget_requests',
  'document_counters',
  'documents',
  'budgets',
  'notifications',
  'chat_history',
]

const DELETED_RESTORE_KEY = 'cuenta.deleted_restore_history_ids'
const DELETED_BACKUP_KEY = 'cuenta.deleted_backup_ids'

function isMissingTableError(error) {
  const message = String(error?.message || error || '')
  return error?.code === '42P01'
    || error?.code === 'PGRST205'
    || /could not find the table .* in the schema cache/i.test(message)
    || /relation .* does not exist/i.test(message)
}

function getDeletedHistorySet() {
  try {
    const raw = window.localStorage.getItem(DELETED_RESTORE_KEY)
    return raw ? new Set(JSON.parse(raw)) : new Set()
  } catch {
    return new Set()
  }
}

function markHistoryDeleted(id, filename) {
  try {
    const raw = window.localStorage.getItem(DELETED_RESTORE_KEY)
    const arr = raw ? JSON.parse(raw) : []
    if (id && !arr.includes(String(id))) arr.push(String(id))
    if (filename && !arr.includes(String(filename))) arr.push(String(filename))
    window.localStorage.setItem(DELETED_RESTORE_KEY, JSON.stringify(arr))
  } catch (e) {
    console.warn('[BackupRestore] Error saving deleted history marker:', e)
  }
}

function unmarkHistoryDeleted(filename) {
  try {
    const raw = window.localStorage.getItem(DELETED_RESTORE_KEY)
    if (!raw) return
    const arr = JSON.parse(raw).filter((item) => item !== String(filename))
    window.localStorage.setItem(DELETED_RESTORE_KEY, JSON.stringify(arr))
  } catch {
    // ignore
  }
}

function getDeletedBackupSet() {
  try {
    const raw = window.localStorage.getItem(DELETED_BACKUP_KEY)
    return raw ? new Set(JSON.parse(raw)) : new Set()
  } catch {
    return new Set()
  }
}

function markBackupDeleted(id, filename) {
  try {
    const raw = window.localStorage.getItem(DELETED_BACKUP_KEY)
    const arr = raw ? JSON.parse(raw) : []
    if (id && !arr.includes(String(id))) arr.push(String(id))
    if (filename && !arr.includes(String(filename))) arr.push(String(filename))
    window.localStorage.setItem(DELETED_BACKUP_KEY, JSON.stringify(arr))
  } catch (e) {
    console.warn('[BackupRestore] Error saving deleted backup marker:', e)
  }
}

function unmarkBackupDeleted(filename) {
  try {
    const raw = window.localStorage.getItem(DELETED_BACKUP_KEY)
    if (!raw) return
    const arr = JSON.parse(raw).filter((item) => item !== String(filename))
    window.localStorage.setItem(DELETED_BACKUP_KEY, JSON.stringify(arr))
  } catch {
    // ignore
  }
}

export function BackupRestoreProvider({ children }) {
  const [backups, setBackups] = useState([])
  const [restoreHistory, setRestoreHistory] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const { user, profileName, role, isAuthenticated } = useAuth()
  const { addLog, fetchLogs } = useAuditLog()
  const { refreshAllBudgetData } = useBudget()
  const { addNotification, refreshNotifications } = useNotifications()

  // ── Fetch backup history from Supabase ───────────────────────
  const fetchBackups = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('backups')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) {
        console.error('[BackupRestore] Failed to fetch backups:', error.message)
      } else {
        const deletedSet = getDeletedBackupSet()
        const filtered = (data || []).filter(
          (b) => !deletedSet.has(String(b.id)) && !deletedSet.has(String(b.filename))
        )
        setBackups(filtered)
      }
    } catch (err) {
      console.error('[BackupRestore] Exception fetching backups:', err)
    }
  }, [])

  // ── Fetch restore history from Supabase ──────────────────────
  const fetchRestoreHistory = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('restore_history')
        .select('*')
        .order('restored_at', { ascending: false })

      if (error) {
        console.error('[BackupRestore] Failed to fetch restore history:', error.message)
      } else {
        const deletedSet = getDeletedHistorySet()
        const filtered = (data || []).filter(
          (r) => !deletedSet.has(String(r.id)) && !deletedSet.has(String(r.filename))
        )
        setRestoreHistory(filtered)
      }
    } catch (err) {
      console.error('[BackupRestore] Exception fetching restore history:', err)
    }
  }, [])

  // Load history on mount when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      fetchBackups()
      fetchRestoreHistory()
    } else {
      setBackups([])
      setRestoreHistory([])
    }
  }, [isAuthenticated, fetchBackups, fetchRestoreHistory])

  // ── Helper: insert backup record with FK fallback ────────────
  async function insertBackupRecord(record) {
    if (record.filename) unmarkBackupDeleted(record.filename)
    const { data, error } = await supabase
      .from('backups')
      .insert(record)
      .select()

    if (error) {
      console.error('[BackupRestore] Backup insert failed:', error.message)
      if (error.message?.includes('foreign key') || error.code === '23503') {
        const { created_by_id, ...rest } = record
        const { data: d2, error: e2 } = await supabase
          .from('backups')
          .insert(rest)
          .select()
        if (e2) return { data: null, error: e2 }
        return { data: d2, error: null }
      }
      return { data: null, error }
    }
    return { data, error: null }
  }

  // ── Helper: insert restore history record with snapshot fallback ───
  async function insertRestoreRecord(record) {
    if (record.filename) unmarkHistoryDeleted(record.filename)
    const { data, error } = await supabase
      .from('restore_history')
      .insert(record)
      .select()

    if (error) {
      console.warn('[BackupRestore] Restore history insert with snapshot failed:', error.message)
      const fallbackRecord = { ...record }
      if (error.message?.includes('snapshot') || error.code === '42703') {
        delete fallbackRecord.snapshot
      }
      if (error.message?.includes('foreign key') || error.code === '23503') {
        delete fallbackRecord.restored_by_id
      }

      const { data: d2, error: e2 } = await supabase
        .from('restore_history')
        .insert(fallbackRecord)
        .select()

      if (e2) {
        console.error('[BackupRestore] Restore history fallback insert failed:', e2.message)
        return { data: null, error: e2 }
      }
      return { data: d2, error: null }
    }
    return { data, error: null }
  }

  // ── Export: fetch ALL data from Supabase + localStorage ──────
  const exportAllData = async () => {
    const supabaseData = {}

    // Export each Supabase table
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

  // ── Helper: Apply pre-restore snapshot back to DB & LocalStorage ───
  const applySnapshot = async (snapshot, { strict = false } = {}) => {
    if (!snapshot) throw new Error('Cannot apply null or undefined snapshot.')
    const supabaseData = snapshot.supabase || {}
    const localStoragePayload = snapshot.localStorage || {}
    const failures = []

    // Step 1: Remove records imported by the restored backup (FK-safe reverse deletion order)
    for (const table of ROLLBACK_DELETE_ORDER) {
      try {
        const snapshotRows = supabaseData[table] || []
        const snapshotIds = new Set(
          snapshotRows
            .map((r) => (r && r.id !== undefined && r.id !== null ? String(r.id) : null))
            .filter(Boolean)
        )

        const { data: currentRows, error: fetchErr } = await supabase.from(table).select('*')
        if (fetchErr) {
          if (isMissingTableError(fetchErr)) {
            console.info(`[Restore] Optional table "${table}" is not installed; skipping it.`)
            continue
          }
          console.warn(`[Rollback] Could not fetch current rows for "${table}":`, fetchErr.message)
          failures.push(`${table}: could not read current rows (${fetchErr.message})`)
          continue
        }

        if (!currentRows || currentRows.length === 0) continue

        if (snapshotIds.size === 0) {
          const allIds = currentRows
            .map((r) => r.id)
            .filter((id) => id !== undefined && id !== null)

          for (let i = 0; i < allIds.length; i += 50) {
            const chunk = allIds.slice(i, i + 50)
            const { error: delErr } = await supabase.from(table).delete().in('id', chunk)
            if (delErr) {
              console.warn(`[Rollback] Delete error on table "${table}":`, delErr.message)
              failures.push(`${table}: could not delete current rows (${delErr.message})`)
            }
          }
        } else {
          const idsToDelete = currentRows
            .filter((r) => r.id !== undefined && r.id !== null && !snapshotIds.has(String(r.id)))
            .map((r) => r.id)

          if (idsToDelete.length > 0) {
            console.log(`[Rollback] Removing ${idsToDelete.length} restored records from "${table}"`)
            for (let i = 0; i < idsToDelete.length; i += 50) {
              const chunk = idsToDelete.slice(i, i + 50)
              const { error: delErr } = await supabase.from(table).delete().in('id', chunk)
              if (delErr) {
                console.warn(`[Rollback] Delete error on table "${table}":`, delErr.message)
                failures.push(`${table}: could not delete rows not present in snapshot (${delErr.message})`)
              }
            }
          }
        }
      } catch (err) {
        console.warn(`[Rollback] Deletion cleanup error on "${table}":`, err)
        failures.push(`${table}: deletion failed (${err.message || err})`)
      }
    }

    // Step 2: Restore snapshot records (FK-safe parent-before-child order)
    for (const table of RESTORE_TABLE_ORDER) {
      const rows = supabaseData[table]
      if (!rows || !Array.isArray(rows) || rows.length === 0) continue

      try {
        for (let i = 0; i < rows.length; i += 50) {
          const chunk = rows.slice(i, i + 50)
          const { error: upsertErr } = await supabase.from(table).upsert(chunk, { onConflict: 'id' })
          if (upsertErr) {
            if (isMissingTableError(upsertErr)) {
              console.info(`[Restore] Optional table "${table}" is not installed; skipping it.`)
              break
            }
            console.warn(`[Rollback] Upsert error on "${table}":`, upsertErr.message)
            failures.push(`${table}: could not restore snapshot rows (${upsertErr.message})`)
          }
        }
      } catch (err) {
        console.warn(`[Rollback] Failed to restore "${table}":`, err)
        failures.push(`${table}: restore failed (${err.message || err})`)
      }
    }

    // Step 3: Revert localStorage keys to pre-restore values
    for (const key of LOCAL_STORAGE_KEYS) {
      try {
        if (localStoragePayload[key] !== undefined && localStoragePayload[key] !== null) {
          window.localStorage.setItem(key, JSON.stringify(localStoragePayload[key]))
        } else {
          window.localStorage.removeItem(key)
        }
      } catch (err) {
        console.warn(`[Rollback] Failed to restore localStorage key "${key}":`, err)
        failures.push(`${key}: local data restore failed (${err.message || err})`)
      }
    }

    if (strict && failures.length > 0) {
      throw new Error(`The snapshot could not be applied completely:\n${failures.join('\n')}`)
    }

    return failures
  }

  // ── Helper: Remove records that came from a specific backup payload ──
  const removeBackupRecords = async (backupData) => {
    if (!backupData) return
    const supabaseData = backupData.supabase || (backupData.meta ? backupData.supabase : backupData) || {}
    const localStoragePayload = backupData.localStorage || {}

    // Step 1: Delete rows for each table in ROLLBACK_DELETE_ORDER
    for (const table of ROLLBACK_DELETE_ORDER) {
      try {
        const rows = supabaseData[table]
        if (!rows || !Array.isArray(rows) || rows.length === 0) continue

        const idsToDelete = rows
          .map((r) => r && (r.id !== undefined && r.id !== null ? r.id : null))
          .filter(Boolean)

        if (idsToDelete.length > 0) {
          console.log(`[BackupRestore] Removing ${idsToDelete.length} records from "${table}" for deleted backup`)
          for (let i = 0; i < idsToDelete.length; i += 50) {
            const chunk = idsToDelete.slice(i, i + 50)
            const { error: delErr } = await supabase.from(table).delete().in('id', chunk)
            if (delErr) {
              console.warn(`[BackupRestore] Error deleting rows from "${table}":`, delErr.message)
            }
          }
        }
      } catch (err) {
        console.warn(`[BackupRestore] Exception removing records for table "${table}":`, err)
      }
    }

    // Step 2: Clean up localStorage keys
    for (const key of LOCAL_STORAGE_KEYS) {
      try {
        if (localStoragePayload[key]) {
          const currentRaw = window.localStorage.getItem(key)
          if (currentRaw) {
            if (key === 'cuenta.budgetData.v4') {
              const current = JSON.parse(currentRaw)
              const restored = localStoragePayload[key] || {}
              const restoredReqIds = new Set((restored.requests || []).map((r) => r.id))
              const restoredExpIds = new Set((restored.expenses || []).map((e) => e.id))
              const restoredBudIds = new Set((restored.budgets || []).map((b) => b.id))

              const filtered = {
                requests: (current.requests || []).filter((r) => !restoredReqIds.has(r.id)),
                expenses: (current.expenses || []).filter((e) => !restoredExpIds.has(e.id)),
                budgets: (current.budgets || []).filter((b) => !restoredBudIds.has(b.id)),
              }
              window.localStorage.setItem(key, JSON.stringify(filtered))
            } else if (key === 'cuenta.documentHistory.v2') {
              const current = JSON.parse(currentRaw)
              const restored = localStoragePayload[key] || []
              const restoredDocIds = new Set((Array.isArray(restored) ? restored : []).map((d) => d.id || d.title))
              const filtered = (Array.isArray(current) ? current : []).filter(
                (d) => !restoredDocIds.has(d.id || d.title)
              )
              window.localStorage.setItem(key, JSON.stringify(filtered))
            } else if (key === 'cuenta.notifications.v2') {
              const current = JSON.parse(currentRaw)
              const restored = localStoragePayload[key] || []
              const restoredNotifIds = new Set((Array.isArray(restored) ? restored : []).map((n) => n.id))
              const filtered = (Array.isArray(current) ? current : []).filter(
                (n) => !restoredNotifIds.has(n.id)
              )
              window.localStorage.setItem(key, JSON.stringify(filtered))
            }
          }
        }
      } catch (err) {
        console.warn(`[BackupRestore] Failed to clean localStorage key "${key}":`, err)
      }
    }
  }

  // ── Helper: Download backup file JSON from Storage if present ───
  const fetchBackupFileContent = async (filename) => {
    if (!filename) return null
    try {
      const { data, error } = await supabase.storage.from('backups').download(filename)
      if (!error && data) {
        const text = await data.text()
        return JSON.parse(text)
      }
    } catch {
      // storage bucket may be optional
    }
    return null
  }

  // ── Helper: Resolve Snapshot for a given record ───────────────
  const resolveSnapshot = async (restoreItem) => {
    if (!restoreItem) return null
    const filename = restoreItem.filename
    const id = restoreItem.id

    // 1. Snapshot already embedded in item object
    if (restoreItem.snapshot && (restoreItem.snapshot.supabase || restoreItem.snapshot.localStorage)) {
      return restoreItem.snapshot
    }

    // 2. Fetch directly from Supabase restore_history row by ID
    if (id) {
      try {
        const { data, error } = await supabase
          .from('restore_history')
          .select('snapshot')
          .eq('id', id)
          .maybeSingle()

        if (!error && data?.snapshot && (data.snapshot.supabase || data.snapshot.localStorage)) {
          return data.snapshot
        }
      } catch (e) {
        console.warn('[BackupRestore] Error fetching snapshot from Supabase by ID:', e)
      }
    }

    // 2b. Query by filename from Supabase restore_history
    if (filename) {
      try {
        const { data, error } = await supabase
          .from('restore_history')
          .select('snapshot')
          .eq('filename', filename)
          .order('restored_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (!error && data?.snapshot && (data.snapshot.supabase || data.snapshot.localStorage)) {
          return data.snapshot
        }
      } catch (e) {
        console.warn('[BackupRestore] Error fetching snapshot from Supabase by filename:', e)
      }
    }

    // 3. Check client IndexedDB & LocalStorage by ID
    if (id) {
      const snap = await getSnapshot(id)
      if (snap && (snap.supabase || snap.localStorage)) return snap
    }

    // 4. Check client IndexedDB & LocalStorage by Filename
    if (filename) {
      const snap = await getSnapshot(filename)
      if (snap && (snap.supabase || snap.localStorage)) return snap
    }

    // 5. Check latest pre-restore fallback
    const latestSnap = await getSnapshot('__latest_pre_restore__')
    if (latestSnap && (latestSnap.supabase || latestSnap.localStorage)) {
      return latestSnap
    }

    return null
  }

  // ── Check if a backup was restored ───────────────────────────
  const isBackupRestored = useCallback(
    (filename) => {
      if (!filename) return false
      return restoreHistory.some(
        (r) => r.filename === filename && r.restore_status === 'success'
      )
    },
    [restoreHistory]
  )

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

      // Record backup metadata in Supabase
      const { error } = await insertBackupRecord({
        filename,
        backup_size: sizeBytes,
        created_by_id: user?.id || null,
        created_by_name: profileName || role || 'System',
      })

      if (error) {
        console.error('[BackupRestore] Could not record backup metadata:', error.message)
      }

      addLog({
        action: `Backup Generated — ${filename}`,
        actionType: 'Backup Generated',
        module: 'Backup & Restore',
        recordType: 'Backup',
        recordId: filename,
        description: `System backup created. File: ${filename}, Size: ${(sizeBytes / 1024).toFixed(1)} KB`,
        newValue: { filename, sizeBytes, createdBy: profileName || role || 'System' },
        status: 'Success',
      })

      if (addNotification) {
        addNotification({
          type: 'info',
          title: 'Backup Generated',
          message: `Backup file ${filename} generated and saved successfully.`,
        })
      }

      await fetchBackups()
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

  function normalizeBackupData(parsed) {
    if (isNewFormat(parsed)) return parsed

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
    let preRestoreSnapshot = null

    try {
      // 0. Automatically create and persist pre-restore snapshot of current database state
      preRestoreSnapshot = await exportAllData()
      await saveSnapshot(fileObj.name, preRestoreSnapshot)
      await saveSnapshot('__latest_pre_restore__', preRestoreSnapshot)

      const backup = normalizeBackupData(rawParsedData)
      const supabaseData = backup.supabase || {}
      const localStoragePayload = backup.localStorage || {}

      // 1. Replace the current operational state with the backup exactly.
      // This removes records created after the backup, including when a
      // backed-up table or localStorage key was empty.
      // Prefer the atomic SECURITY DEFINER RPC (bypasses per-row RLS, so a
      // stale JWT role claim can't fail the restore); fall back to the
      // client-side path if the RPC isn't deployed yet.
      let rpcSuccess = false
      let rpcFailureReason = null
      try {
        const { data: rpcData, error: rpcError } = await supabase.rpc('restore_backup_atomic', {
          p_backup_data: backup,
        })

        if (!rpcError && rpcData?.success) {
          rpcSuccess = true
          const rpcLocalStorage = rpcData.localStorage || {}
          for (const key of LOCAL_STORAGE_KEYS) {
            if (rpcLocalStorage[key] !== undefined && rpcLocalStorage[key] !== null) {
              window.localStorage.setItem(key, JSON.stringify(rpcLocalStorage[key]))
            } else {
              window.localStorage.removeItem(key)
            }
          }
        } else if (rpcError) {
          rpcFailureReason = rpcError.message
          console.warn('[BackupRestore] restore_backup_atomic RPC failed, falling back to client-side restore:', rpcError.message)
        }
      } catch (rpcErr) {
        rpcFailureReason = rpcErr?.message || String(rpcErr)
        console.warn('[BackupRestore] RPC invocation exception, falling back to client-side restore:', rpcErr)
      }

      if (!rpcSuccess) {
        try {
          await applySnapshot(backup, { strict: true })
        } catch (fallbackErr) {
          if (rpcFailureReason) {
            throw new Error(`Atomic restore failed (${rpcFailureReason}); fallback also failed: ${fallbackErr.message}`)
          }
          throw fallbackErr
        }
      }
      for (const table of RESTORE_TABLE_ORDER) {
        const count = Array.isArray(supabaseData[table]) ? supabaseData[table].length : 0
        tableResults.push(`${table}: replaced with ${count} backup row${count === 1 ? '' : 's'}`)
      }
      for (const key of LOCAL_STORAGE_KEYS) {
        tableResults.push(
          `localStorage[${key}]: ${localStoragePayload[key] === undefined ? 'cleared' : 'replaced'}`
        )
      }

      // 2. Trigger immediate state refresh across all modules
      if (typeof refreshAllBudgetData === 'function') {
        await refreshAllBudgetData()
      }
      if (typeof fetchLogs === 'function') {
        await fetchLogs()
      }
      if (typeof refreshNotifications === 'function') {
        await refreshNotifications()
      }

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('cuenta:rollback-complete'))
        window.dispatchEvent(new Event('storage'))
      }

      status = 'success'
      details = tableResults.join('\n')

      addLog({
        action: `Restore Completed — ${fileObj.name}`,
        actionType: 'Restore Completed',
        module: 'Backup & Restore',
        recordType: 'Backup',
        recordId: fileObj.name,
        description: `System restored from backup file: ${fileObj.name}. ${tableResults.length} items processed.`,
        status: 'Success',
      })

      if (addNotification) {
        addNotification({
          type: 'info',
          title: 'System Restored',
          message: `System successfully restored from "${fileObj.name}".`,
        })
      }
    } catch (err) {
      status = 'failed'
      details = err.message + '\n' + tableResults.join('\n')
      console.error('Restore failed', err)
      // Do not leave a partially restored system if any table operation fails.
      if (preRestoreSnapshot) {
        try {
          await applySnapshot(preRestoreSnapshot, { strict: true })
        } catch (rollbackError) {
          details += `\nAutomatic recovery also failed: ${rollbackError.message}`
          console.error('Automatic recovery after failed restore failed', rollbackError)
        }
      }
      throw err
    } finally {
      // Record restore history WITH the snapshot for guaranteed atomic rollbacks
      const { data: histData, error: histError } = await insertRestoreRecord({
        filename: fileObj.name,
        restored_by_id: user?.id || null,
        restored_by_name: profileName || role || 'System',
        restore_status: status,
        details: details,
        snapshot: preRestoreSnapshot,
      })

      if (histError) {
        console.error('[BackupRestore] Could not record restore history:', histError.message)
      } else if (histData && histData[0]?.id && preRestoreSnapshot) {
        await saveSnapshot(histData[0].id, preRestoreSnapshot)
      }

      await fetchRestoreHistory()
      setIsLoading(false)
    }
  }

  // ── Trigger Multi-Module React Context Refresh ───────────────
  const triggerMultiModuleRefresh = async () => {
    if (typeof refreshAllBudgetData === 'function') {
      await refreshAllBudgetData()
    }
    if (typeof fetchLogs === 'function') {
      await fetchLogs()
    }
    if (typeof refreshNotifications === 'function') {
      await refreshNotifications()
    }
    await fetchBackups()
    await fetchRestoreHistory()

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('cuenta:rollback-complete'))
      window.dispatchEvent(new Event('storage'))
    }
  }

  // ── Delete Backup (with automatic pre-restore rollback if restored) ──
  const deleteBackup = async (backupItem) => {
    setIsLoading(true)
    try {
      const filename = backupItem?.filename
      const backupId = backupItem?.id
      const wasRestored = isBackupRestored(filename)
      let rolledBack = false

      // Mark locally deleted immediately so it never reappears in UI
      markBackupDeleted(backupId, filename)
      setBackups((prev) =>
        prev.filter((b) => (backupId ? String(b.id) !== String(backupId) : true) && (filename ? b.filename !== filename : true))
      )
      if (filename) {
        markHistoryDeleted(null, filename)
        setRestoreHistory((prev) => prev.filter((r) => r.filename !== filename))
      }

      if (wasRestored) {
        const snapshot = await resolveSnapshot(backupItem)
        if (snapshot && (snapshot.supabase || snapshot.localStorage)) {
          console.log(`[BackupRestore] Rolling back database for restored backup "${filename}"`)
          let rpcSuccess = false
          try {
            const { data: rpcData, error: rpcError } = await supabase.rpc('rollback_restored_backup', {
              p_restore_history_id: null,
              p_filename: filename,
              p_snapshot: snapshot,
              p_delete_backup: true,
            })

            if (!rpcError && rpcData?.success) {
              rpcSuccess = true
              if (rpcData.localStorage) {
                for (const key of LOCAL_STORAGE_KEYS) {
                  if (rpcData.localStorage[key] !== undefined && rpcData.localStorage[key] !== null) {
                    window.localStorage.setItem(key, JSON.stringify(rpcData.localStorage[key]))
                  } else {
                    window.localStorage.removeItem(key)
                  }
                }
              }
            }
          } catch (rpcErr) {
            console.warn('[BackupRestore] RPC deleteBackup rollback error, fallback to client:', rpcErr)
          }

          if (!rpcSuccess) {
            await applySnapshot(snapshot, { strict: true })
          }

          if (filename) await removeSnapshot(filename)
          if (backupId) await removeSnapshot(backupId)
          await removeSnapshot('__latest_pre_restore__')
          rolledBack = true
        } else {
          // If no snapshot found, remove records by backup content
          const backupContent = await fetchBackupFileContent(filename)
          if (backupContent) {
            await removeBackupRecords(backupContent)
            rolledBack = true
          }
        }
      }

      // Delete backup record from Supabase
      if (backupId) {
        await supabase.from('backups').delete().eq('id', backupId)
      }
      if (filename) {
        await supabase.from('backups').delete().eq('filename', filename)
      }

      // Remove matching restore history entries from Supabase
      if (filename) {
        await supabase.from('restore_history').delete().eq('filename', filename)
      }

      // Storage cleanup if applicable
      try {
        if (filename) {
          await supabase.storage.from('backups').remove([filename])
        }
      } catch {
        // storage optional
      }

      // Log Audit Trail
      const logDescription = wasRestored && rolledBack
        ? `${profileName || role || 'SK Chairman'} deleted restored backup "${filename}" and reverted the system to its previous state.`
        : `${profileName || role || 'SK Chairman'} deleted backup "${filename}".`

      addLog({
        action: `Backup Deleted — ${filename}`,
        actionType: 'Backup Deleted',
        module: 'Backup & Restore',
        recordType: 'Backup',
        recordId: filename,
        description: logDescription,
        newValue: { filename, wasRestored, rolledBack },
        status: 'Success',
      })

      if (addNotification) {
        addNotification({
          type: 'info',
          title: 'Backup Deleted',
          message: wasRestored && rolledBack
            ? `Restored backup "${filename}" deleted and system reverted to previous state.`
            : `Backup "${filename}" deleted successfully.`,
        })
      }

      await triggerMultiModuleRefresh()
      return { success: true, wasRestored, rolledBack }
    } catch (err) {
      console.error('[BackupRestore] Delete backup failed:', err)
      throw err
    } finally {
      setIsLoading(false)
    }
  }

  // ── Delete Restore History (with automatic rollback if snapshot available) ──────────────
  const deleteRestoreHistory = async (restoreItem) => {
    setIsLoading(true)
    try {
      const filename = restoreItem?.filename
      const historyId = restoreItem?.id
      const isSuccessfulRestore = restoreItem?.restore_status === 'success'

      let rolledBack = false

      if (isSuccessfulRestore) {
        // Attempt to resolve the exact pre-restore snapshot
        const snapshot = await resolveSnapshot(restoreItem)
        if (snapshot && (snapshot.supabase || snapshot.localStorage)) {
          // Attempt atomic PostgreSQL RPC execution
          try {
            const { data: rpcData, error: rpcError } = await supabase.rpc('rollback_restored_backup', {
              p_restore_history_id: historyId || null,
              p_filename: filename || null,
              p_snapshot: snapshot,
              p_delete_backup: false,
            })

            if (!rpcError && rpcData?.success) {
              rolledBack = true
              if (rpcData.localStorage) {
                for (const key of LOCAL_STORAGE_KEYS) {
                  if (rpcData.localStorage[key] !== undefined && rpcData.localStorage[key] !== null) {
                    window.localStorage.setItem(key, JSON.stringify(rpcData.localStorage[key]))
                  } else {
                    window.localStorage.removeItem(key)
                  }
                }
              }
            } else if (rpcError) {
              console.warn('[BackupRestore] Database RPC rollback error, falling back to client-side rollback:', rpcError.message)
            }
          } catch (rpcEx) {
            console.warn('[BackupRestore] RPC invocation exception, falling back to client-side rollback:', rpcEx)
          }

          // Fallback: Client-Side Transactional Rollback if RPC was not used
          if (!rolledBack) {
            console.log(`[BackupRestore] Executing client-side rollback for "${filename}"`)
            await applySnapshot(snapshot, { strict: true })
            rolledBack = true
          }

          // Clean up local snapshots
          if (filename) await removeSnapshot(filename)
          if (historyId) await removeSnapshot(historyId)
          await removeSnapshot('__latest_pre_restore__')
        } else {
          console.warn(
            `[BackupRestore] Pre-restore snapshot is unavailable for "${filename}". Deleting restore history record without database rollback to keep current live data safe.`
          )
        }
      }

      // Delete restore history record from Supabase
      if (historyId) {
        await supabase.from('restore_history').delete().eq('id', historyId)
      }
      if (filename) {
        await supabase.from('restore_history').delete().eq('filename', filename)
      }

      // Only hide the entry after its rollback and database deletion succeed.
      markHistoryDeleted(historyId, filename)
      setRestoreHistory((prev) =>
        prev.filter((r) => (historyId ? String(r.id) !== String(historyId) : true) && (filename ? r.filename !== filename : true))
      )

      // Storage cleanup if applicable
      try {
        if (filename) {
          await supabase.storage.from('backups').remove([filename])
        }
      } catch {
        // storage optional
      }

      // Record Audit Log
      const logDescription = rolledBack
        ? `${profileName || role || 'SK Chairman'} deleted restored backup "${filename}" and reverted the database to its pre-restore state.`
        : `${profileName || role || 'SK Chairman'} deleted restore history record "${filename}" (pre-restore snapshot was unavailable, live data preserved).`

      addLog({
        action: `Restore Record Deleted — ${filename}`,
        actionType: 'Restore Deleted',
        module: 'Backup & Restore',
        recordType: 'Restore History',
        recordId: filename || historyId,
        description: logDescription,
        newValue: { filename, rolledBack },
        status: 'Success',
      })

      if (addNotification) {
        addNotification({
          type: 'info',
          title: 'Restore Record Deleted',
          message: rolledBack
            ? `Restored backup "${filename}" deleted and system state rolled back.`
            : `Restore record "${filename}" removed from history. Live data preserved.`,
        })
      }

      // Refresh all modules immediately
      await triggerMultiModuleRefresh()
      return { success: true, wasRolledBack: rolledBack }
    } catch (err) {
      console.error('[BackupRestore] Delete restore history failed:', err)
      throw err
    } finally {
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
      lastCreator: lastBackup?.created_by_name || '—',
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
      deleteBackup,
      deleteRestoreHistory,
      isBackupRestored,
      backupStats,
    }),
    [
      backups,
      restoreHistory,
      isLoading,
      fetchBackups,
      fetchRestoreHistory,
      deleteBackup,
      deleteRestoreHistory,
      isBackupRestored,
      backupStats,
    ]
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
