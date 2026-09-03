import { useMemo, useRef, useState } from 'react'
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip,
} from 'recharts'
import { Wallet, Layers, Boxes, TrendingUp, FileDown } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useAnalysisFilters } from '../../hooks/useAnalysisFilters'
import { useApprovedBudgetDistribution } from '../../hooks/useAnalysisData'
import { useAnalysisAI } from '../../hooks/useAnalysisAI'
import { AnalysisLayout, AnalysisFilterBar } from '../../components/analysis/AnalysisLayout'
import { InsightPanel } from '../../components/analysis/InsightPanel'
import {
  MetricCard, ChartCard, EmptyState, DataTable,
} from '../../components/analysis/AnalysisUI'
import { buildDistributionInsights } from '../../utils/insights'
import {
  formatCurrency, formatPercentage, periodLabel, assignCategoryColors, CHART_INK,
} from '../../utils/analytics'
import { exportAiAnalysisPdf } from '../../utils/exportPdf'

const BREADCRUMB = [
  { label: 'Home', to: '/dashboard' },
  { label: 'Analysis', to: '/dashboard/analysis' },
  { label: 'Category Budget Distribution' },
]

function renderCustomizedLabel({ cx, cy, midAngle, innerRadius, outerRadius, percent }) {
  if (percent < 0.05) return null
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5
  const x = cx + radius * Math.cos(-midAngle * Math.PI / 180)
  const y = cy + radius * Math.sin(-midAngle * Math.PI / 180)
  return (
    <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight="bold">
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  )
}

function PieCategoryTooltip({ active, payload }) {
  if (!active || !payload || !payload.length) return null
  const data = payload[0].payload
  return (
    <div style={{ background: 'var(--surface)', border: `1px solid ${CHART_INK.grid}`, padding: '12px', borderRadius: '8px', boxShadow: '0 4px 16px rgba(0,0,0,0.12)' }}>
      <p style={{ margin: '0 0 8px', fontWeight: 700, color: 'var(--ink-1)' }}>{data.name}</p>
      <p style={{ margin: '4px 0', fontSize: '13px', color: 'var(--ink-3)' }}>Budget: <strong style={{ color: 'var(--ink-1)' }}>{formatCurrency(data.value)}</strong></p>
      <p style={{ margin: '4px 0', fontSize: '13px', color: 'var(--ink-3)' }}>Percentage: <strong style={{ color: 'var(--ink-1)' }}>{formatPercentage(data.percent, 1)}</strong></p>
      {data.count != null && (
        <p style={{ margin: '4px 0', fontSize: '13px', color: 'var(--ink-3)' }}>Projects: <strong style={{ color: 'var(--ink-1)' }}>{data.count}</strong></p>
      )}
    </div>
  )
}

