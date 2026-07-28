import { useNavigate } from 'react-router-dom'
import { ArrowRight, X } from 'lucide-react'
import { useFinancialRisks } from '../../context/FinancialRiskContext'
import { resolveRoute, SEVERITY_RANK } from '../../utils/riskWarnings'
import { SEVERITY_META } from './RiskBadge'

// Compact, page-scoped banner. Shows ONLY the single most severe warning that is
// relevant to this page (via affectedPageKeys), so pages don't get cluttered.
// The persistent top-bar indicator remains the place to see everything.
export default function ContextualRiskBanner({ pageKey }) {
  const { warnings, role, dismiss } = useFinancialRisks()
  const navigate = useNavigate()

  const relevant = warnings
    .filter((w) => w.affectedPageKeys?.includes(pageKey))
    .sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity])

  if (!relevant.length) return null

  const top = relevant[0]
  const meta = SEVERITY_META[top.severity] || SEVERITY_META.low
  const Icon = meta.Icon
  const target = resolveRoute(top.relatedPage, role, ['/dashboard/documents', '/dashboard'])

  return (
    <div className={`contextual-risk-banner risk-${top.severity}`} role="status">
      <span className="crb-icon"><Icon size={18} aria-hidden="true" /></span>
      <div className="crb-body">
        <p className="crb-text">
          <span className="crb-sev">{meta.label}</span>
          <span className="crb-sep"> — </span>
          {top.description}
        </p>
        {relevant.length > 1 ? (
          <p className="crb-more">{relevant.length - 1} more related warning{relevant.length - 1 === 1 ? '' : 's'} on this page.</p>
        ) : null}
      </div>
      {target ? (
        <button type="button" className="crb-action" onClick={() => navigate(target)}>
          Review <ArrowRight size={14} aria-hidden="true" />
        </button>
      ) : null}
      <button
        type="button"
        className="crb-dismiss"
        onClick={() => dismiss(top.id)}
        aria-label={`Dismiss warning: ${top.title}`}
      >
        <X size={15} aria-hidden="true" />
      </button>
    </div>
  )
}
