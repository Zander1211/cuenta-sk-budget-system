import { useState } from 'react'
import '../PrintPreview.css'
import './AdditionalDocuments.css'
import logo from '../../assets/logo.png'
import brgyLogo from '../../assets/brgy-logo-2.png'

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

function TransmittalLetterPreview({ data, onClose, onSave }) {
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const {
    date,
    coaTeamNumber,
    month,
    accountNo,
    bodyText,
    dvRows,
    dvTotal,
    rcdRows,
    otherRows,
    skTreasurer,
    skChairperson,
  } = data

  const hasDvData = dvRows.some((row) => row.payee || row.dvNo || row.amount)
  const rcdDisplayRows = Array.from(
    { length: Math.max(4, rcdRows.length) },
    (_, index) => rcdRows[index] || { date: '', no: '', amount: '' }
  )
  const otherDisplayRows = Array.from(
    { length: Math.max(2, otherRows.length) },
    (_, index) => otherRows[index] || { date: '', typeOfReport: '' }
  )

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
          {/* Government Letterhead with logos */}
          <div className="gov-letterhead" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', marginBottom: '30px' }}>
            <img src={brgyLogo} alt="Barangay Logo" style={{ width: '100px', height: '100px', position: 'absolute', left: '50px', top: '0', objectFit: 'contain' }} />
            <img src={logo} alt="SK Logo" style={{ width: '100px', height: '100px', position: 'absolute', right: '50px', top: '0', objectFit: 'contain' }} />
            <div style={{ textAlign: 'center', lineHeight: '1.3' }}>
              <p style={{ margin: 0 }}>Republic of the Philippines</p>
              <p style={{ margin: 0, fontWeight: 'bold' }}>REGION XII</p>
              <p style={{ margin: 0 }}>Province of Cotabato</p>
              <p style={{ margin: 0 }}>Municipality of Midsayap</p>
              <p style={{ margin: 0, fontWeight: 'bold' }}>BARANGAY UPPER GLAD II</p>
              <br/>
              <p style={{ margin: 0, fontWeight: 'bold', fontSize: '11pt' }}>OFFICE OF THE SANGGUNIANG KABATAAN</p>
            </div>
          </div>

          {/* Title */}
          <div className="doc-title transmittal-reference-title">Transmittal Letter</div>

          <div className="transmittal-body transmittal-reference">
            {/* Date */}
            <div className="transmittal-date">
              <span>Date:</span>
              <strong>{formatDateLocal(date)}</strong>
            </div>

            {/* To block */}
            <div className="transmittal-to">
              <div className="transmittal-to-label">To:</div>
              <div>
                <p>The Audit Team Leader</p>
                <p>COA Regional Office XII, LGS-A Team {coaTeamNumber || '___'}</p>
                <p>PSAO, Amas, Kidapawan City</p>
              </div>
            </div>

            {/* Salutation */}
            <div className="transmittal-salutation">Sir/Madam:</div>

            {/* Body paragraph */}
            <div className="transmittal-paragraph">
              {bodyText || `We submit the original copies of the disbursement vouchers issued for the month of ${month}, duly acknowledged by the payees together with the supporting documents, and copies of the corresponding checks and Sangguniang Kabataan Certification (SKC).`}
            </div>

            {/* Account No */}
            <div className="transmittal-account">
              <span>Account No.:</span> <strong>{accountNo}</strong>
            </div>

            {/* DV Table */}
            <div className="transmittal-table-wrap">
              <table className="transmittal-table transmittal-dv-table">
                <colgroup>
                  <col className="transmittal-date-col" />
                  <col className="transmittal-number-col" />
                  <col className="transmittal-date-col" />
                  <col className="transmittal-number-col" />
                  <col className="transmittal-payee-col" />
                  <col className="transmittal-amount-col" />
                  <col className="transmittal-date-col" />
                  <col className="transmittal-number-col" />
                </colgroup>
                <thead>
                  <tr>
                    <th colSpan={2}>DV</th>
                    <th colSpan={2}>Check</th>
                    <th rowSpan={2}>Payee</th>
                    <th rowSpan={2}>Amount</th>
                    <th colSpan={2}>SKC/s Issued</th>
                  </tr>
                  <tr>
                    <th>Date</th>
                    <th>No.</th>
                    <th>Date</th>
                    <th>No.</th>
                    <th>Date</th>
                    <th>No.</th>
                  </tr>
                </thead>
                <tbody>
                  {hasDvData ? dvRows.map((row, idx) => (
                    <tr key={idx}>
                      <td>{formatDateLocal(row.dvDate)}</td>
                      <td>{row.dvNo}</td>
                      <td>{formatDateLocal(row.checkDate)}</td>
                      <td>{row.checkNo}</td>
                      <td className="text-left">{row.payee}</td>
                      <td className="text-right">
                        {Number(row.amount) ? currency.format(Number(row.amount)) : ''}
                      </td>
                      <td>{formatDateLocal(row.skcDate)}</td>
                      <td>{row.skcNo}</td>
                    </tr>
                  )) : (
                    <tr className="transmittal-no-transaction-row">
                      <td colSpan={8}>NO TRANSACTION</td>
                    </tr>
                  )}
                  <tr className="transmittal-blank-row">
                    <td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td>
                  </tr>
                  <tr className="transmittal-total-row">
                    <th colSpan={5}>TOTAL</th>
                    <td>{dvTotal ? currency.format(dvTotal) : '-'}</td>
                    <td colSpan={2}></td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* RCDs */}
            <div className="transmittal-section-title">
              RCDs and Supporting Documents (RCRs, OR, VDS)
            </div>
            <div className="transmittal-table-wrap">
              <table className="transmittal-table transmittal-rcd-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>No.</th>
                    <th>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {rcdDisplayRows.map((row, idx) => (
                    <tr key={idx}>
                      <td>{formatDateLocal(row.date)}</td>
                      <td>{row.no}</td>
                      <td className="text-right">
                        {Number(row.amount) ? currency.format(Number(row.amount)) : ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Others */}
            <div className="transmittal-section-title">Others</div>
            <div className="transmittal-table-wrap">
              <table className="transmittal-table transmittal-others-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Type of Report</th>
                  </tr>
                </thead>
                <tbody>
                  {otherDisplayRows.map((row, idx) => (
                    <tr key={idx}>
                      <td>{formatDateLocal(row.date)}</td>
                      <td className="text-left">{row.typeOfReport}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Acknowledge */}
            <div className="transmittal-acknowledge">Please acknowledge receipt hereof.</div>

            {/* Closing */}
            <div className="transmittal-closing">
              <p>Very truly yours,</p>
              <div className="transmittal-closing-name">{skTreasurer || '___________'}</div>
              <div className="transmittal-closing-role">SK Treasurer</div>
            </div>

            {/* Bottom signatures */}
            <div className="transmittal-bottom-sigs">
              <div className="transmittal-sig-block transmittal-noted-block">
                <div className="transmittal-signature-label">Noted by:</div>
                <div className="transmittal-sig-name">{skChairperson || '___________'}</div>
                <div className="transmittal-sig-role">SK Chairperson</div>
              </div>
              <div className="transmittal-sig-block">
                <div className="transmittal-received">
                  <p>Received by:</p>
                  <div className="transmittal-received-sig">
                    Signature, Name and Designation
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default TransmittalLetterPreview
