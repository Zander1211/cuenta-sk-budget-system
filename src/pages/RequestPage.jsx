import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import RoleGate from '../components/RoleGate'
import { useBudget } from '../context/BudgetContext'

const currency = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  maximumFractionDigits: 0,
})

const numberFormatter = new Intl.NumberFormat('en-PH', {
  maximumFractionDigits: 0,
})

const parseNumberInput = (value) => {
  const numeric = String(value).replace(/,/g, '')
  return numeric ? Number(numeric) : 0
}

const formatNumberInput = (value) => {
  const numeric = String(value).replace(/\D/g, '')
  if (!numeric) {
    return ''
  }

  return numberFormatter.format(Number(numeric))
}

const categories = [
  'Sports',
  'Education',
  'Community Programs',
  'Environment',
  'Other',
]

function RequestPage() {
  const { requests, addRequest, archiveRequest, restoreRequest } = useBudget()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('active')
  const [event, setEvent] = useState('')
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState('')
  const [eventDate, setEventDate] = useState('')
  const [venue, setVenue] = useState('')
  const [description, setDescription] = useState('')
  const [notes, setNotes] = useState('')
  const [breakdownItems, setBreakdownItems] = useState([
    { itemName: '', quantity: 1, unitCost: 0 },
  ])
  const [formError, setFormError] = useState('')

  const totalFromBreakdown = breakdownItems.reduce((sum, item) => {
    const qty = parseNumberInput(item.quantity)
    const unit = parseNumberInput(item.unitCost)
    return sum + qty * unit
  }, 0)

  const activeRequests = requests.filter((request) => !request.archivedAt)
  const archivedRequests = requests.filter((request) => request.archivedAt)

  function updateBreakdownItem(index, field, value) {
    setBreakdownItems((prev) =>
      prev.map((item, itemIndex) =>
        itemIndex === index
          ? {
              ...item,
              [field]: value,
            }
          : item
      )
    )
  }

  function addBreakdownRow() {
    setBreakdownItems((prev) => [
      ...prev,
      { itemName: '', quantity: 1, unitCost: 0 },
    ])
  }

  function removeBreakdownRow(index) {
    setBreakdownItems((prev) => prev.filter((_, itemIndex) => itemIndex !== index))
  }

  function handleSubmit(eventSubmit) {
    eventSubmit.preventDefault()
    setFormError('')

    const cleanedAmount = parseNumberInput(amount)
    const hasBreakdown = breakdownItems.some(
      (item) => item.itemName.trim() && parseNumberInput(item.quantity) > 0
    )
    const finalAmount = cleanedAmount > 0 ? cleanedAmount : totalFromBreakdown

    if (!event.trim() || !category || !eventDate || !venue.trim()) {
      setFormError('Please complete event, date, venue, and category.')
      return
    }

    if (!hasBreakdown && !cleanedAmount) {
      setFormError('Provide a budget breakdown or total amount.')
      return
    }

    const normalizedBreakdown = breakdownItems
      .map((item) => ({
        itemName: item.itemName.trim(),
        quantity: parseNumberInput(item.quantity),
        unitCost: parseNumberInput(item.unitCost),
      }))
      .filter(
        (item) => item.itemName || item.quantity > 0 || item.unitCost > 0
      )

    addRequest({
      event: event.trim(),
      category,
      amount: finalAmount,
      eventDate,
      venue: venue.trim(),
      description: description.trim(),
      notes: notes.trim(),
      breakdown: normalizedBreakdown,
    })

    setEvent('')
    setAmount('')
    setCategory('')
    setEventDate('')
    setVenue('')
    setDescription('')
    setNotes('')
    setBreakdownItems([{ itemName: '', quantity: 1, unitCost: 0 }])
  }

  function handleArchive(requestId) {
    archiveRequest(requestId)
    setActiveTab('archive')
  }

  return (
    <RoleGate allow={['SK Treasurer']}>
      <header className="dashboard-header">
        <div className="header-left">
          <div>
            <p className="eyebrow">Request</p>
            <h1>Budget request for events</h1>
            <p>Create a budget request that will appear in SK Chairman approvals.</p>
          </div>
        </div>
        <div
          className="header-actions page-tabs"
          role="tablist"
          aria-label="Request views"
        >
          <button
            className={`page-tab ${activeTab === 'active' ? 'is-active' : ''}`}
            type="button"
            role="tab"
            aria-selected={activeTab === 'active'}
            onClick={() => setActiveTab('active')}
          >
            Active
          </button>
          <button
            className={`page-tab ${activeTab === 'archive' ? 'is-active' : ''}`}
            type="button"
            role="tab"
            aria-selected={activeTab === 'archive'}
            onClick={() => setActiveTab('archive')}
          >
            Archive
          </button>
        </div>
      </header>

      <section className="dashboard-content">
        {activeTab === 'active' ? (
          <>
            <div className="overview-card">
          <p className="eyebrow">New request</p>
          <h2>Submit budget request</h2>
          <form className="user-form" onSubmit={handleSubmit}>
            <div className="form-grid">
              <label className="field">
                <span>Event / Project</span>
                <input
                  type="text"
                  value={event}
                  onChange={(eventChange) => setEvent(eventChange.target.value)}
                  placeholder="Youth Leadership Summit"
                  required
                />
              </label>
              <label className="field">
                <span>Event date</span>
                <input
                  type="date"
                  value={eventDate}
                  onChange={(eventChange) => setEventDate(eventChange.target.value)}
                  required
                />
              </label>
              <label className="field">
                <span>Venue</span>
                <input
                  type="text"
                  value={venue}
                  onChange={(eventChange) => setVenue(eventChange.target.value)}
                  placeholder="Barangay Covered Court"
                  required
                />
              </label>
              <label className="field">
                <span>Category</span>
                <select
                  value={category}
                  onChange={(eventChange) => setCategory(eventChange.target.value)}
                  required
                >
                  <option value="">Select category</option>
                  {categories.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Total amount (PHP)</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={amount}
                  onChange={(eventChange) =>
                    setAmount(formatNumberInput(eventChange.target.value))
                  }
                  placeholder="30,000"
                />
              </label>
              <label className="field">
                <span>Project description</span>
                <textarea
                  rows="3"
                  value={description}
                  onChange={(eventChange) => setDescription(eventChange.target.value)}
                  placeholder="Describe the project goals and outcomes"
                />
              </label>
              <label className="field">
                <span>Notes / supporting info</span>
                <textarea
                  rows="3"
                  value={notes}
                  onChange={(eventChange) => setNotes(eventChange.target.value)}
                  placeholder="Add supporting details for the request"
                />
              </label>
            </div>

            <div className="overview-card">
              <p className="eyebrow">Budget breakdown</p>
              <h2>Other expenses</h2>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Other expenses</th>
                    <th>Quantity</th>
                    <th>Unit cost</th>
                    <th>Total cost</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {breakdownItems.map((item, index) => (
                    <tr key={`row-${index}`}>
                      <td>
                        <input
                          type="text"
                          value={item.itemName}
                          onChange={(eventChange) =>
                            updateBreakdownItem(
                              index,
                              'itemName',
                              eventChange.target.value
                            )
                          }
                          placeholder="Other expenses"
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min="0"
                          value={item.quantity}
                          onChange={(eventChange) =>
                            updateBreakdownItem(
                              index,
                              'quantity',
                              eventChange.target.value
                            )
                          }
                        />
                      </td>
                      <td>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={item.unitCost}
                          onChange={(eventChange) =>
                            updateBreakdownItem(
                              index,
                              'unitCost',
                              formatNumberInput(eventChange.target.value)
                            )
                          }
                        />
                      </td>
                      <td>
                        {currency.format(
                          (item.quantity || 0) * (item.unitCost || 0)
                        )}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="text-button"
                          onClick={() => removeBreakdownRow(index)}
                          disabled={breakdownItems.length === 1}
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="content-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={addBreakdownRow}
                >
                  Add expense
                </button>
                <div className="form-note">
                  Total cost from breakdown: {currency.format(totalFromBreakdown)}
                </div>
              </div>
            </div>
            {formError ? <p className="form-error">{formError}</p> : null}
            <button type="submit" className="primary-button">
              Submit Request
            </button>
          </form>
        </div>

        <div className="overview-card">
          <p className="eyebrow">Requests</p>
          <h2>Submitted requests</h2>
          <table className="data-table">
            <thead>
              <tr>
                <th>Event</th>
                <th>Category</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Note</th>
                <th>Submitted</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {activeRequests.length ? (
                activeRequests.map((request) => (
                  <tr key={request.id}>
                    <td>{request.event}</td>
                    <td>{request.category}</td>
                    <td>{currency.format(request.amount)}</td>
                    <td>
                      <span
                        className={`status-pill status-${(
                          request.status || 'Pending'
                        ).toLowerCase()}`}
                      >
                        {request.status || 'Pending'}
                      </span>
                    </td>
                    <td>{request.rejectionReason || '—'}</td>
                    <td>{new Date(request.submittedAt).toLocaleDateString()}</td>
                    <td className="table-actions">
                      <button
                        className="secondary-button"
                        type="button"
                        onClick={() => handleArchive(request.id)}
                      >
                        Archive
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="7" className="empty-state">
                    No requests submitted yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        </>
        ) : (
          <div className="overview-card">
            <p className="eyebrow">Archive</p>
            <h2>Archived requests</h2>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Event</th>
                  <th>Category</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Note</th>
                  <th>Archived Date</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {archivedRequests.length ? (
                  archivedRequests.map((request) => (
                    <tr key={request.id}>
                      <td>{request.event}</td>
                      <td>{request.category}</td>
                      <td>{currency.format(request.amount)}</td>
                      <td>
                        <span
                          className={`status-pill status-${(
                            request.status || 'Pending'
                          ).toLowerCase()}`}
                        >
                          {request.status || 'Pending'}
                        </span>
                      </td>
                      <td>{request.rejectionReason || '—'}</td>
                      <td>{new Date(request.archivedAt).toLocaleDateString()}</td>
                      <td className="table-actions">
                        <button
                          className="secondary-button"
                          type="button"
                          onClick={() => restoreRequest(request.id)}
                        >
                          Restore
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="7" className="empty-state">
                      No archived requests yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </RoleGate>
  )
}

export default RequestPage
