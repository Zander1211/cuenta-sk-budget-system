import React, { useRef, useState } from 'react'
import { X, Printer } from 'lucide-react'
const currency = new Intl.NumberFormat('en-PH', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

function formatCurrency(amount) {
  if (amount === 0 || !amount) return '0'
  return currency.format(amount)
}

function AnnualReportPreview({ data, onClose, onSave }) {
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const contentRef = useRef(null)

  async function handlePrint(e) {
    e.preventDefault()
    if (onSave) {
      setIsSaving(true)
      setSaveError('')
      try {
        await onSave(data)
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

  const mooeLabels = {
    travelling: 'Travelling Expenses',
    training: 'Training Expenses',
    officeSupplies: 'Office Supplies Expenses',
    semiExpendable: 'Semi-Expendable Property Expenses',
    fuelOil: 'Fuel, Oil and Lubricants Expenses',
    accountableForms: 'Accountable Forms Expenses',
    otherSupplies: 'Other Supplies and Materials Expenses',
    water: 'Water Expenses',
    electricity: 'Electricity Expenses',
    postage: 'Postage and Courier Services',
    telephone: 'Telephone Expenses',
    internet: 'Internet Subscription Expenses',
    prizes: 'Prizes',
    rmLandImprovements: 'Repairs & Maint. - Land Improvements',
    rmBuildings: 'Repairs & Maint. - Buildings & Structures',
    rmMachinery: 'Repairs & Maint. - Machinery',
    rmOfficeEquipment: 'Repairs & Maint. - Office Equipment',
    rmICT: 'Repairs & Maint. - ICT Equipment',
    rmSports: 'Repairs & Maint. - Sports Equipment',
    rmTransportation: 'Repairs & Maint. - Transportation Eq.',
    rmFurniture: 'Repairs & Maint. - Furniture & Books',
    rmOtherProperty: 'Repairs & Maint. - Other Property & Eq.',
    fidelityBond: 'Fidelity Bond Premiums',
    advertising: 'Advertising Expenses',
    rent: 'Rent/Lease Expenses',
    membershipDues: 'Membership Dues & Contributions',
    donation: 'Donation',
    honoraria: 'Honoraria',
    bankCharges: 'Bank Charges',
    otherMOOE: 'Other Maintenance and Operating Expenses',
  }

  const coLabels = {
    land: 'Land',
    landImprovements: 'Land Improvements',
    buildings: 'Buildings',
    otherStructures: 'Other Structures',
    machinery: 'Machinery',
    officeEquipment: 'Office Equipment',
    ictEquipment: 'ICT Equipment',
    sportsEquipment: 'Sports Equipment',
    transportation: 'Transportation Equipment',
    furniture: 'Furniture, Fixtures and Books',
    otherProperty: 'Other Property and Equipment',
    cipLandImprovements: 'CIP - Land Improvements',
    cipBuildings: 'CIP - Buildings',
    cipOtherStructures: 'CIP - Other Structures',
  }

  const activeMooeCount = Object.entries(data.mooe || {}).filter(([k, v]) => v > 0 && k !== 'total').length
  const activeCoCount = Object.entries(data.co || {}).filter(([k, v]) => v > 0 && k !== 'total').length
  const totalGeneralAdminRows = 1 + activeMooeCount + ((data.co && data.co.total > 0) ? 1 : 0) + activeCoCount

  return (
    <div className="print-preview-overlay">
      <div className="print-preview-container" ref={contentRef} style={{ overflowX: 'hidden' }}>
        <div className="print-preview-toolbar">
          {saveError && <span style={{ color: '#ef4444', marginRight: '16px', fontSize: '0.9rem' }}>{saveError}</span>}
          <button type="button" className="close-btn" onClick={onClose} disabled={isSaving}>
            <X size={16} /> Close
          </button>
          <button type="button" className="print-btn" onClick={handlePrint} disabled={isSaving}>
            <Printer size={16} /> {isSaving ? 'Saving...' : 'Print / Save as PDF'}
          </button>
        </div>

        <style>{`
          @media print {
            @page { size: portrait; margin: 0.5in; }
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; background: white !important; }
            .print-preview-overlay { background: white !important; overflow: visible !important; position: static !important; }
            .print-preview-toolbar { display: none !important; }
            .print-preview-container { padding: 0 !important; margin: 0 !important; box-shadow: none !important; width: 100% !important; max-width: 100% !important; overflow: visible !important; }
            .print-page { box-shadow: none !important; margin: 0 !important; padding: 0 !important; border: none !important; min-height: auto !important; width: 100% !important; }
            .resolution-section { page-break-before: always; }
          }
          
          .abyip-container {
            width: 100%;
            min-width: 0;
            max-width: 100%;
            box-sizing: border-box;
            background: white;
            color: black;
            font-family: 'Times New Roman', Times, serif;
            font-size: 10pt;
            line-height: 1.4;
            padding: 40px;
          }
          
          @media (max-width: 768px) {
            .abyip-container {
              padding: 20px;
            }
          }

          .abyip-header {
            text-align: center;
            line-height: 1.2;
            margin-bottom: 20px;
          }
          .abyip-title {
            text-align: center;
            font-weight: bold;
            margin: 20px 0;
            font-size: 11pt;
            text-transform: uppercase;
          }
          .abyip-table {
            width: 100%;
            border-collapse: collapse;
            table-layout: fixed;
            font-size: 9.5pt;
            margin-bottom: 30px;
          }
          .abyip-table th, .abyip-table td {
            border: 1px solid #000;
            padding: 6px;
            vertical-align: middle;
            overflow-wrap: anywhere;
          }
          .abyip-table th {
            text-align: center;
            font-weight: bold;
          }
          .amount-col {
            text-align: right;
            font-variant-numeric: tabular-nums;
          }
          .center-col {
            text-align: center;
          }
          .bold { font-weight: bold; }
          .uppercase { text-transform: uppercase; }
          .indent-1 { padding-left: 20px !important; }
          .indent-2 { padding-left: 40px !important; }
          
          .resolution-section {
            margin-top: 80px;
          }
          .resolution-section p {
            margin: 0 0 15px 0;
            text-align: justify;
          }
        `}</style>
        
        <div className="print-page" style={{ width: '100%', overflowX: 'hidden', boxSizing: 'border-box', background: 'white' }}>
          <div className="abyip-container">
            
            {/* ABYIP HEADER */}
            <div className="abyip-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', marginBottom: '20px' }}>
              <div style={{ textAlign: 'center', lineHeight: '1.3' }}>
                <p style={{ margin: 0 }}>Republic of the Philippines</p>
                <p style={{ margin: 0 }}>Province of {data.province || 'Cotabato'}</p>
                <p style={{ margin: 0 }}>Municipality of {data.city || 'Midsayap'}</p>
                <p className="bold uppercase" style={{ margin: 0 }}>SK OF BARANGAY {data.barangay?.toUpperCase() || 'UPPER GLAD 2'}</p>
                <br/>
                <p className="bold uppercase" style={{ fontSize: '11pt', margin: 0 }}>OFFICE OF THE SANGGUNIANG KABATAAN</p>
              </div>
            </div>
            
            <div className="abyip-title">
              <p>ANNUAL BARANGAY YOUTH INVESTMENT PLAN</p>
              <p>(ABYIP) CY-{data.year}</p>
            </div>
            
            <table className="abyip-table">
              <thead>
                <tr>
                  <th style={{ width: '32%' }}>OBJECT OF EXPENDITURES</th>
                  <th style={{ width: '8%' }}>ACCOUNT<br/>CODE</th>
                  <th style={{ width: '16%' }}>BUDGET YEAR<br/>EXPENDITURES</th>
                  <th style={{ width: '22%' }}>EXPECTED RESULTS<br/>(DESIRED OBJECTIVE)</th>
                  <th style={{ width: '22%' }}>PERFORMANCE INDICATORS<br/>(MEANS OF MEASUREMENT)</th>
                </tr>
              </thead>
              <tbody>
                {/* RECEIPTS PROGRAM */}
                <tr>
                  <td colSpan="5" className="bold">PART I. Receipts Program</td>
                </tr>
                
                {data.receipts.subsidyBarangay > 0 && (
                  <tr>
                    <td className="indent-1">Ten Percent (10%) of the general fund of the barangay</td>
                    <td className="center-col"></td>
                    <td className="amount-col">{formatCurrency(data.receipts.subsidyBarangay)}</td>
                    <td></td>
                    <td></td>
                  </tr>
                )}
                {data.receipts.subsidyOtherLGU > 0 && (
                  <tr>
                    <td className="indent-1">Subsidy from Other LGUs</td>
                    <td className="center-col"></td>
                    <td className="amount-col">{formatCurrency(data.receipts.subsidyOtherLGU)}</td>
                    <td></td>
                    <td></td>
                  </tr>
                )}
                {data.receipts.subsidyNGA > 0 && (
                  <tr>
                    <td className="indent-1">Subsidy from National Government Agencies</td>
                    <td className="center-col"></td>
                    <td className="amount-col">{formatCurrency(data.receipts.subsidyNGA)}</td>
                    <td></td>
                    <td></td>
                  </tr>
                )}
                {data.receipts.subsidyGOCC > 0 && (
                  <tr>
                    <td className="indent-1">Subsidy from GOCCs</td>
                    <td className="center-col"></td>
                    <td className="amount-col">{formatCurrency(data.receipts.subsidyGOCC)}</td>
                    <td></td>
                    <td></td>
                  </tr>
                )}
                {(data.receipts.grantsSpecific > 0 || data.receipts.grantsWithoutSpecific > 0) && (
                  <tr>
                    <td className="indent-1">Grants and Donations in Cash</td>
                    <td className="center-col"></td>
                    <td className="amount-col">{formatCurrency(data.receipts.grantsSpecific + data.receipts.grantsWithoutSpecific)}</td>
                    <td></td>
                    <td></td>
                  </tr>
                )}
                {data.receipts.miscIncome > 0 && (
                  <tr>
                    <td className="indent-1">Miscellaneous Income</td>
                    <td className="center-col"></td>
                    <td className="amount-col">{formatCurrency(data.receipts.miscIncome)}</td>
                    <td></td>
                    <td></td>
                  </tr>
                )}
                {data.receipts.otherReceipts > 0 && (
                  <tr>
                    <td className="indent-1">Receipts from fund raising activities / Others</td>
                    <td className="center-col"></td>
                    <td className="amount-col">{formatCurrency(data.receipts.otherReceipts)}</td>
                    <td></td>
                    <td></td>
                  </tr>
                )}
                
                <tr>
                  <td className="bold uppercase">TOTAL ESTIMATED FUNDS AVAILABLE FOR APPROPRIATION</td>
                  <td></td>
                  <td className="amount-col bold">{formatCurrency(data.receipts.total)}</td>
                  <td></td>
                  <td></td>
                </tr>

                {/* EXPENDITURES PROGRAM */}
                <tr>
                  <td colSpan="5" className="bold" style={{ borderTop: '2px solid black' }}>PART II. Expenditures Program</td>
                </tr>
                <tr>
                  <td colSpan="5" className="center-col bold">General Administration Current Operating Expenditures</td>
                </tr>
                
                {/* MOOE */}
                <tr>
                  <td className="bold uppercase">MOOE</td>
                  <td></td>
                  <td className="amount-col bold">{formatCurrency(data.mooe.total)}</td>
                  <td rowSpan={totalGeneralAdminRows} style={{ whiteSpace: 'pre-wrap', verticalAlign: 'top', textAlign: 'left', padding: '10px' }}>
                    {data.expectedResults || 'Not specified'}
                  </td>
                  <td rowSpan={totalGeneralAdminRows} style={{ whiteSpace: 'pre-wrap', verticalAlign: 'top', textAlign: 'left', padding: '10px' }}>
                    {data.performanceIndicators || 'Not specified'}
                  </td>
                </tr>
                {Object.entries(data.mooe).filter(([k, v]) => v > 0 && k !== 'total').map(([key, value]) => (
                  <tr key={key}>
                    <td className="indent-1">{mooeLabels[key] || key}</td>
                    <td></td>
                    <td className="amount-col">{formatCurrency(value)}</td>
                  </tr>
                ))}

                {/* CO */}
                {data.co.total > 0 && (
                  <>
                    <tr>
                      <td className="bold uppercase">CAPITAL OUTLAYS</td>
                      <td></td>
                      <td className="amount-col bold">{formatCurrency(data.co.total)}</td>
                    </tr>
                    {Object.entries(data.co).filter(([k, v]) => v > 0 && k !== 'total').map(([key, value]) => (
                      <tr key={key}>
                        <td className="indent-1">{coLabels[key] || key}</td>
                        <td></td>
                        <td className="amount-col">{formatCurrency(value)}</td>
                      </tr>
                    ))}
                  </>
                )}
                
                <tr>
                  <td className="bold uppercase" style={{ borderTop: '2px solid black', borderBottom: '2px solid black' }}>TOTAL GENERAL ADMINISTRATION PROGRAM</td>
                  <td></td>
                  <td className="amount-col bold" style={{ borderTop: '2px solid black', borderBottom: '2px solid black' }}>
                    {formatCurrency(data.mooe.total + data.co.total)}
                  </td>
                  <td></td>
                  <td></td>
                </tr>

                {/* PROJECTS / PROGRAMS */}
                {data.projects.map((proj, idx) => {
                  const letter = String.fromCharCode(65 + idx);
                  const title = proj.event || proj.project || 'Untitled Project';
                  
                  const overrideExpected = data.projectOverrides?.[proj.id]?.expectedResult;
                  const expectedResult = (overrideExpected !== undefined) ? overrideExpected : (proj.description || '');
                  
                  const overrideIndicator = data.projectOverrides?.[proj.id]?.indicator;
                  const indicator = (overrideIndicator !== undefined) ? overrideIndicator : (proj.projectStatus || proj.status || '');
                  
                  const category = proj.category || 'Youth Development Program';

                  return (
                    <React.Fragment key={proj.id || idx}>
                      <tr>
                        <td className="bold">{letter}. {category}</td>
                        <td></td>
                        <td></td>
                        <td style={{ whiteSpace: 'pre-wrap' }}>{expectedResult || 'Not specified'}</td>
                        <td style={{ whiteSpace: 'pre-wrap' }}>{indicator || 'Not specified'}</td>
                      </tr>
                      <tr>
                        <td className="bold uppercase indent-1">MOOE</td>
                        <td></td>
                        <td className="amount-col">{formatCurrency(proj.amount)}</td>
                        <td></td>
                        <td></td>
                      </tr>
                      <tr>
                        <td className="indent-2">{title}</td>
                        <td></td>
                        <td className="amount-col">{formatCurrency(proj.amount)}</td>
                        <td></td>
                        <td></td>
                      </tr>
                    </React.Fragment>
                  );
                })}
                
                {data.cashAdvancesNet > 0 && (
                  <tr>
                    <td className="bold">Cash Advances, Net</td>
                    <td></td>
                    <td className="amount-col">{formatCurrency(data.cashAdvancesNet)}</td>
                    <td></td>
                    <td></td>
                  </tr>
                )}

                {/* TOTALS */}
                <tr>
                  <td className="bold uppercase" style={{ borderTop: '2px solid black' }}>TOTAL for YOUTH DEVELOPMENT AND EMPOWERMENT PROGRAMS</td>
                  <td style={{ borderTop: '2px solid black' }}></td>
                  <td className="amount-col bold" style={{ borderTop: '2px solid black' }}>
                    {formatCurrency(data.projects.reduce((sum, p) => sum + (Number(p.amount) || 0), 0))}
                  </td>
                  <td style={{ borderTop: '2px solid black' }}></td>
                  <td style={{ borderTop: '2px solid black' }}></td>
                </tr>
                <tr>
                  <td className="bold uppercase">TOTAL EXPENDITURE PROGRAM</td>
                  <td></td>
                  <td className="amount-col bold">{formatCurrency(data.totalPayments)}</td>
                  <td></td>
                  <td></td>
                </tr>
                <tr>
                  <td className="bold uppercase" style={{ borderBottom: '2px solid black' }}>ENDING BALANCE</td>
                  <td style={{ borderBottom: '2px solid black' }}></td>
                  <td className="amount-col bold" style={{ background: '#e0e0e0', borderBottom: '2px solid black' }}>
                    {formatCurrency(data.cashEnd.calculatedTotal)}
                  </td>
                  <td style={{ borderBottom: '2px solid black' }}></td>
                  <td style={{ borderBottom: '2px solid black' }}></td>
                </tr>
              </tbody>
            </table>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '50px', padding: '0 40px' }}>
              <div>
                <p style={{ marginBottom: '40px' }}>Prepared by:</p>
                <p style={{ fontWeight: 'bold', textDecoration: 'underline' }}>{data.skTreasurer?.toUpperCase() || '_______________________'}</p>
                <p style={{ textAlign: 'center' }}>SK Treasurer</p>
              </div>
              <div>
                <p style={{ marginBottom: '40px' }}>Approved:</p>
                <p style={{ fontWeight: 'bold', textDecoration: 'underline' }}>HON. {data.skChairperson?.toUpperCase() || '_______________________'}</p>
                <p style={{ textAlign: 'center' }}>SK Chairperson</p>
              </div>
            </div>

            {/* RESOLUTION SECTION - Starts on new page in print */}
            <div className="resolution-section">
              <div className="abyip-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', marginBottom: '30px' }}>
                <div style={{ textAlign: 'center', lineHeight: '1.3' }}>
                  <p style={{ margin: 0 }}>Republic of the Philippines</p>
                  <p style={{ margin: 0 }}>REGION XII</p>
                  <p style={{ margin: 0 }}>Province of {data.province || 'Cotabato'}</p>
                  <p style={{ margin: 0 }}>Municipality of {data.city || 'Midsayap'}</p>
                  <p className="uppercase bold" style={{ margin: 0 }}>SK OF BARANGAY {data.barangay || 'UPPER GLAD 2'}</p>
                  <br/>
                  <p className="uppercase bold" style={{ fontSize: '11pt', margin: 0 }}>OFFICE OF THE SANGGUNIANG KABATAAN</p>
                </div>
              </div>

              <p style={{ textTransform: 'uppercase', marginBottom: '30px' }}>
                EXCERPTS FROM THE MINUTES OF THE REGULAR SESSION OF THE SANGGUNIANG KABATAAN OF BARANGAY {data.barangay}, {data.city}, {data.province} HELD AT BARANGAY HALL ON DECEMBER 23, {data.year} AT EXACTLY 8:00 O'CLOCK IN THE MORNING. A RESOLUTION AUTHORIZING THE ANNUAL BUDGET OF THE BARANGAY {data.barangay}, FOR FISCAL YEAR {data.year} IN THE TOTAL AMOUNT OF {formatCurrency(data.receipts.total)} APPROPRIATING THE NECESSARY FUNDS FOR THE PURPOSE.
              </p>

              <div style={{ display: 'flex', marginBottom: '40px' }}>
                <div style={{ width: '120px', fontWeight: 'bold' }}>PRESENTS:</div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', marginBottom: '5px' }}>
                    <span style={{ width: '250px' }}>Hon. {data.skChairperson || '_________________'}</span> 
                    <span>___________________ Presiding Officer/SK Chairperson</span>
                  </div>
                  <div style={{ display: 'flex', marginBottom: '5px' }}>
                    <span style={{ width: '250px' }}>Hon. {data.skTreasurer || '_________________'}</span> 
                    <span>___________________ SK Treasurer</span>
                  </div>
                  <div style={{ display: 'flex', marginBottom: '5px' }}>
                    <span style={{ width: '250px' }}>Hon. {data.skSecretary || '___________________________'}</span> 
                    <span>___________________ SK Secretary</span>
                  </div>
                  {(data.skKagawads || ['', '', '', '', '', '', '']).map((kagawad, idx) => {
                    // Only render empty lines up to 5 if entirely blank, to match standard forms, or all 7 if they are entered.
                    // Wait, if all are blank, rendering 7 might make the page too long? Let's just render all of them unconditionally.
                    return (
                      <div key={idx} style={{ display: 'flex', marginBottom: '5px' }}>
                        <span style={{ width: '250px' }}>Hon. {kagawad || '___________________________'}</span> 
                        <span>___________________ SK Kagawad</span>
                      </div>
                    )
                  })}
                </div>
              </div>

              <div style={{ textAlign: 'center', marginBottom: '40px' }}>
                <p className="bold">RESOLUTION NO. _______</p>
                <p>Series of {data.year}</p>
              </div>

              <p>
                PRESENT FOR CONSIDERATION IS THE ANNUAL BUDGET OF SANGGUNIANG KABATAAN OF BARANGAY {data.barangay} FISCAL YEAR {data.year} IN THE TOTAL AMOUNT of {formatCurrency(data.receipts.total)} covering the various expenditures of SK barangay Government for FY {data.year} is hereby approved.
              </p>

              <p>
                WHEREAS, incorporated is the Annual Barangay Youth Investment Plan (ABYIP) which shall be made an integral part of this Resolution;
              </p>

              <p>
                WHEREAS, pursuant to section 329 of RA NO. 7160 and Section 20 (a) of RA No. 10742, Ten percent (10%) of the general fund of the Barangay shall be set aside for the SK. The Sangguniang Barangay shall appropriate the SK Funds in Lump-sum which shall be disbursed solely for youth development and empowerment purpose.
              </p>

              <p>
                WHEREAS, Section 20 (b) of RA No.10742 provides that the SK shall have Financial independence in its operation, disbursement and encashment of their funds, income and expenditures;
              </p>

              <p>
                NOW THEREFORE, on motion of SK Kagawad ___________________________ and duly seconded by Hon. ___________________________ be it.
              </p>

              <p>
                RESOLVED, as it is hereby approved to enact the following Appropriation Resolution to wit;
              </p>

              <p style={{ marginLeft: '40px' }}>
                The provision of this Appropriation shall take on January {data.year} to December {data.year}.
              </p>

              <p style={{ marginLeft: '40px' }}>
                RESOLVED FINALLY, as it is finally resolved to forward copy of this resolution to the office of Sangguniang Bayan for information.
              </p>

              <p style={{ marginTop: '40px', marginBottom: '40px' }}>UNANIMOUSLY APPROVED: December 22, {data.year}</p>

              <p style={{ textTransform: 'uppercase', marginBottom: '60px' }}>I HEREBY CERTIFY to the correctness of the above-quoted resolution.</p>

              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '20px' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <span style={{ marginRight: '10px' }}>Attested by:</span>
                    <span style={{ borderBottom: '1px solid black', width: '200px', display: 'inline-block' }}></span>
                  </div>
                  <p style={{ paddingLeft: '90px', marginTop: '5px' }}>SK Secretary</p>
                </div>
              </div>
              
              <div style={{ marginTop: '50px' }}>
                <p>Approved:</p>
                <div style={{ marginTop: '40px', paddingLeft: '60px' }}>
                  <p style={{ textDecoration: 'underline', fontWeight: 'bold' }}>HON. {data.skChairperson?.toUpperCase() || '_______________________'}</p>
                  <p style={{ paddingLeft: '30px', marginTop: '5px' }}>SK CHAIRPERSON</p>
                </div>
              </div>

            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default AnnualReportPreview
