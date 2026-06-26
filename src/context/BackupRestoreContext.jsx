import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useAuth } from './AuthContext'
import { supabase } from '../supabase/supabaseClient'
import { logAuditEvent } from '../utils/auditLogger'
import { useAuditLog } from './AuditLogContext'

const BackupRestoreContext = createContext(null)

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

  // Get current state of all relevant tables
  const exportAllData = async () => {
    const tables = [
      'budgets',
      'expenses',
      'requests',
      'documents',
      'projects',
      'created_accounts',
      // skip audit_trail, backups, restore_history to avoid recursion/bloat
    ]
    
    const exportData = {}
    for (const table of tables) {
      const { data, error } = await supabase.from(table).select('*')
      if (!error && data) {
        exportData[table] = data
      }
    }
    return exportData
  }

  const createBackup = async () => {
    try {
      setIsLoading(true)
      const data = await exportAllData()
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      const filename = `cuenta_backup_${timestamp}.json`
      
      const jsonStr = JSON.stringify(data, null, 2)
      const blob = new Blob([jsonStr], { type: 'application/json' })
      const sizeBytes = blob.size

      // In a real app with storage setup, we would upload the blob to Supabase Storage.
      // Here, we just download it locally and record the metadata.
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

  const restoreFromBackup = async (fileObj, parsedData) => {
    setIsLoading(true)
    let status = 'failed'
    let details = ''

    try {
      // 1. Process tables in order (respecting rough FK constraints if any)
      const tables = [
        'created_accounts',
        'projects',
        'budgets',
        'expenses',
        'requests',
        'documents',
      ]

      for (const table of tables) {
        if (parsedData[table] && Array.isArray(parsedData[table])) {
          // Upsert data. We assume IDs are preserved.
          const { error } = await supabase.from(table).upsert(parsedData[table])
          if (error) {
            console.warn(`Error restoring ${table}:`, error)
          }
        }
      }

      status = 'success'
      details = `Successfully restored ${Object.keys(parsedData).length} tables.`
      
      addLog({
        action: 'Restored system from backup',
        module: 'Backup & Restore',
        description: `File: ${fileObj.name}`
      })
    } catch (err) {
      status = 'failed'
      details = err.message
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
