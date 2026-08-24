import { useMemo } from 'react'
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts'
import { Gauge, PiggyBank, Percent, Activity } from 'lucide-react'
import { useAnalysisFilters } from '../../hooks/useAnalysisFilters'
import { useBudgetUtilization } from '../../hooks/useAnalysisData'
import { useAnalysisAI } from '../../hooks/useAnalysisAI'
import { AnalysisLayout, AnalysisFilterBar } from '../../components/analysis/AnalysisLayout'
import { InsightPanel } from '../../components/analysis/InsightPanel'
import {
  MetricCard, ChartCard, EmptyState, DataTable, StatusBadge, UtilizationProgress,
} from '../../components/analysis/AnalysisUI'
import { buildUtilizationInsights } from '../../utils/insights'
import {
  formatCurrency, formatPercentage, periodLabel, utilizationStatus,
  CHART_COLORS,
} from '../../utils/analytics'

const BREADCRUMB = [{ label: 'Home', to: '/dashboard' }, { label: 'Analysis', to: '/dashboard/analysis' }, { label: 'Budget Utilization' }]

export default function BudgetUtilizationPage() {
  const { filters, setFilter } = useAnalysisFilters()
  const util = useBudgetUtilization(filters)
  const label = periodLabel(filters)

  const rows = useMemo(() => {
    return util.projectRows.map((record) => ({
      ...record,
      _key: String(record.id),
      status: record.allocation > 0 ? utilizationStatus(record.rate) : 'Over Budget',
    }))
  }, [util.projectRows])

  const donutData = [
    { name: 'Utilized', value: Math.max(0, Math.min(util.utilizedBudget, util.totalBudget || util.utilizedBudget)) },
    { name: 'Remaining', value: Math.max(0, util.remainingBudget) },
  ]
  const over = util.remainingBudget < 0

  const fallback = useMemo(() => buildUtilizationInsights(util), [util])
  const aiPayload = useMemo(() => ({
    page: 'budget-utilization',
    period: label,
    utilizedBudget: Math.round(util.utilizedBudget),
    remainingBudget: Math.round(util.remainingBudget),
    utilizationRate: Number(util.utilizationRate.toFixed(1)),
    performance: util.performance.label,
    missingReceipts: util.missingReceipts,
    approvedRecords: rows.slice(0, 8).map((r) => ({
      name: r.name,
      type: r.type,
      approvedBudget: Math.round(r.allocation),
      utilized: Math.round(r.utilized),
      remaining: Math.round(r.remaining),
      rate: Number(r.rate.toFixed(1)),
      status: r.status,
    })),
  }), [util, rows, label])
  const ai = useAnalysisAI(aiPayload, { fallback, enabled: util.hasAnyData })

  const cards = [
    { icon: Gauge, label: 'Utilized Budget', value: formatCurrency(util.utilizedBudget), meta: `Spent in ${label}` },
    { icon: PiggyBank, label: 'Remaining Budget', value: formatCurrency(util.remainingBudget), meta: over ? 'Over budget' : 'Available', tone: over ? 'danger' : 'positive' },
    { icon: Percent, label: 'Utilization Rate', value: formatPercentage(util.utilizationRate, 1), meta: 'Expenses ÷ budget', tone: util.utilizationRate > 95 ? 'danger' : util.utilizationRate > 80 ? 'warning' : 'positive' },
    { icon: Activity, label: 'Overall Performance', value: util.performance.label, meta: util.performance.message, tone: util.performance.tone },
  ]

  const columns = [
    { key: 'name', header: 'Approved Project / Event / Payroll' },
    { key: 'type', header: 'Type' },
    { key: 'allocation', header: 'Approved Budget', align: 'right', render: (r) => formatCurrency(r.allocation) },
    { key: 'utilized', header: 'Utilized', align: 'right', render: (r) => formatCurrency(r.utilized) },
    { key: 'remaining', header: 'Remaining Budget', align: 'right', render: (r) => formatCurrency(r.remaining) },
    { key: 'rate', header: 'Used', align: 'right', render: (r) => formatPercentage(r.rate, 1) },
    { key: 'status', header: 'Status', align: 'center', render: (r) => <StatusBadge status={r.status} /> },
  ]

  return (
    <AnalysisLayout
      breadcrumb={BREADCRUMB}
      title="Budget Utilization"
      description="How much of each approved Project, Event, or Payroll budget has been used by recorded expenses and requisitions."
      filterBar={<AnalysisFilterBar filters={filters} setFilter={setFilter} />}
    >
      <section className="an-metric-grid">
        {cards.map((c) => <MetricCard key={c.label} {...c} />)}
      </section>

      {!util.hasBudgetData && util.utilizedBudget === 0 ? (
        <ChartCard><EmptyState title="No approved budget requests for this period" message={`Approve a Project, Event, or Payroll request for ${label} to see utilization.`} /></ChartCard>
      ) : (
        <>
          <div className="an-two-col">
            <ChartCard eyebrow="Overview" title="Budget utilization">
              <div className="an-donut-wrap">
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie data={donutData} dataKey="value" innerRadius="64%" outerRadius="90%" paddingAngle={2} startAngle={90} endAngle={-270}>
                      <Cell fill={over ? CHART_COLORS.danger : CHART_COLORS.primaryLine} />
                      <Cell fill={CHART_COLORS.remaining} />
                    </Pie>
                    <Tooltip formatter={(v) => formatCurrency(v)} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="an-donut-center">
                  <span className="val">{formatPercentage(util.utilizationRate, 0)}</span>
                  <span className="lbl">utilized</span>
                </div>
              </div>
              <div className="an-legend">
                <div className="an-legend-item">
                  <span className="an-legend-left"><span className="an-legend-dot" style={{ background: over ? CHART_COLORS.danger : CHART_COLORS.primaryLine }} />Utilized</span>
                  <span className="an-legend-val">{formatCurrency(util.utilizedBudget)}</span>
                </div>
                <div className="an-legend-item">
                  <span className="an-legend-left"><span className="an-legend-dot" style={{ background: CHART_COLORS.remaining }} />Remaining</span>
                  <span className="an-legend-val">{formatCurrency(Math.max(0, util.remainingBudget))}</span>
                </div>
              </div>
              <p className={`an-context-msg ${util.performance.tone === 'positive' ? '' : util.performance.tone}`}>{util.performance.message}</p>
            </ChartCard>

            <ChartCard eyebrow="By approved record" title="Project, Event, and Payroll utilization" description="Each record uses its own approved budget as the utilization base.">
              {rows.length ? (
                <div>{rows.map((r) => (
                  <UtilizationProgress key={r._key} label={r.name} utilized={r.utilized} allocation={r.allocation} rate={r.rate} status={r.status} />
                ))}</div>
              ) : (
                <EmptyState title="No approved records" message="No approved Project, Event, or Payroll budgets are available for this period." />
              )}
            </ChartCard>
          </div>

          <div className="an-detail-grid">
            <ChartCard eyebrow="Breakdown" title="Utilization details">
              <DataTable columns={columns} rows={rows} empty="No utilization records for this period." />
            </ChartCard>
            <InsightPanel
              title="AI Utilization Insights"
              status={ai.status} summary={ai.summary} insights={ai.insights}
              recommendations={ai.recommendations} error={ai.error} onRefresh={ai.refresh} updatedAt={ai.updatedAt}
            />
          </div>
        </>
      )}
    </AnalysisLayout>
  )
}
