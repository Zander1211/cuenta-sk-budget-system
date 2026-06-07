import '../PrintPreview.css'
import './AdditionalDocuments.css'

const currency = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  maximumFractionDigits: 2,
})

function ProjectDesignPreview({ data, onClose }) {
  const {
    title,
    cost,
    location,
    projectLeader,
    rationale,
    objectives,
    beneficiaries,
    estimatedParticipants,
    budgetItems,
    totalBudget,
    sourceOfFund,
    preparedBy,
    notedBy,
  } = data

  function handlePrint(e) {
    e.preventDefault()
    window.print()
  }

  const MIN_BUDGET_ROWS = 8
  const paddedBudgetItems = [...budgetItems]
  while (paddedBudgetItems.length < MIN_BUDGET_ROWS) {
    paddedBudgetItems.push({ qty: '', unitOfIssue: '', description: '', unitCost: '', amount: '' })
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
                <p className="gov-line-bold">BARANGAY UPPER GLAD II</p>
              </div>
              <div className="gov-logo-placeholder">[LOGO]</div>
            </div>
            <p className="gov-office">OFFICE OF THE SANGGUNIANG KABATAAN</p>
          </div>

          {/* Title */}
          <div className="doc-title">Project Design</div>

          {/* Sections */}
          <div className="project-section">
            <span className="section-label">I. TITLE:</span>
            <span className="section-value">{title}</span>
          </div>

          <div className="project-section">
            <span className="section-label">II. COST:</span>
            <span className="section-value">{currency.format(cost)}</span>
          </div>

          <div className="project-section">
            <span className="section-label">III. LOCATION:</span>
            <span className="section-value">{location}</span>
          </div>

          <div className="project-section">
            <span className="section-label">IV. PROJECT LEADER:</span>
            <span className="section-value">{projectLeader}</span>
          </div>

          <div className="project-section">
            <span className="section-label">V. RATIONALE:</span>
            {rationale ? (
              <div className="section-text">{rationale}</div>
            ) : (
              <span className="section-value" style={{ fontStyle: 'italic', color: '#666' }}>
                (No rationale provided)
              </span>
            )}
          </div>

          <div className="project-section">
            <span className="section-label">VI. OBJECTIVES:</span>
            {objectives.length ? (
              <ol>
                {objectives.map((obj, idx) => (
                  <li key={idx}>{obj}</li>
                ))}
              </ol>
            ) : (
              <span
                className="section-value"
                style={{ fontStyle: 'italic', color: '#666', marginLeft: '40px', display: 'block' }}
              >
                (No objectives provided)
              </span>
            )}
          </div>

          <div className="project-section">
            <span className="section-label">VII. TARGET BENEFICIARIES:</span>
            {beneficiaries.length ? (
              <ol>
                {beneficiaries.map((ben, idx) => (
                  <li key={idx}>{ben}</li>
                ))}
              </ol>
            ) : null}
            <p style={{ marginLeft: '40px', fontSize: '12px' }}>
              Estimated number of participants: <strong>{estimatedParticipants}</strong> recipients
            </p>
          </div>

          <div className="project-section">
            <span className="section-label">VIII. BUDGETARY REQUIREMENTS:</span>
          </div>

          {/* Budget table */}
          <table className="doc-table">
            <thead>
              <tr>
                <th style={{ width: '50px' }}>Qty</th>
                <th style={{ width: '80px' }}>Unit of Issue</th>
                <th>Item Description</th>
                <th style={{ width: '110px' }}>Estimated Unit Cost</th>
                <th style={{ width: '120px' }}>Estimated Amount</th>
              </tr>
            </thead>
            <tbody>
              {paddedBudgetItems.map((item, idx) => {
                const hasData = item.description || item.qty
                return (
                  <tr key={idx} className={hasData ? '' : 'empty-row'}>
                    <td>{hasData ? item.qty : ''}</td>
                    <td>{item.unitOfIssue || ''}</td>
                    <td className="text-left">{item.description || ''}</td>
                    <td className="text-right">
                      {hasData && item.unitCost ? currency.format(Number(item.unitCost)) : ''}
                    </td>
                    <td className="text-right">
                      {hasData && item.amount ? currency.format(Number(item.amount)) : ''}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          {/* Total */}
          <div className="doc-total-row">
            <span>TOTAL:</span>
            <span>{currency.format(totalBudget)}</span>
          </div>

          <div className="project-source-fund">SOURCE OF FUND: {sourceOfFund}</div>

          {/* Signatures */}
          <div className="project-signatures">
            <div className="project-sig-block">
              <div className="project-sig-title">Prepared by:</div>
              <div className="project-sig-name">{preparedBy || '___________'}</div>
              <div className="project-sig-role">SK Kagawad</div>
            </div>
            <div className="project-sig-block">
              <div className="project-sig-title">Noted by:</div>
              <div className="project-sig-name">{notedBy || '___________'}</div>
              <div className="project-sig-role">SK Chairman</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ProjectDesignPreview
