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

const MIN_ROWS = 9

function PayrollPreview({ data, onClose, onSave }) {
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const {
    payrollNumber,
    periodCovered,
    rows,
    totals,
    skKagawad,
    skTreasurer,
    skChairman,
    certDateA,
    certDateB,
    certDateC,
    certDateD,
  } = data

  const paddedRows = [...rows]
  while (paddedRows.length < MIN_ROWS) {
    paddedRows.push({
      name: '',
      position: '',
      honoraria: '',
      serviceRendered: '',
      cbcLbf: '',
      netAmount: '',
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
    <div className="print-preview-overlay payroll-preview-overlay">
      <div className="print-preview-container payroll-preview-container">
        <div className="print-preview-toolbar">
          {saveError && <span style={{ color: '#ef4444', marginRight: '16px', fontSize: '0.9rem' }}>{saveError}</span>}
          <button type="button" className="close-btn" onClick={onClose} disabled={isSaving}>
            Close
          </button>
          <button type="button" className="print-btn" onClick={handlePrint} disabled={isSaving}>
            {isSaving ? 'Saving...' : 'Print / Save as PDF'}
          </button>
        </div>

        <div className="print-page payroll-document">
          <div className="payroll-header">
            <h2>PAYROLL</h2>
            <p className="payroll-period">{periodCovered}</p>
            <p className="payroll-period-label">Period Covered</p>
          </div>

          <div className="payroll-reference-sheet">
            <div className="payroll-reference-info">
              <div className="payroll-reference-info-column">
                <div><span>Barangay:</span><strong>Upper Glad 2</strong></div>
                <div><span>SK No.:</span><strong>&nbsp;</strong></div>
              </div>
              <div className="payroll-reference-info-column">
                <div><span>Municipality:</span><strong>Midsayap</strong></div>
                <div><span>Province:</span><strong>Cotabato</strong></div>
              </div>
              <div className="payroll-reference-info-column">
                <div><span>Payroll No.:</span><strong>{payrollNumber}</strong></div>
                <div><span>Page:</span><strong>1 of 1</strong></div>
              </div>
            </div>

            <div className="payroll-table-wrap">
              <table className="payroll-reference-table">
                <colgroup>
                  <col className="payroll-col-number" />
                  <col className="payroll-col-name" />
                  <col className="payroll-col-position" />
                  <col className="payroll-col-money" />
                  <col className="payroll-col-service" />
                  <col className="payroll-col-money" />
                  <col className="payroll-col-deduction" />
                  <col className="payroll-col-net" />
                  <col className="payroll-col-signature" />
                </colgroup>
                <thead>
                  <tr>
                    <th>No.</th>
                    <th>Name</th>
                    <th>Position</th>
                    <th>Honoraria</th>
                    <th>Service<br />Rendered</th>
                    <th>Total</th>
                    <th>CBC/LBF</th>
                    <th>Net Amount</th>
                    <th>Signature of<br />Recipient</th>
                  </tr>
                </thead>
                <tbody>
                  {paddedRows.map((row, idx) => {
                    const hasData = row.name || row.honoraria
                    const hon = Number(row.honoraria) || 0
                    const net = Number(row.netAmount) || 0
                    return (
                      <tr key={idx}>
                        <td>{idx + 1}</td>
                        <td className="text-left">{row.name || ''}</td>
                        <td>{row.position || ''}</td>
                        <td className="text-right">{hasData && hon ? currency.format(hon) : ''}</td>
                        <td>{row.serviceRendered || ''}</td>
                        <td className="text-right">{hasData && hon ? currency.format(hon) : ''}</td>
                        <td className="text-right">
                          {hasData && Number(row.cbcLbf) ? currency.format(Number(row.cbcLbf)) : ''}
                        </td>
                        <td className="text-right">{hasData && net ? currency.format(net) : ''}</td>
                        <td></td>
                      </tr>
                    )
                  })}
                  <tr className="payroll-total-row">
                    <th colSpan={2}>TOTAL</th>
                    <td></td>
                    <td className="text-right">{currency.format(totals.honoraria)}</td>
                    <td></td>
                    <td className="text-right">{currency.format(totals.total)}</td>
                    <td className="text-right">{currency.format(totals.cbcLbf)}</td>
                    <td className="text-right">{currency.format(totals.netAmount)}</td>
                    <td></td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="payroll-reference-certifications">
              <div className="payroll-reference-cert payroll-reference-cert-a">
                <strong>A. CERTIFIED</strong>
                <p>Existence of available appropriations for the charges/expenses indicated above</p>
                <div className="payroll-cert-fields">
                  <div><span>Signature:</span><b></b></div>
                  <div><span>Printed Name:</span><b>{skKagawad}</b></div>
                  <div><span>Position:</span><b>SK Kagawad</b></div>
                  <div><span>Date:</span><b>{formatDateLocal(certDateA)}</b></div>
                </div>
              </div>
              <div className="payroll-reference-cert payroll-reference-cert-b">
                <strong>B. CERTIFIED</strong>
                <p>Funds (Cash) available</p>
                <div className="payroll-cert-fields payroll-cert-centered">
                  <div><b>{skTreasurer}</b></div>
                  <div><b>SK Treasurer</b></div>
                  <div><b>{formatDateLocal(certDateB)}</b></div>
                </div>
              </div>
              <div className="payroll-reference-cert payroll-reference-cert-c">
                <strong>C. CERTIFIED</strong>
                <p>As to validity, propriety, and legality<br />Approved: For Payment</p>
                <div className="payroll-cert-fields payroll-cert-centered">
                  <div><b>{skChairman}</b></div>
                  <div><b>SK Chairman</b></div>
                  <div><b>{formatDateLocal(certDateC)}</b></div>
                </div>
              </div>
              <div className="payroll-reference-cert payroll-reference-cert-d">
                <strong>D. Paid by</strong>
                <div className="payroll-cert-fields payroll-cert-centered">
                  <div><b>{skTreasurer}</b></div>
                  <div><b>SK Treasurer</b></div>
                  <div><b>{formatDateLocal(certDateD)}</b></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default PayrollPreview
