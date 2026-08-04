import { motion, useReducedMotion } from 'framer-motion'
import { AlertTriangle, CheckCircle2, Info, Lightbulb, RefreshCw, Sparkles } from 'lucide-react'

const severityMeta = {
  high: { Icon: AlertTriangle, label: 'High Priority', colorClass: 'high' },
  medium: { Icon: Info, label: 'Medium Priority', colorClass: 'medium' },
  low: { Icon: CheckCircle2, label: 'Low / Info', colorClass: 'low' },
}

const severityWhy = {
  high: 'Flagged as high priority — this may indicate a budget variance or compliance risk requiring attention.',
  medium: 'Flagged as medium priority — worth monitoring, but not currently exceeding critical thresholds.',
  low: 'Informational observation — budget and compliance remain within standard ranges.',
}

export function InsightItem({ item }) {
  const sev = item.severity === 'high' || item.severity === 'medium' ? item.severity : 'low'
  const { Icon, label, colorClass } = severityMeta[sev] || severityMeta.low
  const why = item.why || severityWhy[sev] || severityWhy.low

  return (
    <div className={`an-risk-card ${colorClass}`} style={{ padding: '16px 18px', gap: '8px' }}>
      <div className="an-risk-card-head">
        <h4 className="an-risk-card-title" style={{ fontSize: '0.96rem' }}>{item.title}</h4>
        <span className={`an-chip ${sev}`} style={{ fontSize: '0.72rem', padding: '2px 8px' }}>
          <Icon size={12} style={{ display: 'inline', marginRight: '3px', verticalAlign: '-1px' }} />
          {label}
        </span>
      </div>
      {why ? (
        <p className="an-risk-why" style={{ fontSize: '0.86rem', lineHeight: '1.45' }}>
          <span className="an-risk-why-tag">Why:</span> {why}
        </p>
      ) : null}
      {item.detail ? (
        <p className="an-risk-detail" style={{ fontSize: '0.82rem', padding: '6px 10px' }}>
          {item.detail}
        </p>
      ) : null}
    </div>
  )
}

// Proactive, page-specific insight panel for drill-down analytics pages.
export function InsightPanel({
  id,
  title = 'AI Insights',
  status,
  summary,
  insights = [],
  recommendations = [],
  error,
  onRefresh,
  updatedAt,
  emptyMessage = 'No insights available for the selected period.',
}) {
  const reduce = useReducedMotion()
  const statusLabel =
    status === 'loading'
      ? 'Analyzing data…'
      : status === 'error'
        ? 'AI interpretation unavailable'
        : updatedAt
          ? `Updated ${new Date(updatedAt).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })}`
          : 'Computed insights'

  return (
    <motion.aside
      id={id}
      className="an-card an-insight-panel"
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      aria-label="AI insights panel"
    >
      <div className="an-card-head" style={{ alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span className="an-ai-summary-badge" style={{ width: '36px', height: '36px' }}>
            <Sparkles size={16} />
          </span>
          <div>
            <h3 className="an-card-title" style={{ fontSize: '1.1rem' }}>{title}</h3>
            <p style={{ margin: '2px 0 0', fontSize: '0.8rem', color: '#64748b', fontWeight: 500 }}>
              {statusLabel}
            </p>
          </div>
        </div>

        {onRefresh ? (
          <button
            type="button"
            className="an-btn an-btn-ghost an-btn-icon"
            style={{ width: '36px', height: '36px', padding: '6px' }}
            onClick={onRefresh}
            disabled={status === 'loading'}
            aria-label="Refresh AI analysis"
            title="Refresh analysis"
          >
            <RefreshCw size={15} className={status === 'loading' ? 'an-spin' : ''} />
          </button>
        ) : null}
      </div>

      {summary ? (
        <p className="an-ai-summary-text" style={{ fontSize: '0.92rem', padding: '12px 14px' }}>
          {summary}
        </p>
      ) : null}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {insights.length ? (
          insights.map((item, i) => <InsightItem key={`${item.title}-${i}`} item={item} />)
        ) : (
          <p style={{ margin: 0, fontSize: '0.88rem', color: '#64748b', textAlign: 'center', padding: '16px' }}>
            {emptyMessage}
          </p>
        )}
      </div>

      {recommendations.length ? (
        <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, fontSize: '0.9rem', color: '#0E9F6E' }}>
            <Lightbulb size={16} />
            <span>Recommended Actions</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {recommendations.map((rec, i) => {
              const text = typeof rec === 'object' ? (rec.detail || rec.title || '') : String(rec)
              return (
                <div key={i} style={{ display: 'flex', gap: '8px', fontSize: '0.86rem', color: '#334155', lineHeight: '1.45' }}>
                  <span style={{ color: '#0E9F6E', fontWeight: 700 }}>•</span>
                  <span>{text}</span>
                </div>
              )
            })}
          </div>
        </div>
      ) : null}

      {error ? (
        <p style={{ margin: 0, fontSize: '0.84rem', color: '#b45309', background: '#fffbeb', padding: '10px 12px', border: '1px solid #fde68a', borderRadius: '8px' }}>
          {error}
        </p>
      ) : null}
    </motion.aside>
  )
}
