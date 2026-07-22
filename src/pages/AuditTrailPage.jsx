import { useMemo, useState, useCallback } from 'react'
import {
  Search, Download, ChevronLeft, ChevronRight,
  Shield, Clock, Users, Activity,
  ChevronDown, ChevronUp, Info,
} from 'lucide-react'
import RoleGate from '../components/RoleGate'
import { useAuditLog } from '../context/AuditLogContext'

// ── Constants ────────────────────────────────────────────────────

const ACTION_TYPES = [
  'All',
  // Authentication
  'User Login', 'User Logout', 'Password Changed', 'Password Updated via OTP',
  'Email Address Updated', 'Profile Updated',
  // Budget
  'Budget Created', 'Budget Updated', 'Budget Deleted',
  // Requests
  'Request Created', 'Request Updated', 'Request Submitted',
  'Request Approved', 'Request Rejected', 'Request Cancelled',
  'Request Archived', 'Request Restored',
  // Projects / Events / Payroll
  'Project Created', 'Project Updated', 'Project Archived', 'Project Restored',
  'Event Created', 'Event Updated', 'Event Archived', 'Event Restored',
  'Payroll Created', 'Payroll Updated', 'Payroll Archived', 'Payroll Restored',
  'Status Changed',
  // Expenses
  'Expense Added', 'Expense Updated', 'Expense Deleted',
  // Documents / Receipts
  'Document Generated', 'Document Updated', 'Document Archived', 'Document Restored',
  'Receipt Uploaded', 'Receipt Updated', 'Receipt Deleted',
  // Backup
  'Backup Generated', 'Restore Started', 'Restore Completed', 'Restore Failed',
  // Users
  'User Created', 'User Updated', 'User Activated', 'User Deactivated', 'User Deleted',
]

const MODULES = [
  'All',
  'Authentication', 'Monthly Budget', 'Budget Requests',
  'Projects', 'Events', 'Payroll', 'Expenses',
  'Documents', 'Receipts', 'Backup & Restore', 'User Management',
]

const RECORD_TYPES = [
  'All',
  'User', 'Budget', 'Budget Request', 'Project', 'Event', 'Payroll',
  'Expense', 'Document', 'Receipt', 'Backup',
]

const ROLES = ['All', 'SK Chairman', 'SK Treasurer', 'SK Kagawad', 'Barangay Treasurer']
const STATUSES = ['All', 'Success', 'Failed']

// ── Badge helper ─────────────────────────────────────────────────

function getActionBadge(actionType, action) {
  const text = (actionType || action || '').toLowerCase()
  if (text.includes('login'))         return { label: 'Login',    tone: 'approved' }
  if (text.includes('logout'))        return { label: 'Logout',   tone: 'neutral'  }
  if (text.includes('approved'))      return { label: 'Approved', tone: 'approved' }
  if (text.includes('rejected'))      return { label: 'Rejected', tone: 'rejected' }
  if (text.includes('cancelled'))     return { label: 'Cancelled',tone: 'rejected' }
  if (text.includes('restored'))      return { label: 'Restored', tone: 'approved' }
  if (text.includes('archived'))      return { label: 'Archived', tone: 'neutral'  }
  if (text.includes('created') || text.includes('submitted') || text.includes('added'))
    return { label: 'Created', tone: 'pending' }
  if (text.includes('updated') || text.includes('changed') || text.includes('uploaded'))
    return { label: 'Updated', tone: 'pending' }
  if (text.includes('deleted'))       return { label: 'Deleted',  tone: 'rejected' }
  if (text.includes('backup') || text.includes('restore'))
    return { label: 'Backup',  tone: 'neutral' }
  if (text.includes('password'))      return { label: 'Auth',     tone: 'neutral'  }
  return { label: 'System', tone: 'neutral' }
}

function getStatusBadgeTone(status) {
  if (!status || status === 'Success') return 'approved'
  return 'rejected'
}

// ── Before/After diff renderer ───────────────────────────────────

