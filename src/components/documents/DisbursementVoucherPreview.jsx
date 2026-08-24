import '../PrintPreview.css'
import { useState } from 'react'
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

function DisbursementVoucherPreview({ data, onClose, onSave }) {
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const {
    dvNumber,
    date,
    fund,
    payeeName,
    payeeAddress,
    particulars,
    amount,
    skKagawad,
    skTreasurer,
    skChairman,
    certDateA,
    certDateB,
    certDateC,
    bankName,
  } = data

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

  const accountingRows = Array.from({ length: 5 }, () => ({
    account: '',
    code: '',
    debit: '',
    credit: '',
  }))

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

        <div className="print-page dv-document">
          <div className="dv-form-scroll">
            <table className="dv-form-table">
              <colgroup>
                {Array.from({ length: 12 }, (_, index) => <col key={index} />)}
              </colgroup>
              <tbody>
                <tr className="dv-form-title-row">
                  <th colSpan="8">Disbursement Voucher</th>
                  <td colSpan="4"><span>DV No.:</span> <strong>{dvNumber}</strong></td>
                </tr>
                <tr className="dv-form-info-row">
                  <td colSpan="5"><span>Barangay:</span> <strong>UPPER GLAD II</strong></td>
                  <td colSpan="3"><span>Municipality:</span> <strong>MIDSAYAP</strong></td>
                  <td colSpan="4"><span>Date:</span> <strong>{formatDateLocal(date)}</strong></td>
                </tr>
                <tr className="dv-form-info-row">
                  <td colSpan="5"><span>Payee/Office:</span> <strong>{payeeName}</strong></td>
                  <td colSpan="3"><span>Province:</span> <strong>COTABATO</strong></td>
                  <td colSpan="4"><span>Fund:</span> <strong>{fund}</strong></td>
                </tr>
                <tr className="dv-form-info-row">
                  <td colSpan="5"><span>Address:</span> <strong>{payeeAddress}</strong></td>
                  <td colSpan="3"><span>TIN:</span></td>
                  <td colSpan="4" aria-label="Reserved field">&nbsp;</td>
                </tr>

                <tr className="dv-form-column-headings">
                  <th colSpan="8">Particulars</th>
                  <th colSpan="4">Amount</th>
                </tr>
                <tr className="dv-form-particulars-row">
                  <td colSpan="8"><p>{particulars}</p></td>
                  <td colSpan="4" className="dv-form-amount">{currency.format(amount)}</td>
                </tr>
                <tr className="dv-form-total-row">
                  <th colSpan="8">Total Amount Due This Voucher</th>
                  <td colSpan="4">{currency.format(amount)}</td>
                </tr>

                <tr className="dv-form-certifications">
                  <td colSpan="5">
                    <strong className="dv-form-certified">Certified</strong>
                    <p>Existence of available appropriation for the charges/expenses indicated above</p>
                    <div className="dv-form-cert-fields">
                      <div><span>Signature:</span><b className="dv-form-write-line" /></div>
                      <div><span>Printed Name:</span><b className="dv-form-write-line">{skKagawad}</b></div>
                      <div><span>Position:</span><b className="dv-form-write-line">Budget Monitoring Officer</b></div>
                      <div><span>Date:</span><b className="dv-form-write-line">{formatDateLocal(certDateA)}</b></div>
                    </div>
                  </td>
                  <td colSpan="3">
                    <strong className="dv-form-certified">Certified</strong>
                    <p>Fund Cash Available</p>
                    <div className="dv-form-cert-fields">
                      <div><span>Signature:</span><b className="dv-form-write-line" /></div>
                      <div><span>Printed Name:</span><b className="dv-form-write-line">{skTreasurer}</b></div>
                      <div><span>Position:</span><b className="dv-form-write-line">SK Treasurer</b></div>
                      <div><span>Date:</span><b className="dv-form-write-line">{formatDateLocal(certDateB)}</b></div>
                    </div>
                  </td>
                  <td colSpan="4">
                    <strong className="dv-form-certified">Certified</strong>
                    <p>As to validity, propriety and legality<br />Approved: For Payment</p>
                    <div className="dv-form-cert-fields">
                      <div><span>Signature:</span><b className="dv-form-write-line" /></div>
                      <div><span>Printed Name:</span><b className="dv-form-write-line">{skChairman}</b></div>
                      <div><span>Position:</span><b className="dv-form-write-line">SK Chairman</b></div>
                      <div><span>Date:</span><b className="dv-form-write-line">{formatDateLocal(certDateC)}</b></div>
                    </div>
                  </td>
                </tr>

                <tr className="dv-form-section-label">
                  <td colSpan="12">Received Payment</td>
                </tr>
                <tr className="dv-form-payment-row">
                  <td colSpan="5">
                    <div className="dv-form-signature-space" />
                    <div className="dv-form-signature-caption">Signature Over Printed Name</div>
                  </td>
                  <td colSpan="7">
                    <div className="dv-form-payment-fields">
                      <div className="dv-form-payment-pair">
                        <span>Check Number:</span><b className="dv-form-write-line" />
                        <span>Date:</span><b className="dv-form-write-line" />
                      </div>
                      <div><span>Bank Name:</span><b className="dv-form-write-line">{bankName}</b></div>
                    </div>
                  </td>
                </tr>

                <tr className="dv-form-section-label">
                  <th colSpan="12">Accounting Entries</th>
                </tr>
                <tr className="dv-form-account-headings">
                  <th colSpan="5">Account</th>
                  <th colSpan="2">Account Code</th>
                  <th colSpan="2">Debit</th>
                  <th colSpan="3">Credit</th>
                </tr>
                {accountingRows.map((row, idx) => (
                  <tr className="dv-form-account-row" key={idx}>
                    <td colSpan="5">{row.account}</td>
                    <td colSpan="2">{row.code}</td>
                    <td colSpan="2">{row.debit}</td>
                    <td colSpan="3">{row.credit}</td>
                  </tr>
                ))}
                <tr className="dv-form-account-space">
                  <td colSpan="5">&nbsp;</td>
                  <td colSpan="7">&nbsp;</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}

export default DisbursementVoucherPreview
