import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Search,
  Shield, Clock, Users, Activity,
  ChevronDown, ChevronUp, Info,
} from 'lucide-react'
import RoleGate from '../components/RoleGate'
import PaginationControls from '../components/PaginationControls'
import { useAuditLog } from '../context/AuditLogContext'
import { ACTION_TYPE_GROUPS, MODULE_OPTIONS, MONTH_NAMES, RECORD_TYPE_OPTIONS, ROLE_OPTIONS } from '../utils/auditFilters'

// ── Constants ────────────────────────────────────────────────────

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
  if (text.includes('verified'))      return { label: 'Verified', tone: 'approved' }
  if (text.includes('updated') || text.includes('changed') || text.includes('uploaded') || text.includes('replaced'))
    return { label: 'Updated', tone: 'pending' }
  if (text.includes('deleted'))       return { label: 'Deleted',  tone: 'rejected' }
  if (text.includes('backup') || text.includes('restore'))
    return { label: 'Backup',  tone: 'neutral' }
  if (text.includes('generated'))     return { label: 'Generated', tone: 'pending' }
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
  year:       'All',
  month:      'All',
  dateFrom:   '',
  dateTo:     '',
}

// The current year and the four before it — the trail cannot reach further
// back than the system itself.
const YEAR_OPTIONS = Array.from({ length: 5 }, (_, i) => String(new Date().getFullYear() - i))

