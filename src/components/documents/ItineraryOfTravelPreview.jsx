import { useState } from 'react'
import '../PrintPreview.css'
import './AdditionalDocuments.css'

const currency = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  maximumFractionDigits: 2,
})

function formatDateLocal(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  if (Number.isNaN(d.getTime())) return dateStr
  return d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })
}

function formatTime(timeStr) {
  if (!timeStr) return ''
  const [h, m] = timeStr.split(':')
  const hour = Number(h)
  const ampm = hour >= 12 ? 'PM' : 'AM'
  const displayHour = hour % 12 || 12
  return `${displayHour}:${m} ${ampm}`
}

const MIN_ROWS = 6

function ItineraryOfTravelPreview({ data, onClose, onSave }) {
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const {
    itineraryNumber,
    travelerName,
    position,
    officialStation,
    travelStart,
    travelEnd,
    purpose,
    rows,
    grandTotal,
    approvedBy,
    immediateSupervisor,
  } = data

  const paddedRows = [...rows]
  while (paddedRows.length < MIN_ROWS) {
    paddedRows.push({
      date: '',
      destination: '',
      departure: '',
      arrival: '',
      transportation: '',
      perDiem: '',
      others: '',
      total: '',
    })
  }

  async function handlePrint(e) {
    e.preventDefault()
    if (onSave) {
      setIsSaving(true)
      setSaveError('')
      try {
        await onSave()
        setTimeout(() => window.print(), 500)
      } catch (err) {
        setSaveError('Failed to save document record: ' + err.message)
      } finally {
        setIsSaving(false)
      }
    } else {
      window.print()
    }
  }

  return (
    <div className="print-preview-overlay">
      <div className="print-preview-container">
        <div className="print-preview-toolbar">
          {saveError && <span style={{ color: '#ef4444', marginRight: '16px', fontSize: '0.9rem' }}>{saveError}</span>}
          <button type="button" className="close-btn" onClick={onClose} disabled={isSaving}>
            Close
          </button>
          <button type="button" className="print-btn" onClick={handlePrint} disabled={isSaving}>
            {isSaving ? 'Saving...' : 'Print / Save as PDF'}
          </button>
        </div>

        <div className="print-page">
          {/* Top-right labels */}
          <div className="itinerary-top-labels">
            <p style={{ margin: 0, fontStyle: 'italic' }}>SK copy</p>
            <p style={{ margin: 0 }}>Appendix 46</p>
          </div>

          {/* Letterhead */}
          <div className="gov-letterhead">
            <p className="gov-line">Republic of the Philippines</p>
            <p className="gov-line">Province of Cotabato</p>
            <p className="gov-line">Municipality of Midsayap</p>
            <p className="gov-line-bold">BARANGAY UPPER GLAD II</p>
          </div>

          {/* Title */}
          <div className="doc-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Itinerary of Travel</span>
            <span style={{ fontSize: '12px', fontWeight: 400, letterSpacing: 0 }}>
              No: {itineraryNumber}
            </span>
          </div>

          {/* Info grid */}
          <div className="itinerary-info-grid">
            <div>
              <div className="doc-info-row">
                <span className="doc-info-label">Name:</span>
                <span className="doc-info-value">{travelerName}</span>
              </div>
              <div className="doc-info-row">
                <span className="doc-info-label">Position:</span>
                <span className="doc-info-value">{position}</span>
              </div>
              <div className="doc-info-row">
                <span className="doc-info-label">Official Station:</span>
                <span className="doc-info-value">{officialStation}</span>
              </div>
            </div>
            <div>
              <div className="doc-info-row">
                <span className="doc-info-label">Date of Travel:</span>
                <span className="doc-info-value">
                  {formatDateLocal(travelStart)} - {formatDateLocal(travelEnd)}
                </span>
              </div>
              <div className="doc-info-row">
                <span className="doc-info-label">Purpose of Travel:</span>
                <span className="doc-info-value">{purpose}</span>
              </div>
            </div>
          </div>

          {/* Travel table */}
          <table className="doc-table">
            <thead>
              <tr>
                <th style={{ width: '70px' }}>Date</th>
                <th>Places to be visited (Destination)</th>
                <th colSpan={2}>TIME</th>
                <th style={{ width: '90px' }}>Means of Transportation</th>
                <th style={{ width: '70px' }}>Per Diem</th>
                <th style={{ width: '60px' }}>Others</th>
                <th style={{ width: '90px' }}>Total Amount</th>
              </tr>
              <tr>
                <th></th>
                <th></th>
                <th style={{ width: '60px' }}>Departure</th>
                <th style={{ width: '60px' }}>Arrival</th>
                <th></th>
                <th></th>
                <th></th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {paddedRows.map((row, idx) => {
                const hasData = row.destination || row.date
                return (
                  <tr key={idx} className={hasData ? '' : 'empty-row'}>
                    <td>{hasData ? formatDateLocal(row.date) : ''}</td>
                    <td className="text-left">{row.destination || ''}</td>
                    <td>{hasData ? formatTime(row.departure) : ''}</td>
                    <td>{hasData ? formatTime(row.arrival) : ''}</td>
                    <td>{row.transportation || ''}</td>
                    <td className="text-right">
                      {hasData && Number(row.perDiem) ? currency.format(Number(row.perDiem)) : ''}
                    </td>
                    <td className="text-right">
                      {hasData && Number(row.others) ? currency.format(Number(row.others)) : ''}
                    </td>
                    <td className="text-right">
                      {hasData && Number(row.total) ? currency.format(Number(row.total)) : ''}
                    </td>
                  </tr>
                )
              })}
              {/* Total row */}
              <tr style={{ fontWeight: 700 }}>
                <td colSpan={7} style={{ textAlign: 'right' }}>
                  TOTAL
                </td>
                <td className="text-right">{currency.format(grandTotal)}</td>
              </tr>
            </tbody>
          </table>

          {/* Signatures */}
          <div className="itinerary-signatures">
            <div className="itinerary-sig-block">
              <div className="itinerary-sig-title">Prepared by:</div>
              <div className="itinerary-sig-name">{travelerName || '___________'}</div>
              <div className="itinerary-sig-line">Signature over Printed Name</div>
            </div>
            <div className="itinerary-sig-block">
              <div className="itinerary-sig-title">Approved by:</div>
              <div className="itinerary-sig-name">{approvedBy || '___________'}</div>
              <div className="itinerary-sig-line">Signature over Printed Name</div>
              <div className="itinerary-sig-role">Punong Barangay</div>
            </div>
          </div>

          {/* Certification */}
          <div className="itinerary-cert-box">
            <p style={{ margin: 0 }}>
              I certify that: (1) I have reviewed the foregoing itinerary, (2) the travel is
              necessary to the service, (3) the period covered is reasonable and (4) the expenses
              claimed are proper.
            </p>
          </div>

          <div className="itinerary-supervisor">
            <div style={{ marginTop: '28px', borderTop: '1px solid #000', display: 'inline-block', paddingTop: '4px', minWidth: '200px' }}>
              <div style={{ fontWeight: 700, textTransform: 'uppercase' }}>
                {immediateSupervisor || '___________'}
              </div>
            </div>
            <div style={{ fontStyle: 'italic', fontSize: '10px' }}>
              Signature over Printed Name
            </div>
            <div style={{ fontSize: '11px' }}>Immediate Supervisor</div>
          </div>

          <p style={{ fontSize: '10px', marginTop: '16px', fontStyle: 'italic', color: '#666' }}>
            Note:
          </p>
        </div>
      </div>
    </div>
  )
}

export default ItineraryOfTravelPreview
