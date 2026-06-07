import '../components/PrintPreview.css'

const currency = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  maximumFractionDigits: 2,
})

const MIN_ROWS = 10

function PurchaseOrderPreview({ data, onClose }) {
  const {
    barangay,
    municipality,
    province,
    poNumber,
    date,
    supplierName,
    supplierAddress,
    supplierTin,
    procurementMode,
    placeOfDelivery,
    dateOfDelivery,
    deliveryTime,
    paymentTime,
    items,
    totalAmount,
  } = data

  const paddedItems = [...items]
  while (paddedItems.length < MIN_ROWS) {
    paddedItems.push({ unit: '', itemName: '', quantity: '', unitCost: '', total: '' })
  }

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
          {/* Title */}
          <div className="doc-title">Purchase Order</div>

          {/* Header: Barangay / Municipality */}
          <div className="po-header-grid">
            <div className="doc-info-left">
              <div className="doc-info-row">
                <span className="doc-info-label">Barangay :</span>
                <span className="doc-info-value">{barangay}</span>
              </div>
            </div>
            <div className="doc-info-right">
              <div className="doc-info-row">
                <span className="doc-info-label">Municipality :</span>
                <span className="doc-info-value">{municipality}</span>
              </div>
              <div className="doc-info-row" style={{ marginTop: '4px' }}>
                <span className="doc-info-label">Province :</span>
                <span className="doc-info-value">{province}</span>
              </div>
            </div>
          </div>

          {/* Supplier + PO details */}
          <div className="po-supplier-block">
            <div className="po-supplier-left">
              <div className="doc-info-row">
                <span className="doc-info-label">Supplier:</span>
                <span className="doc-info-value">{supplierName}</span>
              </div>
              <div className="doc-info-row">
                <span className="doc-info-label">Address:</span>
                <span className="doc-info-value">{supplierAddress}</span>
              </div>
              <div className="doc-info-row">
                <span className="doc-info-label">TIN:</span>
                <span className="doc-info-value">{supplierTin}</span>
              </div>
            </div>
            <div className="po-supplier-right">
              <div className="doc-info-row">
                <span className="doc-info-label">P.O. No.:</span>
                <span className="doc-info-value">{poNumber}</span>
              </div>
              <div className="doc-info-row">
                <span className="doc-info-label">Date:</span>
                <span className="doc-info-value">{date}</span>
              </div>
              <div className="doc-info-row">
                <span className="doc-info-label" style={{ minWidth: 'auto' }}>Mode of Procurement:</span>
              </div>
              <div className="po-procurement-group">
                <span className="po-procurement-option">
                  Bidding ( {procurementMode === 'Bidding' ? 'x' : ' '} )
                </span>
                <span className="po-procurement-option">
                  Negotiable ( {procurementMode === 'Negotiable' ? 'x' : ' '} )
                </span>
                <span className="po-procurement-option">
                  Over the Counter ( {procurementMode === 'Over the Counter' ? 'x' : ' '} )
                </span>
              </div>
            </div>
          </div>

          {/* Gentleman section */}
          <div className="po-gentleman">
            <p><strong>Gentleman:</strong></p>
            <p style={{ marginLeft: '20px' }}>
              Please deliver to this office the following subject to the terms and conditions contained herein:
            </p>
            <div className="po-delivery-grid">
              <div>
                <div className="doc-info-row">
                  <span className="doc-info-label">Place of Delivery:</span>
                  <span className="doc-info-value">{placeOfDelivery}</span>
                </div>
                <div className="doc-info-row">
                  <span className="doc-info-label">Date of Delivery:</span>
                  <span className="doc-info-value">{dateOfDelivery}</span>
                </div>
              </div>
              <div>
                <div className="doc-info-row">
                  <span className="doc-info-label">Delivery Time:</span>
                  <span className="doc-info-value">{deliveryTime || '___________'}</span>
                </div>
                <div className="doc-info-row">
                  <span className="doc-info-label">Payment Time:</span>
                  <span className="doc-info-value">{paymentTime || '___________'}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Items Table */}
          <table className="doc-table">
            <thead>
              <tr>
                <th style={{ width: '60px' }}>UNIT</th>
                <th>PARTICULARS</th>
                <th style={{ width: '80px' }}>QUANTITY</th>
                <th style={{ width: '100px' }}>UNIT COST</th>
                <th style={{ width: '110px' }}>TOTAL AMOUNT</th>
              </tr>
            </thead>
            <tbody>
              {paddedItems.map((item, index) => {
                const hasData = item.itemName || item.quantity
                return (
                  <tr key={index} className={hasData ? '' : 'empty-row'}>
                    <td>{item.unit || ''}</td>
                    <td className="text-left">{item.itemName || ''}</td>
                    <td>{item.quantity || ''}</td>
                    <td className="text-right">
                      {item.unitCost ? currency.format(item.unitCost) : ''}
                    </td>
                    <td className="text-right">
                      {item.total ? currency.format(item.total) : ''}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          {/* Total */}
          <div className="doc-total-row">
            <span>Total Amount:</span>
            <span>{currency.format(totalAmount)}</span>
          </div>

          {/* Conforme */}
          <div className="po-conforme">
            <p className="po-conforme-label">CONFORME:</p>
            <p className="po-conforme-sig">Signature of Supplier</p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default PurchaseOrderPreview
