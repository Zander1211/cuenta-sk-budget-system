import { AlertTriangle, AlertCircle, CheckCircle2, RefreshCw, Sparkles, ArrowDown } from 'lucide-react'

// Consolidated AI risk overview shown ONLY at the top of the Analysis page.
// Summarizes the same deterministic + Gemini insights the AI Insights panel renders
// below — it does not compute or invent any new financial values.

const SEV = {
  high: { label: 'High', explain: 'Requires immediate attention', Icon: AlertTriangle },
  medium: { label: 'Medium', explain: 'Monitor closely', Icon: AlertCircle },
  low: { label: 'Low', explain: 'Informational only', Icon: CheckCircle2 },
}

function countBySeverity(insights = []) {
  return insights.reduce(
    (acc, i) => {
      const s = i.severity === 'high' || i.severity === 'medium' ? i.severity : 'low'
      acc[s] += 1
      return acc
    },
    { high: 0, medium: 0, low: 0 }
  )
}

function overallStatus(counts) {
  if (counts.high > 0) return { tone: 'danger', label: 'Action needed' }
  if (counts.medium > 0) return { tone: 'warning', label: 'Monitor' }
  if (counts.high + counts.medium + counts.low > 0) return { tone: 'positive', label: 'Healthy' }
  return { tone: 'neutral', label: 'No insights yet' }
}

export default function AnalysisInsightHeader({ status, summary, insights = [], updatedAt, onRefresh, onViewDetails }) {
  const counts = countBySeverity(insights)
  const overall = overallStatus(counts)
  const total = counts.high + counts.medium + counts.low

  const statusLine =
    status === 'loading'
      ? 'Generating analysis…'
      : status === 'error'
        ? 'AI interpretation unavailable'
        : updatedAt
          ? `Updated ${new Date(updatedAt).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })}`
          : 'Computed insights'

  // Prefer the Gemini summary; fall back to a plain deterministic sentence.
  const summaryText =
    summary?.trim() ||
    (total === 0
      ? 'No insights have been generated for the selected period yet.'
      : `${counts.high} high-priority, ${counts.medium} medium, and ${counts.low} informational insight${counts.low === 1 ? '' : 's'} for the selected period. Review the details below.`)

  return (
    <section className="an-card an-ai-header" aria-label="AI financial overview">
      <div className="an-ai-header-main">
        <div className="an-ai-header-lead">
          <span className="an-ai-header-badge" aria-hidden="true"><Sparkles size={18} /></span>
          <div className="an-ai-header-copy">
            <p className="an-eyebrow">AI Financial Overview</p>
            <div className="an-ai-header-title-row">
              <h2 className="an-ai-header-title">Overall Financial Status</h2>
              <span className={`an-ai-status an-ai-status-${overall.tone}`}>{overall.label}</span>
            </div>
            <p className="an-ai-counts-inline" aria-hidden="true">
              <span className="hi">HIGH ({counts.high})</span>
              <span className="dot">•</span>
              <span className="me">MEDIUM ({counts.medium})</span>
              <span className="dot">•</span>
              <span className="lo">LOW ({counts.low})</span>
            </p>
            <p className="an-ai-header-summary">{summaryText}</p>
          </div>
        </div>

        <div className="an-ai-header-meta">
          <span className="an-ai-updated">{statusLine}</span>
          {onRefresh ? (
            <button
              type="button"
              className="an-btn an-btn-ghost an-btn-icon"
              onClick={onRefresh}
              disabled={status === 'loading'}
              aria-label="Refresh analysis"
              title="Refresh analysis"
            >
              <RefreshCw size={16} className={status === 'loading' ? 'an-spin' : ''} />
            </button>
          ) : null}
        </div>
      </div>

      <div className="an-ai-sev-cards">
        {['high', 'medium', 'low'].map((sev) => {
          const { label, explain, Icon } = SEV[sev]
          return (
            <div key={sev} className={`an-ai-sev-card ${sev}`}>
              <span className="an-ai-sev-count">{counts[sev]}</span>
              <div className="an-ai-sev-text">
                <span className="an-ai-sev-label"><Icon size={15} aria-hidden="true" /> {label}</span>
                <span className="an-ai-sev-explain">{explain}</span>
              </div>
            </div>
          )
        })}
      </div>

      <div className="an-ai-header-actions">
        <button type="button" className="an-btn an-btn-outline" onClick={onViewDetails}>
          View Detailed Insights <ArrowDown size={15} />
        </button>
      </div>
    </section>
  )
}
