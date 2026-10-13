import { useState } from 'react'
import { X, Printer } from 'lucide-react'
import { getReceiptDisplayName } from '../../utils/uploadUtils'

const php = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', minimumFractionDigits: 2 })
const pct = (val) => `${Number(val || 0).toFixed(1)}%`

const MONTH_LABELS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function SectionHeader({ children }) {
  return (
    <div className="fsr-section-header" style={{
      backgroundColor: '#1a5c3a',
      color: '#ffffff',
      padding: '8px 16px',
      fontSize: '0.82rem',
      fontWeight: 700,
      textTransform: 'uppercase',
      letterSpacing: '0.5px',
      marginTop: '20px',
      borderRadius: '4px',
    }}>
      {children}
    </div>
  )
}

function InfoGrid({ items }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
      gap: '10px 20px',
      padding: '12px 0',
    }}>
      {items.map(({ label, value }) => (
        <div key={label}>
          <p style={{ margin: 0, fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.4px', fontWeight: 600 }}>{label}</p>
          <p style={{ margin: '2px 0 0', fontSize: '0.92rem', color: '#1e293b', fontWeight: 500 }}>{value || '—'}</p>
        </div>
      ))}
    </div>
  )
}

function FinancialRow({ label, value, isLast }) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '6px 0',
      borderBottom: isLast ? 'none' : '1px solid #f1f5f9',
    }}>
      <span style={{ fontSize: '0.86rem', color: '#334155' }}>{label}</span>
      <span style={{ fontSize: '0.86rem', fontFamily: 'monospace', color: '#1e293b', fontWeight: 500 }}>{value}</span>
    </div>
  )
}

