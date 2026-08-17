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

const MIN_ROWS = 8

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
          {/* Header */}
          <div className="payroll-header">
            <h2>PAYROLL</h2>
            <p className="payroll-period">{periodCovered}</p>
          </div>

          {/* Info grid */}
          <div className="payroll-info-grid">
            <div>
              <div className="doc-info-row">
                <span className="doc-info-label">Barangay:</span>
                <span className="doc-info-value">Upper Glad 2</span>
              </div>
            </div>
            <div>
              <div className="doc-info-row">
                <span className="doc-info-label">Municipality:</span>
                <span className="doc-info-value">Midsayap</span>
              </div>
              <div className="doc-info-row">
                <span className="doc-info-label">Province:</span>
                <span className="doc-info-value">Cotabato</span>
              </div>
              <div className="doc-info-row">
                <span className="doc-info-label">Payroll No.:</span>
                <span className="doc-info-value" style={{ fontWeight: 700 }}>
                  {payrollNumber}
                </span>
              </div>
              <div className="doc-info-row">
                <span className="doc-info-label">Page:</span>
                <span className="doc-info-value">1 of 1</span>
              </div>
            </div>
          </div>

          {/* Payroll table */}
          <table className="doc-table">
            <thead>
              <tr>
                <th style={{ width: '35px' }}>No.</th>
                <th>Name</th>
                <th>Position</th>
                <th style={{ width: '90px' }}>Honoraria</th>
                <th style={{ width: '90px' }}>Service Rendered</th>
                <th style={{ width: '80px' }}>Total</th>
                <th style={{ width: '70px' }}>CBC/LBF</th>
                <th style={{ width: '90px' }}>Net Amount</th>
                <th style={{ width: '80px' }}>Signature</th>
              </tr>
            </thead>
            <tbody>
              {paddedRows.map((row, idx) => {
                const hasData = row.name || row.honoraria
                const hon = Number(row.honoraria) || 0
                const net = Number(row.netAmount) || 0
                return (
                  <tr key={idx} className={hasData ? '' : 'empty-row'}>
                    <td>{hasData ? idx + 1 : ''}</td>
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
              {/* Total row */}
              <tr style={{ fontWeight: 700 }}>
                <td colSpan={3} style={{ textAlign: 'right' }}>
                  TOTAL
                </td>
                <td className="text-right">{currency.format(totals.honoraria)}</td>
                <td></td>
                <td className="text-right">{currency.format(totals.total)}</td>
                <td className="text-right">{currency.format(totals.cbcLbf)}</td>
                <td className="text-right">{currency.format(totals.netAmount)}</td>
                <td></td>
              </tr>
            </tbody>
          </table>

          {/* 4-column certification */}
          <div className="payroll-cert-grid">
            <div className="payroll-cert-box">
              <div className="dv-cert-label">A. Certified</div>
              <div className="dv-cert-text" style={{ fontSize: '9px' }}>
                Existence of available appropriations for the charges/expenses indicated above
              </div>
              <div className="dv-cert-sig-line">
                <div className="dv-cert-name">{skKagawad || '___________'}</div>
                <div className="dv-cert-position">SK Kagawad</div>
                <div className="dv-cert-date">{formatDateLocal(certDateA)}</div>
              </div>
            </div>
            <div className="payroll-cert-box">
              <div className="dv-cert-label">B. Certified</div>
              <div className="dv-cert-text" style={{ fontSize: '9px' }}>
                Funds (Cash) available
              </div>
              <div className="dv-cert-sig-line">
                <div className="dv-cert-name">{skTreasurer || '___________'}</div>
                <div className="dv-cert-position">SK Treasurer</div>
                <div className="dv-cert-date">{formatDateLocal(certDateB)}</div>
              </div>
            </div>
            <div className="payroll-cert-box">
              <div className="dv-cert-label">C. Certified</div>
              <div className="dv-cert-text" style={{ fontSize: '9px' }}>
                As to validity, proprietary, and legality
                <br />
                Approved: For Payment
              </div>
              <div className="dv-cert-sig-line">
                <div className="dv-cert-name">{skChairman || '___________'}</div>
                <div className="dv-cert-position">SK Chairman</div>
                <div className="dv-cert-date">{formatDateLocal(certDateC)}</div>
              </div>
            </div>
            <div className="payroll-cert-box">
              <div className="dv-cert-label">D. Noted by:</div>
              <div className="dv-cert-text" style={{ fontSize: '9px' }}>&nbsp;</div>
              <div className="dv-cert-sig-line">
                <div className="dv-cert-name">{skTreasurer || '___________'}</div>
                <div className="dv-cert-position">SK Treasurer</div>
                <div className="dv-cert-date">{formatDateLocal(certDateD)}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default PayrollPreview
