import { useNavigate } from 'react-router-dom'
import { ArrowRight, X } from 'lucide-react'
import { formatCurrency, formatPercentage } from '../../utils/analytics'
import { resolveRoute } from '../../utils/riskWarnings'
import RiskBadge, { SEVERITY_META } from './RiskBadge'

// Detailed warning card used in the drawer. Shows icon, title, severity badge,
// the "Why" explanation, the description, related metrics, a recommended action,
// and a permission-safe link to the relevant page.
export default function RiskCard({ warning, role, onNavigate, onDismiss }) {
  const navigate = useNavigate()
  const { Icon } = SEVERITY_META[warning.severity] || SEVERITY_META.low
  const target = resolveRoute(warning.relatedPage, role, ['/dashboard/documents', '/dashboard'])
  const isCurrency = ['budget', 'risk', 'spending'].includes(warning.type)

  const handleNavigate = () => {
    if (!target) return
    onNavigate?.(warning, target)
    navigate(target)
  }

  return (
    <article className={`risk-card risk-${warning.severity}`}>
      <div className="risk-card-head">
        <span className="risk-card-icon"><Icon size={16} aria-hidden="true" /></span>
        <h4 className="risk-card-title">{warning.title}</h4>
        <RiskBadge severity={warning.severity} />
      </div>

      <p className="risk-card-why"><span className="risk-card-why-label">Why:</span> {warning.why}</p>
      <p className="risk-card-desc">{warning.description}</p>

      {(warning.percentage != null || (isCurrency && warning.amount != null)) ? (
        <div className="risk-card-metrics">
          {warning.percentage != null ? (
            <span className="risk-metric">
              <span className="risk-metric-label">Utilization</span>
              <span className="risk-metric-value">{formatPercentage(warning.percentage)}</span>
            </span>
          ) : null}
          {isCurrency && warning.amount != null ? (
            <span className="risk-metric">
              <span className="risk-metric-label">Amount</span>
              <span className="risk-metric-value">{formatCurrency(warning.amount)}</span>
            </span>
          ) : null}
        </div>
      ) : null}

      {warning.recommendation ? (
        <p className="risk-card-reco"><span className="risk-card-reco-label">Recommended action:</span> {warning.recommendation}</p>
      ) : null}

      <div className="risk-card-actions">
        {target ? (
          <button type="button" className="risk-link" onClick={handleNavigate}>
            Review <ArrowRight size={14} aria-hidden="true" />
          </button>
        ) : <span />}
        {onDismiss ? (
          <button
            type="button"
            className="risk-dismiss"
            onClick={() => onDismiss(warning)}
            aria-label={`Dismiss warning: ${warning.title}`}
          >
            <X size={14} aria-hidden="true" /> Dismiss
          </button>
        ) : null}
      </div>
    </article>
  )
}