function RecordSection({ record, index, receiptLinks }) {
  const financials = record._financials || {}
  const docs = record._documents || []
  const receipts = receiptLinks[String(record.id)] || []

  const dateConducted = (record.eventDate || record.date)
    ? new Date(record.eventDate || record.date).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })
    : '—'

  return (
    <div className="fsr-record-card" style={{
      marginBottom: '32px',
      border: '1px solid #e2e8f0',
      borderRadius: '8px',
      overflow: 'hidden',
      pageBreakInside: 'avoid',
    }}>
      {/* Record Title Bar */}
      <div className="fsr-record-header" style={{
        backgroundColor: '#f8fafc',
        borderBottom: '2px solid #1a5c3a',
        padding: '12px 20px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '12px',
        flexWrap: 'wrap',
      }}>
        <div>
          <p style={{ margin: 0, fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>
            {record.type} #{index + 1}
          </p>
          <h3 style={{ margin: '3px 0 0', fontSize: '1.05rem', color: '#1e293b', fontWeight: 700 }}>
            {record.event || record.project || 'Untitled'}
          </h3>
        </div>
        <span style={{
          display: 'inline-block',
          padding: '3px 10px',
          borderRadius: '999px',
          fontSize: '0.75rem',
          fontWeight: 600,
          backgroundColor: record.projectStatus === 'Completed' ? '#dcfce7' : '#fef9c3',
          color: record.projectStatus === 'Completed' ? '#166534' : '#854d0e',
          border: `1px solid ${record.projectStatus === 'Completed' ? '#bbf7d0' : '#fde68a'}`,
        }}>
          {record.projectStatus || record.status || 'Approved'}
        </span>
      </div>

      <div style={{ padding: '4px 20px 16px' }}>
        {/* General Information */}
        <SectionHeader>General Information</SectionHeader>
        <InfoGrid items={[
          { label: 'Category', value: record.category },
          { label: 'Date Conducted', value: dateConducted },
          { label: 'Venue', value: record.venue },
          { label: 'Responsible Officer', value: record.requestedBy },
          { label: 'Description', value: record.description },
        ]} />

        {/* Financial Summary */}
        <SectionHeader>Financial Summary</SectionHeader>
        <div style={{ padding: '10px 0', maxWidth: '400px' }}>
          <FinancialRow label="Approved Budget" value={php.format(financials.approvedBudget || 0)} />
          <FinancialRow label="Total Actual Expenses" value={php.format(financials.totalExpenses || 0)} />
          <FinancialRow label="Remaining Balance" value={php.format(financials.remainingBudget || 0)} />
          <FinancialRow label="Budget Utilization" value={pct(financials.utilization)} />
          {record.returnedBudget > 0 && (
            <FinancialRow label="Returned Budget" value={php.format(record.returnedBudget)} />
          )}
          <FinancialRow
            label="Expense Source"
            value={financials.source === 'verified-receipts' ? 'Verified Receipts' : 'No verified receipts'}
            isLast
          />
        </div>

        {/* Generated Documents */}
        <SectionHeader>Generated Documents</SectionHeader>
        {docs.length === 0 ? (
          <p style={{ margin: '10px 0', fontSize: '0.85rem', color: '#94a3b8', fontStyle: 'italic' }}>
            No documents generated for this record.
          </p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '10px', fontSize: '0.83rem' }}>
            <thead>
              <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                {['Document Type', 'Document Name', 'Generated By', 'Date'].map(h => (
                  <th key={h} style={{ padding: '7px 10px', textAlign: 'left', color: '#64748b', textTransform: 'uppercase', fontSize: '0.68rem', fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {docs.map((doc) => (
                <tr key={doc.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '7px 10px', color: '#475569' }}>{doc.type}</td>
                  <td style={{ padding: '7px 10px', color: '#1e293b', fontWeight: 500 }}>{doc.name}</td>
                  <td style={{ padding: '7px 10px', color: '#475569' }}>{doc.generatedBy || doc.generated_by || '—'}</td>
                  <td style={{ padding: '7px 10px', color: '#475569' }}>
                    {(doc.dateGenerated || doc.date_generated)
                      ? new Date(doc.dateGenerated || doc.date_generated).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Uploaded Receipts */}
        <SectionHeader>Uploaded Receipts</SectionHeader>
        {receipts.length === 0 ? (
          <p style={{ margin: '10px 0', fontSize: '0.85rem', color: '#94a3b8', fontStyle: 'italic' }}>
            No receipts uploaded for this record.
          </p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '10px', fontSize: '0.83rem' }}>
            <thead>
              <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                {['Receipt / File', 'Vendor / Store', 'Date', 'Amount', 'OCR Status'].map(h => (
                  <th key={h} style={{ padding: '7px 10px', textAlign: 'left', color: '#64748b', textTransform: 'uppercase', fontSize: '0.68rem', fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {receipts.map((receipt, i) => {
                const ocr = receipt.ocrMetadata || {}
                const displayName = getReceiptDisplayName(receipt, record, i, receipts.length)
                return (
                  <tr key={receipt.id || i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '7px 10px', color: '#1e293b' }}>{displayName}</td>
                    <td style={{ padding: '7px 10px', color: '#475569' }}>{ocr.vendor || ocr.store || ocr.merchant || '—'}</td>
                    <td style={{ padding: '7px 10px', color: '#475569' }}>
                      {ocr.date || (receipt.uploadedAt ? new Date(receipt.uploadedAt).toLocaleDateString('en-PH') : '—')}
                    </td>
                    <td style={{ padding: '7px 10px', color: '#1e293b', fontFamily: 'monospace' }}>
                      {ocr.totalAmount ? php.format(ocr.totalAmount) : '—'}
                    </td>
                    <td style={{ padding: '7px 10px' }}>
                      <span style={{
                        display: 'inline-block',
                        padding: '2px 8px',
                        borderRadius: '999px',
                        fontSize: '0.7rem',
                        fontWeight: 600,
                        backgroundColor: receipt.ocrVerifiedAt ? '#dcfce7' : '#f1f5f9',
                        color: receipt.ocrVerifiedAt ? '#166534' : '#64748b',
                      }}>
                        {receipt.ocrVerifiedAt ? 'Verified' : 'Unverified'}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

export default function FullSummaryReportPreview({ records = [], receiptLinks = {}, filters = {}, onClose, onSave }) {
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const now = new Date()

  async function handlePrint(e) {
    if (e) e.preventDefault()
    if (onSave) {
      setIsSaving(true)
      setSaveError('')
      try {
        await onSave({
          records,
          receiptLinks,
          filters,
          generatedAt: now.toISOString(),
        })

      } catch (err) {
        console.error('Failed to save Full Summary Report record:', err)
        setSaveError('Failed to save document record: ' + (err.message || 'Unknown error'))

      } finally {
        setIsSaving(false)
      }
      setTimeout(() => window.print(), 350)
    } else {
      window.print()
    }
  }

  function buildFilterLabel() {
    const parts = []
    if (filters.type === 'Project') parts.push('Projects Only')
    else if (filters.type === 'Event') parts.push('Events Only')
    else parts.push('Projects & Events')

    if (filters.year && filters.year !== 'all') parts.push(filters.year)
    if (filters.quarter && filters.quarter !== 'all') parts.push(`Q${filters.quarter}`)
    if (filters.month && filters.month !== 'all') parts.push(MONTH_LABELS[Number(filters.month) - 1])
    return parts.join(' · ')
  }

  const projects = records.filter(r => r.type === 'Project')
  const events = records.filter(r => r.type === 'Event')
  const totalBudget = records.reduce((s, r) => s + (r._financials?.approvedBudget || 0), 0)
  const totalExpenses = records.reduce((s, r) => s + (r._financials?.totalExpenses || 0), 0)
  const totalReceipts = records.reduce((s, r) => s + (receiptLinks[String(r.id)]?.length || 0), 0)

  return (
    <div className="print-preview-overlay fsr-preview-root">
      {/* Screen toolbar — hidden during print */}
      <div className="no-print fsr-preview-toolbar" style={{
        position: 'fixed',
        top: 0, left: 0, right: 0,
        zIndex: 1000,
        backgroundColor: '#1a5c3a',
        color: 'white',
        padding: '12px 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '16px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
      }}>
        <div>
          <p style={{ margin: 0, fontSize: '0.72rem', opacity: 0.75, letterSpacing: '0.5px', textTransform: 'uppercase' }}>Full Summary Report</p>
          <p style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>{buildFilterLabel()}</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {saveError && (
            <span style={{ color: '#fca5a5', fontSize: '0.82rem', fontWeight: 500, marginRight: '8px' }}>
              {saveError}
            </span>
          )}
          <button
            type="button"
            onClick={handlePrint}
            disabled={isSaving}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '8px 18px', borderRadius: '6px',
              backgroundColor: 'white', color: '#1a5c3a',
              border: 'none', cursor: isSaving ? 'not-allowed' : 'pointer',
              fontWeight: 600, fontSize: '0.88rem',
              opacity: isSaving ? 0.7 : 1,
            }}
          >
            <Printer size={14} />
            {isSaving ? 'Saving & Printing…' : 'Print / Export PDF'}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '8px 14px', borderRadius: '6px',
              backgroundColor: 'rgba(255,255,255,0.15)', color: 'white',
              border: '1px solid rgba(255,255,255,0.3)', cursor: isSaving ? 'not-allowed' : 'pointer',
              fontWeight: 500, fontSize: '0.88rem',
            }}
          >
            <X size={14} />
            Close
          </button>
        </div>
      </div>

      {/* Printable Report Body */}
      <div className="fsr-report-wrapper" style={{ paddingTop: '64px', minHeight: '100vh', backgroundColor: '#f1f5f9' }}>
        <div className="fsr-report-page" style={{
          maxWidth: '920px',
          margin: '0 auto',
          padding: '32px 24px 80px',
          backgroundColor: 'white',
          boxShadow: '0 0 0 1px #e2e8f0',
          minHeight: 'calc(100vh - 64px)',
        }}>
          {/* Report Header */}
          <div style={{ textAlign: 'center', marginBottom: '28px', paddingBottom: '20px', borderBottom: '2px solid #1a5c3a' }}>
            <p style={{ margin: '0 0 4px', fontSize: '0.72rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 600 }}>
              Sangguniang Kabataan — Cuenta
            </p>
            <h1 style={{ margin: '0 0 6px', fontSize: '1.7rem', color: '#1a5c3a', fontWeight: 800 }}>
              Full Summary Report
            </h1>
            <p style={{ margin: 0, fontSize: '0.97rem', color: '#475569', fontWeight: 500 }}>
              {buildFilterLabel()}
            </p>
            <p style={{ margin: '6px 0 0', fontSize: '0.78rem', color: '#94a3b8' }}>
              Generated {now.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })} at {now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>

          {/* Overview Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px', marginBottom: '28px' }}>
            {[
              { label: 'Total Records', value: records.length },
              { label: 'Projects', value: projects.length },
              { label: 'Events', value: events.length },
              { label: 'Total Budget', value: php.format(totalBudget) },
              { label: 'Total Expenses', value: php.format(totalExpenses) },
              { label: 'Total Receipts', value: totalReceipts },
            ].map(({ label, value }) => (
              <div key={label} style={{
                backgroundColor: '#f8fafc', padding: '14px', borderRadius: '8px',
                border: '1px solid #e2e8f0', textAlign: 'center',
              }}>
                <p style={{ margin: 0, fontSize: '0.68rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.4px', fontWeight: 600 }}>{label}</p>
                <p style={{ margin: '4px 0 0', fontSize: '1.15rem', color: '#1a5c3a', fontWeight: 800 }}>{value}</p>
              </div>
            ))}
          </div>

          {records.length === 0 && (
            <div style={{ textAlign: 'center', padding: '60px 24px', color: '#94a3b8' }}>
              <p style={{ fontSize: '1rem', margin: 0 }}>No approved records match the selected filters.</p>
            </div>
          )}

          {/* Projects */}
          {projects.length > 0 && (
            <>
              <div style={{ margin: '28px 0 14px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '4px', height: '24px', backgroundColor: '#1a5c3a', borderRadius: '2px' }} />
                <h2 style={{ margin: 0, fontSize: '1.15rem', color: '#1e293b', fontWeight: 700 }}>
                  Projects <span style={{ color: '#64748b', fontWeight: 400, fontSize: '0.95rem' }}>({projects.length})</span>
                </h2>
              </div>
              {projects.map((record, idx) => (
                <RecordSection key={record.id} record={record} index={idx} receiptLinks={receiptLinks} />
              ))}
            </>
          )}

          {/* Events */}
          {events.length > 0 && (
            <>
              <div style={{ margin: '28px 0 14px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '4px', height: '24px', backgroundColor: '#0d7a5f', borderRadius: '2px' }} />
                <h2 style={{ margin: 0, fontSize: '1.15rem', color: '#1e293b', fontWeight: 700 }}>
                  Events <span style={{ color: '#64748b', fontWeight: 400, fontSize: '0.95rem' }}>({events.length})</span>
                </h2>
              </div>
              {events.map((record, idx) => (
                <RecordSection key={record.id} record={record} index={idx} receiptLinks={receiptLinks} />
              ))}
            </>
          )}
        </div>
      </div>

      <style>{`
        .fsr-preview-root {
          position: fixed !important;
          inset: 0 !important;
          z-index: 9999 !important;
          background-color: #f1f5f9 !important;
          backdrop-filter: none !important;
          display: block !important;
          overflow-y: auto !important;
          padding: 0 !important;
          margin: 0 !important;
        }

        @media print {
          @page {
            size: portrait;
            margin: 0.5in;
          }

          /* Ensure all container elements stay visible and don't get clipped by fixed or scrolling layouts */
          html, body, #root, .dashboard, .dashboard-shell, .dashboard-layout, .dashboard-main {
            position: static !important;
            overflow: visible !important;
            height: auto !important;
            min-height: auto !important;
            display: block !important;
            padding: 0 !important;
            margin: 0 !important;
            background: white !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          .fsr-preview-root,
          .fsr-preview-root * {
            visibility: visible !important;
          }

          .print-preview-overlay.fsr-preview-root,
          .fsr-preview-root {
            position: static !important;
            inset: auto !important;
            overflow: visible !important;
            height: auto !important;
            min-height: auto !important;
            display: block !important;
            padding: 0 !important;
            margin: 0 !important;
            background: white !important;
          }

          .no-print,
          .fsr-preview-toolbar,
          .dashboard-sidebar,
          .dashboard-mobile-header,
          .dashboard-topbar,
          .sidebar-scrim,
          .chat-widget-fab,
          .chat-widget-panel,
          #cue-chat-fab,
          .mobile-bottom-nav {
            display: none !important;
            visibility: hidden !important;
          }

          .fsr-report-wrapper {
            padding-top: 0 !important;
            background: white !important;
            min-height: auto !important;
            display: block !important;
            overflow: visible !important;
          }

          .fsr-report-page {
            max-width: 100% !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            box-shadow: none !important;
            border: none !important;
            min-height: auto !important;
            display: block !important;
            overflow: visible !important;
          }

          /* Keep record sections nicely formatted across pages */
          .fsr-record-card {
            page-break-inside: auto !important;
            break-inside: auto !important;
            overflow: visible !important;
            margin-bottom: 24px !important;
            border: 1px solid #cbd5e1 !important;
          }

          .fsr-record-header {
            page-break-after: avoid !important;
            break-after: avoid !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          .fsr-section-header {
            page-break-after: avoid !important;
            break-after: avoid !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            background-color: #1a5c3a !important;
            color: #ffffff !important;
          }

          table, tr {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
        }
      `}</style>
    </div>
  )
}
