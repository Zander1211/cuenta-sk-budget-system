import { useState, useRef, useMemo } from 'react'
import { DatabaseBackup, HardDriveDownload, HardDriveUpload, Clock, FileJson, CheckCircle2, XCircle, Loader2, Database, HardDrive } from 'lucide-react'
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
  const { backups, restoreHistory, isLoading, createBackup, restoreFromBackup, backupStats } = useBackupRestore()
  const [dragActive, setDragActive] = useState(false)
  const [selectedFile, setSelectedFile] = useState(null)
  const [parsedData, setParsedData] = useState(null)
  const [previewError, setPreviewError] = useState('')
  const fileInputRef = useRef(null)

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
      // Check if localStorage data was part of the backup — if so, reload
      const hasLocalStorage = parsedData.localStorage && Object.keys(parsedData.localStorage).length > 0
      alert('System successfully restored!' + (hasLocalStorage ? ' The page will now reload to apply all changes.' : ''))
      if (hasLocalStorage) {
        window.location.reload()
        return
      }
      setSelectedFile(null)
      setParsedData(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
    } catch (err) {
      alert('Restore failed. See console for details.')
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div>
              <p className="eyebrow">System Snapshots</p>
              <h2>Create Backup</h2>
            </div>
            <button 
              type="button" 
              className="primary-button" 
              onClick={createBackup}
              disabled={isLoading}
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
              </tr>
            </thead>
            <tbody>
              {backups.length ? (
                backups.map(b => (
                  <tr key={b.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <FileJson size={16} style={{ color: 'var(--ink-soft)' }} />
                        <span style={{ fontWeight: 500 }}>{b.filename}</span>
                      </div>
                    </td>
                    <td>{formatBytes(b.backup_size)}</td>
                    <td>{b.created_by_name}</td>
                    <td style={{ color: 'var(--ink-soft)' }}>{formatDate(b.created_at)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="4" className="empty-state">No backups found.</td>
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
                  disabled={isLoading}
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
                  disabled={isLoading}
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
              </tr>
            </thead>
            <tbody>
              {restoreHistory.length ? (
                restoreHistory.map(r => (
                  <tr key={r.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Clock size={16} style={{ color: 'var(--ink-soft)' }} />
                        <span style={{ fontWeight: 500 }}>{r.filename}</span>
                      </div>
                    </td>
                    <td>
                      <span className={`status-pill ${r.restore_status === 'success' ? 'status-approved' : 'status-rejected'}`}>
                        {r.restore_status === 'success' ? 'Success' : 'Failed'}
                      </span>
                    </td>
                    <td>{r.restored_by_name}</td>
                    <td style={{ color: 'var(--ink-soft)' }}>{formatDate(r.restored_at)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="4" className="empty-state">No restore history found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </RoleGate>
  )
}

export default BackupRestorePage
