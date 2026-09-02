import { useState } from 'react'
import '../PrintPreview.css'
import './AdditionalDocuments.css'
import { Printer, X } from 'lucide-react'
import logo from '../../assets/logo.png'

const currency = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  maximumFractionDigits: 2,
})

function formatDate(dateStr) {
  if (!dateStr) return '_______________'
  const d = new Date(dateStr)
  if (Number.isNaN(d.getTime())) return dateStr
  return d.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

// Table of contents section numbering
const tocSections = [
  { num: 'I', title: 'Preliminaries', page: '1' },
  { num: 'II', title: 'Introduction', page: '2' },
  { num: 'III', title: 'Program / Activity Details', page: '3' },
  { num: 'IV', title: 'Challenges Encountered and Solutions', page: '4' },
  { num: 'V', title: 'Results, Insights, and Recommendations', page: '5' },
  { num: 'VI', title: 'Appendices and Attachments', page: '6' },
]

function NarrativeReportPreview({ data, onClose, onSave }) {
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

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

  const hasFinancial =
    data.financialData &&
    (data.financialData.approved > 0 || data.financialData.breakdown?.length > 0)

  const printMode = data.printMode || 'both'
  const showNarrative = printMode === 'both' || printMode === 'narrative'
  const showPhotos = printMode === 'both' || printMode === 'photos'
  const showCoverPage = data.includeCoverPage !== false

  const reportMainTitle = printMode === 'photos' ? 'PHOTO DOCUMENTATION' : printMode === 'both' ? 'NARRATIVE REPORT & PHOTO DOCUMENTATION' : 'NARRATIVE REPORT'


  return (
    <div className="print-preview-overlay">
      <div className="print-preview-container" style={{ maxWidth: '900px' }}>
        <div className="print-preview-toolbar">
          {saveError && <span style={{ color: '#ef4444', marginRight: '16px', fontSize: '0.9rem' }}>{saveError}</span>}
          <button type="button" className="close-btn" onClick={onClose} disabled={isSaving}>
            <X size={16} /> Close
          </button>
          <button type="button" className="print-btn" onClick={handlePrint} disabled={isSaving}>
            <Printer size={16} /> {isSaving ? 'Saving...' : 'Print / Save as PDF'}
          </button>
        </div>

        {/* ════════════════════════════════════════════════ */}
        {/*  PAGE 1 — TITLE PAGE                            */}
        {/* ════════════════════════════════════════════════ */}
        {showCoverPage && (
          <div className="print-page nr-print-page">
          <div className="nr-title-page">
            <div className="nr-logo-area" style={{ display: 'flex', justifyContent: 'center', marginBottom: '20px', padding: '0 50px' }}>
              <img src={logo} alt="SK Logo" style={{ width: '120px', height: '120px', objectFit: 'contain' }} />
            </div>

            <div className="nr-title-block" style={{ textAlign: 'center', marginBottom: '40px', lineHeight: '1.3' }}>
              <p style={{ margin: 0 }}>Republic of the Philippines</p>
              <p style={{ margin: 0 }}>
                Barangay {data.barangay}, {data.municipality}, {data.province}
              </p>
              <br/>
              <p style={{ margin: 0, fontWeight: 'bold', fontSize: '14pt' }}>SANGGUNIANG KABATAAN</p>
            </div>

            <div className="nr-title-main">
              <h1>{reportMainTitle}</h1>
              <div className="nr-title-divider" />
              <h2>{data.projectTitle || 'Untitled Project'}</h2>
            </div>

            <div className="nr-title-details">
              <div className="nr-title-detail-row">
                <span className="nr-detail-label">Date of Activity:</span>
                <span className="nr-detail-value">{formatDate(data.activityDate)}</span>
              </div>
              <div className="nr-title-detail-row">
                <span className="nr-detail-label">Venue:</span>
                <span className="nr-detail-value">{data.venue || '_______________'}</span>
              </div>
              <div className="nr-title-detail-row">
                <span className="nr-detail-label">Target Beneficiaries:</span>
                <span className="nr-detail-value">{data.beneficiaries || '_______________'}</span>
              </div>
            </div>

            <div className="nr-title-footer">
              <p>Barangay {data.barangay}</p>
              <p>{data.municipality}, {data.province}</p>
            </div>
          </div>
        </div>
        )}

        {/* ════════════════════════════════════════════════ */}
        {/*  PAGE 2 — ACKNOWLEDGMENT & TOC                  */}
        {/* ════════════════════════════════════════════════ */}
        {(showNarrative || showCoverPage) && (
          <div className="print-page nr-print-page" style={{ marginTop: showCoverPage ? '24px' : '0' }}>
          {/* Acknowledgment */}
          <div className="nr-section">
            <h2 className="nr-section-heading">ACKNOWLEDGMENT AND APPROVAL</h2>
            <p className="nr-body-text">{data.acknowledgment}</p>

            <div className="nr-sig-grid">
              <div className="nr-sig-block">
                <p className="nr-sig-label">Prepared by:</p>
                <div className="nr-sig-line-space" />
                <p className="nr-sig-name">{data.skKagawad || '_______________'}</p>
                <p className="nr-sig-role">SK Kagawad — Assigned</p>
              </div>
              <div className="nr-sig-block">
                <p className="nr-sig-label">Noted and Approved by:</p>
                <div className="nr-sig-line-space" />
                <p className="nr-sig-name">{data.skChairperson || '_______________'}</p>
                <p className="nr-sig-role">SK Chairperson</p>
              </div>
              {data.otherSignatories ? (
                <div className="nr-sig-block" style={{ gridColumn: '1 / -1' }}>
                  <p className="nr-sig-label">Other Authorized Signatories:</p>
                  <div className="nr-sig-line-space" />
                  <p className="nr-sig-name">{data.otherSignatories}</p>
                </div>
              ) : null}
            </div>
          </div>

          {/* Table of Contents */}
          {showNarrative && (
            <div className="nr-section" style={{ marginTop: '40px' }}>
              <h2 className="nr-section-heading">TABLE OF CONTENTS</h2>
              <table className="nr-toc-table">
                <thead>
                  <tr>
                    <th style={{ width: '50px' }}>No.</th>
                    <th>Section</th>
                    <th style={{ width: '60px', textAlign: 'right' }}>Page</th>
                  </tr>
                </thead>
                <tbody>
                  {tocSections.map((s) => (
                    <tr key={s.num}>
                      <td>{s.num}</td>
                      <td>{s.title}</td>
                      <td style={{ textAlign: 'right' }}>{s.page}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        )}

        {/* ════════════════════════════════════════════════ */}
        {/*  NARRATIVE SECTIONS (Conditional)               */}
        {/* ════════════════════════════════════════════════ */}
        {showNarrative && (
          <>
            {/* ════════════════════════════════════════════════ */}
            {/*  PAGE 3 — INTRODUCTION                          */}
            {/* ════════════════════════════════════════════════ */}
            <div className="print-page nr-print-page" style={{ marginTop: '24px' }}>
          <div className="nr-page-header">
            <span>Narrative Report — {data.projectTitle}</span>
            <span>Section II</span>
          </div>

          <div className="nr-section">
            <h2 className="nr-section-heading">II. INTRODUCTION</h2>

            <h3 className="nr-sub-heading">A. Rationale / Background</h3>
            <p className="nr-body-text">
              {data.rationale || 'No rationale provided.'}
            </p>

            <h3 className="nr-sub-heading">B. Objectives</h3>
            {data.objectives.length > 0 ? (
              <ol className="nr-objectives-list">
                {data.objectives.map((obj, idx) => (
                  <li key={idx}>{obj}</li>
                ))}
              </ol>
            ) : (
              <p className="nr-body-text nr-empty">No objectives listed.</p>
            )}
          </div>
        </div>

        {/* ════════════════════════════════════════════════ */}
        {/*  PAGE 4 — PROGRAM / ACTIVITY DETAILS            */}
        {/* ════════════════════════════════════════════════ */}
        <div className="print-page nr-print-page" style={{ marginTop: '24px' }}>
          <div className="nr-page-header">
            <span>Narrative Report — {data.projectTitle}</span>
            <span>Section III</span>
          </div>

          <div className="nr-section">
            <h2 className="nr-section-heading">III. PROGRAM / ACTIVITY DETAILS</h2>

            <h3 className="nr-sub-heading">A. Event Information</h3>
            <table className="nr-info-table">
              <tbody>
                <tr>
                  <td className="nr-info-label">Project / Event Name</td>
                  <td>{data.projectTitle || '—'}</td>
                </tr>
                <tr>
                  <td className="nr-info-label">Date</td>
                  <td>{formatDate(data.activityDate)}</td>
                </tr>
                <tr>
                  <td className="nr-info-label">Venue</td>
                  <td>{data.venue || '—'}</td>
                </tr>
                <tr>
                  <td className="nr-info-label">Target Participants</td>
                  <td>{data.targetParticipants || '—'}</td>
                </tr>
                <tr>
                  <td className="nr-info-label">Total Participants</td>
                  <td>{data.totalParticipants || '—'}</td>
                </tr>
              </tbody>
            </table>

            {data.activityFlow.length > 0 ? (
              <>
                <h3 className="nr-sub-heading">B. Activity Flow</h3>
                <table className="nr-flow-table">
                  <thead>
                    <tr>
                      <th style={{ width: '140px' }}>Time</th>
                      <th>Activity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.activityFlow.map((item, idx) => (
                      <tr key={idx}>
                        <td>{item.time || '—'}</td>
                        <td>{item.activity || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            ) : null}

            <h3 className="nr-sub-heading">C. Speakers and Participants</h3>
            <table className="nr-info-table">
              <tbody>
                <tr>
                  <td className="nr-info-label">Resource Speakers</td>
                  <td style={{ whiteSpace: 'pre-line' }}>{data.resourceSpeakers || '—'}</td>
                </tr>
                <tr>
                  <td className="nr-info-label">Facilitators</td>
                  <td style={{ whiteSpace: 'pre-line' }}>{data.facilitators || '—'}</td>
                </tr>
                <tr>
                  <td className="nr-info-label">Guests</td>
                  <td style={{ whiteSpace: 'pre-line' }}>{data.guests || '—'}</td>
                </tr>
                <tr>
                  <td className="nr-info-label">Total No. of Participants</td>
                  <td>{data.totalParticipants || '—'}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* ════════════════════════════════════════════════ */}
        {/*  PAGE 5 — CHALLENGES & SOLUTIONS                */}
        {/* ════════════════════════════════════════════════ */}
        <div className="print-page nr-print-page" style={{ marginTop: '24px' }}>
          <div className="nr-page-header">
            <span>Narrative Report — {data.projectTitle}</span>
            <span>Section IV</span>
          </div>

          <div className="nr-section">
            <h2 className="nr-section-heading">IV. CHALLENGES ENCOUNTERED AND SOLUTIONS</h2>

            <h3 className="nr-sub-heading">A. Challenges Encountered</h3>
            <p className="nr-body-text">
              {data.challenges || 'No challenges documented.'}
            </p>

            <h3 className="nr-sub-heading">B. Actions Taken</h3>
            <p className="nr-body-text">
              {data.actionsTaken || 'No actions documented.'}
            </p>
          </div>
        </div>

        {/* ════════════════════════════════════════════════ */}
        {/*  PAGE 6 — RESULTS & RECOMMENDATIONS             */}
        {/* ════════════════════════════════════════════════ */}
        <div className="print-page nr-print-page" style={{ marginTop: '24px' }}>
          <div className="nr-page-header">
            <span>Narrative Report — {data.projectTitle}</span>
            <span>Section V</span>
          </div>

          <div className="nr-section">
            <h2 className="nr-section-heading">V. RESULTS, INSIGHTS, AND RECOMMENDATIONS</h2>

            <h3 className="nr-sub-heading">A. Summary of Outcomes</h3>
            <table className="nr-info-table">
              <tbody>
                <tr>
                  <td className="nr-info-label">Beneficiaries Reached</td>
                  <td>{data.beneficiariesReached || '—'}</td>
                </tr>
                <tr>
                  <td className="nr-info-label">Skills Learned</td>
                  <td>{data.skillsLearned || '—'}</td>
                </tr>
                <tr>
                  <td className="nr-info-label">Community Impact</td>
                  <td>{data.communityImpact || '—'}</td>
                </tr>
                <tr>
                  <td className="nr-info-label">Accomplishments</td>
                  <td>{data.accomplishments || '—'}</td>
                </tr>
              </tbody>
            </table>

            <h3 className="nr-sub-heading">B. Recommendations</h3>
            <p className="nr-body-text">
              {data.recommendations || 'No recommendations provided.'}
            </p>
          </div>
        </div>
        </>
        )}

        {/* ════════════════════════════════════════════════ */}
        {/*  PAGE 7 — APPENDICES / PHOTO DOC                 */}
        {/* ════════════════════════════════════════════════ */}
        {(showNarrative || showPhotos) && (
          <div className="print-page nr-print-page" style={{ marginTop: '24px' }}>
            <div className="nr-page-header">
              <span>{reportMainTitle} — {data.projectTitle}</span>
              <span>{showNarrative ? 'Section VI' : 'Documentation'}</span>
            </div>

            <div className="nr-section">
              {showNarrative && <h2 className="nr-section-heading">VI. APPENDICES AND ATTACHMENTS</h2>}

              {/* Financial Summary */}
              {showNarrative && (
                hasFinancial ? (
              <>
                <h3 className="nr-sub-heading">A. Financial Summary</h3>
                <table className="nr-finance-table">
                  <thead>
                    <tr>
                      <th>Description</th>
                      <th style={{ textAlign: 'right' }}>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.financialData.breakdown.length > 0
                      ? data.financialData.breakdown.map((item, idx) => (
                          <tr key={idx}>
                            <td>{item.itemName || `Item ${idx + 1}`}</td>
                            <td style={{ textAlign: 'right' }}>
                              {currency.format(
                                (Number(item.quantity) || 0) *
                                  (Number(item.unitCost) || 0)
                              )}
                            </td>
                          </tr>
                        ))
                      : (
                          <tr>
                            <td>Total Approved Budget</td>
                            <td style={{ textAlign: 'right' }}>
                              {currency.format(data.financialData.approved)}
                            </td>
                          </tr>
                        )}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td style={{ fontWeight: 700 }}>TOTAL</td>
                      <td style={{ textAlign: 'right', fontWeight: 700 }}>
                        {currency.format(data.financialData.approved)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </>
            ) : (
              <>
                <h3 className="nr-sub-heading">A. Financial Summary</h3>
                <p className="nr-body-text nr-empty">No financial data available.</p>
              </>
            )
          )}

            {/* Photo Documentation */}
            {showPhotos && (
              <>
                <h3 className="nr-sub-heading">
                  {showNarrative ? (hasFinancial ? 'B. Photo Documentation' : 'A. Photo Documentation') : 'Photo Documentation'}
                </h3>
            {data.photos.length > 0 ? (
              <div className="nr-photo-doc-grid">
                {data.photos.map((photo, idx) => (
                  <div className="nr-photo-doc-item" key={idx}>
                    <img src={photo.src} alt={photo.caption} />
                    <p className="nr-photo-doc-caption">
                      Photo {idx + 1}: {photo.caption}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="nr-body-text nr-empty">No photos attached.</p>
                )}
              </>
            )}
          </div>

          {/* Footer */}
          <div className="nr-report-footer">
            <p>
              This {printMode === 'photos' ? 'photo documentation' : 'narrative report'} is submitted in compliance with the documentation
              requirements of the Commission on Audit (COA) and the Department of the
              Interior and Local Government (DILG).
            </p>
            <p className="nr-footer-location">
              Barangay {data.barangay}, {data.municipality}, {data.province}
            </p>
          </div>
        </div>
        )}
      </div>
    </div>
  )
}

export default NarrativeReportPreview
