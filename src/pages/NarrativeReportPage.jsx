import { Fragment, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, PlusCircle, Trash2, Image, Upload } from 'lucide-react'
import RoleGate from '../components/RoleGate'
import { useBudget } from '../context/BudgetContext'
import { useAuth } from '../context/AuthContext'
import NarrativeReportPreview from '../components/documents/NarrativeReportPreview'

const currency = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  maximumFractionDigits: 0,
})

const DEFAULTS = {
  barangay: 'UPPER GLAD 2',
  municipality: 'MIDSAYAP',
  province: 'COTABATO',
  skChairperson: '',
  skKagawad: '',
}

function NarrativeReportPage() {
  const navigate = useNavigate()
  const { requests, expenses } = useBudget()
  const { profileName, role } = useAuth()

  const [selectedRequestId, setSelectedRequestId] = useState('')
  const [preview, setPreview] = useState(null)

  // ── 1. Preliminaries ──
  const [projectTitle, setProjectTitle] = useState('')
  const [activityDate, setActivityDate] = useState('')
  const [venue, setVenue] = useState('')
  const [beneficiaries, setBeneficiaries] = useState('')
  const [barangay, setBarangay] = useState(DEFAULTS.barangay)
  const [municipality, setMunicipality] = useState(DEFAULTS.municipality)
  const [province, setProvince] = useState(DEFAULTS.province)
  const [skChairperson, setSkChairperson] = useState(DEFAULTS.skChairperson)
  const [skKagawad, setSkKagawad] = useState(DEFAULTS.skKagawad)
  const [otherSignatories, setOtherSignatories] = useState('')
  const [acknowledgment, setAcknowledgment] = useState(
    'We, the undersigned members of the Sangguniang Kabataan Council, hereby acknowledge and certify the contents of this Narrative Report as true and accurate. This report is submitted in compliance with the documentation requirements set forth by the Commission on Audit (COA) and the Department of the Interior and Local Government (DILG).'
  )

  // ── 2. Introduction ──
  const [rationale, setRationale] = useState('')
  const [objectives, setObjectives] = useState([''])

  // ── 3. Program / Activity Details ──
  const [targetParticipants, setTargetParticipants] = useState('')
  const [activityFlow, setActivityFlow] = useState([{ time: '', activity: '' }])
  const [resourceSpeakers, setResourceSpeakers] = useState('')
  const [facilitators, setFacilitators] = useState('')
  const [guests, setGuests] = useState('')
  const [totalParticipants, setTotalParticipants] = useState('')

  // ── 4. Challenges & Solutions ──
  const [challenges, setChallenges] = useState('')
  const [actionsTaken, setActionsTaken] = useState('')

  // ── 5. Results & Recommendations ──
  const [beneficiariesReached, setBeneficiariesReached] = useState('')
  const [skillsLearned, setSkillsLearned] = useState('')
  const [communityImpact, setCommunityImpact] = useState('')
  const [accomplishments, setAccomplishments] = useState('')
  const [recommendations, setRecommendations] = useState('')

  // ── 6. Appendices ──
  const [photos, setPhotos] = useState([])

  // ── Request selection ──
  const eligibleRequests = useMemo(
    () =>
      requests.filter(
        (r) =>
          (r.status === 'Approved' || r.status === 'Pending' || !r.status) &&
          !r.archivedAt
      ),
    [requests]
  )

  const selectedRequest = useMemo(
    () => (selectedRequestId ? requests.find((r) => r.id === selectedRequestId) : null),
    [selectedRequestId, requests]
  )

  // Financial data from expenses
  const financialData = useMemo(() => {
    if (!selectedRequest) return { approved: 0, items: [] }

    const matchingExpenses = expenses.filter(
      (e) =>
        e.id === selectedRequest.id ||
        (e.event && e.event === selectedRequest.event) ||
        (e.project && e.project === selectedRequest.event)
    )

    const totalApproved = matchingExpenses.reduce(
      (sum, e) => sum + (Number(e.amount) || 0),
      0
    )

    return {
      approved: totalApproved || Number(selectedRequest.amount) || 0,
      items: matchingExpenses,
      breakdown: Array.isArray(selectedRequest.breakdown) ? selectedRequest.breakdown : [],
    }
  }, [selectedRequest, expenses])

  function handleSelectRequest(e) {
    const id = e.target.value
    setSelectedRequestId(id)

    if (!id) return

    const request = requests.find((r) => r.id === id)
    if (!request) return

    setProjectTitle(request.event || '')
    setActivityDate(request.eventDate || '')
    setVenue(request.venue || '')
    setRationale(request.description || '')
    if (request.notes) {
      setTargetParticipants(request.notes)
    }
  }

  // ── Objective helpers ──
  function updateObjective(index, value) {
    setObjectives((prev) => prev.map((o, i) => (i === index ? value : o)))
  }
  function addObjective() {
    setObjectives((prev) => [...prev, ''])
  }
  function removeObjective(index) {
    setObjectives((prev) => prev.filter((_, i) => i !== index))
  }

  // ── Activity flow helpers ──
  function updateFlowItem(index, field, value) {
    setActivityFlow((prev) =>
      prev.map((item, i) => (i === index ? { ...item, [field]: value } : item))
    )
  }
  function addFlowItem() {
    setActivityFlow((prev) => [...prev, { time: '', activity: '' }])
  }
  function removeFlowItem(index) {
    setActivityFlow((prev) => prev.filter((_, i) => i !== index))
  }

  // ── Photo helpers ──
  function handlePhotoUpload(e) {
    const files = Array.from(e.target.files || [])
    files.forEach((file) => {
      const reader = new FileReader()
      reader.onload = (ev) => {
        setPhotos((prev) => [
          ...prev,
          { src: ev.target.result, caption: file.name, fileName: file.name },
        ])
      }
      reader.readAsDataURL(file)
    })
    e.target.value = ''
  }
  function updatePhotoCaption(index, caption) {
    setPhotos((prev) => prev.map((p, i) => (i === index ? { ...p, caption } : p)))
  }
  function removePhoto(index) {
    setPhotos((prev) => prev.filter((_, i) => i !== index))
  }

  // ── Preview ──
  function handlePreview() {
    setPreview({
      // Preliminaries
      projectTitle,
      activityDate,
      venue,
      beneficiaries,
      barangay,
      municipality,
      province,
      skChairperson,
      skKagawad,
      otherSignatories,
      acknowledgment,
      // Introduction
      rationale,
      objectives: objectives.filter((o) => o.trim()),
      // Activity Details
      targetParticipants,
      activityFlow: activityFlow.filter((f) => f.time || f.activity),
      resourceSpeakers,
      facilitators,
      guests,
      totalParticipants,
      // Challenges
      challenges,
      actionsTaken,
      // Results
      beneficiariesReached,
      skillsLearned,
      communityImpact,
      accomplishments,
      recommendations,
      // Appendices
      photos,
      financialData,
    })
  }

  return (
    <RoleGate allow={['SK Chairman', 'SK Treasurer']}>
      <header className="dashboard-header">
        <div className="header-left">
          <div>
            <p className="eyebrow">Documents</p>
            <h1>Narrative Report</h1>
            <p>Generate a professional narrative report for a project or event.</p>
          </div>
        </div>
        <div className="header-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={() => navigate('/dashboard/documents')}
          >
            <ArrowLeft size={16} />
            Back to Documents
          </button>
        </div>
      </header>

      <section className="dashboard-content">
        {/* ── Select Request ── */}
        <div className="overview-card">
          <p className="eyebrow">Auto-fill</p>
          <h2>Select a project or event</h2>
          <p style={{ marginBottom: '12px', color: 'var(--ink-soft)', fontSize: '0.9rem' }}>
            Choose an existing request to auto-populate fields, or fill in manually.
          </p>
          <label className="field">
            <span>Select request</span>
            <select value={selectedRequestId} onChange={handleSelectRequest}>
              <option value="">— Choose a request —</option>
              {eligibleRequests.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.event} — {currency.format(r.amount)} ({r.status || 'Pending'})
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* ═══════ SECTION 1: PRELIMINARIES ═══════ */}
        <div className="overview-card">
          <p className="eyebrow">Section 1</p>
          <h2>Preliminaries — Title Page</h2>
          <div className="form-grid">
            <label className="field">
              <span>Project / Event Title</span>
              <input
                type="text"
                value={projectTitle}
                onChange={(e) => setProjectTitle(e.target.value)}
                placeholder="e.g. Youth Leadership Summit 2026"
              />
            </label>
            <label className="field">
              <span>Date of Activity</span>
              <input
                type="date"
                value={activityDate}
                onChange={(e) => setActivityDate(e.target.value)}
              />
            </label>
            <label className="field">
              <span>Venue</span>
              <input
                type="text"
                value={venue}
                onChange={(e) => setVenue(e.target.value)}
                placeholder="e.g. Barangay Covered Court"
              />
            </label>
            <label className="field">
              <span>Target Beneficiaries</span>
              <input
                type="text"
                value={beneficiaries}
                onChange={(e) => setBeneficiaries(e.target.value)}
                placeholder="e.g. Youth ages 15-30"
              />
            </label>
            <label className="field">
              <span>Barangay</span>
              <input
                type="text"
                value={barangay}
                onChange={(e) => setBarangay(e.target.value)}
              />
            </label>
            <label className="field">
              <span>Municipality / City</span>
              <input
                type="text"
                value={municipality}
                onChange={(e) => setMunicipality(e.target.value)}
              />
            </label>
            <label className="field">
              <span>Province</span>
              <input
                type="text"
                value={province}
                onChange={(e) => setProvince(e.target.value)}
              />
            </label>
          </div>
        </div>

        <div className="overview-card">
          <p className="eyebrow">Section 1</p>
          <h2>Acknowledgment &amp; Approval Sheet</h2>
          <label className="field">
            <span>Acknowledgment message</span>
            <textarea
              rows={4}
              value={acknowledgment}
              onChange={(e) => setAcknowledgment(e.target.value)}
            />
          </label>
          <div className="form-grid">
            <label className="field">
              <span>SK Chairperson</span>
              <input
                type="text"
                value={skChairperson}
                onChange={(e) => setSkChairperson(e.target.value)}
                placeholder="Full name"
              />
            </label>
            <label className="field">
              <span>Assigned SK Kagawad</span>
              <input
                type="text"
                value={skKagawad}
                onChange={(e) => setSkKagawad(e.target.value)}
                placeholder="Full name"
              />
            </label>
            <label className="field">
              <span>Other authorized signatories</span>
              <input
                type="text"
                value={otherSignatories}
                onChange={(e) => setOtherSignatories(e.target.value)}
                placeholder="Optional (comma-separated)"
              />
            </label>
          </div>
        </div>

        {/* ═══════ SECTION 2: INTRODUCTION ═══════ */}
        <div className="overview-card">
          <p className="eyebrow">Section 2</p>
          <h2>Introduction</h2>
          <label className="field">
            <span>Rationale / Background</span>
            <textarea
              rows={5}
              value={rationale}
              onChange={(e) => setRationale(e.target.value)}
              placeholder="Explain the purpose of the project or event. Reference the CBYDP and/or ABYIP where applicable."
            />
          </label>
          <div className="nr-section-list">
            <h3>Objectives</h3>
            {objectives.map((obj, idx) => (
              <div className="list-item-row" key={idx}>
                <span className="list-item-number">{idx + 1}.</span>
                <input
                  type="text"
                  value={obj}
                  onChange={(e) => updateObjective(idx, e.target.value)}
                  placeholder={`Objective ${idx + 1}`}
                />
                {objectives.length > 1 ? (
                  <button
                    type="button"
                    className="remove-row-btn"
                    onClick={() => removeObjective(idx)}
                    title="Remove"
                  >
                    <Trash2 size={14} />
                  </button>
                ) : null}
              </div>
            ))}
            <div className="add-row-actions">
              <button type="button" className="add-row-btn" onClick={addObjective}>
                <PlusCircle size={16} /> Add objective
              </button>
            </div>
          </div>
        </div>

        {/* ═══════ SECTION 3: PROGRAM / ACTIVITY DETAILS ═══════ */}
        <div className="overview-card">
          <p className="eyebrow">Section 3</p>
          <h2>Program / Activity Details</h2>
          <div className="form-grid">
            <label className="field">
              <span>Target Participants</span>
              <input
                type="text"
                value={targetParticipants}
                onChange={(e) => setTargetParticipants(e.target.value)}
                placeholder="e.g. 150 youth from the barangay"
              />
            </label>
            <label className="field">
              <span>Total Number of Participants</span>
              <input
                type="text"
                value={totalParticipants}
                onChange={(e) => setTotalParticipants(e.target.value)}
                placeholder="e.g. 142"
              />
            </label>
          </div>

          <div className="nr-section-list">
            <h3>Activity Flow (Timeline)</h3>
            <div className="nr-flow-list">
              {activityFlow.map((item, idx) => (
                <div className="nr-flow-row" key={idx}>
                  <input
                    type="text"
                    value={item.time}
                    onChange={(e) => updateFlowItem(idx, 'time', e.target.value)}
                    placeholder="Time (e.g. 8:00 AM)"
                    className="nr-flow-time"
                  />
                  <input
                    type="text"
                    value={item.activity}
                    onChange={(e) => updateFlowItem(idx, 'activity', e.target.value)}
                    placeholder="Activity description"
                    className="nr-flow-activity"
                  />
                  {activityFlow.length > 1 ? (
                    <button
                      type="button"
                      className="remove-row-btn"
                      onClick={() => removeFlowItem(idx)}
                      title="Remove"
                    >
                      <Trash2 size={14} />
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
            <div className="add-row-actions">
              <button type="button" className="add-row-btn" onClick={addFlowItem}>
                <PlusCircle size={16} /> Add activity
              </button>
            </div>
          </div>

          <div className="form-grid" style={{ marginTop: '16px' }}>
            <label className="field">
              <span>Resource Speakers</span>
              <textarea
                rows={2}
                value={resourceSpeakers}
                onChange={(e) => setResourceSpeakers(e.target.value)}
                placeholder="Names and titles (one per line)"
              />
            </label>
            <label className="field">
              <span>Facilitators</span>
              <textarea
                rows={2}
                value={facilitators}
                onChange={(e) => setFacilitators(e.target.value)}
                placeholder="Names (one per line)"
              />
            </label>
            <label className="field">
              <span>Guests</span>
              <textarea
                rows={2}
                value={guests}
                onChange={(e) => setGuests(e.target.value)}
                placeholder="Names and positions (one per line)"
              />
            </label>
          </div>
        </div>

        {/* ═══════ SECTION 4: CHALLENGES & SOLUTIONS ═══════ */}
        <div className="overview-card">
          <p className="eyebrow">Section 4</p>
          <h2>Challenges Encountered &amp; Solutions</h2>
          <label className="field">
            <span>Challenges Encountered</span>
            <textarea
              rows={4}
              value={challenges}
              onChange={(e) => setChallenges(e.target.value)}
              placeholder="Document issues such as scheduling conflicts, weather conditions, logistical concerns, attendance issues, etc."
            />
          </label>
          <label className="field">
            <span>Actions Taken</span>
            <textarea
              rows={4}
              value={actionsTaken}
              onChange={(e) => setActionsTaken(e.target.value)}
              placeholder="Explain the solutions implemented by the SK Council to address the challenges."
            />
          </label>
        </div>

        {/* ═══════ SECTION 5: RESULTS & RECOMMENDATIONS ═══════ */}
        <div className="overview-card">
          <p className="eyebrow">Section 5</p>
          <h2>Results, Insights &amp; Recommendations</h2>
          <div className="form-grid">
            <label className="field">
              <span>Number of Beneficiaries Reached</span>
              <input
                type="text"
                value={beneficiariesReached}
                onChange={(e) => setBeneficiariesReached(e.target.value)}
                placeholder="e.g. 142 youth participants"
              />
            </label>
            <label className="field">
              <span>Skills Learned</span>
              <input
                type="text"
                value={skillsLearned}
                onChange={(e) => setSkillsLearned(e.target.value)}
                placeholder="e.g. Leadership, teamwork, public speaking"
              />
            </label>
          </div>
          <label className="field">
            <span>Community Impact</span>
            <textarea
              rows={3}
              value={communityImpact}
              onChange={(e) => setCommunityImpact(e.target.value)}
              placeholder="Describe the overall impact on the community."
            />
          </label>
          <label className="field">
            <span>Accomplishments</span>
            <textarea
              rows={3}
              value={accomplishments}
              onChange={(e) => setAccomplishments(e.target.value)}
              placeholder="List key accomplishments achieved during the activity."
            />
          </label>
          <label className="field">
            <span>Recommendations</span>
            <textarea
              rows={3}
              value={recommendations}
              onChange={(e) => setRecommendations(e.target.value)}
              placeholder="Suggestions for improving future projects and events."
            />
          </label>
        </div>

        {/* ═══════ SECTION 6: APPENDICES ═══════ */}
        <div className="overview-card">
          <p className="eyebrow">Section 6</p>
          <h2>Appendices &amp; Attachments</h2>

          {selectedRequest ? (
            <div className="nr-financial-summary">
              <h3>Financial Summary (Auto-filled)</h3>
              <div className="nr-finance-chips">
                <div className="nr-finance-chip">
                  <span className="nr-finance-label">Approved Budget</span>
                  <span className="nr-finance-value">{currency.format(financialData.approved)}</span>
                </div>
                {financialData.breakdown.length > 0 ? (
                  <div className="nr-finance-chip">
                    <span className="nr-finance-label">Breakdown Items</span>
                    <span className="nr-finance-value">{financialData.breakdown.length}</span>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          <div className="nr-photos-section">
            <h3>Photo Documentation</h3>
            <p style={{ color: 'var(--ink-soft)', fontSize: '0.9rem', marginBottom: '12px' }}>
              Upload photos from the event. Add captions describing each photo.
            </p>
            <label className="nr-upload-area">
              <Upload size={20} />
              <span>Click to upload photos</span>
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={handlePhotoUpload}
                style={{ display: 'none' }}
              />
            </label>

            {photos.length > 0 ? (
              <div className="nr-photo-grid">
                {photos.map((photo, idx) => (
                  <div className="nr-photo-card" key={idx}>
                    <div className="nr-photo-img-wrap">
                      <img src={photo.src} alt={photo.caption} />
                      <button
                        type="button"
                        className="nr-photo-remove"
                        onClick={() => removePhoto(idx)}
                        title="Remove photo"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <input
                      type="text"
                      className="nr-photo-caption"
                      value={photo.caption}
                      onChange={(e) => updatePhotoCaption(idx, e.target.value)}
                      placeholder="Enter caption"
                    />
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        {/* ═══════ ACTIONS ═══════ */}
        <div className="nr-actions">
          <button
            type="button"
            className="primary-button"
            onClick={handlePreview}
            disabled={!projectTitle.trim()}
          >
            Preview &amp; Generate PDF
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={() => navigate('/dashboard/documents')}
          >
            Cancel
          </button>
        </div>
      </section>

      {preview ? (
        <NarrativeReportPreview data={preview} onClose={() => setPreview(null)} />
      ) : null}
    </RoleGate>
  )
}

export default NarrativeReportPage
