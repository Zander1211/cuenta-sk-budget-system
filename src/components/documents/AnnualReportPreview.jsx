import { useRef } from 'react'
import { X, Printer } from 'lucide-react'

const currency = new Intl.NumberFormat('en-PH', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

function formatCurrency(amount) {
  if (amount === 0 || !amount) return '-'
  return currency.format(amount)
}

function AnnualReportPreview({ data, onClose }) {
  const contentRef = useRef(null)

  function handlePrint() {
    window.print()
  }

  // Helper for rendering a line item with an amount
  const LineItem = ({ label, amount, isTotal = false, indent = 0, style }) => (
    <div className={`ar-line-item ar-indent-${indent}`} style={style}>
      <span className={isTotal ? 'ar-total-label' : ''}>{label}</span>
      <span className={isTotal ? 'ar-total-value' : ''}>{formatCurrency(amount)}</span>
    </div>
  )

  return (
    <div className="print-preview-overlay">
      <div className="print-preview-toolbar">
        <button type="button" className="secondary-button" onClick={onClose}>
          <X size={16} />
          Close
        </button>
        <button type="button" className="primary-button" onClick={handlePrint}>
          <Printer size={16} />
          Print
        </button>
      </div>

      <div className="print-preview-container" ref={contentRef}>
        
        {/* PAGE 1: Receipts and MOOE */}
        <div className="print-page ar-print-page">
          <div className="ar-header">
            <p className="ar-republic">Republic of the Philippines</p>
            <hr className="ar-header-line" />
            <p className="ar-sk-details">(SK of Barangay {data.barangay}, {data.city}, {data.province})</p>
            <h1 className="ar-title">Annual Statement of Receipts and Payments</h1>
            <p className="ar-subtitle">For the year ended December 31, {data.year}</p>
          </div>

          <div className="ar-body">
            <h2 className="ar-section-title">Receipts</h2>
            <LineItem label="Subsidy from Barangay" amount={data.receipts.subsidyBarangay} indent={1} />
            <LineItem label="Subsidy from Other Local Government Units" amount={data.receipts.subsidyOtherLGU} indent={1} />
            <LineItem label="Subsidy from National Government Agencies" amount={data.receipts.subsidyNGA} indent={1} />
            <LineItem label="Subsidy from Government-Owned and/or Controlled Corporations" amount={data.receipts.subsidyGOCC} indent={1} />
            <div className="ar-line-item ar-indent-1"><span>Grants and Donations in Cash</span></div>
            <LineItem label="with Specific Purpose" amount={data.receipts.grantsSpecific} indent={2} />
            <LineItem label="without Specific Purpose" amount={data.receipts.grantsWithoutSpecific} indent={2} />
            <LineItem label="Miscellaneous Income" amount={data.receipts.miscIncome} indent={1} />
            <LineItem label="Other Receipts" amount={data.receipts.otherReceipts} indent={1} style={{ borderBottom: '1px solid #000', marginBottom: '2px', paddingBottom: '2px' }} />
            <LineItem label="Total Receipts for the year" amount={data.receipts.total} isTotal />

            <h2 className="ar-section-title" style={{ marginTop: '16px' }}>Less: Payments</h2>
            <h3 className="ar-subsection-title ar-indent-1">Maintenance and Other Operating Expenses</h3>
            
            <LineItem label="Travelling Expenses" amount={data.mooe.travelling} indent={2} />
            <LineItem label="Training Expenses" amount={data.mooe.training} indent={2} />
            <LineItem label="Office Supplies Expenses" amount={data.mooe.officeSupplies} indent={2} />
            <LineItem label="Semi-Expendable Property Expenses" amount={data.mooe.semiExpendable} indent={2} />
            <LineItem label="Fuel, Oil and Lubricants Expenses" amount={data.mooe.fuelOil} indent={2} />
            <LineItem label="Accountable Forms Expenses" amount={data.mooe.accountableForms} indent={2} />
            <LineItem label="Other Supplies and Materials Expenses" amount={data.mooe.otherSupplies} indent={2} />
            <LineItem label="Water Expenses" amount={data.mooe.water} indent={2} />
            <LineItem label="Electricity Expenses" amount={data.mooe.electricity} indent={2} />
            <LineItem label="Postage and Courier Services" amount={data.mooe.postage} indent={2} />
            <LineItem label="Telephone Expenses" amount={data.mooe.telephone} indent={2} />
            <LineItem label="Internet Subscription Expenses" amount={data.mooe.internet} indent={2} />
            <LineItem label="Prizes" amount={data.mooe.prizes} indent={2} />
            <LineItem label="Repairs and Maintenance-Land Improvements" amount={data.mooe.rmLandImprovements} indent={2} />
            <LineItem label="Repairs and Maintenance-Buildings and Other Structures" amount={data.mooe.rmBuildings} indent={2} />
            <LineItem label="Repairs and Maintenance-Machinery" amount={data.mooe.rmMachinery} indent={2} />
            <LineItem label="Repairs and Maintenance-Office Equipment" amount={data.mooe.rmOfficeEquipment} indent={2} />
            <LineItem label="Repairs and Maintenance -Information and Communications Technology Equipment" amount={data.mooe.rmICT} indent={2} />
            <LineItem label="Repairs and Maintenance-Sports Equipment" amount={data.mooe.rmSports} indent={2} />
            <LineItem label="Repairs and Maintenance-Transportation Equipment" amount={data.mooe.rmTransportation} indent={2} />
            <LineItem label="Repairs and Maintenance-Furniture, Fixtures and Books" amount={data.mooe.rmFurniture} indent={2} />
            <LineItem label="Repairs and Maintenance-Other Property and Equipment" amount={data.mooe.rmOtherProperty} indent={2} />
            <LineItem label="Fidelity Bond Premiums" amount={data.mooe.fidelityBond} indent={2} />
            <LineItem label="Advertising Expenses" amount={data.mooe.advertising} indent={2} />
            <LineItem label="Rent/Lease Expenses" amount={data.mooe.rent} indent={2} />
            <LineItem label="Membership Dues and Contributions to Organizations" amount={data.mooe.membershipDues} indent={2} />
            <LineItem label="Donation" amount={data.mooe.donation} indent={2} />
          </div>
        </div>

        {/* PAGE 2: Continuation (MOOE, CO, Cash, Signatures) */}
        <div className="print-page ar-print-page">
          <div className="ar-body">
            <LineItem label="Honoraria" amount={data.mooe.honoraria} indent={2} />
            <LineItem label="Bank Charges" amount={data.mooe.bankCharges} indent={2} />
            <LineItem label="Other Maintenance and Operating Expenses" amount={data.mooe.otherMOOE} indent={2} style={{ borderBottom: '1px solid #000', marginBottom: '2px', paddingBottom: '2px' }} />
            <LineItem label="Total Maintenance and Other Operating Expenses" amount={data.mooe.total} indent={1} isTotal />

            <h3 className="ar-subsection-title ar-indent-1" style={{ marginTop: '16px' }}>Capital Outlay</h3>
            <LineItem label="Land" amount={data.co.land} indent={2} />
            <LineItem label="Land Improvements" amount={data.co.landImprovements} indent={2} />
            <LineItem label="Buildings" amount={data.co.buildings} indent={2} />
            <LineItem label="Other Structures" amount={data.co.otherStructures} indent={2} />
            <LineItem label="Machinery" amount={data.co.machinery} indent={2} />
            <LineItem label="Office Equipment" amount={data.co.officeEquipment} indent={2} />
            <LineItem label="Information and Communications Technology Equipment" amount={data.co.ictEquipment} indent={2} />
            <LineItem label="Sports Equipment" amount={data.co.sportsEquipment} indent={2} />
            <LineItem label="Transportation Equipment" amount={data.co.transportation} indent={2} />
            <LineItem label="Furniture, Fixtures and Books" amount={data.co.furniture} indent={2} />
            <LineItem label="Other Property and Equipment" amount={data.co.otherProperty} indent={2} />
            <LineItem label="Construction in Progress-Land Improvements" amount={data.co.cipLandImprovements} indent={2} />
            <LineItem label="Construction in Progress-Buildings" amount={data.co.cipBuildings} indent={2} />
            <LineItem label="Construction in Progress-Other Structures" amount={data.co.cipOtherStructures} indent={2} style={{ borderBottom: '1px solid #000', marginBottom: '2px', paddingBottom: '2px' }} />
            <LineItem label="Total Capital Outlay" amount={data.co.total} indent={1} isTotal />

            <LineItem label="Cash Advances, Net" amount={data.cashAdvancesNet} isTotal style={{ marginTop: '24px' }} />
            
            <LineItem label="Total Payments for the year" amount={data.totalPayments} isTotal style={{ marginTop: '16px' }} />
            <LineItem label="Increase/(Decrease) in Cash for the year" amount={data.increaseDecreaseCash} isTotal />
            
            <div className="ar-line-item"><span>Add/Less: Others</span><span>{formatCurrency(data.addLessOthers)}</span></div>
            
            <LineItem label="Total Increase/(Decrease) in Cash for the year" amount={data.totalIncreaseDecreaseCash} isTotal />
            
            <h2 className="ar-section-title" style={{ marginTop: '8px' }}>Cash at beginning of year</h2>
            <LineItem label="Cash on Hand" amount={data.cashBeginning.hand} indent={1} />
            <LineItem label="Cash in Bank" amount={data.cashBeginning.bank} indent={1} />
            
            <LineItem label="Cash at end of year" amount={data.cashEnd.calculatedTotal} isTotal style={{ marginTop: '8px' }} />

            <h2 className="ar-section-title" style={{ marginTop: '16px' }}>Breakdown of Cash at end of year</h2>
            <LineItem label="Cash on Hand" amount={data.cashEnd.hand} indent={1} />
            <LineItem label="Cash in Bank" amount={data.cashEnd.bank} indent={1} style={{ borderBottom: '1px solid #000', marginBottom: '2px', paddingBottom: '2px' }} />

            <div className="ar-signatures" style={{ marginTop: '48px' }}>
              <p style={{ marginBottom: '32px' }}>Prepared and certified correct by:</p>
              
              <div className="ar-signature-row">
                <div className="ar-signature-block">
                  <div className="ar-signature-line" style={{ fontWeight: 'bold', textTransform: 'uppercase' }}>
                    {data.skTreasurer || '_________________________'}
                  </div>
                  <div className="ar-signature-label">SK Treasurer</div>
                </div>
                <div className="ar-signature-block">
                  <div className="ar-signature-line">___________________</div>
                  <div className="ar-signature-label">Date</div>
                </div>
              </div>

              <p style={{ marginTop: '32px', marginBottom: '32px' }}>Approved by:</p>
              
              <div className="ar-signature-row">
                <div className="ar-signature-block">
                  <div className="ar-signature-line" style={{ fontWeight: 'bold', textTransform: 'uppercase' }}>
                    {data.skChairperson || '_________________________'}
                  </div>
                  <div className="ar-signature-label">SK Chairperson</div>
                </div>
                <div className="ar-signature-block">
                  <div className="ar-signature-line">___________________</div>
                  <div className="ar-signature-label">Date</div>
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* PAGE 3: Annex A - Summary of Projects & Accomplishments */}
        {data.projects.length > 0 && (
          <div className="print-page ar-print-page ar-annex-page">
            <h2 className="ar-annex-title">Annex A: Summary of Projects & Events for CY {data.year}</h2>
            <table className="ar-annex-table">
              <thead>
                <tr>
                  <th>No.</th>
                  <th>Project / Event Title</th>
                  <th>Category</th>
                  <th>Date</th>
                  <th>Total Cost</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.projects.map((proj, idx) => (
                  <tr key={proj.id}>
                    <td>{idx + 1}</td>
                    <td>{proj.event || proj.project || 'Untitled'}</td>
                    <td>{proj.category || 'Uncategorized'}</td>
                    <td>
                      {proj.eventDate || proj.date || proj.approvedAt
                        ? new Date(proj.eventDate || proj.date || proj.approvedAt).toLocaleDateString()
                        : '—'}
                    </td>
                    <td>{formatCurrency(proj.amount)}</td>
                    <td>{proj.projectStatus || proj.status || 'Completed'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

      </div>
    </div>
  )
}

export default AnnualReportPreview
