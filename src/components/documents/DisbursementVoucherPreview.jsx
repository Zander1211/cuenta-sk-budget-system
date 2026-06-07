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

function DisbursementVoucherPreview({ data, onClose }) {
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

  function handlePrint(e) {
    e.preventDefault()
    window.print()
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
          <button type="button" className="close-btn" onClick={onClose}>
            Close
          </button>
          <button type="button" className="print-btn" onClick={handlePrint}>
            Print / Save as PDF
          </button>
        </div>

        <div className="print-page">
          {/* Letterhead */}
          <div className="gov-letterhead">
            <p className="gov-line">Republic of the Philippines</p>
            <p className="gov-line-bold">BARANGAY UPPER GLAD II</p>
          </div>

          {/* Title */}
          <div className="doc-title">Disbursement Voucher</div>

          {/* Header grid */}
          <div className="dv-header-grid">
            <div className="dv-header-left">
              <div className="doc-info-row">
                <span className="doc-info-label">Office:</span>
                <span className="doc-info-value">{payeeName}</span>
              </div>
              <div className="doc-info-row">
                <span className="doc-info-label">Address:</span>
                <span className="doc-info-value">{payeeAddress}</span>
              </div>
            </div>
            <div className="dv-header-right">
              <div className="doc-info-row">
                <span className="doc-info-label">Municipality:</span>
                <span className="doc-info-value">MIDSAYAP</span>
              </div>
              <div className="doc-info-row">
                <span className="doc-info-label">Province:</span>
                <span className="doc-info-value">COTABATO</span>
              </div>
              <div className="doc-info-row" style={{ marginTop: '8px' }}>
                <span className="doc-info-label">DV No.:</span>
                <span className="doc-info-value" style={{ fontWeight: 700 }}>
                  {dvNumber}
                </span>
              </div>
              <div className="doc-info-row">
                <span className="doc-info-label">Date:</span>
                <span className="doc-info-value">{formatDateLocal(date)}</span>
              </div>
              <div className="doc-info-row">
                <span className="doc-info-label">Fund:</span>
                <span className="doc-info-value">{fund}</span>
              </div>
            </div>
          </div>

          {/* Particulars */}
          <div className="dv-particulars">
            <div className="dv-particulars-title">Particulars</div>
            <p style={{ margin: 0, fontSize: '12px', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
              {particulars}
            </p>
          </div>

          {/* Amount */}
          <div className="dv-amount-row">
            <span style={{ fontSize: '11px' }}>Amount:</span>
            <span style={{ fontWeight: 700 }}>{currency.format(amount)}</span>
          </div>

          {/* Total */}
          <div className="dv-total-row">
            <span>Total Amount Due This Voucher</span>
            <span>{currency.format(amount)}</span>
          </div>

          {/* Certification grid (3 columns) */}
          <div className="dv-cert-grid">
            <div className="dv-cert-box">
              <div className="dv-cert-label">A. Certified</div>
              <div className="dv-cert-text">
                Existence of available appropriation for the charges/expenses indicated above
              </div>
              <div className="dv-cert-sig-line">
                <div className="dv-cert-name">{skKagawad || '___________'}</div>
                <div className="dv-cert-position">SK Kagawad</div>
                <div className="dv-cert-date">Date: {formatDateLocal(certDateA)}</div>
              </div>
            </div>
            <div className="dv-cert-box">
              <div className="dv-cert-label">B. Certified</div>
              <div className="dv-cert-text">Fund Cash Available</div>
              <div className="dv-cert-sig-line">
                <div className="dv-cert-name">{skTreasurer || '___________'}</div>
                <div className="dv-cert-position">SK Treasurer</div>
                <div className="dv-cert-date">Date: {formatDateLocal(certDateB)}</div>
              </div>
            </div>
            <div className="dv-cert-box">
              <div className="dv-cert-label">C. Certified</div>
              <div className="dv-cert-text">
                As to validity, propriety and legality
                <br />
                Approved: For Payment
              </div>
              <div className="dv-cert-sig-line">
                <div className="dv-cert-name">{skChairman || '___________'}</div>
                <div className="dv-cert-position">SK Chairman</div>
                <div className="dv-cert-date">Date: {formatDateLocal(certDateC)}</div>
              </div>
            </div>
          </div>

          {/* Received Payment */}
          <div className="dv-received">
            <div>
              <p style={{ margin: '0 0 20px', fontWeight: 700 }}>Received Payment:</p>
              <div style={{ borderTop: '1px solid #000', paddingTop: '4px', textAlign: 'center' }}>
                <span style={{ fontStyle: 'italic', fontSize: '10px' }}>
                  Signature over Printed Name
                </span>
              </div>
            </div>
            <div>
              <div className="doc-info-row">
                <span className="doc-info-label" style={{ fontSize: '10px' }}>
                  Check Number:
                </span>
                <span>_______________</span>
              </div>
              <div className="doc-info-row">
                <span className="doc-info-label" style={{ fontSize: '10px' }}>
                  Date:
                </span>
                <span>_______________</span>
              </div>
              <div className="doc-info-row">
                <span className="doc-info-label" style={{ fontSize: '10px' }}>
                  Bank Name:
                </span>
                <span className="doc-info-value">{bankName}</span>
              </div>
            </div>
          </div>

          {/* Accounting Entries */}
          <div className="dv-accounting">
            <div className="dv-accounting-title">Accounting Entries</div>
            <table className="doc-table" style={{ marginBottom: 0 }}>
              <thead>
                <tr>
                  <th>Account</th>
                  <th>Account Code</th>
                  <th style={{ width: '100px' }}>Debit</th>
                  <th style={{ width: '100px' }}>Credit</th>
                </tr>
              </thead>
              <tbody>
                {accountingRows.map((row, idx) => (
                  <tr key={idx} className="empty-row">
                    <td>{row.account}</td>
                    <td>{row.code}</td>
                    <td>{row.debit}</td>
                    <td>{row.credit}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}

export default DisbursementVoucherPreview
