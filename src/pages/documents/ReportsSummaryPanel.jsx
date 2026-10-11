import { useEffect, useMemo, useRef, useState } from 'react'
import { FileText, Receipt, BarChart2, CheckCircle, Clock, TrendingUp } from 'lucide-react'
import { supabase } from '../../supabase/supabaseClient'
import { useBudget } from '../../context/BudgetContext'
import { useDocuments } from '../../context/DocumentContext'
import { useAuth } from '../../context/AuthContext'
import { summarizeApprovedBudgetFinancials } from '../../utils/projectEventFinancials'
import { getBudgetTotalForPeriod } from '../../utils/budgetUtils'
import YearSpinner from '../../components/YearSpinner'
import ReportSummaryNote from '../../components/ReportSummaryNote'

const currency = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})

const REPORT_TYPE_META = {
  'Annual Report': { icon: '📋', color: '#6366f1', label: 'Annual Reports' },
  'Narrative Report': { icon: '📝', color: '#0ea5e9', label: 'Narrative Reports' },
  'Purchase Request': { icon: '🛒', color: '#f59e0b', label: 'Purchase Requests' },
  'Disbursement Voucher': { icon: '💸', color: '#10b981', label: 'Disbursement Vouchers' },
  'Other': { icon: '📄', color: '#8b5cf6', label: 'Other Documents' },
}

function StatCard({ icon: Icon, iconColor, label, value, subtitle, accent }) {
  return (
    <div style={{
      backgroundColor: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-surface)',
      padding: '20px 24px',
      boxShadow: 'var(--shadow)',
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {accent && (
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: accent }} />
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div style={{
          width: 36, height: 36, borderRadius: '10px',
          background: iconColor + '18',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <Icon size={18} color={iconColor} />
        </div>
        <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
          {label}
        </p>
      </div>
      <h3 style={{ margin: 0, fontSize: '1.8rem', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1 }}>
        {value}
      </h3>
      {subtitle && (
        <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{subtitle}</p>
      )}
    </div>
  )
}

function DocTypeRow({ icon, label, color, count, archived }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '12px',
      padding: '12px 16px', borderRadius: 'var(--radius-control)',
      background: 'rgba(0,0,0,0.02)', border: '1px solid var(--border)',
    }}>
      <span style={{ fontSize: '1.25rem', lineHeight: 1 }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-primary)' }}>{label}</p>
        {archived > 0 && (
          <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{archived} archived</p>
        )}
      </div>
      <span style={{
        padding: '4px 12px', borderRadius: '999px',
        background: color + '18', color, fontWeight: 700, fontSize: '0.9rem',
      }}>
        {count}
      </span>
    </div>
  )
}

function RecentDocRow({ doc }) {
  const year = doc.relatedEntityId || new Date(doc.dateGenerated).getFullYear()
  const meta = REPORT_TYPE_META[doc.type] || REPORT_TYPE_META['Other']
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '12px',
      padding: '10px 0', borderBottom: '1px solid var(--border)',
    }}>
      <span style={{ fontSize: '1.2rem', flexShrink: 0 }}>{meta.icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontWeight: 500, fontSize: '0.88rem', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {doc.name}
        </p>
        <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
          {doc.type} · {year} · {new Date(doc.dateGenerated).toLocaleDateString()}
        </p>
      </div>
      {doc.archivedAt
        ? <span className="status-pill status-rejected" style={{ margin: 0, flexShrink: 0, fontSize: '0.72rem' }}>Archived</span>
        : <span className="status-pill status-completed" style={{ margin: 0, flexShrink: 0, fontSize: '0.72rem' }}>Active</span>
      }
    </div>
  )
}

