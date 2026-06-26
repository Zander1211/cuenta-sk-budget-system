import { useMemo, useState } from 'react'
import { Search, Trash2, Download } from 'lucide-react'
import RoleGate from '../components/RoleGate'
import { useAuditLog } from '../context/AuditLogContext'

const actionTypes = [
  'All',
  'Login',
  'Logout',
  'Approved',
  'Rejected',
  'Submitted',
  'Archived',
  'Restored',
  'Added',
  'Updated',
  'Uploaded',
  'Opened',
]

function getActionBadge(action) {
  if (!action) return { label: 'System', tone: 'neutral' }
  const lower = action.toLowerCase()
  if (lower.includes('approved')) return { label: 'Approved', tone: 'approved' }
  if (lower.includes('rejected')) return { label: 'Rejected', tone: 'rejected' }
  if (lower.includes('submitted') || lower.includes('added'))
    return { label: 'Created', tone: 'pending' }
  if (lower.includes('archived')) return { label: 'Archived', tone: 'neutral' }
  if (lower.includes('restored')) return { label: 'Restored', tone: 'approved' }
  if (lower.includes('logged in') || lower.includes('login'))
    return { label: 'Login', tone: 'approved' }
  if (lower.includes('logged out') || lower.includes('logout'))
    return { label: 'Logout', tone: 'neutral' }
  if (lower.includes('uploaded')) return { label: 'Upload', tone: 'pending' }
  if (lower.includes('updated')) return { label: 'Updated', tone: 'pending' }
  if (lower.includes('opened')) return { label: 'Navigate', tone: 'neutral' }
  return { label: 'System', tone: 'neutral' }
}

