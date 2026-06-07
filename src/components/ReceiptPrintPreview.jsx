import './PrintPreview.css'

const currency = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  maximumFractionDigits: 2,
})

function ReceiptPrintPreview({ expense, receiptUrl, onClose }) {
  const projectName = expense.event || expense.project || 'Untitled'
  const uploadDate = expense.approvedAt || expense.date || expense.eventDate

  function handlePrint(e) {
    e.preventDefault()
    window.print()
  }

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
          {/* Header */}
          <div className="gov-letterhead">
            <div className="gov-logo-row">
              <div className="gov-logo-placeholder">[LOGO]</div>
              <div className="gov-letterhead-text">
                <p className="gov-line">Republic of the Philippines</p>
                <p className="gov-line-bold">REGION XII</p>
                <p className="gov-line">Province of Cotabato</p>
                <p className="gov-line">Municipality of Midsayap</p>
                <p className="gov-line-bold">BARANGAY UPPER GLAD II</p>
              </div>
              <div className="gov-logo-placeholder">[LOGO]</div>
            </div>
            <p className="gov-office">OFFICE OF THE SANGGUNIANG KABATAAN</p>
          </div>

          <div className="doc-title">Receipt Report</div>

          {/* Project Details */}
          <div className="receipt-report-details">
            <div className="receipt-detail-row">
              <span className="receipt-detail-label">Project / Event:</span>
              <span className="receipt-detail-value">{projectName}</span>
            </div>
            <div className="receipt-detail-row">
              <span className="receipt-detail-label">Category:</span>
              <span className="receipt-detail-value">{expense.category || 'Uncategorized'}</span>
            </div>
            <div className="receipt-detail-row">
              <span className="receipt-detail-label">Amount:</span>
              <span className="receipt-detail-value">{currency.format(expense.amount || 0)}</span>
            </div>
            <div className="receipt-detail-row">
              <span className="receipt-detail-label">Date:</span>
              <span className="receipt-detail-value">
                {uploadDate ? new Date(uploadDate).toLocaleDateString('en-US', {
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric',
                }) : '—'}
              </span>
            </div>
            <div className="receipt-detail-row">
              <span className="receipt-detail-label">Report Generated:</span>
              <span className="receipt-detail-value">
                {new Date().toLocaleDateString('en-US', {
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </span>
            </div>
          </div>

          {/* Receipt image */}
          <div className="receipt-report-image-section">
            <h3 className="receipt-report-subtitle">Attached Receipt</h3>
            {receiptUrl ? (
              <div className="receipt-report-image-wrap">
                <img
                  src={receiptUrl}
                  alt={`Receipt for ${projectName}`}
                  className="receipt-report-image"
                  onError={(e) => {
                    e.target.style.display = 'none'
                    e.target.parentElement.innerHTML =
                      '<p style="padding:40px;text-align:center;color:#666;">Receipt image could not be loaded. The file may be a PDF or an unsupported format.</p>'
                  }}
                />
              </div>
            ) : (
              <div className="receipt-report-missing">
                <p>No receipt has been uploaded for this expense.</p>
              </div>
            )}
          </div>

          {/* Breakdown if available */}
          {expense.breakdown?.length ? (
            <div className="receipt-report-breakdown">
              <h3 className="receipt-report-subtitle">Budget Breakdown</h3>
              <table className="doc-table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th style={{ width: '80px' }}>Qty</th>
                    <th style={{ width: '110px' }}>Unit Cost</th>
                    <th style={{ width: '120px' }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {expense.breakdown.map((item, idx) => (
                    <tr key={idx}>
                      <td className="text-left">{item.itemName || '—'}</td>
                      <td>{item.quantity || 0}</td>
                      <td className="text-right">{currency.format(item.unitCost || 0)}</td>
                      <td className="text-right">
                        {currency.format((item.quantity || 0) * (item.unitCost || 0))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          {/* Footer */}
          <div className="receipt-report-footer">
            <p>
              This report was generated by the Cuenta SK Financial Management System.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ReceiptPrintPreview
