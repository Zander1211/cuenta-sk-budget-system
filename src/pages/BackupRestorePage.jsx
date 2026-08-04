import { useState, useRef, useMemo } from 'react'
import {
  DatabaseBackup,
  HardDriveDownload,
  HardDriveUpload,
  Clock,
  FileJson,
  CheckCircle2,
  XCircle,
  Loader2,
  Database,
  HardDrive,
  Trash2,
  AlertTriangle
} from 'lucide-react'
import RoleGate from '../components/RoleGate'
import { useBackupRestore } from '../context/BackupRestoreContext'

function formatBytes(bytes, decimals = 2) {
  if (!+bytes) return '0 Bytes'
  const k = 1024
  const dm = decimals < 0 ? 0 : decimals
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`
}

function formatDate(dateStr) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function BackupRestorePage() {
  const {
    backups,
    restoreHistory,
    isLoading,
    createBackup,
    restoreFromBackup,
    deleteBackup,
    deleteRestoreHistory,
    isBackupRestored,
    backupStats
  } = useBackupRestore()

  const [dragActive, setDragActive] = useState(false)
  const [selectedFile, setSelectedFile] = useState(null)
  const [parsedData, setParsedData] = useState(null)
  const [previewError, setPreviewError] = useState('')
  const fileInputRef = useRef(null)

  // Delete confirmation modal state
  const [deleteModal, setDeleteModal] = useState({ open: false, type: null, item: null })
  const [isDeleting, setIsDeleting] = useState(false)

  const handleDrag = (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }

  const processFile = (file) => {
    setPreviewError('')
    setSelectedFile(null)
    setParsedData(null)

    if (!file) return
    if (!file.name.endsWith('.json')) {
      setPreviewError('Only JSON files are supported for restore.')
      return
    }

    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const json = JSON.parse(e.target.result)
        if (typeof json !== 'object' || Array.isArray(json)) {
          throw new Error('Invalid backup format. Expected an object containing tables.')
        }
        // Validate: must be new format (has meta.version + supabase) or old flat format
        const isNewFmt = json.meta && json.meta.version && (json.supabase || json.localStorage)
        const isOldFmt = !isNewFmt && Object.values(json).some(v => Array.isArray(v))
        if (!isNewFmt && !isOldFmt) {
          throw new Error('Unrecognized backup format. The file does not contain valid Cuenta backup data.')
        }
        setParsedData(json)
        setSelectedFile(file)
      } catch (err) {
        setPreviewError(err.message || 'Failed to parse the backup file. It may be corrupted or invalid.')
      }
    }
    reader.onerror = () => setPreviewError('Failed to read the file.')
    reader.readAsText(file)
  }

  const handleDrop = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0])
    }
  }

  const handleChange = (e) => {
    e.preventDefault()
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0])
    }
  }

  const handleRestore = async () => {
    if (!selectedFile || !parsedData) return
    
    if (!window.confirm('WARNING: Restoring will overwrite existing data with the contents of this backup. Are you absolutely sure you want to proceed?')) {
      return
    }

    try {
      await restoreFromBackup(selectedFile, parsedData)
      alert('System successfully restored! All modules have been updated with the backup data.')
      setSelectedFile(null)
      setParsedData(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
    } catch (err) {
      console.error('Restore error:', err)
      alert('Restore failed: ' + (err?.message || 'See console for details.'))
    }
  }

  const handleConfirmDelete = async () => {
    if (!deleteModal.open || !deleteModal.item) return
    setIsDeleting(true)
    try {
      if (deleteModal.type === 'backup') {
        const result = await deleteBackup(deleteModal.item)
        if (result?.rolledBack) {
          alert('Backup deleted! Database state and all modules have been rolled back to their pre-restore state.')
        } else {
          alert('Backup deleted successfully.')
        }
      } else if (deleteModal.type === 'restore') {
        const result = await deleteRestoreHistory(deleteModal.item)
        if (result?.wasRolledBack) {
          alert('Restore record deleted! Restored data has been removed and the database returned to its previous state.')
        } else {
          alert('Restore record removed from history. Current system data remains safe and intact.')
        }
      }
      setDeleteModal({ open: false, type: null, item: null })
    } catch (err) {
      console.error('Deletion error:', err)
      alert(err.message || 'Failed to delete record. Check console.')
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <RoleGate allow={['SK Chairman']}>
      <header className="dashboard-header">
        <div className="header-left">
          <div>
            <p className="eyebrow">Data Management</p>
            <h1>Backup & Restore</h1>
            <p>Secure system data and restore from previous snapshots.</p>
          </div>
        </div>
      </header>

      <section className="dashboard-content backup-dashboard">
        
        {/* BACKUP SECTION */}
        <div className="overview-card">
          <div className="card-header-bar">
            <div>
              <p className="eyebrow">System Snapshots</p>
              <h2>Create Backup</h2>
            </div>
            <button 
              type="button" 
              className="primary-button" 
              onClick={createBackup}
              disabled={isLoading || isDeleting}
            >
              {isLoading ? <Loader2 size={16} className="spin-animation" /> : <HardDriveDownload size={16} />}
              Generate Backup
            </button>
          </div>

          <div className="backup-summary-grid">
            <div className="backup-card">
              <span className="backup-card-label">Total Backups</span>
              <span className="backup-card-value">{backupStats.total}</span>
            </div>
            <div className="backup-card">
              <span className="backup-card-label">Last Backup Date</span>
              <span className="backup-card-value">{formatDate(backupStats.lastDate)}</span>
            </div>
            <div className="backup-card">
              <span className="backup-card-label">Last Backup Size</span>
              <span className="backup-card-value">{formatBytes(backupStats.lastSize)}</span>
            </div>
            <div className="backup-card">
              <span className="backup-card-label">Created By</span>
              <span className="backup-card-value" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {backupStats.lastCreator}
              </span>
            </div>
          </div>

          <p className="eyebrow" style={{ marginTop: '24px' }}>Backup History</p>
          <table className="data-table">
            <thead>
              <tr>
                <th>Filename</th>
                <th>Size</th>
                <th>Created By</th>
                <th>Date</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {backups.length ? (
                backups.map(b => {
                  const restored = isBackupRestored(b.filename)
                  return (
                    <tr key={b.id || b.filename}>
                      <td data-label="Filename">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          <FileJson size={16} style={{ color: 'var(--ink-soft)' }} />
                          <span style={{ fontWeight: 500 }}>{b.filename}</span>
                          {restored && (
                            <span className="status-pill status-approved" style={{ fontSize: '0.72rem', padding: '2px 6px' }}>
                              Restored
                            </span>
                          )}
                        </div>
                      </td>
                      <td data-label="Size">{formatBytes(b.backup_size)}</td>
                      <td data-label="Created By">{b.created_by_name}</td>
                      <td data-label="Date" style={{ color: 'var(--ink-soft)' }}>{formatDate(b.created_at)}</td>
                      <td data-label="Actions" className="table-actions" style={{ textAlign: 'right' }}>
                        <button
                          type="button"
                          className="secondary-button"
                          style={{
                            color: '#dc2626',
                            borderColor: '#fca5a5',
                            backgroundColor: '#fef2f2',
                            padding: '6px 12px',
                            fontSize: '0.85rem',
                          }}
                          onClick={() => setDeleteModal({ open: true, type: 'backup', item: b })}
                          disabled={isLoading || isDeleting}
                          title="Delete Backup"
                        >
                          <Trash2 size={14} />
                          Delete
                        </button>
                      </td>
                    </tr>
                  )
                })
              ) : (
                <tr>
                  <td colSpan="5" className="empty-state">No backups found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* RESTORE SECTION */}
        <div className="overview-card" style={{ marginTop: '24px' }}>
          <p className="eyebrow">Data Recovery</p>
          <h2>Restore System</h2>
          <p style={{ color: 'var(--ink-soft)', marginBottom: '20px', fontSize: '0.9rem' }}>
            Upload a previously generated <code>.json</code> backup file to restore the system state. 
            This action will update existing records to match the backup data.
          </p>

          <form onDragEnter={handleDrag} onSubmit={(e) => e.preventDefault()}>
            <input 
              ref={fileInputRef} 
              type="file" 
              accept=".json" 
              onChange={handleChange} 
              style={{ display: 'none' }} 
            />
            <label 
              className={`restore-upload-area ${dragActive ? 'drag-active' : ''}`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <HardDriveUpload size={32} style={{ color: dragActive ? 'var(--sea)' : 'var(--ink-soft)' }} />
              <div>
                <p style={{ fontWeight: 600, color: dragActive ? 'var(--sea)' : 'var(--ink)', marginBottom: '4px' }}>
                  Click to upload or drag and drop
                </p>
                <p style={{ fontSize: '0.85rem' }}>Cuenta JSON Backup files only</p>
              </div>
            </label>
          </form>

          {previewError && (
            <div className="restore-error-list">
              <XCircle size={18} />
              <div>
                <strong>Validation Error</strong>
                <p>{previewError}</p>
              </div>
            </div>
          )}

          {selectedFile && parsedData && (() => {
            // Normalize for preview: detect new vs old format
            const isNewFmt = parsedData.meta && parsedData.meta.version && (parsedData.supabase || parsedData.localStorage)
            const supabaseTables = isNewFmt ? (parsedData.supabase || {}) : parsedData
            const localStorageEntries = isNewFmt ? (parsedData.localStorage || {}) : {}
            const backupMeta = isNewFmt ? parsedData.meta : null

            const supabaseEntries = Object.entries(supabaseTables).filter(([, v]) => Array.isArray(v))
            const localEntries = Object.entries(localStorageEntries)
            const totalRows = supabaseEntries.reduce((sum, [, arr]) => sum + arr.length, 0)

            return (
            <div className="restore-preview">
              <div className="restore-preview-header">
                <CheckCircle2 size={20} style={{ color: '#15803d', marginTop: '2px' }} />
                <div>
                  <h3 style={{ margin: '0 0 4px 0', fontSize: '1.05rem', color: '#15803d' }}>Ready to Restore</h3>
                  <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--ink-soft)' }}>
                    <strong>File:</strong> {selectedFile.name} ({formatBytes(selectedFile.size)})
                    {backupMeta && <> · <strong>Format:</strong> v{backupMeta.version}</>}
                    {backupMeta && <> · <strong>Created:</strong> {formatDate(backupMeta.createdAt)}</>}
                  </p>
                </div>
              </div>
              
              {/* Supabase Tables */}
              {supabaseEntries.length > 0 && (
              <div className="restore-preview-tables">
                <p className="eyebrow" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Database size={14} /> Supabase Tables ({totalRows} total rows)
                </p>
                <div className="restore-table-list">
                  {supabaseEntries.map(([tableName, dataArr]) => (
                    <div key={tableName} className="restore-table-item">
                      <span className="restore-table-name">{tableName}</span>
                      <span className="restore-table-count">
                        {dataArr.length} rows
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              )}

              {/* localStorage Data */}
              {localEntries.length > 0 && (
              <div className="restore-preview-tables">
                <p className="eyebrow" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <HardDrive size={14} /> Local Storage Data
                </p>
                <div className="restore-table-list">
                  {localEntries.map(([key, value]) => {
                    let label = key
                    let detail = 'object'
                    if (key === 'cuenta.budgetData.v4') {
                      label = 'Budget Data (Requests, Expenses, Budgets)'
                      const v = value || {}
                      const parts = []
                      if (Array.isArray(v.requests)) parts.push(`${v.requests.length} requests`)
                      if (Array.isArray(v.expenses)) parts.push(`${v.expenses.length} expenses`)
                      if (Array.isArray(v.budgets)) parts.push(`${v.budgets.length} budgets`)
                      detail = parts.join(', ') || 'empty'
                    } else if (key === 'cuenta.documentHistory.v2') {
                      label = 'Document History'
                      detail = Array.isArray(value) ? `${value.length} documents` : 'object'
                    } else if (key === 'cuenta.notifications.v2') {
                      label = 'Notifications'
                      detail = Array.isArray(value) ? `${value.length} notifications` : 'object'
                    }
                    return (
                      <div key={key} className="restore-table-item">
                        <span className="restore-table-name">{label}</span>
                        <span className="restore-table-count">{detail}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
              )}

              <div className="restore-preview-actions" style={{ marginTop: '12px' }}>
                <button 
                  type="button" 
                  className="primary-button" 
                  onClick={handleRestore}
                  disabled={isLoading || isDeleting}
                  style={{ background: '#b91c1c' }}
                >
                  {isLoading ? <Loader2 size={16} className="spin-animation" /> : null}
                  Confirm & Restore Data
                </button>
                <button 
                  type="button" 
                  className="secondary-button" 
                  onClick={() => {
                    setSelectedFile(null)
                    setParsedData(null)
                    if (fileInputRef.current) fileInputRef.current.value = ''
                  }}
                  disabled={isLoading || isDeleting}
                >
                  Cancel
                </button>
              </div>
            </div>
            )
          })()}

          <p className="eyebrow" style={{ marginTop: '32px' }}>Restore History</p>
          <table className="data-table">
            <thead>
              <tr>
                <th>Filename</th>
                <th>Status</th>
                <th>Restored By</th>
                <th>Date</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {restoreHistory.length ? (
                restoreHistory.map(r => (
                  <tr key={r.id || r.filename}>
                    <td data-label="Filename">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Clock size={16} style={{ color: 'var(--ink-soft)' }} />
                        <span style={{ fontWeight: 500 }}>{r.filename}</span>
                      </div>
                    </td>
                    <td data-label="Status">
                      <span className={`status-pill ${r.restore_status === 'success' ? 'status-approved' : 'status-rejected'}`}>
                        {r.restore_status === 'success' ? 'Success' : 'Failed'}
                      </span>
                    </td>
                    <td data-label="Restored By">{r.restored_by_name}</td>
                    <td data-label="Date" style={{ color: 'var(--ink-soft)' }}>{formatDate(r.restored_at)}</td>
                    <td data-label="Actions" className="table-actions" style={{ textAlign: 'right' }}>
                      <button
                        type="button"
                        className="secondary-button"
                        style={{
                          color: '#dc2626',
                          borderColor: '#fca5a5',
                          backgroundColor: '#fef2f2',
                          padding: '6px 12px',
                          fontSize: '0.85rem',
                        }}
                        onClick={() => setDeleteModal({ open: true, type: 'restore', item: r })}
                        disabled={isLoading || isDeleting}
                        title="Delete Restore History"
                      >
                        <Trash2 size={14} />
                        Delete
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="5" className="empty-state">No restore history found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Delete Confirmation Modal */}
      {deleteModal.open && (
        <div
          className="modal-overlay"
          onClick={() => !isDeleting && setDeleteModal({ open: false, type: null, item: null })}
        >
          <div
            className="modal-content"
            style={{ maxWidth: '480px' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '50%',
                  backgroundColor: '#fee2e2',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#dc2626',
                  flexShrink: 0
                }}
              >
                <Trash2 size={20} />
              </div>
              <div>
                <h2 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--ink)' }}>
                  {deleteModal.type === 'restore' || isBackupRestored(deleteModal.item?.filename)
                    ? 'Delete Restored Backup'
                    : 'Delete Backup'}
                </h2>
                <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--ink-soft)' }}>
                  {deleteModal.item?.filename}
                </p>
              </div>
            </div>

            <div className="modal-body" style={{ margin: '20px 0', lineHeight: 1.5 }}>
              {deleteModal.type === 'restore' || isBackupRestored(deleteModal.item?.filename) ? (
                <>
                  <p style={{ color: 'var(--ink)', fontSize: '0.95rem', margin: '0 0 12px 0', fontWeight: 600 }}>
                    Are you sure you want to delete this restored backup?
                  </p>
                  <p style={{ color: 'var(--ink-soft)', fontSize: '0.9rem', margin: '0 0 12px 0' }}>
                    Deleting this backup will remove the restored data and return the system to the state it was in before the restore.
                  </p>
                  <div
                    style={{
                      backgroundColor: '#fffbeb',
                      border: '1px solid #fef3c7',
                      borderLeft: '4px solid #f59e0b',
                      borderRadius: '6px',
                      padding: '12px',
                      marginTop: '8px',
                      display: 'flex',
                      gap: '10px',
                      fontSize: '0.88rem',
                      color: '#92400e'
                    }}
                  >
                    <AlertTriangle size={20} style={{ flexShrink: 0, marginTop: '2px', color: '#d97706' }} />
                    <div>
                      <strong style={{ display: 'block', marginBottom: '2px' }}>Automatic System Rollback</strong>
                      <span>
                        All records imported from this backup will be removed, and your prior data will be restored across all modules. This action cannot be undone.
                      </span>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <p style={{ color: 'var(--ink)', fontSize: '0.95rem', margin: '0 0 8px 0' }}>
                    Are you sure you want to delete this backup?
                  </p>
                  <p style={{ color: 'var(--ink-soft)', fontSize: '0.88rem', margin: 0 }}>
                    This action cannot be undone.
                  </p>
                </>
              )}
            </div>

            <div className="modal-footer" style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="secondary-button"
                onClick={() => setDeleteModal({ open: false, type: null, item: null })}
                disabled={isDeleting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="primary-button"
                style={{ backgroundColor: '#dc2626', color: '#fff', borderColor: '#dc2626' }}
                onClick={handleConfirmDelete}
                disabled={isDeleting}
              >
                {isDeleting ? <Loader2 size={16} className="spin-animation" /> : <Trash2 size={16} />}
                {isDeleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </RoleGate>
  )
}

export default BackupRestorePage
