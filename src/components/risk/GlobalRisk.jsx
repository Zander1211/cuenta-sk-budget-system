import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ShieldAlert, ShieldCheck, Sparkles, RefreshCw, X, ChevronRight } from 'lucide-react'
import { useFinancialRisks } from '../../context/FinancialRiskContext'
import { useAuditLog } from '../../context/AuditLogContext'
import { SEVERITY_RANK } from '../../utils/riskWarnings'
import RiskBadge, { SEVERITY_META } from './RiskBadge'
import RiskCard from './RiskCard'

const SEVERITY_ORDER = ['high', 'medium', 'low']
const SEVERITY_HEADINGS = { high: 'High priority', medium: 'Medium priority', low: 'Low priority' }

function formatUpdated(iso) {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

// Global, persistent financial-risk control: a top-bar indicator that opens a
// compact summary dropdown, plus a detailed drawer. Rendered once from the app
// shell so it appears on every authenticated page.
export default function GlobalRisk() {
  const { role, warnings, allRoleWarnings, counts, severity, total, updatedAt, refresh, dismiss, restoreAll, canViewAnalysis } =
    useFinancialRisks()
  const { addLog } = useAuditLog()
  const navigate = useNavigate()

  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const wrapRef = useRef(null)
  const closeBtnRef = useRef(null)

  // Close the dropdown on outside click / Escape.
  useEffect(() => {
    if (!dropdownOpen) return undefined
    const onDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setDropdownOpen(false)
    }
    const onKey = (e) => {
      if (e.key === 'Escape') setDropdownOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [dropdownOpen])

  // Drawer: focus the close button on open, Escape to close, basic focus trap.
  useEffect(() => {
    if (!drawerOpen) return undefined
    closeBtnRef.current?.focus()
    const onKey = (e) => {
      if (e.key === 'Escape') setDrawerOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [drawerOpen])

  const logAction = (action, description) =>
    addLog?.({
      action,
      actionType: action,
      module: 'Financial Warnings',
      recordType: 'Risk',
      description,
      status: 'Success',
    })

  const openDrawer = () => {
    setDropdownOpen(false)
    setDrawerOpen(true)
    logAction('Opened Financial Warnings', `Opened the global financial warnings drawer (${total} active).`)
  }

  const handleRefresh = () => {
    refresh()
    logAction('Refreshed Financial Warnings', 'Manually refreshed the global financial risk analysis.')
  }

  const handleWarningNavigate = (warning, target) => {
    setDrawerOpen(false)
    setDropdownOpen(false)
    logAction('Viewed Financial Warning', `Reviewed "${warning.title}" (${warning.severity.toUpperCase()}) and navigated to ${target}.`)
  }

  const handleDismiss = (warning) => {
    dismiss(warning.id)
    logAction('Acknowledged Financial Warning', `Acknowledged "${warning.title}" (${warning.severity.toUpperCase()}).`)
  }

  const viewAllInsights = () => {
    setDropdownOpen(false)
    setDrawerOpen(false)
    logAction('Opened Analysis From Warnings', 'Navigated to the Analysis page from financial warnings.')
    navigate('/dashboard/analysis')
  }

  // ---- Indicator label ----
  const urgent = counts.high + counts.medium
  const IndicatorIcon = severity && severity !== 'low' ? ShieldAlert : ShieldCheck
  let sevLabel = 'OK'
  let subLabel = 'No active warnings'
  if (total > 0) {
    if (urgent === 0) {
      sevLabel = 'LOW'
      subLabel = 'No urgent risks'
    } else {
      sevLabel = (severity || 'low').toUpperCase()
      subLabel = `${total} alert${total === 1 ? '' : 's'}`
    }
  }
  const indicatorClass = total > 0 ? `risk-${severity}` : 'risk-none'
  const ariaLabel =
    total > 0
      ? `Financial warnings: ${counts.high} high-priority, ${counts.medium} medium, ${counts.low} low`
      : 'Financial warnings: none active'
  const liveMessage =
    counts.high > 0 ? `${counts.high} high-priority financial warning${counts.high === 1 ? '' : 's'} active.` : ''

  const dismissedCount = allRoleWarnings.length - warnings.length
  const topWarnings = warnings.slice().sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]).slice(0, 5)

  return (
    <div className="global-risk-indicator" ref={wrapRef}>
      {/* Screen-reader announcement for new high-priority warnings */}
      <span className="risk-sr-only" role="status" aria-live="polite">{liveMessage}</span>

      <button
        type="button"
        className={`gri-button ${indicatorClass}`}
        aria-haspopup="dialog"
        aria-expanded={dropdownOpen}
        aria-label={ariaLabel}
        onClick={() => setDropdownOpen((o) => !o)}
      >
        <IndicatorIcon size={17} aria-hidden="true" />
        <span className="gri-text">
          <span className="gri-sev">{sevLabel}</span>
          <span className="gri-sub">{subLabel}</span>
        </span>
        {urgent > 0 ? <span className="gri-count" aria-hidden="true">{total}</span> : null}
      </button>

      {dropdownOpen ? (
        <div className="global-risk-dropdown" role="dialog" aria-label="Financial risk status">
          <div className="grd-head">
            <div>
              <h3 className="grd-title">Financial Risk Status</h3>
              <p className="grd-updated">Updated {formatUpdated(updatedAt)}</p>
            </div>
            {canViewAnalysis ? (
              <button type="button" className="grd-icon-btn" onClick={handleRefresh} aria-label="Refresh analysis" title="Refresh">
                <RefreshCw size={15} aria-hidden="true" />
              </button>
            ) : null}
          </div>

          <div className="grd-counts">
            <span className="grd-count-chip risk-high"><b>{counts.high}</b> HIGH</span>
            <span className="grd-count-chip risk-medium"><b>{counts.medium}</b> MEDIUM</span>
            <span className="grd-count-chip risk-low"><b>{counts.low}</b> LOW</span>
          </div>

          {topWarnings.length ? (
            <ul className="grd-list">
              {topWarnings.map((w) => {
                const { Icon } = SEVERITY_META[w.severity] || SEVERITY_META.low
                return (
                  <li key={w.id} className={`grd-item risk-${w.severity}`}>
                    <span className="grd-item-icon"><Icon size={14} aria-hidden="true" /></span>
                    <span className="grd-item-title">{w.title}</span>
                    <RiskBadge severity={w.severity} showIcon={false} />
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="grd-empty">No active financial warnings for this period.</p>
          )}

          <div className="grd-actions">
            {warnings.length ? (
              <button type="button" className="grd-detail-btn" onClick={openDrawer}>
                View details <ChevronRight size={15} aria-hidden="true" />
              </button>
            ) : null}
            {canViewAnalysis ? (
              <button type="button" className="grd-link" onClick={viewAllInsights}>
                <Sparkles size={14} aria-hidden="true" /> View all insights
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {drawerOpen ? (
        <div className="global-risk-drawer-overlay" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setDrawerOpen(false) }}>
          <aside className="global-risk-drawer" role="dialog" aria-modal="true" aria-label="Financial warnings">
            <header className="grdrawer-head">
              <div>
                <h2 className="grdrawer-title">Financial Warnings</h2>
                <p className="grdrawer-sub">Updated {formatUpdated(updatedAt)} · {total} active</p>
              </div>
              <div className="grdrawer-head-actions">
                {canViewAnalysis ? (
                  <button type="button" className="grd-icon-btn" onClick={handleRefresh} aria-label="Refresh analysis" title="Refresh">
                    <RefreshCw size={16} aria-hidden="true" />
                  </button>
                ) : null}
                <button type="button" className="grd-icon-btn" ref={closeBtnRef} onClick={() => setDrawerOpen(false)} aria-label="Close">
                  <X size={18} aria-hidden="true" />
                </button>
              </div>
            </header>

            <div className="grdrawer-body">
              {total === 0 ? (
                <div className="grdrawer-empty">
                  <ShieldCheck size={28} aria-hidden="true" />
                  <p>No active financial warnings for this period.</p>
                </div>
              ) : (
                SEVERITY_ORDER.map((sev) => {
                  const group = warnings.filter((w) => w.severity === sev)
                  if (!group.length) return null
                  return (
                    <section key={sev} className="grdrawer-group">
                      <h3 className={`grdrawer-group-title risk-${sev}`}>{SEVERITY_HEADINGS[sev]} ({group.length})</h3>
                      {group.map((w) => (
                        <RiskCard
                          key={w.id}
                          warning={w}
                          role={role}
                          onNavigate={handleWarningNavigate}
                          onDismiss={handleDismiss}
                        />
                      ))}
                    </section>
                  )
                })
              )}

              {dismissedCount > 0 ? (
                <button type="button" className="grdrawer-restore" onClick={restoreAll}>
                  Show {dismissedCount} dismissed warning{dismissedCount === 1 ? '' : 's'}
                </button>
              ) : null}

              {canViewAnalysis ? (
                <button type="button" className="grdrawer-analysis" onClick={viewAllInsights}>
                  <Sparkles size={15} aria-hidden="true" /> Open full Analysis
                </button>
              ) : null}
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  )
}