function renderDiff(label, value) {
  if (!value || typeof value !== 'object' || !Object.keys(value).length) return null
  return (
    <div className="audit-diff-block">
      <span className="audit-diff-label">{label}</span>
      <div className="audit-diff-values">
        {Object.entries(value).map(([k, v]) => (
          <div key={k} className="audit-diff-row">
            <span className="audit-diff-key">{k.replace(/_/g, ' ')}</span>
            <span className="audit-diff-value">
              {v === null || v === undefined ? '—'
                : typeof v === 'object' ? JSON.stringify(v)
                : String(v)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Expandable row detail ─────────────────────────────────────────

function AuditRowDetail({ log }) {
  const hasDiff = log.previous_value || log.new_value
  const hasMeta = log.ip_address || log.device_info || log.record_id || log.remarks

  if (!hasDiff && !hasMeta) return (
    <div className="audit-row-detail empty">
      <Info size={14} />
      <span>No additional detail recorded for this entry.</span>
    </div>
  )

  return (
    <div className="audit-row-detail">
      {/* Before / After diff */}
      {hasDiff && (
        <div className="audit-diff-section">
          {renderDiff('Before', log.previous_value)}
          {log.previous_value && log.new_value && (
            <div className="audit-diff-arrow">→</div>
          )}
          {renderDiff('After', log.new_value)}
        </div>
      )}

      {/* Meta info */}
      {hasMeta && (
        <div className="audit-meta-grid">
          {log.record_id && (
            <div className="audit-meta-item">
              <span className="audit-meta-key">Record ID</span>
              <span className="audit-meta-val">{log.record_id}</span>
            </div>
          )}
          {log.ip_address && (
            <div className="audit-meta-item">
              <span className="audit-meta-key">IP Address</span>
              <span className="audit-meta-val">{log.ip_address}</span>
            </div>
          )}
          {log.device_info && (
            <div className="audit-meta-item">
              <span className="audit-meta-key">Device / Browser</span>
              <span className="audit-meta-val">{log.device_info}</span>
            </div>
          )}
          {log.remarks && (
            <div className="audit-meta-item" style={{ gridColumn: '1 / -1' }}>
              <span className="audit-meta-key">Remarks / Reason</span>
              <span className="audit-meta-val">{log.remarks}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main Component ───────────────────────────────────────────────

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

function AuditTrailPage() {
  const {
    logs,
    isLoadingLogs,
    totalCount,
    totalPages,
    currentPage,
    goToPage,
    activeFilters,
    setActiveFilters,
    fetchLogs,
    PAGE_SIZE,
  } = useAuditLog()

  const [localFilters, setLocalFilters] = useState(DEFAULT_FILTERS)
  const [expandedRows, setExpandedRows] = useState({})

  // Stats derived from the currently loaded page
  const today = new Date().toDateString()
  const actionsToday = useMemo(() =>
    logs.filter(l => new Date(l.created_at).toDateString() === today).length,
    [logs, today]
  )
  const uniqueUsers = useMemo(() => new Set(logs.map(l => l.user_name).filter(Boolean)).size, [logs])
  const lastActivity = logs[0]?.created_at
    ? new Date(logs[0].created_at).toLocaleString('en-US', {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
      })
    : '—'

  // Unique user names for filter dropdown (from loaded page)
  const uniqueActors = useMemo(() => {
    const s = new Set()
    logs.forEach(l => { if (l.user_name) s.add(l.user_name) })
    return Array.from(s).sort()
  }, [logs])

  function handleFilterChange(key, value) {
    setLocalFilters(prev => ({ ...prev, [key]: value }))
  }

  function handleApplyFilters(e) {
    e?.preventDefault()
    setActiveFilters(localFilters)
    setExpandedRows({})
  }

  function handleClearFilters() {
    setLocalFilters(DEFAULT_FILTERS)
    setActiveFilters(DEFAULT_FILTERS)
    setExpandedRows({})
  }

  function toggleRow(id) {
    setExpandedRows(prev => ({ ...prev, [id]: !prev[id] }))
  }

  const handleExportCsv = useCallback(() => {
    if (!logs.length) return

    const headers = [
      'Date & Time', 'User Name', 'Role', 'Action', 'Action Type',
      'Module', 'Record Type', 'Record ID', 'Description',
      'Previous Value', 'New Value', 'IP Address', 'Device Info',
      'Status', 'Remarks',
    ]

    function csvField(v) {
      if (v === null || v === undefined) return '""'
      if (typeof v === 'object') return `"${JSON.stringify(v).replace(/"/g, '""')}"`
      return `"${String(v).replace(/"/g, '""')}"`
    }

    const rows = logs.map(log => [
      csvField(new Date(log.created_at).toLocaleString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
      })),
      csvField(log.user_name),
      csvField(log.user_role),
      csvField(log.action),
      csvField(log.action_type),
      csvField(log.module),
      csvField(log.record_type),
      csvField(log.record_id),
      csvField(log.description),
      csvField(log.previous_value),
      csvField(log.new_value),
      csvField(log.ip_address),
      csvField(log.device_info),
      csvField(log.status),
      csvField(log.remarks),
    ].join(','))

    const csvContent = [headers.map(h => `"${h}"`).join(','), ...rows].join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url  = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href  = url
    link.setAttribute('download', `audit_trail_${new Date().toISOString().split('T')[0]}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }, [logs])

  function formatDateTime(iso) {
    if (!iso) return '—'
    return new Date(iso).toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    })
  }

  const hasActiveFilters = Object.entries(localFilters).some(([k, v]) => v && v !== 'All' && v !== '')

  return (
    <RoleGate allow={['SK Chairman']}>
      {/* ── Header ──────────────────────────────────────────── */}
      <header className="dashboard-header">
        <div className="header-left">
          <div>
            <p className="eyebrow">Audit Trail</p>
            <h1>Tamper-Evident Activity Log</h1>
            <p>Complete chronological record of all system actions. Append-only — records cannot be modified or deleted.</p>
          </div>
        </div>
        <div className="header-actions">
          <span className="items-found-badge">
            {totalCount.toLocaleString()} total records
          </span>
          <button
            type="button"
            className="secondary-button"
            onClick={handleExportCsv}
            disabled={!logs.length}
          >
            <Download size={16} />
            Export CSV
          </button>
        </div>
      </header>

      <section className="dashboard-content">

        {/* ── Stats Bar ───────────────────────────────────────── */}
        <div className="audit-stats-bar">
          <div className="audit-stat-card">
            <div className="audit-stat-icon">
              <Shield size={20} />
            </div>
            <div>
              <p className="audit-stat-value">{totalCount.toLocaleString()}</p>
              <p className="audit-stat-label">Total Records</p>
            </div>
          </div>
          <div className="audit-stat-card">
            <div className="audit-stat-icon accent-blue">
              <Activity size={20} />
            </div>
            <div>
              <p className="audit-stat-value">{actionsToday}</p>
              <p className="audit-stat-label">Actions Today</p>
            </div>
          </div>
          <div className="audit-stat-card">
            <div className="audit-stat-icon accent-green">
              <Users size={20} />
            </div>
            <div>
              <p className="audit-stat-value">{uniqueUsers}</p>
              <p className="audit-stat-label">Unique Users</p>
            </div>
          </div>
          <div className="audit-stat-card">
            <div className="audit-stat-icon accent-amber">
              <Clock size={20} />
            </div>
            <div>
              <p className="audit-stat-value audit-stat-value--sm">{lastActivity}</p>
              <p className="audit-stat-label">Last Activity</p>
            </div>
          </div>
        </div>

        {/* ── Filters Panel ────────────────────────────────────── */}
        <div className="overview-card">
          <p className="eyebrow">Search & Filter</p>
          <form className="audit-filters-form" onSubmit={handleApplyFilters}>
            {/* Row 1: Search + Date Range */}
            <div className="audit-filter-row">
              <label className="search-field audit-search" style={{ flex: '2', minWidth: '240px' }}>
                <Search size={16} />
                <input
                  type="search"
                  id="audit-search"
                  placeholder="Search by user, description, action, or record ID…"
                  value={localFilters.search}
                  onChange={e => handleFilterChange('search', e.target.value)}
                  aria-label="Search audit logs"
                />
              </label>
              <div className="audit-date-range">
                <label className="audit-date-label">
                  From
                  <input
                    type="date"
                    id="audit-date-from"
                    value={localFilters.dateFrom}
                    onChange={e => handleFilterChange('dateFrom', e.target.value)}
                  />
                </label>
                <label className="audit-date-label">
                  To
                  <input
                    type="date"
                    id="audit-date-to"
                    value={localFilters.dateTo}
                    onChange={e => handleFilterChange('dateTo', e.target.value)}
                  />
                </label>
              </div>
            </div>

            {/* Row 2: Dropdowns */}
            <div className="audit-filter-row audit-filter-row--dropdowns">
              <select
                className="panel-select"
                id="audit-user-filter"
                value={localFilters.userName}
                onChange={e => handleFilterChange('userName', e.target.value)}
              >
                <option value="All">All Users</option>
                {uniqueActors.map(a => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>

              <select
                className="panel-select"
                id="audit-role-filter"
                value={localFilters.userRole}
                onChange={e => handleFilterChange('userRole', e.target.value)}
              >
                {ROLES.map(r => (
                  <option key={r} value={r}>{r === 'All' ? 'All Roles' : r}</option>
                ))}
              </select>

              <select
                className="panel-select"
                id="audit-action-type-filter"
                value={localFilters.actionType}
                onChange={e => handleFilterChange('actionType', e.target.value)}
              >
                {ACTION_TYPES.map(t => (
                  <option key={t} value={t}>{t === 'All' ? 'All Action Types' : t}</option>
                ))}
              </select>

              <select
                className="panel-select"
                id="audit-module-filter"
                value={localFilters.module}
                onChange={e => handleFilterChange('module', e.target.value)}
              >
                {MODULES.map(m => (
                  <option key={m} value={m}>{m === 'All' ? 'All Modules' : m}</option>
                ))}
              </select>

              <select
                className="panel-select"
                id="audit-record-type-filter"
                value={localFilters.recordType}
                onChange={e => handleFilterChange('recordType', e.target.value)}
              >
                {RECORD_TYPES.map(rt => (
                  <option key={rt} value={rt}>{rt === 'All' ? 'All Record Types' : rt}</option>
                ))}
              </select>

              <select
                className="panel-select"
                id="audit-status-filter"
                value={localFilters.status}
                onChange={e => handleFilterChange('status', e.target.value)}
              >
                {STATUSES.map(s => (
                  <option key={s} value={s}>{s === 'All' ? 'All Statuses' : s}</option>
                ))}
              </select>
            </div>

            {/* Row 3: Actions */}
            <div className="audit-filter-actions">
              <button type="submit" className="primary-button" id="audit-apply-filters">
                Apply Filters
              </button>
              {hasActiveFilters && (
                <button
                  type="button"
                  className="secondary-button"
                  id="audit-clear-filters"
                  onClick={handleClearFilters}
                >
                  Clear Filters
                </button>
              )}
            </div>
          </form>
        </div>

        {/* ── Table ───────────────────────────────────────────── */}
        <div className="overview-card">
          <div className="audit-table-header">
            <div>
              <p className="eyebrow">Chronological Record</p>
              <h2>Audit Trail</h2>
            </div>
            <span className="items-found-badge">
              Page {currentPage} of {totalPages} &nbsp;·&nbsp; {logs.length} entries shown
            </span>
          </div>

          <div className="audit-table-wrapper">
            <table className="audit-table audit-table-v2">
              <thead>
                <tr>
                  <th style={{ width: '160px' }}>Date &amp; Time</th>
                  <th style={{ width: '155px' }}>User / Role</th>
                  <th style={{ width: '140px' }}>Action Type</th>
                  <th style={{ width: '120px' }}>Module</th>
                  <th style={{ width: '110px' }}>Record Type</th>
                  <th>Description</th>
                  <th style={{ width: '80px' }}>Status</th>
                  <th style={{ width: '48px' }} aria-label="Expand row"></th>
                </tr>
              </thead>
              <tbody>
                {isLoadingLogs ? (
                  <tr>
                    <td colSpan="8" className="empty-state">
                      <div className="audit-loading">
                        <div className="audit-spinner" />
                        Loading audit trail…
                      </div>
                    </td>
                  </tr>
                ) : logs.length ? (
                  logs.map(log => {
                    const badge      = getActionBadge(log.action_type, log.action)
                    const statusTone = getStatusBadgeTone(log.status)
                    const isExpanded = !!expandedRows[log.id]
                    const hasDetail  = log.previous_value || log.new_value ||
                                      log.ip_address     || log.device_info ||
                                      log.record_id      || log.remarks

                    return [
                      <tr
                        key={log.id}
                        className={`audit-row${isExpanded ? ' is-expanded' : ''}${hasDetail ? ' is-expandable' : ''}`}
                        onClick={() => hasDetail && toggleRow(log.id)}
                        tabIndex={hasDetail ? 0 : undefined}
                        onKeyDown={e => { if (hasDetail && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); toggleRow(log.id) } }}
                        aria-expanded={hasDetail ? isExpanded : undefined}
                      >
                        <td className="audit-timestamp">
                          {formatDateTime(log.created_at)}
                        </td>
                        <td>
                          <div className="audit-user-cell">
                            <span className="audit-user-name">{log.user_name || '—'}</span>
                            {log.user_role && (
                              <span className="audit-user-role">{log.user_role}</span>
                            )}
                          </div>
                        </td>
                        <td>
                          <span className={`status-pill status-${badge.tone}`}>
                            {badge.label}
                          </span>
                          <span className="audit-action-text">
                            {(log.action_type || log.action || '').replace(/—.+$/, '').trim()}
                          </span>
                        </td>
                        <td className="audit-module">{log.module || '—'}</td>
                        <td>
                          {log.record_type ? (
                            <span className="audit-record-type-badge">{log.record_type}</span>
                          ) : '—'}
                        </td>
                        <td className="audit-description" title={log.description || log.action}>
                          {log.description || log.action || '—'}
                        </td>
                        <td>
                          <span className={`status-pill status-${statusTone}`} style={{ fontSize: '0.7rem' }}>
                            {log.status || 'Success'}
                          </span>
                        </td>
                        <td className="audit-expand-cell">
                          {hasDetail && (
                            <button
                              type="button"
                              className="audit-expand-btn"
                              aria-label={isExpanded ? 'Collapse details' : 'Expand details'}
                              onClick={e => { e.stopPropagation(); toggleRow(log.id) }}
                            >
                              {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                            </button>
                          )}
                        </td>
                      </tr>,
                      isExpanded && hasDetail ? (
                        <tr key={`${log.id}-detail`} className="audit-detail-row">
                          <td colSpan="8">
                            <AuditRowDetail log={log} />
                          </td>
                        </tr>
                      ) : null,
                    ]
                  })
                ) : (
                  <tr>
                    <td colSpan="8" className="empty-state">
                      {hasActiveFilters
                        ? 'No records match the current filters. Try adjusting your search.'
                        : 'No audit records yet. Events will appear here as actions are performed.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* ── Pagination ──────────────────────────────────────── */}
          {totalPages > 1 && (
            <div className="audit-pagination">
              <button
                type="button"
                className="secondary-button audit-page-btn"
                id="audit-prev-page"
                onClick={() => goToPage(currentPage - 1)}
                disabled={currentPage <= 1 || isLoadingLogs}
                aria-label="Previous page"
              >
                <ChevronLeft size={16} />
                Previous
              </button>

              <div className="audit-page-numbers">
                {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                  let page = i + 1
                  if (totalPages > 7) {
                    if (currentPage <= 4) {
                      page = i + 1
                    } else if (currentPage >= totalPages - 3) {
                      page = totalPages - 6 + i
                    } else {
                      page = currentPage - 3 + i
                    }
                  }
                  return (
                    <button
                      key={page}
                      type="button"
                      className={`audit-page-number${page === currentPage ? ' is-active' : ''}`}
                      onClick={() => goToPage(page)}
                      disabled={isLoadingLogs}
                      aria-current={page === currentPage ? 'page' : undefined}
                    >
                      {page}
                    </button>
                  )
                })}
              </div>

              <button
                type="button"
                className="secondary-button audit-page-btn"
                id="audit-next-page"
                onClick={() => goToPage(currentPage + 1)}
                disabled={currentPage >= totalPages || isLoadingLogs}
                aria-label="Next page"
              >
                Next
                <ChevronRight size={16} />
              </button>
            </div>
          )}

          {/* Showing X-Y of N */}
          <p className="audit-pagination-info">
            Showing {Math.min((currentPage - 1) * PAGE_SIZE + 1, totalCount)}–{Math.min(currentPage * PAGE_SIZE, totalCount)} of {totalCount.toLocaleString()} records
            {hasActiveFilters ? ' (filtered)' : ''}
          </p>
        </div>

      </section>
    </RoleGate>
  )
}

export default AuditTrailPage