export default function ReportsSummaryPanel() {
  const { role } = useAuth()
  const { budgets, expenses, verifiedReceiptTotals } = useBudget()
  const { documentStats } = useDocuments()

  const currentYear = new Date().getFullYear()
  const [selectedYear, setSelectedYear] = useState(currentYear)
  const [allDocs, setAllDocs] = useState([])
  const [receiptStats, setReceiptStats] = useState({ total: 0, verified: 0, withReceipts: 0 })
  const [loading, setLoading] = useState(true)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  useEffect(() => {
    setLoading(true)
    const fetchAll = async () => {
      const [docsRes, receiptRes] = await Promise.all([
        supabase
          .from('documents')
          .select('id, name, type, date_generated, archived_at, related_entity_id, generated_by')
          .order('date_generated', { ascending: false })
          .limit(500),
        supabase
          .from('receipt_records')
          .select('id, record_id, ocr_verified_at')
          .limit(2000),
      ])
      if (!mountedRef.current) return

      const docs = (docsRes.data || []).map(row => ({
        id: row.id,
        name: row.name,
        type: row.type,
        dateGenerated: row.date_generated,
        archivedAt: row.archived_at,
        relatedEntityId: row.related_entity_id,
        generatedBy: row.generated_by,
      }))
      setAllDocs(docs)

      const receiptRows = receiptRes.data || []
      const total = receiptRows.length
      const verified = receiptRows.filter(r => r.ocr_verified_at).length
      const uniqueRecords = new Set(receiptRows.map(r => r.record_id)).size
      setReceiptStats({ total, verified, withReceipts: uniqueRecords })
      setLoading(false)
    }
    fetchAll()
  }, [])

  const financials = useMemo(() => {
    const totalBudget = getBudgetTotalForPeriod(budgets, null, selectedYear)
    const { totalApprovedBudget, totalExpenses, remainingBudget, utilization, records } =
      summarizeApprovedBudgetFinancials(expenses, verifiedReceiptTotals, { view: 'yearly', year: selectedYear })
    return { totalBudget, totalApprovedBudget, totalExpenses, remainingBudget, utilization, projectCount: records.length }
  }, [budgets, expenses, verifiedReceiptTotals, selectedYear])

  const docTypeBreakdown = useMemo(() => {
    const counts = {}
    const archived = {}
    allDocs.forEach(doc => {
      const type = REPORT_TYPE_META[doc.type] ? doc.type : 'Other'
      counts[type] = (counts[type] || 0) + 1
      if (doc.archivedAt) archived[type] = (archived[type] || 0) + 1
    })
    return Object.entries(REPORT_TYPE_META)
      .map(([type, meta]) => ({ type, meta, count: counts[type] || 0, archived: archived[type] || 0 }))
      .filter(r => r.count > 0)
  }, [allDocs])

  const recentDocs = useMemo(() => allDocs.slice(0, 8), [allDocs])

  const approvedCount = expenses.filter(e => ['Approved', 'Released'].includes(e.status || '')).length
  const receiptCoverage = approvedCount > 0
    ? Math.min(100, Math.round((receiptStats.withReceipts / approvedCount) * 100))
    : 0

  if (!['SK Chairman', 'SK Treasurer'].includes(role)) return null

  return (
    <section className="dashboard-content" style={{ paddingTop: 0 }}>
      <div style={{ marginBottom: '24px' }}>
        <p className="eyebrow">Summary</p>
        <h2 style={{ margin: '0 0 6px', fontSize: '1.4rem', color: 'var(--text-primary)' }}>
          Reports & Documents Overview
        </h2>
        <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
          A consolidated view of all generated reports, document types, receipts, and financial records.
        </p>
      </div>

      {loading ? (
        <div style={{ padding: '48px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
          Loading summary…
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', marginBottom: '28px' }}>
            <StatCard icon={FileText} iconColor="#6366f1" label="Total Documents" value={allDocs.length}
              subtitle={`${allDocs.filter(d => !d.archivedAt).length} active · ${allDocs.filter(d => d.archivedAt).length} archived`}
              accent="linear-gradient(90deg,#6366f1,#818cf8)" />
            <StatCard icon={Receipt} iconColor="#10b981" label="Receipts Uploaded" value={receiptStats.total.toLocaleString()}
              subtitle={`${receiptStats.verified} OCR-verified`}
              accent="linear-gradient(90deg,#10b981,#34d399)" />
            <StatCard icon={CheckCircle} iconColor="#0ea5e9" label="Receipt Coverage" value={`${receiptCoverage}%`}
              subtitle="of approved records have receipts"
              accent="linear-gradient(90deg,#0ea5e9,#38bdf8)" />
            <StatCard icon={BarChart2} iconColor="#f59e0b" label="Records Covered" value={receiptStats.withReceipts}
              subtitle="unique project/event records"
              accent="linear-gradient(90deg,#f59e0b,#fbbf24)" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px', marginBottom: '28px' }}>
            <div style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-surface)', padding: '24px', boxShadow: 'var(--shadow)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                <FileText size={16} color="var(--text-secondary)" />
                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)' }}>Documents by Type</h3>
              </div>
              {docTypeBreakdown.length === 0
                ? <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem' }}>No documents generated yet.</p>
                : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {docTypeBreakdown.map(({ type, meta, count, archived }) => (
                      <DocTypeRow key={type} icon={meta.icon} label={meta.label} color={meta.color} count={count} archived={archived} />
                    ))}
                  </div>
                )
              }
            </div>

            <div style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-surface)', padding: '24px', boxShadow: 'var(--shadow)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                <Receipt size={16} color="var(--text-secondary)" />
                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)' }}>Receipt Health</h3>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Coverage</span>
                    <span style={{ fontSize: '0.82rem', color: 'var(--text-primary)', fontWeight: 700 }}>{receiptCoverage}%</span>
                  </div>
                  <div style={{ height: 8, borderRadius: 4, background: 'var(--border)', overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', borderRadius: 4, width: `${receiptCoverage}%`, transition: 'width 0.6s ease',
                      background: receiptCoverage >= 80 ? '#10b981' : receiptCoverage >= 50 ? '#f59e0b' : '#ef4444',
                    }} />
                  </div>
                </div>
                {receiptStats.total > 0 && (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', fontWeight: 600 }}>OCR Verified</span>
                      <span style={{ fontSize: '0.82rem', color: 'var(--text-primary)', fontWeight: 700 }}>{receiptStats.verified} / {receiptStats.total}</span>
                    </div>
                    <div style={{ height: 8, borderRadius: 4, background: 'var(--border)', overflow: 'hidden' }}>
                      <div style={{
                        height: '100%', borderRadius: 4, width: `${Math.round((receiptStats.verified / receiptStats.total) * 100)}%`, transition: 'width 0.6s ease',
                        background: '#0ea5e9',
                      }} />
                    </div>
                  </div>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '4px' }}>
                  <div style={{ padding: '12px', borderRadius: 'var(--radius-control)', background: '#10b98112', border: '1px solid #10b98130' }}>
                    <p style={{ margin: 0, fontSize: '0.75rem', color: '#10b981', fontWeight: 600, textTransform: 'uppercase' }}>Verified</p>
                    <p style={{ margin: '4px 0 0', fontSize: '1.3rem', fontWeight: 700, color: '#10b981' }}>{receiptStats.verified}</p>
                  </div>
                  <div style={{ padding: '12px', borderRadius: 'var(--radius-control)', background: '#ef444412', border: '1px solid #ef444430' }}>
                    <p style={{ margin: 0, fontSize: '0.75rem', color: '#ef4444', fontWeight: 600, textTransform: 'uppercase' }}>Unverified</p>
                    <p style={{ margin: '4px 0 0', fontSize: '1.3rem', fontWeight: 700, color: '#ef4444' }}>{receiptStats.total - receiptStats.verified}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-surface)', padding: '24px', boxShadow: 'var(--shadow)', marginBottom: '28px' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <TrendingUp size={16} color="var(--text-secondary)" />
                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)' }}>Financial Summary</h3>
              </div>
              <YearSpinner year={selectedYear} onYearChange={setSelectedYear} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '14px' }}>
              {[
                { label: 'Total Budget', value: currency.format(financials.totalBudget), color: '#6366f1' },
                { label: 'Allocated', value: currency.format(financials.totalApprovedBudget), color: '#0ea5e9' },
                { label: 'Actual Spent', value: currency.format(financials.totalExpenses), color: '#f59e0b' },
                { label: 'Remaining', value: currency.format(Math.max(0, financials.remainingBudget)), color: '#10b981' },
                { label: 'Utilization', value: `${financials.utilization.toFixed(1)}%`, color: '#8b5cf6' },
                { label: 'Projects / Events', value: financials.projectCount, color: '#06b6d4' },
              ].map(({ label, value, color }) => (
                <div key={label} style={{ padding: '16px', borderRadius: 'var(--radius-control)', background: `${color}10`, border: `1px solid ${color}25` }}>
                  <p style={{ margin: 0, fontSize: '0.75rem', color, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px' }}>{label}</p>
                  <p style={{ margin: '6px 0 0', fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>{value}</p>
                </div>
              ))}
            </div>
          </div>

          <div style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-surface)', padding: '24px', boxShadow: 'var(--shadow)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
              <Clock size={16} color="var(--text-secondary)" />
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)' }}>Recently Generated Documents</h3>
            </div>
            {recentDocs.length === 0
              ? <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem' }}>No documents have been generated yet.</p>
              : <div>{recentDocs.map(doc => <RecentDocRow key={doc.id} doc={doc} />)}</div>
            }
          </div>

          <div style={{ marginTop: '20px' }}>
            <ReportSummaryNote variant="dashboard" />
          </div>
        </>
      )}
    </section>
  )
}
