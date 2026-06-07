import { useMemo, useState } from 'react'
import { Search, Trash2 } from 'lucide-react'
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

function AuditLogsPage() {
  const { logs, clearLogs } = useAuditLog()
  const [searchQuery, setSearchQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState('All')
  const [actorFilter, setActorFilter] = useState('All')

  // Unique actors for filter dropdown
  const uniqueActors = useMemo(() => {
    const actors = new Set()
    logs.forEach((log) => {
      if (log.actor) actors.add(log.actor)
    })
    return Array.from(actors).sort()
  }, [logs])

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      // Text search
      const matchesSearch =
        !searchQuery ||
        log.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (log.actor || '').toLowerCase().includes(searchQuery.toLowerCase())

      // Type filter
      const matchesType =
        typeFilter === 'All' ||
        log.action.toLowerCase().includes(typeFilter.toLowerCase())

      // Actor filter
      const matchesActor =
        actorFilter === 'All' || log.actor === actorFilter

      return matchesSearch && matchesType && matchesActor
    })
  }, [logs, searchQuery, typeFilter, actorFilter])

  function handleClearLogs() {
    if (window.confirm('Clear all audit logs? This action cannot be undone.')) {
      clearLogs()
    }
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
        </div>
      </header>

      <section className="dashboard-content">
        {/* Filters */}
        <div className="overview-card">
          <p className="eyebrow">Filters</p>
          <div className="audit-filters">
            <label className="search-field audit-search">
              <Search size={16} />
              <input
                type="search"
                placeholder="Search actions or actors..."
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

        {/* Logs Table */}
        <div className="overview-card">
          <p className="eyebrow">Recent Activity</p>
          <h2>Audit Trail</h2>
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: '160px' }}>Timestamp</th>
                <th style={{ width: '100px' }}>Type</th>
                <th>Action</th>
                <th style={{ width: '160px' }}>Actor</th>
                <th style={{ width: '120px' }}>Role</th>
              </tr>
            </thead>
            <tbody>
              {filteredLogs.length ? (
                filteredLogs.map((log) => {
                  const badge = getActionBadge(log.action)
                  return (
                    <tr key={log.id}>
                      <td className="audit-timestamp">
                        {new Date(log.timestamp).toLocaleString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td>
                        <span className={`status-pill status-${badge.tone}`}>
                          {badge.label}
                        </span>
                      </td>
                      <td>{log.action}</td>
                      <td className="audit-actor">{log.actor || '—'}</td>
                      <td className="audit-role">{log.role || '—'}</td>
                    </tr>
                  )
                })
              ) : (
                <tr>
                  <td colSpan="5" className="empty-state">
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

export default AuditLogsPage
