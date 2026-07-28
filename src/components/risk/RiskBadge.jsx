import { AlertTriangle, AlertCircle, CheckCircle2 } from 'lucide-react'

// Severity presentation shared across the risk UI. Text label is always present so
// severity is never communicated through color alone (accessibility).
export const SEVERITY_META = {
  high: { Icon: AlertTriangle, label: 'HIGH' },
  medium: { Icon: AlertCircle, label: 'MEDIUM' },
  low: { Icon: CheckCircle2, label: 'LOW' },
}

export default function RiskBadge({ severity = 'low', showIcon = true }) {
  const meta = SEVERITY_META[severity] || SEVERITY_META.low
  const Icon = meta.Icon
  return (
    <span className={`risk-badge risk-${severity}`}>
      {showIcon ? <Icon size={13} aria-hidden="true" /> : null}
      {meta.label}
    </span>
  )
}
