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

function TransmittalLetterPreview({ data, onClose }) {
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
  const hasRcdData = rcdRows.some((row) => row.no || row.amount)
  const hasOtherData = otherRows.some((row) => row.typeOfReport)

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
          {/* Government Letterhead with logos */}
          <div className="gov-letterhead">
            <div className="gov-logo-row">
              <div className="gov-logo-placeholder">[LOGO]</div>
              <div className="gov-letterhead-text">
                <p className="gov-line">Republic of the Philippines</p>
                <p className="gov-line-bold">REGION XII</p>
                <p className="gov-line">Province of Cotabato</p>
                <p className="gov-line">Municipality of Midsayap</p>
                <p className="gov-line-bold">Barangay Upper Glad II</p>
              </div>
              <div className="gov-logo-placeholder">[LOGO]</div>
            </div>
          </div>

          {/* Title */}
          <div className="doc-title">Transmittal Letter</div>

          <div className="transmittal-body">
            {/* Date */}
            <div className="transmittal-date">
              {formatDateLocal(date)}
            </div>

            {/* To block */}
            <div className="transmittal-to">
              <p style={{ margin: 0 }}>To:</p>
              <p style={{ margin: 0 }}>The Audit Team Leader</p>
              <p style={{ margin: 0 }}>
                COA Regional Office XII, LAS-A Team {coaTeamNumber || '___'}
              </p>
              <p style={{ margin: 0 }}>PSAO, Amas, Kidapawan City</p>
            </div>

            {/* Salutation */}
            <div className="transmittal-salutation">Sir/Madam:</div>

            {/* Body paragraph */}
            <div className="transmittal-paragraph">
              {bodyText}
            </div>

            {/* Account No */}
            <div className="transmittal-account">
              Account No.: {accountNo}
            </div>

            {/* DV Table */}
            {hasDvData ? (
              <table className="doc-table">
                <thead>
                  <tr>
                    <th colSpan={2}>DV</th>
                    <th colSpan={2}>Check</th>
                    <th rowSpan={2}>Payee</th>
                    <th rowSpan={2} style={{ width: '90px' }}>Amount</th>
                    <th colSpan={2}>SKC&apos;s Issued</th>
                  </tr>
                  <tr>
                    <th style={{ width: '70px' }}>Date</th>
                    <th style={{ width: '70px' }}>No.</th>
                    <th style={{ width: '70px' }}>Date</th>
                    <th style={{ width: '70px' }}>No.</th>
                    <th style={{ width: '70px' }}>Date</th>
                    <th style={{ width: '70px' }}>No.</th>
                  </tr>
                </thead>
                <tbody>
                  {dvRows.map((row, idx) => {
                    const hasRowData = row.payee || row.dvNo || row.amount
                    return (
                      <tr key={idx} className={hasRowData ? '' : 'empty-row'}>
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
                    )
                  })}
                  <tr style={{ fontWeight: 700 }}>
                    <td colSpan={5} style={{ textAlign: 'right' }}>TOTAL</td>
                    <td className="text-right">{currency.format(dvTotal)}</td>
                    <td colSpan={2}></td>
                  </tr>
                </tbody>
              </table>
            ) : (
              <div className="transmittal-no-transaction">NO TRANSACTION</div>
            )}

            {/* RCDs */}
            {hasRcdData ? (
              <>
                <div className="transmittal-section-title">
                  RCDs and Supporting Documents (RCRs, OR, VDS):
                </div>
                <table className="doc-table">
                  <thead>
                    <tr>
                      <th style={{ width: '100px' }}>Date</th>
                      <th style={{ width: '100px' }}>No.</th>
                      <th style={{ width: '120px' }}>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rcdRows.map((row, idx) => {
                      const hasRowData = row.no || row.amount
                      return (
                        <tr key={idx} className={hasRowData ? '' : 'empty-row'}>
                          <td>{formatDateLocal(row.date)}</td>
                          <td>{row.no}</td>
                          <td className="text-right">
                            {Number(row.amount) ? currency.format(Number(row.amount)) : ''}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </>
            ) : null}

            {/* Others */}
            {hasOtherData ? (
              <>
                <div className="transmittal-section-title">Others:</div>
                <table className="doc-table">
                  <thead>
                    <tr>
                      <th style={{ width: '100px' }}>Date</th>
                      <th>Type of Report</th>
                    </tr>
                  </thead>
                  <tbody>
                    {otherRows.map((row, idx) => {
                      const hasRowData = row.typeOfReport
                      return (
                        <tr key={idx} className={hasRowData ? '' : 'empty-row'}>
                          <td>{formatDateLocal(row.date)}</td>
                          <td className="text-left">{row.typeOfReport}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </>
            ) : null}

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
              <div className="transmittal-sig-block">
                <div className="transmittal-sig-name">{skChairperson || '___________'}</div>
                <div className="transmittal-sig-role">SK Chairperson</div>
              </div>
              <div className="transmittal-sig-block">
                <div className="transmittal-received">
                  <p style={{ margin: '0 0 4px', fontWeight: 700 }}>Received by:</p>
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
