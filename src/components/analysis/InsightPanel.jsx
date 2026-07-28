import { motion, useReducedMotion } from 'framer-motion'
import { AlertTriangle, CheckCircle2, Info, Lightbulb, RefreshCw, Sparkles } from 'lucide-react'

const severityMeta = {
  high: { Icon: AlertTriangle, label: 'High' },
  medium: { Icon: Info, label: 'Medium' },
  low: { Icon: CheckCircle2, label: 'Low' },
}

// Fallback justification when an insight (e.g. from the AI) has no explicit `why`.
// Keeps every card consistent — a severity is never shown without a reason.
const severityWhy = {
  high: 'Flagged as high priority — this may indicate a budget or compliance risk that needs attention.',
  medium: 'Flagged as medium priority — worth monitoring, but not yet at a critical threshold.',
  low: 'Informational insight — this does not indicate a current risk.',
}

export function InsightItem({ item }) {
  const { Icon, label } = severityMeta[item.severity] || severityMeta.low
  const why = item.why || severityWhy[item.severity] || severityWhy.low
  return (
    <div className={`an-insight ${item.severity}`}>
      <span className="an-insight-icon"><Icon size={16} /></span>
      <div className="an-insight-body">
        <div className="an-insight-head">
          <span className="an-insight-title">{item.title}</span>
          <span className={`an-sev an-sev-${item.severity}`}>{label}</span>
        </div>
        {why ? (
          <p className="an-insight-why">
            <span className="an-insight-why-label">Why:</span> {why}
          </p>
        ) : null}
        {item.detail ? <p className="an-insight-detail">{item.detail}</p> : null}
      </div>
    </div>
  )
}

// Proactive, page-specific insight panel. Distinct from the conversational Cue chatbot.
export function InsightPanel({
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
      ? 'Generating analysis…'
      : status === 'error'
        ? 'AI interpretation unavailable'
        : updatedAt
          ? `Updated ${new Date(updatedAt).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })}`
          : 'Computed insights'

  return (
    <motion.aside
      className="an-card an-insight-panel"
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      aria-label="AI insights panel"
    >
      <div className="an-insight-panel-head">
        <div className="an-insight-panel-title">
          <span className="an-insight-panel-badge"><Sparkles size={15} /></span>
          <div>
            <h2 className="an-card-title">{title}</h2>
            <p className="an-insight-panel-status">{statusLabel}</p>
          </div>
        </div>
        {onRefresh ? (
          <button
            type="button"
            className="an-btn an-btn-ghost an-btn-icon"
            onClick={onRefresh}
            disabled={status === 'loading'}
            aria-label="Refresh AI analysis"
            title="Refresh analysis"
          >
            <RefreshCw size={15} className={status === 'loading' ? 'an-spin' : ''} />
          </button>
        ) : null}
      </div>

      {summary ? <p className="an-insight-summary">{summary}</p> : null}

      <div className="an-insight-list">
        {insights.length ? (
          insights.map((item, i) => <InsightItem key={`${item.title}-${i}`} item={item} />)
        ) : (
          <p className="an-insight-empty">{emptyMessage}</p>
        )}
      </div>

      {recommendations.length ? (
        <div className="an-reco">
          <div className="an-reco-head">
            <Lightbulb size={15} />
            <span>Recommended next actions</span>
          </div>
          <ul className="an-reco-list">
            {recommendations.map((rec, i) => (
              <li key={i}>{rec}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {error ? <p className="an-insight-error">{error}</p> : null}
    </motion.aside>
  )
}
