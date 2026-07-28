import { AlertTriangle, ArrowDownRight, ArrowRight, ArrowUpRight, Download, Minus, RefreshCw } from 'lucide-react'
import { formatCurrency, formatPercentage, statusTone, getUtilizationColor } from '../../utils/analytics'

// ---------- MetricCard ----------
export function MetricCard({ icon: Icon, label, value, meta, chip, tone = 'neutral' }) {
  return (
    <div className="an-metric-card">
      <div className="an-metric-top">
        {Icon ? <span className={`an-metric-icon ${tone}`}><Icon size={18} /></span> : <span />}
        {chip ? <span className={`an-chip ${tone}`}>{chip}</span> : null}
      </div>
      <div className="an-metric-body">
        <span className="an-metric-label">{label}</span>
        <span className="an-metric-value">{value}</span>
      </div>
      {meta ? <span className="an-metric-meta">{meta}</span> : null}
    </div>
  )
}

// ---------- StatusBadge ----------
export function StatusBadge({ status }) {
  return <span className={`an-status-badge ${statusTone(status)}`}>{status}</span>
}

// ---------- CurrencyValue ----------
export function CurrencyValue({ amount, detailed = false }) {
  return <>{formatCurrency(amount, { detailed })}</>
}

// ---------- PercentageChange ----------
export function PercentageChange({ value, invertColor = false }) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return <span className="an-change muted">No previous-period data</span>
  }
  const rounded = Math.round(value * 10) / 10
  const up = rounded > 0
  const flat = rounded === 0
  const Icon = flat ? Minus : up ? ArrowUpRight : ArrowDownRight
  // For spending, "up" is usually a warning; caller can invert.
  const positive = invertColor ? !up : up
  const tone = flat ? 'muted' : positive ? 'danger' : 'positive'
  return (
    <span className={`an-change ${tone}`}>
      <Icon size={13} />
      {flat ? '0%' : `${up ? '+' : ''}${formatPercentage(rounded, 1)}`}
    </span>
  )
}

// ---------- TrendIndicator ----------
export function TrendIndicator({ direction }) {
  const map = {
    Increasing: { Icon: ArrowUpRight, tone: 'danger' },
    Decreasing: { Icon: ArrowDownRight, tone: 'positive' },
    Stable: { Icon: ArrowRight, tone: 'muted' },
  }
  const { Icon, tone } = map[direction] || map.Stable
  return (
    <span className={`an-trend ${tone}`}>
      <Icon size={15} />
      {direction}
    </span>
  )
}

// ---------- ChartCard ----------
export function ChartCard({ title, eyebrow, description, action, children, className = '' }) {
  return (
    <section className={`an-card ${className}`}>
      <div className="an-card-head">
        <div>
          {eyebrow ? <p className="an-eyebrow">{eyebrow}</p> : null}
          {title ? <h2 className="an-card-title">{title}</h2> : null}
          {description ? <p className="an-card-desc">{description}</p> : null}
        </div>
        {action ? <div className="an-card-action">{action}</div> : null}
      </div>
      {children}
    </section>
  )
}

// ---------- EmptyState ----------
export function EmptyState({ title = 'No data available', message, action }) {
  return (
    <div className="an-empty" role="status">
      <div className="an-empty-icon"><AlertTriangle size={22} /></div>
      <h3>{title}</h3>
      {message ? <p>{message}</p> : null}
      {action}
    </div>
  )
}

// ---------- ErrorState ----------
export function ErrorState({ message = 'Something went wrong while loading this analysis.', onRetry }) {
  return (
    <div className="an-error" role="alert">
      <div className="an-error-icon"><AlertTriangle size={22} /></div>
      <p>{message}</p>
      {onRetry ? (
        <button type="button" className="an-btn an-btn-ghost" onClick={onRetry}>
          <RefreshCw size={15} /> Retry
        </button>
      ) : null}
    </div>
  )
}

// ---------- LoadingSkeleton ----------
export function LoadingSkeleton({ variant = 'card', count = 1 }) {
  if (variant === 'cards') {
    return (
      <div className="an-metric-grid">
        {Array.from({ length: count || 4 }).map((_, i) => (
          <div key={i} className="an-metric-card an-skeleton-card">
            <div className="an-skel an-skel-line short" />
            <div className="an-skel an-skel-line big" />
            <div className="an-skel an-skel-line" />
          </div>
        ))}
      </div>
    )
  }
  if (variant === 'chart') {
    return <div className="an-skel an-skel-chart" aria-hidden="true" />
  }
  if (variant === 'table') {
    return (
      <div className="an-skel-table" aria-hidden="true">
        {Array.from({ length: count || 5 }).map((_, i) => (
          <div key={i} className="an-skel an-skel-row" />
        ))}
      </div>
    )
  }
  return <div className="an-skel an-skel-block" aria-hidden="true" />
}

// ---------- UtilizationProgress ----------
export function UtilizationProgress({ label, utilized, allocation, rate, status, showAmounts = true }) {
  const pct = Math.max(0, Math.min(100, Number(rate) || 0))
  const tone = statusTone(status)
  const fillColor = getUtilizationColor(rate)
  return (
    <div className="an-util-row">
      <div className="an-util-head">
        <span className="an-util-label" title={label}>{label}</span>
        <span className={`an-util-rate ${tone}`}>{formatPercentage(rate, 0)}</span>
      </div>
      <div
        className="an-util-track"
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${label} utilization ${formatPercentage(rate, 0)}`}
      >
        <div className="an-util-fill" style={{ width: `${pct}%`, background: fillColor }} />
      </div>
      {showAmounts ? (
        <div className="an-util-meta">
          <span>{formatCurrency(utilized)}{allocation != null ? ` of ${formatCurrency(allocation)}` : ''}</span>
          {status ? <StatusBadge status={status} /> : null}
        </div>
      ) : null}
    </div>
  )
}

// ---------- ExportButton ----------
export function ExportButton({ onExport, disabled }) {
  return (
    <button
      type="button"
      className="an-btn an-btn-outline"
      onClick={onExport}
      disabled={disabled}
      aria-label="Export current analysis as CSV"
    >
      <Download size={15} /> Export
    </button>
  )
}

// ---------- DataTable (generic, horizontally scrollable) ----------
export function DataTable({ columns, rows, caption, empty = 'No records for this period.' }) {
  return (
    <div className="an-table-wrap" tabIndex={0}>
      <table className="an-table">
        {caption ? <caption className="an-table-caption">{caption}</caption> : null}
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} className={c.align ? `align-${c.align}` : ''} scope="col">
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="an-table-empty">{empty}</td>
            </tr>
          ) : (
            rows.map((row, i) => (
              <tr key={row._key ?? i}>
                {columns.map((c) => (
                  <td key={c.key} className={c.align ? `align-${c.align}` : ''}>
                    {c.render ? c.render(row, i) : row[c.key]}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}
