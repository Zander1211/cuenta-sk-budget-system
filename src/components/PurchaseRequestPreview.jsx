import { useState } from 'react'
import '../components/PrintPreview.css'
import barangaySeal from '../assets/brgy-logo-2.png'

const currency = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  maximumFractionDigits: 2,
})

const MIN_ROWS = 10

function PurchaseRequestPreview({ data, onClose, onSave }) {
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const {
    barangay,
    municipality,
    province,
    prNumber,
    date,
    items,
    totalAmount,
    requestedByName,
    requestedByDate,
    approvedByName,
    approvedByDate,
  } = data

  const paddedItems = [...items]
  while (paddedItems.length < MIN_ROWS) {
    paddedItems.push({ itemName: '', quantity: '', unitOfIssue: '', unitCost: '', total: '' })
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

        <div className="print-page purchase-request-document">
          <img
            className="purchase-request-watermark"
            src={barangaySeal}
            alt=""
            aria-hidden="true"
          />

          {/* Title */}
          <div className="doc-title">Purchase Request</div>

          {/* Info Grid */}
          <div className="doc-info-grid">
            <div className="doc-info-left">
              <div className="doc-info-row">
                <span className="doc-info-label">Barangay</span>
                <span>:</span>
                <span className="doc-info-value">{barangay}</span>
              </div>
              <div className="doc-info-row">
                <span className="doc-info-label">Municipality</span>
                <span>:</span>
                <span className="doc-info-value">{municipality}</span>
              </div>
              <div className="doc-info-row">
                <span className="doc-info-label">Province</span>
                <span>:</span>
                <span className="doc-info-value">{province}</span>
              </div>
            </div>
            <div className="doc-info-right">
              <div className="doc-info-row">
                <span className="doc-info-label">P.R. NO.:</span>
                <span className="doc-info-value">{prNumber}</span>
              </div>
              <div className="doc-info-row">
                <span className="doc-info-label">DATE:</span>
                <span className="doc-info-value">{date}</span>
              </div>
            </div>
          </div>

          {/* Requisition Section */}
          <div className="doc-section-title">Requisition</div>

          <table className="doc-table">
            <thead>
              <tr>
                <th style={{ width: '60px' }}>Item Number</th>
                <th style={{ width: '50px' }}>QTY.</th>
                <th style={{ width: '70px' }}>Unit of Issue</th>
                <th>Item Description</th>
                <th style={{ width: '100px' }}>Estimated Unit Cost</th>
                <th style={{ width: '110px' }}>Estimated Amount</th>
              </tr>
            </thead>
            <tbody>
              {paddedItems.map((item, index) => {
                const hasData = item.itemName || item.quantity
                return (
                  <tr key={index} className={hasData ? '' : 'empty-row'}>
                    <td>{hasData ? index + 1 : ''}</td>
                    <td>{item.quantity || ''}</td>
                    <td>{item.unitOfIssue || ''}</td>
                    <td className="text-left">{item.itemName || ''}</td>
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
            <span>Total Estimated Amount:</span>
            <span>{currency.format(totalAmount)}</span>
          </div>

          {/* Signatures */}
          <div className="doc-signatures">
            <div className="doc-sig-block">
              <p className="doc-sig-title">Requested By:</p>
              <p className="doc-sig-name">{requestedByName}</p>
              <p className="doc-sig-line">Signature over Printed Name</p>
              <p className="doc-sig-role">Requisitioner</p>
              <p className="doc-sig-date">Date: {requestedByDate}</p>
            </div>
            <div className="doc-sig-block">
              <p className="doc-sig-title">Approved for Issuance:</p>
              <p className="doc-sig-name">{approvedByName}</p>
              <p className="doc-sig-line">Signature over Printed Name</p>
              <p className="doc-sig-role">SK Chairman</p>
              <p className="doc-sig-date">Date: {approvedByDate}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default PurchaseRequestPreview
