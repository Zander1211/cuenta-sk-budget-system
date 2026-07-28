import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { useAuth } from './AuthContext'
import { useFinancialSummary, useCategoryAnalysis, useMonthlyTrend } from '../hooks/useAnalysisData'
import { periodLabel } from '../utils/analytics'
import {
  buildGlobalWarnings,
  filterWarningsByRole,
  highestSeverity,
  countBySeverity,
  warningsSignature,
} from '../utils/riskWarnings'

const FinancialRiskContext = createContext(null)

// Global, deterministic financial-risk awareness. One provider computes the current
// period's warnings from the same reactive budget/expense data the Analysis module
// uses, so it updates automatically after any financial mutation — with no AI calls
// and no recomputation per page navigation.
export function FinancialRiskProvider({ children }) {
  const { role } = useAuth()

  // Current period (this month). Stable for the session so the memoized analysis
  // hooks don't recompute on every render.
  const filters = useMemo(() => {
    const now = new Date()
    return { view: 'monthly', year: now.getFullYear(), month: now.getMonth() + 1, project: 'all', category: 'all' }
  }, [])

  const summary = useFinancialSummary(filters)
  const category = useCategoryAnalysis(filters)
  const trend = useMonthlyTrend(filters)
  const label = periodLabel(filters)

  const allWarnings = useMemo(
    () => buildGlobalWarnings({ summary: { ...summary, periodLabel: label }, category, trend }),
    [summary, category, trend, label]
  )
  const roleWarnings = useMemo(() => filterWarningsByRole(allWarnings, role), [allWarnings, role])
  const signature = warningsSignature(roleWarnings)

  // Session state: dismissals + last-updated stamp, keyed to the risk signature.
  // When the deterministic picture changes (data or severity), dismissals expire
  // and the timestamp refreshes — the React "adjust state during render" pattern,
  // which avoids setState-in-effect.
  const [risk, setRisk] = useState(() => ({
    sig: signature,
    updatedAt: new Date().toISOString(),
    dismissed: new Set(),
  }))
  if (risk.sig !== signature) {
    setRisk({ sig: signature, updatedAt: new Date().toISOString(), dismissed: new Set() })
  }

  const dismiss = useCallback((id) => {
    setRisk((r) => {
      const dismissed = new Set(r.dismissed)
      dismissed.add(id)
      return { ...r, dismissed }
    })
  }, [])
  const restoreAll = useCallback(() => setRisk((r) => ({ ...r, dismissed: new Set() })), [])
  const refresh = useCallback(() => setRisk((r) => ({ ...r, updatedAt: new Date().toISOString() })), [])

  const visibleWarnings = useMemo(
    () => roleWarnings.filter((w) => !risk.dismissed.has(w.id)),
    [roleWarnings, risk.dismissed]
  )

  const value = useMemo(() => {
    const counts = countBySeverity(visibleWarnings)
    return {
      role,
      warnings: visibleWarnings, // dismissed removed
      allRoleWarnings: roleWarnings, // everything the role may see, incl. dismissed
      counts,
      total: visibleWarnings.length,
      severity: visibleWarnings.length ? highestSeverity(visibleWarnings) : null,
      updatedAt: risk.updatedAt,
      dismiss,
      restoreAll,
      refresh,
      canViewAnalysis: ['SK Chairman', 'SK Treasurer'].includes(role),
      hasData: summary.hasAnyData,
    }
  }, [role, visibleWarnings, roleWarnings, risk.updatedAt, dismiss, restoreAll, refresh, summary.hasAnyData])

  return <FinancialRiskContext.Provider value={value}>{children}</FinancialRiskContext.Provider>
}

export function useFinancialRisks() {
  const ctx = useContext(FinancialRiskContext)
  if (!ctx) throw new Error('useFinancialRisks must be used within a FinancialRiskProvider')
  return ctx
}