export default function CategoryBudgetDistributionPage() {
  const { role } = useAuth()
  const canExport = role === 'SK Chairman' || role === 'SK Treasurer'
  const { filters, setFilter } = useAnalysisFilters()
  const chartRef = useRef(null)
  const [exporting, setExporting] = useState(false)

  const dist = useApprovedBudgetDistribution(filters)
  const label = periodLabel(filters)

  const colorByName = useMemo(
    () => assignCategoryColors(dist.distribution.map((c) => c.name)),
    [dist.distribution]
  )

  const pieData = useMemo(() =>
    dist.distribution.map((c) => ({
      ...c,
      color: colorByName.get(c.name),
      percent: dist.total > 0 ? (c.value / dist.total) * 100 : 0,
    })),
    [dist.distribution, dist.total, colorByName]
  )

  const fallback = useMemo(() => buildDistributionInsights(dist), [dist])
  const aiPayload = useMemo(() => ({
    page: 'category-budget-distribution',
    period: label,
    totalBudget: Math.round(dist.total),
    totalProjectsEvents: dist.totalProjectsEvents,
    categories: dist.distribution.map((c) => ({
      name: c.name,
      total: Math.round(c.value),
      share: Number(((c.value / dist.total) * 100).toFixed(1)),
      count: c.count,
    })),
  }), [dist, label])
  const ai = useAnalysisAI(aiPayload, { fallback, enabled: dist.hasData })

  const largest = dist.distribution[0] || null
  const cards = [
    { icon: Wallet, label: 'Total Budget', value: formatCurrency(dist.total), meta: `Approved allocations for ${label}` },
    { icon: Layers, label: 'Categories', value: String(dist.distribution.length), meta: 'Distinct budget categories' },
    { icon: Boxes, label: 'Projects/Events', value: String(dist.totalProjectsEvents), meta: 'Approved projects, events & payroll' },
    {
      icon: TrendingUp,
      label: 'Largest Category',
      value: largest ? largest.name : '—',
      meta: largest ? `${formatCurrency(largest.value)} (${formatPercentage((largest.value / dist.total) * 100, 1)})` : 'No data',
      tone: 'warning',
    },
  ]

  const columns = [
    {
      key: 'name', header: 'Category', render: (r) => (
        <span><span className="an-cat-dot" style={{ background: colorByName.get(r.name) }} />{r.name}</span>
      )
    },
    { key: 'value', header: 'Total Budget', align: 'right', render: (r) => formatCurrency(r.value) },
    { key: 'percent', header: 'Percentage', align: 'right', render: (r) => formatPercentage((r.value / dist.total) * 100, 1) },
    { key: 'count', header: 'Projects/Events', align: 'right', render: (r) => r.count },
  ]

  async function handleExportPdf() {
    if (exporting || !dist.hasData) return
    setExporting(true)
    try {
      await exportAiAnalysisPdf({
        chartRef: chartRef.current,
        distribution: dist.distribution,
        total: dist.total,
        totalProjectsEvents: dist.totalProjectsEvents,
        aiSummary: ai.summary,
        filters,
      })
    } catch (err) {
      console.error('PDF export failed:', err)
    } finally {
      setExporting(false)
    }
  }

  return (
    <AnalysisLayout
      breadcrumb={BREADCRUMB}
      title="Category Budget Distribution"
      description="How approved budget is allocated across categories, with the count of projects and events behind each share."
      filterBar={<AnalysisFilterBar filters={filters} setFilter={setFilter} />}
    >
      <section className="an-metric-grid">
        {cards.map((c) => <MetricCard key={c.label} {...c} />)}
      </section>

      {!dist.hasData ? (
        <ChartCard><EmptyState title="No approved budget data" message={`No approved projects, events, or payroll were recorded for ${label}.`} /></ChartCard>
      ) : (
        <div className="an-detail-grid">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <ChartCard
              eyebrow="Distribution" title={`Category budget share — ${label}`}
              action={canExport ? (
                <button type="button" className="an-btn an-btn-outline" onClick={handleExportPdf} disabled={exporting} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                  <FileDown size={15} />
                  {exporting ? 'Exporting…' : 'Export PDF'}
                </button>
              ) : null}
            >
              <div ref={chartRef} data-pdf-capture="full">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', alignItems: 'center' }}>
                  <div style={{ height: '280px' }}>
                    <ResponsiveContainer width="100%" height={260}>
                      <PieChart>
                        <Pie
                          data={pieData}
                          cx="50%"
                          cy="50%"
                          innerRadius={65}
                          outerRadius={105}
                          paddingAngle={2}
                          dataKey="value"
                          nameKey="name"
                          label={renderCustomizedLabel}
                          labelLine={false}
                        >
                          {pieData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip content={<PieCategoryTooltip />} cursor={{ fill: CHART_INK.cursor }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', paddingRight: '8px', paddingTop: '4px', paddingBottom: '4px' }}>
                    {pieData.map((entry) => (
                      <div key={entry.name} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', minWidth: 0 }}>
                        <span style={{ width: '12px', height: '12px', borderRadius: '50%', flexShrink: 0, marginTop: '3px', background: entry.color }} />
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--ink-1)', lineHeight: 1.4, wordBreak: 'break-word' }}>
                            {entry.name}
                          </div>
                          <div style={{ fontSize: '0.78rem', color: 'var(--ink-3)', lineHeight: 1.4 }}>
                            {formatCurrency(entry.value)} · {formatPercentage((entry.value / dist.total) * 100, 0)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </ChartCard>

            <ChartCard eyebrow="Breakdown" title="Budget summary table">
              <DataTable columns={columns} rows={dist.distribution.map((c) => ({ ...c, _key: c.name }))} />
            </ChartCard>
          </div>

          <InsightPanel
            title="AI Distribution Insights"
            status={ai.status} summary={ai.summary} insights={ai.insights}
            recommendations={ai.recommendations} error={ai.error} onRefresh={ai.refresh} updatedAt={ai.updatedAt}
          />
        </div>
      )}
    </AnalysisLayout>
  )
}
