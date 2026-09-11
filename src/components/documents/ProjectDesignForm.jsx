import React, { useState, useEffect } from 'react'
import CurrencyInput from '../CurrencyInput'
import { PlusCircle, Trash2 } from 'lucide-react'
import { useActiveSkChairmanName } from '../../hooks/useActiveSkChairmanName'

const currency = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  maximumFractionDigits: 2,
})

function ProjectDesignForm({ profileName, role, selectedRequest, onPreview, initialData = null }) {
  const activeChairmanName = useActiveSkChairmanName()
  const [title, setTitle] = useState(() => initialData?.title ?? '')
  const [cost, setCost] = useState(() => (initialData?.cost != null ? String(initialData.cost) : ''))
  const [location, setLocation] = useState(() => initialData?.location ?? '')
  const [projectLeader, setProjectLeader] = useState(() => initialData?.projectLeader ?? '')
  const [rationale, setRationale] = useState(() => initialData?.rationale ?? '')
  const [objectives, setObjectives] = useState(() => initialData?.objectives ?? ['', '', ''])
  const [beneficiaries, setBeneficiaries] = useState(() => initialData?.beneficiaries ?? ['', ''])
  const [estimatedParticipants, setEstimatedParticipants] = useState(() => initialData?.estimatedParticipants ?? '')
  const [budgetItems, setBudgetItems] = useState(() => initialData?.budgetItems ?? [])
  const [sourceOfFund, setSourceOfFund] = useState(() => initialData?.sourceOfFund ?? 'Sangguniang Kabataan Fund')
  const [preparedBy, setPreparedBy] = useState(() => initialData?.preparedBy ?? '')
  const [notedBy, setNotedBy] = useState(() => initialData?.notedBy ?? '')

  useEffect(() => {
    if (!initialData) setProjectLeader(profileName || '')
  }, [profileName, initialData])

  useEffect(() => {
    if (activeChairmanName) setNotedBy((prev) => prev || activeChairmanName)
  }, [activeChairmanName])

  useEffect(() => {
    // Editing an already-generated document: title/cost/location/budgetItems
    // are already seeded from what was saved — don't overwrite them with the
    // record's current live values.
    if (selectedRequest && !initialData) {
      setTitle(selectedRequest.event || '')
      setCost(String(selectedRequest.amount || ''))
      setLocation(selectedRequest.venue || '')

      const breakdown = Array.isArray(selectedRequest.breakdown) ? selectedRequest.breakdown : []
      const mapped = breakdown
        .filter((item) => item.itemName || item.quantity > 0)
        .map((item) => ({
          qty: Number(item.quantity) || 0,
          unitOfIssue: 'pc',
          description: item.itemName || '',
          unitCost: Number(item.unitCost) || 0,
          amount: (Number(item.quantity) || 0) * (Number(item.unitCost) || 0),
        }))

      if (!mapped.length && selectedRequest.amount > 0) {
        mapped.push({
          qty: 1,
          unitOfIssue: 'lot',
          description: selectedRequest.event || 'Budget allocation',
          unitCost: Number(selectedRequest.amount) || 0,
          amount: Number(selectedRequest.amount) || 0,
        })
      }
      setBudgetItems(mapped)
    }
  }, [selectedRequest, initialData])

  function updateObjective(index, value) {
    setObjectives((prev) => prev.map((obj, i) => (i === index ? value : obj)))
  }

  function addObjective() {
    setObjectives((prev) => [...prev, ''])
  }

  function removeObjective(index) {
    setObjectives((prev) => prev.filter((_, i) => i !== index))
  }

  function updateBeneficiary(index, value) {
    setBeneficiaries((prev) => prev.map((b, i) => (i === index ? value : b)))
  }

  function addBeneficiary() {
    setBeneficiaries((prev) => [...prev, ''])
  }

  function removeBeneficiary(index) {
    setBeneficiaries((prev) => prev.filter((_, i) => i !== index))
  }

  const totalBudget = budgetItems.reduce((sum, item) => sum + (Number(item.amount) || 0), 0)

  function handlePreview() {
    onPreview({
      type: 'project',
      data: {
        title,
        cost: Number(cost) || 0,
        location,
        projectLeader,
        rationale,
        objectives: objectives.filter((o) => o.trim()),
        beneficiaries: beneficiaries.filter((b) => b.trim()),
        estimatedParticipants: estimatedParticipants || '0',
        budgetItems,
        totalBudget,
        sourceOfFund,
        preparedBy,
        notedBy,
      },
    })
  }

  return (
    <div className="doc-gen-form">
      <div className="form-grid">
        <label className="field">
          <span>I. Project Title</span>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Project/event title"
          />
        </label>
        <label className="field">
          <span>II. Cost</span>
          <CurrencyInput
            value={cost}
            onValueChange={(val) => setCost(Number(val))}
            placeholder="0.00"
          />
        </label>
        <label className="field">
          <span>III. Location</span>
          <input
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Project location/venue"
          />
        </label>
        <label className="field">
          <span>IV. Project Leader</span>
          <input
            type="text"
            value={projectLeader}
            onChange={(e) => setProjectLeader(e.target.value)}
            placeholder="Project leader name"
          />
        </label>
      </div>

      <label className="field">
        <span>V. Rationale</span>
        <textarea
          rows={4}
          value={rationale}
          onChange={(e) => setRationale(e.target.value)}
          placeholder="Explain the project rationale..."
        />
      </label>

      {/* Objectives */}
      <div className="doc-form-section">
        <h3>VI. Objectives</h3>
        <div className="objectives-list">
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
        </div>
        <div className="add-row-actions">
          <button type="button" className="add-row-btn" onClick={addObjective}>
            <PlusCircle size={16} /> Add objective
          </button>
        </div>
      </div>

      {/* Beneficiaries */}
      <div className="doc-form-section">
        <h3>VII. Target Beneficiaries</h3>
        <div className="beneficiaries-list">
          {beneficiaries.map((ben, idx) => (
            <div className="list-item-row" key={idx}>
              <span className="list-item-number">{idx + 1}.</span>
              <input
                type="text"
                value={ben}
                onChange={(e) => updateBeneficiary(idx, e.target.value)}
                placeholder={`Beneficiary ${idx + 1}`}
              />
              {beneficiaries.length > 1 ? (
                <button
                  type="button"
                  className="remove-row-btn"
                  onClick={() => removeBeneficiary(idx)}
                  title="Remove"
                >
                  <Trash2 size={14} />
                </button>
              ) : null}
            </div>
          ))}
        </div>
        <div className="add-row-actions">
          <button type="button" className="add-row-btn" onClick={addBeneficiary}>
            <PlusCircle size={16} /> Add beneficiary
          </button>
          <label className="field" style={{ marginLeft: 'auto', maxWidth: '220px' }}>
            <span>Estimated participants</span>
            <input
              type="number"
              min="0"
              value={estimatedParticipants}
              onChange={(e) => setEstimatedParticipants(e.target.value)}
              placeholder="Number"
            />
          </label>
        </div>
      </div>

      {/* Budgetary Requirements — read-only. This is the approved requisition
          breakdown; once approved it's final, so nothing here can add,
          remove, or edit a line. Expenses incurred later belong in the
          record's own Additional Requisition Breakdown instead. */}
      <div className="doc-form-section">
        <h3>VIII. Budgetary Requirements</h3>
        <p className="form-note" style={{ marginTop: 0 }}>
          These items come from the approved budget request and cannot be edited here.
        </p>
        <div style={{ overflowX: 'auto' }}>
          <table className="add-row-table">
            <thead>
              <tr>
                <th style={{ width: '60px' }}>Qty</th>
                <th style={{ width: '90px' }}>Unit of Issue</th>
                <th>Item Description</th>
                <th style={{ width: '110px' }}>Est. Unit Cost</th>
                <th style={{ width: '120px' }}>Est. Amount</th>
              </tr>
            </thead>
            <tbody>
              {budgetItems.map((item, idx) => (
                <tr key={idx}>
                  <td>{item.qty}</td>
                  <td>{item.unitOfIssue || '—'}</td>
                  <td>{item.description || '—'}</td>
                  <td>{currency.format(item.unitCost || 0)}</td>
                  <td className="computed-cell">{currency.format(item.amount || 0)}</td>
                </tr>
              ))}
              {budgetItems.length ? (
                <tr className="total-row">
                  <td colSpan={4} style={{ textAlign: 'right', fontWeight: 700 }}>
                    TOTAL
                  </td>
                  <td className="computed-cell">{currency.format(totalBudget)}</td>
                </tr>
              ) : (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', color: 'var(--ink-soft)' }}>
                    Select an approved request above to load its requisition items.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <label className="field" style={{ marginTop: '8px' }}>
          <span>Source of Fund</span>
          <input
            type="text"
            value={sourceOfFund}
            onChange={(e) => setSourceOfFund(e.target.value)}
          />
        </label>
      </div>

      {/* Signatures */}
      <div className="doc-form-section">
        <h3>Signatories</h3>
        <div className="form-grid">
          <label className="field">
            <span>Prepared by (SK Kagawad)</span>
            <input
              type="text"
              value={preparedBy}
              onChange={(e) => setPreparedBy(e.target.value)}
              placeholder="SK Kagawad name"
            />
          </label>
          <label className="field">
            <span>Noted by (SK Chairman)</span>
            <input
              type="text"
              value={notedBy}
              onChange={(e) => setNotedBy(e.target.value)}
              placeholder="SK Chairman name"
            />
          </label>
        </div>
      </div>

      <div className="doc-gen-actions">
        <button type="button" className="primary-button" onClick={handlePreview}>
          {initialData ? 'Save' : 'Preview Document'}
        </button>
      </div>
    </div>
  )
}

export default ProjectDesignForm
