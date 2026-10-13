import { useEffect, useMemo, useState } from 'react'
import { FileText, Filter, Loader, Calendar, Layers, Sparkles, ArrowLeft } from 'lucide-react'
import { useBudget } from '../../context/BudgetContext'
import { useAuth } from '../../context/AuthContext'
import { useDocuments } from '../../context/DocumentContext'
import { supabase } from '../../supabase/supabaseClient'
import { calculateProjectEventFinancials, isApprovedBudgetRecord } from '../../utils/projectEventFinancials'
import { monthOptions, MONTHS_FULL } from '../../utils/analytics'
import FullSummaryReportPreview from '../../components/documents/FullSummaryReportPreview'

const RECEIPTS_BUCKET = 'receipts'

const QUARTER_MONTH_RANGES = {
  '1': [1, 2, 3],
  '2': [4, 5, 6],
  '3': [7, 8, 9],
  '4': [10, 11, 12],
}

function getRecordPeriod(record) {
  const raw = record.eventDate || record.date || record.approvedAt || record.submittedAt
  if (raw) {
    const d = new Date(raw)
    if (!isNaN(d.getTime())) return { month: d.getMonth() + 1, year: d.getFullYear() }
  }
  return { month: record.month || null, year: record.year || null }
}

export default function FullSummaryReportPanel({ onBack }) {
  const { role, profileName } = useAuth()
  const { addDocument } = useDocuments()
  const { expenses, verifiedReceiptTotals } = useBudget()

  // Filters
  const currentYear = new Date().getFullYear()
  const [filterType, setFilterType] = useState('all') // 'all' | 'Project' | 'Event'
  const [filterYear, setFilterYear] = useState(String(currentYear))
  const [filterQuarter, setFilterQuarter] = useState('all')
  const [filterMonth, setFilterMonth] = useState('all')

  // UI state
  const [isGenerating, setIsGenerating] = useState(false)
  const [reportData, setReportData] = useState(null) // { records, receiptLinks, filters }
  const [error, setError] = useState('')

  const canGenerate = ['SK Chairman', 'SK Treasurer', 'SK Kagawad', 'Barangay Treasurer'].includes(role)

  // Build year options from expenses
  const availableYears = useMemo(() => {
    const set = new Set()
    expenses.forEach(e => {
      const { year } = getRecordPeriod(e)
      if (year) set.add(year)
    })
    const sorted = Array.from(set).sort((a, b) => b - a)
    if (!sorted.includes(currentYear)) sorted.unshift(currentYear)
    return sorted
  }, [expenses, currentYear])

  // Get approved base records (non-additional, Project/Event only)
  const approvedRecords = useMemo(() =>
    expenses.filter(e => isApprovedBudgetRecord(e) && ['Project', 'Event'].includes(e.type || 'Project')),
    [expenses]
  )

  // Reset quarter/month when year changes
  useEffect(() => {
    setFilterQuarter('all')
    setFilterMonth('all')
  }, [filterYear])

  // Reset month when quarter changes to a specific one
  useEffect(() => {
    if (filterQuarter !== 'all') setFilterMonth('all')
  }, [filterQuarter])

  // Reset quarter when month is set
  useEffect(() => {
    if (filterMonth !== 'all') setFilterQuarter('all')
  }, [filterMonth])

  // All approved projects and events matching the filters
  const periodRecords = useMemo(() => {
    return approvedRecords.filter(r => {
      if (filterType !== 'all' && (r.type || 'Project') !== filterType) return false
      const { year, month } = getRecordPeriod(r)
      if (filterYear !== 'all' && year !== Number(filterYear)) return false
      if (filterQuarter !== 'all') {
        const months = QUARTER_MONTH_RANGES[filterQuarter] || []
        if (!months.includes(month)) return false
      }
      if (filterMonth !== 'all' && month !== Number(filterMonth)) return false
      return true
    })
  }, [approvedRecords, filterType, filterYear, filterQuarter, filterMonth])

  async function handleGenerate() {
    if (!canGenerate) return
    setIsGenerating(true)
    setError('')

    try {
      // Consolidates all approved Projects and Events matching the selected filters
      const records = periodRecords

      if (records.length === 0) {
        setError('No approved Projects or Events match the selected filters.')
        setIsGenerating(false)
        return
      }

      // Calculate financials for each record
      const recordsWithFinancials = records.map(record => ({
        ...record,
        _financials: calculateProjectEventFinancials(record, expenses, verifiedReceiptTotals),
        _documents: [],
      }))

      // Fetch generated documents for all records
      const recordIds = recordsWithFinancials.map(r => String(r.id))
      const requestIds = recordsWithFinancials.map(r => r.requestId).filter(Boolean).map(String)
      const allEntityIds = [...new Set([...recordIds, ...requestIds])]

      let docsData = []
      if (allEntityIds.length > 0) {
        const { data, error: docsError } = await supabase
          .from('documents')
          .select('id, name, type, generated_by, date_generated, related_entity_id, data')
          .in('related_entity_id', allEntityIds)
          .is('archived_at', null)
          .neq('type', 'Annual Report')
          .order('date_generated', { ascending: true })

        if (!docsError && data) docsData = data
      }

      // Map docs back to records
      const docsById = {}
      docsData.forEach(doc => {
        const eid = String(doc.related_entity_id)
        if (!docsById[eid]) docsById[eid] = []
        docsById[eid].push({
          id: doc.id,
          name: doc.name,
          type: doc.type,
          generatedBy: doc.generated_by,
          dateGenerated: doc.date_generated,
        })
      })

      recordsWithFinancials.forEach(r => {
        r._documents = [
          ...(docsById[String(r.id)] || []),
          ...(r.requestId ? (docsById[String(r.requestId)] || []) : []),
        ]
        // Deduplicate
        const seen = new Set()
        r._documents = r._documents.filter(d => {
          if (seen.has(d.id)) return false
          seen.add(d.id)
          return true
        })
      })

      // Fetch receipts for all records
      let receiptRows = []
      if (recordIds.length > 0) {
        const scanAware = await supabase
          .from('receipt_records')
          .select('id, record_id, requisition_id, file_path, original_path, is_scanned, ocr_metadata, ocr_verified_at, ocr_verified_by, file_name, file_type, uploaded_at')
          .in('record_id', recordIds)
          .order('uploaded_at', { ascending: true })

        if (!scanAware.error && scanAware.data) {
          receiptRows = scanAware.data
        } else {
          const legacy = await supabase
            .from('receipt_records')
            .select('id, record_id, file_path, file_name, file_type, uploaded_at')
            .in('record_id', recordIds)
            .order('uploaded_at', { ascending: true })
          if (!legacy.error && legacy.data) receiptRows = legacy.data
        }
      }

      // Build signed URLs for receipts
      const receiptLinks = {}
      await Promise.all(receiptRows.map(async (receipt) => {
        const { data } = await supabase.storage
          .from(RECEIPTS_BUCKET)
          .createSignedUrl(receipt.file_path, 60 * 60)

        if (data?.signedUrl) {
          const key = String(receipt.record_id)
          if (!receiptLinks[key]) receiptLinks[key] = []
          receiptLinks[key].push({
            id: receipt.id,
            url: data.signedUrl,
            path: receipt.file_path,
            name: receipt.file_name || 'Receipt',
            type: receipt.file_type,
            isScanned: Boolean(receipt.is_scanned),
            ocrMetadata: receipt.ocr_metadata || null,
            ocrVerifiedAt: receipt.ocr_verified_at || null,
            ocrVerifiedBy: receipt.ocr_verified_by || null,
            uploadedAt: receipt.uploaded_at || null,
            requisitionId: receipt.requisition_id || null,
          })
        }
      }))

      setReportData({
        records: recordsWithFinancials,
        receiptLinks,
        filters: {
          type: filterType,
          year: filterYear,
          quarter: filterQuarter,
          month: filterMonth,
        },
      })
    } catch (err) {
      console.error('Failed to generate Full Summary Report:', err)
      setError('Failed to generate report. Please try again.')
    } finally {
      setIsGenerating(false)
    }
  }

  // Build filter description
  function buildFilterDescription() {
    const parts = []
    if (filterType === 'Project') parts.push('Projects Only')
    else if (filterType === 'Event') parts.push('Events Only')
    else parts.push('All Projects & Events')

    if (filterYear !== 'all') parts.push(filterYear)
    if (filterQuarter !== 'all') parts.push(`Q${filterQuarter}`)
    if (filterMonth !== 'all') parts.push(MONTHS_FULL[Number(filterMonth) - 1])
    return parts.join(' · ')
  }

  async function handleSaveReport(previewData) {
    if (!previewData) return

    const selectedYear = filterYear !== 'all' ? filterYear : String(currentYear)
    const filterDesc = buildFilterDescription()
    const docName = `Full Summary Report — ${filterDesc}`

    // Count existing Full Summary Reports with similar filter/year for clean versioning
    let version = 1
    const { count } = await supabase
      .from('documents')
      .select('id', { count: 'exact', head: true })
      .eq('type', 'Full Summary Report')
      .eq('name', docName)
    if (count) version = count + 1

    const finalName = version > 1 ? `${docName} (v${version})` : docName

    await addDocument({
      name: finalName,
      project: filterType !== 'all' ? filterType : 'All Projects & Events',
      generatedBy: profileName || role,
      type: 'Full Summary Report',
      data: {
        type: 'full_summary',
        filters: previewData.filters,
        records: previewData.records,
        receiptLinks: previewData.receiptLinks,
        generatedAt: previewData.generatedAt,
      },
      relatedEntityType: 'reporting_period',
      relatedEntityId: selectedYear,
    })
  }

  if (reportData) {
    return (

        <FullSummaryReportPreview
          records={reportData.records}
          receiptLinks={reportData.receiptLinks}
          filters={reportData.filters}
          onSave={handleSaveReport}
          onClose={() => setReportData(null)}
        />

    )
  }

  return (
    <section className="dashboard-content">
      {/* Back nav */}
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px',
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--text-secondary)', fontSize: '0.88rem',
            padding: '0 0 20px', fontWeight: 500,
          }}
        >
          <ArrowLeft size={15} />
          Back to Documents
        </button>
      )}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '28px', gap: '16px', flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: '0 0 6px', fontSize: '1.4rem', color: 'var(--text-primary)' }}>Full Summary Report</h2>
          <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem', maxWidth: '580px' }}>
            Generate a comprehensive report consolidating all approved Projects and Events — including financial summaries, generated documents, and uploaded receipts — for a selected reporting period.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: '5px',
            padding: '4px 12px', borderRadius: '999px',
            backgroundColor: 'var(--accent-light, #dcfce7)', color: 'var(--accent, #1a5c3a)',
            fontSize: '0.78rem', fontWeight: 600, border: '1px solid var(--accent-border, #bbf7d0)',
          }}>
            <Sparkles size={12} />
            Consolidated Report
          </span>
        </div>
      </div>

      {/* Filter Panel */}
      <div style={{
        backgroundColor: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-surface)',
        boxShadow: 'var(--shadow)',
        overflow: 'hidden',
        marginBottom: '24px',
      }}>
        {/* Filter header */}
        <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Filter size={18} style={{ color: 'var(--text-secondary)' }} />
          <div>
            <h3 style={{ margin: 0, fontSize: '1.05rem', color: 'var(--text-primary)', fontWeight: 600 }}>Report Filters</h3>
            <p style={{ margin: '2px 0 0', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
              Choose whether to include Projects, Events, or both, and select your reporting period.
            </p>
          </div>
        </div>

        <div style={{ padding: '24px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
          {/* Type / Category Filter */}
          <div>
            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '6px' }}>
              <Layers size={12} style={{ display: 'inline', marginRight: '4px' }} />
              Projects & Events
            </label>
            <select
              id="fsr-filter-type"
              value={filterType}
              onChange={e => setFilterType(e.target.value)}
              style={{ width: '100%', padding: '9px 12px', borderRadius: 'var(--radius-control)', border: '1px solid var(--border)', fontSize: '0.92rem', backgroundColor: 'var(--surface)', color: 'var(--text-primary)' }}
            >
              <option value="all">All Projects & Events</option>
              <option value="Project">Projects Only</option>
              <option value="Event">Events Only</option>
            </select>
          </div>

          {/* Year */}
          <div>
            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '6px' }}>
              <Calendar size={12} style={{ display: 'inline', marginRight: '4px' }} />
              Year
            </label>
            <select
              id="fsr-filter-year"
              value={filterYear}
              onChange={e => setFilterYear(e.target.value)}
              style={{ width: '100%', padding: '9px 12px', borderRadius: 'var(--radius-control)', border: '1px solid var(--border)', fontSize: '0.92rem', backgroundColor: 'var(--surface)', color: 'var(--text-primary)' }}
            >
              <option value="all">All Years</option>
              {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>

          {/* Quarter */}
          <div>
            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '6px' }}>
              Quarter
            </label>
            <select
              id="fsr-filter-quarter"
              value={filterQuarter}
              onChange={e => setFilterQuarter(e.target.value)}
              style={{ width: '100%', padding: '9px 12px', borderRadius: 'var(--radius-control)', border: '1px solid var(--border)', fontSize: '0.92rem', backgroundColor: 'var(--surface)', color: 'var(--text-primary)' }}
            >
              <option value="all">All Quarters</option>
              <option value="1">Q1 (Jan – Mar)</option>
              <option value="2">Q2 (Apr – Jun)</option>
              <option value="3">Q3 (Jul – Sep)</option>
              <option value="4">Q4 (Oct – Dec)</option>
            </select>
          </div>

          {/* Month */}
          <div>
            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '6px' }}>
              Month
            </label>
            <select
              id="fsr-filter-month"
              value={filterMonth}
              onChange={e => setFilterMonth(e.target.value)}
              style={{ width: '100%', padding: '9px 12px', borderRadius: 'var(--radius-control)', border: '1px solid var(--border)', fontSize: '0.92rem', backgroundColor: 'var(--surface)', color: 'var(--text-primary)' }}
            >
              <option value="all">All Months</option>
              {monthOptions.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>
        </div>

        {/* Filter summary + action */}
        <div style={{
          padding: '16px 24px',
          borderTop: '1px solid var(--border)',
          backgroundColor: 'var(--surface-2, #f8fafc)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '16px',
          flexWrap: 'wrap',
        }}>
          <div>
            <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
              Filters: <strong style={{ color: 'var(--text-primary)' }}>{buildFilterDescription()}</strong>
            </p>
            <p style={{ margin: '2px 0 0', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
              {periodRecords.length} approved {filterType === 'Project' ? 'project' : filterType === 'Event' ? 'event' : 'record'}{periodRecords.length === 1 ? '' : 's'} will be included.
            </p>
          </div>
          {canGenerate && (
            <button
              id="fsr-generate-btn"
              type="button"
              className="primary-button"
              disabled={isGenerating}
              onClick={handleGenerate}
              style={{ minWidth: '200px', justifyContent: 'center' }}
            >
              {isGenerating ? (
                <>
                  <Loader size={15} style={{ animation: 'spin 1s linear infinite' }} />
                  Generating Report…
                </>
              ) : (
                <>
                  <FileText size={15} />
                  Generate Full Summary Report
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div style={{
          padding: '14px 20px',
          backgroundColor: '#fef2f2',
          border: '1px solid #fecaca',
          borderRadius: 'var(--radius-surface)',
          color: '#dc2626',
          fontSize: '0.9rem',
          marginBottom: '20px',
        }}>
          {error}
        </div>
      )}

      {/* Info cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '16px' }}>
        {[
          {
            icon: '📋',
            title: 'General Information',
            desc: 'Name, category, status, date conducted, venue, and responsible officer for each Project and Event.',
          },
          {
            icon: '💰',
            title: 'Financial Summary',
            desc: 'Approved budget, actual expenses, remaining balance, budget utilization, and returned budget per record.',
          },
          {
            icon: '📄',
            title: 'Generated Documents',
            desc: 'All documents linked to each record: Purchase Requests, DVs, Itineraries, Transmittal Letters, and more.',
          },
          {
            icon: '🧾',
            title: 'Uploaded Receipts',
            desc: 'All receipts per record with vendor, date, amount, and OCR verification status.',
          },
        ].map(({ icon, title, desc }) => (
          <div key={title} style={{
            backgroundColor: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-surface)',
            padding: '20px',
            boxShadow: 'var(--shadow)',
          }}>
            <div style={{ fontSize: '1.6rem', marginBottom: '10px' }}>{icon}</div>
            <h4 style={{ margin: '0 0 6px', fontSize: '0.97rem', color: 'var(--text-primary)', fontWeight: 600 }}>{title}</h4>
            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: '1.5' }}>{desc}</p>
          </div>
        ))}
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </section>
  )
}
