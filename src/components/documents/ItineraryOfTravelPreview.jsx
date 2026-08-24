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
      transportationCost: '',
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
          <div className="itinerary-top-labels">Appendix 46</div>

          {/* Letterhead */}
          <div className="gov-letterhead" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', marginBottom: '30px' }}>
            <div style={{ textAlign: 'center', lineHeight: '1.3' }}>
              <p className="gov-line" style={{ margin: 0 }}>Republic of the Philippines</p>
              <p className="gov-line" style={{ margin: 0 }}>Province of Cotabato</p>
              <p className="gov-line" style={{ margin: 0 }}>Municipality of Midsayap</p>
              <p className="gov-line-bold" style={{ margin: 0 }}>BARANGAY UPPER GLAD II</p>
            </div>
          </div>

          <div className="itinerary-reference-form">
            <div className="itinerary-reference-title">
              <strong>Itinerary of Travel</strong>
              <span>No: <b>{itineraryNumber}</b></span>
            </div>

            <div className="itinerary-reference-details">
              <div className="itinerary-detail-column">
                <div><span>Name:</span><strong>{travelerName}</strong></div>
                <div><span>Position:</span><strong>{position}</strong></div>
                <div><span>Official Station:</span><strong>{officialStation}</strong></div>
              </div>
              <div className="itinerary-detail-column itinerary-travel-details">
                <div>
                  <span>Date of Travel:</span>
                  <strong>{formatDateLocal(travelStart)} - {formatDateLocal(travelEnd)}</strong>
                </div>
                <div className="itinerary-purpose-line">
                  <span>Purpose of Travel:</span>
                  <strong>{purpose}</strong>
                </div>
              </div>
            </div>

            <div className="itinerary-table-wrap">
              <table className="itinerary-reference-table">
                <colgroup>
                  <col className="itinerary-col-date" />
                  <col className="itinerary-col-destination" />
                  <col className="itinerary-col-time" />
                  <col className="itinerary-col-time" />
                  <col className="itinerary-col-means" />
                  <col className="itinerary-col-cost" />
                  <col className="itinerary-col-cost" />
                  <col className="itinerary-col-cost" />
                  <col className="itinerary-col-total" />
                </colgroup>
                <thead>
                  <tr>
                    <th rowSpan={2}>Date</th>
                    <th rowSpan={2}>Places to be visited<br />(Destination)</th>
                    <th colSpan={2}>TIME</th>
                    <th rowSpan={2}>Means of<br />Transportation</th>
                    <th rowSpan={2}>Transportation</th>
                    <th rowSpan={2}>Per Diem</th>
                    <th rowSpan={2}>Others</th>
                    <th rowSpan={2}>Total<br />Amount</th>
                  </tr>
                  <tr>
                    <th>Departure</th>
                    <th>Arrival</th>
                  </tr>
                </thead>
                <tbody>
                  {paddedRows.map((row, idx) => {
                    const hasData = row.destination || row.date
                    return (
                      <tr key={idx}>
                        <td>{hasData ? formatDateLocal(row.date) : ''}</td>
                        <td className="text-left">{row.destination || ''}</td>
                        <td>{hasData ? formatTime(row.departure) : ''}</td>
                        <td>{hasData ? formatTime(row.arrival) : ''}</td>
                        <td>{row.transportation || ''}</td>
                        <td className="text-right">
                          {Number(row.transportationCost) ? currency.format(Number(row.transportationCost)) : ''}
                        </td>
                        <td className="text-right">
                          {Number(row.perDiem) ? currency.format(Number(row.perDiem)) : ''}
                        </td>
                        <td className="text-right">
                          {Number(row.others) ? currency.format(Number(row.others)) : ''}
                        </td>
                        <td className="text-right">
                          {Number(row.total) ? currency.format(Number(row.total)) : ''}
                        </td>
                      </tr>
                    )
                  })}
                  <tr className="itinerary-total-row">
                    <th colSpan={8}>TOTAL</th>
                    <td className="text-right">{grandTotal ? currency.format(grandTotal) : ''}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="itinerary-approval-grid">
              <div className="itinerary-certification-panel">
                <p>
                  I certify that: (1) I have reviewed the foregoing itinerary, (2) the travel is
                  necessary to the service, (3) the period covered is reasonable and (4) the
                  expenses claimed are proper.
                </p>
                <div className="itinerary-reference-signature">
                  <strong>{immediateSupervisor || '___________'}</strong>
                  <span>Signature over Printed Name</span>
                  <span>Immediate Supervisor</span>
                </div>
              </div>
              <div className="itinerary-signatory-panel itinerary-prepared-panel">
                <div className="itinerary-panel-label">Prepared by:</div>
                <div className="itinerary-reference-signature">
                  <strong>{travelerName || '___________'}</strong>
                  <span>Signature over Printed Name</span>
                </div>
              </div>
              <div className="itinerary-signatory-panel itinerary-approved-panel">
                <div className="itinerary-panel-label">Approved by:</div>
                <div className="itinerary-reference-signature">
                  <strong>{approvedBy || '___________'}</strong>
                  <span>Signature over Printed Name</span>
                  <span>Punong Barangay</span>
                </div>
              </div>
            </div>
          </div>

          <p className="itinerary-note">Note:</p>
        </div>
      </div>
    </div>
  )
}

export default ItineraryOfTravelPreview
