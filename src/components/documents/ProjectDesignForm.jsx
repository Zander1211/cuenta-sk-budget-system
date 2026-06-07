import { useState, useEffect } from 'react'
import { PlusCircle, Trash2 } from 'lucide-react'

const currency = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  maximumFractionDigits: 2,
})

function ProjectDesignForm({ profileName, role, selectedRequest, onPreview }) {
  const [title, setTitle] = useState('')
  const [cost, setCost] = useState('')
  const [location, setLocation] = useState('')
  const [projectLeader, setProjectLeader] = useState('')
  const [rationale, setRationale] = useState('')
  const [objectives, setObjectives] = useState(['', '', ''])
  const [beneficiaries, setBeneficiaries] = useState(['', ''])
  const [estimatedParticipants, setEstimatedParticipants] = useState('')
  const [budgetItems, setBudgetItems] = useState([])
  const [sourceOfFund, setSourceOfFund] = useState('Sangguniang Kabataan Fund')
  const [preparedBy, setPreparedBy] = useState('')
  const [notedBy, setNotedBy] = useState('')

  useEffect(() => {
    setProjectLeader(profileName || '')
  }, [profileName])

  useEffect(() => {
    if (selectedRequest) {
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
  }, [selectedRequest])

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

  function updateBudgetItem(index, field, value) {
    setBudgetItems((prev) =>
      prev.map((item, i) => {
        if (i !== index) return item
        const updated = { ...item, [field]: value }
        if (field === 'qty' || field === 'unitCost') {
          updated.amount = (Number(updated.qty) || 0) * (Number(updated.unitCost) || 0)
        }
        return updated
      })
    )
  }

  function addBudgetItem() {
    setBudgetItems((prev) => [
      ...prev,
      { qty: 1, unitOfIssue: 'pc', description: '', unitCost: 0, amount: 0 },
    ])
  }

  function removeBudgetItem(index) {
    setBudgetItems((prev) => prev.filter((_, i) => i !== index))
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
          <input
            type="number"
            min="0"
            step="0.01"
            value={cost}
            onChange={(e) => setCost(e.target.value)}
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

      {/* Budgetary Requirements */}
      <div className="doc-form-section">
        <h3>VIII. Budgetary Requirements</h3>
        <div style={{ overflowX: 'auto' }}>
          <table className="add-row-table">
            <thead>
              <tr>
                <th style={{ width: '60px' }}>Qty</th>
                <th style={{ width: '90px' }}>Unit of Issue</th>
                <th>Item Description</th>
                <th style={{ width: '110px' }}>Est. Unit Cost</th>
                <th style={{ width: '120px' }}>Est. Amount</th>
                <th style={{ width: '40px' }}></th>
              </tr>
            </thead>
            <tbody>
              {budgetItems.map((item, idx) => (
                <tr key={idx}>
                  <td>
                    <input
                      type="number"
                      min="0"
                      value={item.qty}
                      onChange={(e) => updateBudgetItem(idx, 'qty', e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      value={item.unitOfIssue}
                      onChange={(e) => updateBudgetItem(idx, 'unitOfIssue', e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      value={item.description}
                      onChange={(e) => updateBudgetItem(idx, 'description', e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={item.unitCost}
                      onChange={(e) => updateBudgetItem(idx, 'unitCost', e.target.value)}
                    />
                  </td>
                  <td className="computed-cell">{currency.format(item.amount || 0)}</td>
                  <td>
                    <button
                      type="button"
                      className="remove-row-btn"
                      onClick={() => removeBudgetItem(idx)}
                      title="Remove"
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
              {budgetItems.length ? (
                <tr className="total-row">
                  <td colSpan={4} style={{ textAlign: 'right', fontWeight: 700 }}>
                    TOTAL
                  </td>
                  <td className="computed-cell">{currency.format(totalBudget)}</td>
                  <td></td>
                </tr>
              ) : (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', color: 'var(--ink-soft)' }}>
                    Select a request to auto-fill or add items manually.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="add-row-actions">
          <button type="button" className="add-row-btn" onClick={addBudgetItem}>
            <PlusCircle size={16} /> Add item
          </button>
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
          Preview & Print
        </button>
      </div>
    </div>
  )
}

export default ProjectDesignForm