function AuditTrailPage() {
  const {
    logs,
    actorOptions,
    fetchActorOptions,
    isLoadingLogs,
    totalCount,
    totalPages,
    currentPage,
    goToPage,
    setActiveFilters,
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

  // Active accounts only, alphabetical — the context keeps this in sync with
  // the account directory. Names on loaded log rows are deliberately NOT
  // merged in: that would put a disabled account's name straight back.
  const uniqueActors = actorOptions

  // Filters apply live — no "Apply" click needed. Dropdowns and dates are
  // discrete choices, so they fetch immediately; free-text search is
  // debounced so it doesn't fire a server request per keystroke.
  const searchDebounceRef = useRef(null)

  useEffect(() => () => clearTimeout(searchDebounceRef.current), [])

  // Pick up any account change made while this page was closed or hidden.
  useEffect(() => { fetchActorOptions() }, [fetchActorOptions])

  // If the account being filtered on is disabled while selected, it drops out
  // of the list — go back to All Users rather than keep filtering by a name
  // the dropdown no longer shows.
  const selectedUser = localFilters.userName
  useEffect(() => {
    if (selectedUser !== 'All' && actorOptions.length && !actorOptions.includes(selectedUser)) {
      handleFilterChange('userName', 'All')
    }
    // handleFilterChange closes over the current filters; the trigger is the
    // selection or the list changing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedUser, actorOptions])

  function handleFilterChange(key, value) {
    const next = { ...localFilters, [key]: value }
    // A month only means something within a year: picking one with no year
    // chosen selects the current year, and clearing the year clears the month.
    if (key === 'month' && value !== 'All' && next.year === 'All') {
      next.year = String(new Date().getFullYear())
    }
    if (key === 'year' && value === 'All') next.month = 'All'
    setLocalFilters(next)
    setExpandedRows({})

    clearTimeout(searchDebounceRef.current)
    if (key === 'search') {
      searchDebounceRef.current = setTimeout(() => setActiveFilters(next), 400)
    } else {
      setActiveFilters(next)
    }
  }

  // Pressing Enter in the search field flushes immediately instead of
  // waiting out the debounce.
  function handleApplyFilters(e) {
    e?.preventDefault()
    clearTimeout(searchDebounceRef.current)
    setActiveFilters(localFilters)
    setExpandedRows({})
  }

  function handleClearFilters() {
    clearTimeout(searchDebounceRef.current)
    setLocalFilters(DEFAULT_FILTERS)
    setActiveFilters(DEFAULT_FILTERS)
    setExpandedRows({})
  }

  function toggleRow(id) {
    setExpandedRows(prev => ({ ...prev, [id]: !prev[id] }))
  }

  // Split into date + time so the "Date & Time" column can stack them on two
  // short lines instead of one long nowrap string — the single-line version
  // ("Sep 26, 2026, 03:42:15 PM") was wide enough on its own to force the
  // table to outgrow its column and need horizontal scrolling.
  function formatLogDate(iso) {
    if (!iso) return '—'
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    })
  }

  function formatLogTime(iso) {
    if (!iso) return ''
    return new Date(iso).toLocaleTimeString('en-US', {
      hour: '2-digit', minute: '2-digit',
    })
  }

  const hasActiveFilters = Object.values(localFilters).some((value) => value && value !== 'All')

  return (
    <RoleGate allow={['SK Chairman', 'SK Treasurer', 'SK Kagawad', 'Barangay Treasurer']}>
      {/* ── Header ──────────────────────────────────────────── */}
      <header className="dashboard-header">
        <div className="header-left">
          <div>
            <p className="eyebrow">Activity Logs</p>
            <h1>Tamper-Evident Activity Log</h1>
            <p>Complete chronological record of all system actions, including those of the SK Chairman and SK Treasurer. View-only for every role — records cannot be modified or deleted.</p>
          </div>
        </div>
        <div className="header-actions">
          <span className="items-found-badge">
            {totalCount.toLocaleString()} total records
          </span>
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
                  placeholder="Search by user, activity, module, date (e.g. Sept. 21, 2026), or record ID…"
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
                id="audit-year-filter"
                value={localFilters.year}
                onChange={e => handleFilterChange('year', e.target.value)}
                aria-label="Filter by year"
              >
                <option value="All">All Years</option>
                {YEAR_OPTIONS.map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>

              <select
                className="panel-select"
                id="audit-month-filter"
                value={localFilters.month}
                onChange={e => handleFilterChange('month', e.target.value)}
                aria-label="Filter by month"
              >
                <option value="All">All Months</option>
                {MONTH_NAMES.map((name, i) => (
                  <option key={name} value={String(i + 1)}>{name}</option>
                ))}
              </select>

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
                <option value="All">All Roles</option>
                {ROLE_OPTIONS.map(r => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>

              <select
                className="panel-select"
                id="audit-action-type-filter"
                value={localFilters.actionType}
                onChange={e => handleFilterChange('actionType', e.target.value)}
              >
                <option value="All">All Action Types</option>
                {ACTION_TYPE_GROUPS.map(section => (
                  <optgroup key={section.group} label={section.group}>
                    {section.options.map(option => (
                      <option key={option.label} value={option.label}>{option.label}</option>
                    ))}
                  </optgroup>
                ))}
              </select>

              <select
                className="panel-select"
                id="audit-module-filter"
                value={localFilters.module}
                onChange={e => handleFilterChange('module', e.target.value)}
              >
                <option value="All">All Modules</option>
                {MODULE_OPTIONS.map(m => (
                  <option key={m.label} value={m.label}>{m.label}</option>
                ))}
              </select>

              <select
                className="panel-select"
                id="audit-record-type-filter"
                value={localFilters.recordType}
                onChange={e => handleFilterChange('recordType', e.target.value)}
              >
                <option value="All">All Record Types</option>
                {RECORD_TYPE_OPTIONS.map(rt => (
                  <option key={rt.label} value={rt.label}>{rt.label}</option>
                ))}
              </select>
            </div>

            {/* Row 3: Actions — filters apply live as you change them (see
                handleFilterChange), so there is no "Apply" button anymore;
                only Clear is left, for a one-click reset. */}
            <div className="audit-filter-actions">
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
              <h2>Activity Logs</h2>
            </div>
            <span className="items-found-badge">
              Page {currentPage} of {totalPages} &nbsp;·&nbsp; {logs.length} entries shown
            </span>
          </div>

          <div className="audit-table-wrapper">
            <table className="audit-table audit-table-v2">
              <thead>
                <tr>
                  {/* Percentage widths + `table-layout: fixed` (see .audit-table-v2)
                      keep every column's share of the table predictable, so the
                      table never has to grow wider than its card and force
                      horizontal scrolling — Description gets by far the most
                      room since it carries the most important information. */}
                  <th style={{ width: '11%' }}>Date &amp; Time</th>
                  <th style={{ width: '11%' }}>User / Role</th>
                  <th style={{ width: '11%' }}>Action Type</th>
                  {/* "Authentication" (Module's longest single unbroken word — no
                      space to wrap at) needs ~13% to stay on one line instead of
                      fracturing mid-word; the date/time split freed up room here
                      since it no longer needs one long nowrap line. */}
                  <th style={{ width: '13%' }}>Module</th>
                  <th style={{ width: '10%' }}>Record Type</th>
                  <th style={{ width: '32%' }}>Description</th>
                  <th style={{ width: '7%' }}>Status</th>
                  <th style={{ width: '5%' }} aria-label="Expand row"></th>
                </tr>
              </thead>
              <tbody>
                {isLoadingLogs ? (
                  <tr>
                    <td colSpan="8" className="empty-state">
                      <div className="audit-loading">
                        <div className="audit-spinner" />
                        Loading activity logs…
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
                        <td className="audit-timestamp" data-label="Date & Time">
                          <span className="audit-date">{formatLogDate(log.created_at)}</span>
                          <span className="audit-time">{formatLogTime(log.created_at)}</span>
                        </td>
                        <td data-label="User / Role">
                          <div className="audit-user-cell">
                            <span className="audit-user-name">{log.user_name || '—'}</span>
                            {log.user_role && (
                              <span className="audit-user-role">{log.user_role}</span>
                            )}
                          </div>
                        </td>
                        <td data-label="Action Type">
                          <div className="audit-action-cell">
                            <span className={`status-pill status-${badge.tone}`}>
                              {badge.label}
                            </span>
                            <span className="audit-action-text">
                              {(log.action_type || log.action || '').replace(/—.+$/, '').trim()}
                            </span>
                          </div>
                        </td>
                        <td className="audit-module" data-label="Module">{log.module || '—'}</td>
                        <td data-label="Record Type">
                          {log.record_type ? (
                            <span className="audit-record-type-badge">{log.record_type}</span>
                          ) : '—'}
                        </td>
                        {/* Full text, always — no truncation, no title tooltip. Long
                            descriptions wrap onto extra lines and the row grows to fit. */}
                        <td className="audit-description" data-label="Description">
                          {log.description || log.action || '—'}
                        </td>
                        <td data-label="Status">
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
          <PaginationControls
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={totalCount}
            pageSize={PAGE_SIZE}
            onPageChange={goToPage}
            isLoading={isLoadingLogs}
            isFiltered={hasActiveFilters}
            idPrefix="audit"
          />

        </div>

      </section>
    </RoleGate>
  )
}

export default AuditTrailPage