function AuditTrailPage() {
  const { logs, clearLogs, isLoadingLogs } = useAuditLog()
  const [searchQuery, setSearchQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState('All')
  const [actorFilter, setActorFilter] = useState('All')
  const [moduleFilter, setModuleFilter] = useState('All')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  // Unique actors for filter dropdown
  const uniqueActors = useMemo(() => {
    const actors = new Set()
    logs.forEach((log) => {
      if (log.user_name) actors.add(log.user_name)
    })
    return Array.from(actors).sort()
  }, [logs])

  // Unique modules for filter dropdown
  const uniqueModules = useMemo(() => {
    const modules = new Set()
    logs.forEach((log) => {
      if (log.module) modules.add(log.module)
    })
    return Array.from(modules).sort()
  }, [logs])

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      // Text search
      const matchesSearch =
        !searchQuery ||
        (log.action || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (log.user_name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (log.description || '').toLowerCase().includes(searchQuery.toLowerCase())

      // Type filter
      const matchesType =
        typeFilter === 'All' ||
        (log.action || '').toLowerCase().includes(typeFilter.toLowerCase())

      // Actor filter
      const matchesActor =
        actorFilter === 'All' || log.user_name === actorFilter

      // Module filter
      const matchesModule =
        moduleFilter === 'All' || log.module === moduleFilter

      // Date filtering (local)
      let matchesDate = true
      if (dateFrom || dateTo) {
        const logDate = new Date(log.created_at)
        if (dateFrom) {
          const from = new Date(dateFrom)
          from.setHours(0, 0, 0, 0)
          if (logDate < from) matchesDate = false
        }
        if (dateTo && matchesDate) {
          const to = new Date(dateTo)
          to.setHours(23, 59, 59, 999)
          if (logDate > to) matchesDate = false
        }
      }

      return matchesSearch && matchesType && matchesActor && matchesModule && matchesDate
    })
  }, [logs, searchQuery, typeFilter, actorFilter, moduleFilter, dateFrom, dateTo])

  function handleClearLogs() {
    if (window.confirm('Clear all audit trail records? This action cannot be undone.')) {
      clearLogs()
    }
  }

  function handleExportCsv() {
    if (!filteredLogs.length) return

    const headers = ['Date', 'User Name', 'Role', 'Action', 'Module', 'Description']
    const csvContent = [
      headers.join(','),
      ...filteredLogs.map(log => {
        const date = new Date(log.created_at).toISOString()
        const userName = `"${log.user_name || ''}"`
        const role = `"${log.user_role || ''}"`
        const action = `"${(log.action || '').replace(/"/g, '""')}"`
        const module = `"${(log.module || '').replace(/"/g, '""')}"`
        const description = `"${(log.description || '').replace(/"/g, '""')}"`
        return [date, userName, role, action, module, description].join(',')
      })
    ].join('\\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', `audit_trail_${new Date().toISOString().split('T')[0]}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <RoleGate allow={['SK Chairman']}>
      <header className="dashboard-header">
        <div className="header-left">
          <div>
            <p className="eyebrow">Audit Trail</p>
            <h1>System Activity</h1>
            <p>
              Track key actions taken by users across the system.
            </p>
          </div>
        </div>
        <div className="header-actions">
          <span className="items-found-badge">
            {filteredLogs.length} of {logs.length} entries
          </span>
          <button type="button" className="secondary-button" onClick={handleExportCsv} disabled={!filteredLogs.length}>
            <Download size={16} />
            Export CSV
          </button>
        </div>
      </header>

      <section className="dashboard-content">
        {/* Filters */}
        <div className="overview-card">
          <p className="eyebrow">Filters</p>
          <div className="audit-trail-filters">
            <div className="audit-trail-filter-row">
              <label className="search-field audit-search" style={{ flex: 1, minWidth: '200px' }}>
                <Search size={16} />
                <input
                  type="search"
                  placeholder="Search actions, actors or descriptions..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  aria-label="Search audit logs"
                />
              </label>
              <select
                className="panel-select"
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
              >
                {actionTypes.map((type) => (
                  <option key={type} value={type}>
                    {type === 'All' ? 'All Actions' : type}
                  </option>
                ))}
              </select>
              <select
                className="panel-select"
                value={actorFilter}
                onChange={(e) => setActorFilter(e.target.value)}
              >
                <option value="All">All Users</option>
                {uniqueActors.map((actor) => (
                  <option key={actor} value={actor}>
                    {actor}
                  </option>
                ))}
              </select>
              <select
                className="panel-select"
                value={moduleFilter}
                onChange={(e) => setModuleFilter(e.target.value)}
              >
                <option value="All">All Modules</option>
                {uniqueModules.map((mod) => (
                  <option key={mod} value={mod}>
                    {mod}
                  </option>
                ))}
              </select>
            </div>
            <div className="audit-trail-filter-row" style={{ justifyContent: 'space-between', marginTop: '8px' }}>
              <div className="audit-date-range">
                <label className="audit-date-label">
                  From
                  <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
                </label>
                <label className="audit-date-label">
                  To
                  <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
                </label>
              </div>
              <div className="audit-trail-actions">
                {logs.length > 0 ? (
                  <button
                    type="button"
                    className="secondary-button audit-clear-btn"
                    onClick={handleClearLogs}
                  >
                    <Trash2 size={14} />
                    Clear Logs
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        {/* Logs Table */}
        <div className="overview-card">
          <p className="eyebrow">Recent Activity</p>
          <h2>Audit Trail</h2>
          <table className="audit-table">
            <thead>
              <tr>
                <th style={{ width: '150px' }}>Date & Time</th>
                <th style={{ width: '160px' }}>User Name</th>
                <th style={{ width: '140px' }}>Role</th>
                <th>Action</th>
                <th style={{ width: '120px' }}>Module</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              {isLoadingLogs && !logs.length ? (
                <tr>
                  <td colSpan="6" className="empty-state">
                    Loading audit trail...
                  </td>
                </tr>
              ) : filteredLogs.length ? (
                filteredLogs.map((log) => {
                  const badge = getActionBadge(log.action)
                  return (
                    <tr key={log.id}>
                      <td className="audit-timestamp">
                        {new Date(log.created_at).toLocaleString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td className="audit-actor">{log.user_name || '—'}</td>
                      <td className="audit-role">{log.user_role || '—'}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span className={`status-pill status-${badge.tone}`}>
                            {badge.label}
                          </span>
                          <span>{log.action}</span>
                        </div>
                      </td>
                      <td>{log.module || '—'}</td>
                      <td className="audit-description" title={log.description}>{log.description || '—'}</td>
                    </tr>
                  )
                })
              ) : (
                <tr>
                  <td colSpan="6" className="empty-state">
                    {logs.length
                      ? 'No matching logs found. Adjust your filters.'
                      : 'No activity yet. Logs will appear as actions happen.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </RoleGate>
  )
}

export default AuditTrailPage
