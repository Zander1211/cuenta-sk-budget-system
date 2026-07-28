import { Fragment, useState } from 'react'
import RoleGate from '../components/RoleGate'
import { useBudget } from '../context/BudgetContext'

const currency = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  maximumFractionDigits: 0,
})

function ApprovalsPage() {
  const {
    requests,
    approveRequest,
    rejectRequest,
    cancelApproval,
    archiveRequest,
    restoreRequest,
    undoRejectRequest,
    updateProjectStatus,
    updateRejectionReason,
    updateCancellationReason,
  } = useBudget()
  const [expanded, setExpanded] = useState({})
  const [activeTab, setActiveTab] = useState('pending')
  const [rejectingId, setRejectingId] = useState(null)
  const [rejectNote, setRejectNote] = useState('')
  const [rejectError, setRejectError] = useState('')
  const [cancellingId, setCancellingId] = useState(null)
  const [cancelNote, setCancelNote] = useState('')
  const [cancelError, setCancelError] = useState('')
  const [editingRejectReasonId, setEditingRejectReasonId] = useState(null)
  const [editRejectNote, setEditRejectNote] = useState('')
  const [editingCancelReasonId, setEditingCancelReasonId] = useState(null)
  const [editCancelNote, setEditCancelNote] = useState('')

  function startEditRejectReason(requestId, currentReason) {
    setEditingRejectReasonId(requestId)
    setEditRejectNote(currentReason || '')
  }

  function saveRejectReason(requestId) {
    updateRejectionReason(requestId, editRejectNote.trim())
    setEditingRejectReasonId(null)
  }

  function startEditCancelReason(requestId, currentReason) {
    setEditingCancelReasonId(requestId)
    setEditCancelNote(currentReason || '')
  }

  function saveCancelReason(requestId) {
    updateCancellationReason(requestId, editCancelNote.trim())
    setEditingCancelReasonId(null)
  }

  const getBreakdownTotal = (breakdown = []) =>
    breakdown.reduce((sum, item) => {
      const qty = Number(item.quantity) || 0
      const unit = Number(item.unitCost) || 0
      return sum + qty * unit
    }, 0)

  function toggleDetails(requestId) {
    setExpanded((prev) => ({
      ...prev,
      [requestId]: !prev[requestId],
    }))
  }

  function startReject(requestId) {
    setRejectingId(requestId)
    setRejectNote('')
    setRejectError('')
    setExpanded((prev) => ({
      ...prev,
      [requestId]: true,
    }))
  }

  function submitReject(requestId) {
    if (!rejectNote.trim()) {
      setRejectError('Please add a rejection note.')
      return
    }

    if (!window.confirm("Are you sure you want to reject this budget request? This action will update the request status to Rejected.")) {
      return
    }

    rejectRequest(requestId, rejectNote.trim())
    setRejectingId(null)
    setRejectNote('')
    setRejectError('')
  }

  function startCancel(requestId) {
    setCancellingId(requestId)
    setCancelNote('')
    setCancelError('')
    setExpanded((prev) => ({
      ...prev,
      [requestId]: true,
    }))
  }

  function submitCancel(requestId) {
    if (!cancelNote.trim()) {
      setCancelError('Please add a cancellation reason.')
      return
    }

    if (!window.confirm("Are you sure you want to cancel the approval of this project or event? This action will reverse the approved budget allocation and update all related budget calculations.")) {
      return
    }

    cancelApproval(requestId, cancelNote.trim())
    setCancellingId(null)
    setCancelNote('')
    setCancelError('')
  }

  function handleTabChange(nextTab) {
    setActiveTab(nextTab)
    setRejectingId(null)
    setRejectNote('')
    setRejectError('')
    setCancellingId(null)
    setCancelNote('')
    setCancelError('')
    setEditingRejectReasonId(null)
    setEditingCancelReasonId(null)
  }

  function handleArchive(requestId) {
    archiveRequest(requestId)
    setActiveTab('archive')
  }

  function renderRequestRow(
    request,
    {
      showArchivedAt = false,
      allowApprove = false,
      allowReject = false,
      allowArchive = false,
      allowRestore = false,
      allowCancel = false,
    }
  ) {
    const breakdownItems = Array.isArray(request.breakdown)
      ? request.breakdown
      : []
    const breakdownTotal = getBreakdownTotal(breakdownItems)
    const requestedAmount = Number(request.amount) || 0
    const totalAmount = requestedAmount > 0 ? requestedAmount : breakdownTotal
    const hasBreakdown = breakdownItems.length > 0
    const isApproved = request.status === 'Approved'
    const isRejected = request.status === 'Rejected'
    const isCancelled = request.status === 'Cancelled'
    
    let displayProjectStatus = request.projectStatus || 'Pending'
    if (isRejected) displayProjectStatus = 'Rejected'
    if (isCancelled) displayProjectStatus = 'Cancelled'
    if (displayProjectStatus === 'Pending' && isApproved) displayProjectStatus = 'Ongoing' // Fallback for old approved data

    const columnCount = showArchivedAt ? 8 : 7

    return (
      <Fragment key={request.id}>
        <tr>
          <td>{request.event}</td>
          <td>{request.category}</td>
          <td>{currency.format(totalAmount)}</td>
          <td>
            {request.eventDate
              ? new Date(request.eventDate).toLocaleDateString()
              : '—'}
          </td>
          <td>{request.venue || '—'}</td>
          <td>
            {isApproved ? (
              <select
                className="project-status-select"
                value={displayProjectStatus}
                onChange={(e) =>
                  updateProjectStatus(request.id, e.target.value)
                }
              >
                <option value="Ongoing">Ongoing</option>
                <option value="Completed">Completed</option>
              </select>
            ) : (
              <span
                className={`status-pill status-${displayProjectStatus.toLowerCase()}`}
              >
                {displayProjectStatus}
              </span>
            )}
          </td>
          {showArchivedAt ? (
            <td>
              {request.archivedAt
                ? new Date(request.archivedAt).toLocaleDateString()
                : '—'}
            </td>
          ) : null}
          <td className="table-actions">
            <button
              className="secondary-button"
              type="button"
              onClick={() => toggleDetails(request.id)}
            >
              {expanded[request.id] ? 'Hide' : 'View'}
            </button>
            {allowArchive ? (
              <button
                className="secondary-button"
                type="button"
                onClick={() => handleArchive(request.id)}
              >
                Archive
              </button>
            ) : null}
            {allowRestore ? (
              <button
                className="secondary-button"
                type="button"
                onClick={() => restoreRequest(request.id)}
              >
                Restore
              </button>
            ) : null}
          </td>
        </tr>
        {expanded[request.id] ? (
          <tr className="details-row">
            <td colSpan={columnCount}>
              <div className="details-panel">
                <div className="details-grid">
                  <div>
                    <p className="details-label">Event</p>
                    <p className="details-value">{request.event}</p>
                  </div>
                  <div>
                    <p className="details-label">Category</p>
                    <p className="details-value">{request.category}</p>
                  </div>
                  <div>
                    <p className="details-label">Total amount</p>
                    <p className="details-value">
                      {currency.format(totalAmount)}
                    </p>
                  </div>
                  <div>
                    <p className="details-label">Total cost</p>
                    <p className="details-value">
                      {hasBreakdown ? currency.format(breakdownTotal) : '—'}
                    </p>
                  </div>
                  <div>
                    <p className="details-label">Project description</p>
                    <p className="details-value">
                      {request.description || '—'}
                    </p>
                  </div>

                  <div>
                    <p className="details-label">Event date</p>
                    <p className="details-value">
                      {request.eventDate
                        ? new Date(request.eventDate).toLocaleDateString()
                        : '—'}
                    </p>
                  </div>
                  <div>
                    <p className="details-label">Venue</p>
                    <p className="details-value">{request.venue || '—'}</p>
                  </div>
                  <div>
                    <p className="details-label">Submitted</p>
                    <p className="details-value">
                      {new Date(request.submittedAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>

                <div className="details-breakdown">
                  <p className="details-label">Budget breakdown</p>
                  {breakdownItems.length ? (
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Requisition</th>
                          <th>Quantity</th>
                          <th>Unit cost</th>
                          <th>Total cost</th>
                        </tr>
                      </thead>
                      <tbody>
                        {breakdownItems.map((item, index) => (
                          <tr key={`${request.id}-item-${index}`}>
                            <td>{item.itemName || '—'}</td>
                            <td>{item.quantity || 0}</td>
                            <td>{currency.format(item.unitCost || 0)}</td>
                            <td>
                              {currency.format(
                                (item.quantity || 0) * (item.unitCost || 0)
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr>
                          <th colSpan="3">Total cost</th>
                          <th>{currency.format(breakdownTotal)}</th>
                        </tr>
                      </tfoot>
                    </table>
                  ) : (
                    <p className="details-value">No requisition provided.</p>
                  )}
                </div>



                {request.status === 'Rejected' ? (
                  <div className="reject-panel" style={{ marginTop: '12px' }}>
                    <p className="details-label">Rejection Reason</p>
                    {editingRejectReasonId === request.id ? (
                      <div className="field">
                        <textarea
                          rows="3"
                          value={editRejectNote}
                          onChange={(e) => setEditRejectNote(e.target.value)}
                        />
                        <div className="content-actions" style={{ marginTop: '8px' }}>
                          <button className="secondary-button" type="button" onClick={() => setEditingRejectReasonId(null)}>Cancel</button>
                          <button className="primary-button" type="button" onClick={() => saveRejectReason(request.id)}>Save Note</button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px' }}>
                        <p className="details-value" style={{ color: '#e53e3e', whiteSpace: 'pre-wrap', flex: 1 }}>
                          {request.rejectionReason || 'No reason provided.'}
                        </p>
                        <button className="secondary-button" type="button" onClick={() => startEditRejectReason(request.id, request.rejectionReason)}>Edit</button>
                      </div>
                    )}
                  </div>
                ) : null}

                {request.status === 'Cancelled' ? (
                  <div className="reject-panel" style={{ marginTop: '12px' }}>
                    <p className="details-label">Cancellation Reason</p>
                    {editingCancelReasonId === request.id ? (
                      <div className="field">
                        <textarea
                          rows="3"
                          value={editCancelNote}
                          onChange={(e) => setEditCancelNote(e.target.value)}
                        />
                        <div className="content-actions" style={{ marginTop: '8px' }}>
                          <button className="secondary-button" type="button" onClick={() => setEditingCancelReasonId(null)}>Cancel</button>
                          <button className="primary-button" type="button" style={{ backgroundColor: '#e53e3e', color: 'white', borderColor: '#e53e3e' }} onClick={() => saveCancelReason(request.id)}>Save Note</button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px' }}>
                        <p className="details-value" style={{ color: '#e53e3e', whiteSpace: 'pre-wrap', flex: 1 }}>
                          {request.cancellationReason || 'No reason provided.'}
                        </p>
                        <button className="secondary-button" type="button" onClick={() => startEditCancelReason(request.id, request.cancellationReason)}>Edit</button>
                      </div>
                    )}
                  </div>
                ) : null}

                {allowReject && rejectingId === request.id ? (
                  <div className="reject-panel">
                    <label className="field">
                      <span>Rejection Reason</span>
                      <textarea
                        rows="3"
                        value={rejectNote}
                        onChange={(event) => setRejectNote(event.target.value)}
                        placeholder="Explain why this request was rejected"
                      />
                    </label>
                    {rejectError ? (
                      <p className="form-error">{rejectError}</p>
                    ) : null}
                    <div className="content-actions">
                      <button
                        className="secondary-button"
                        type="button"
                        onClick={() => setRejectingId(null)}
                      >
                        Cancel
                      </button>
                      <button
                        className="primary-button"
                        type="button"
                        onClick={() => submitReject(request.id)}
                      >
                        Confirm Reject
                      </button>
                    </div>
                  </div>
                ) : null}

                {allowCancel && isApproved && cancellingId === request.id ? (
                  <div className="reject-panel" style={{ backgroundColor: '#fff5f5' }}>
                    <label className="field">
                      <span>Cancellation Reason</span>
                      <textarea
                        rows="3"
                        value={cancelNote}
                        onChange={(event) => setCancelNote(event.target.value)}
                        placeholder="Explain why this approval is being cancelled"
                      />
                    </label>
                    {cancelError ? (
                      <p className="form-error">{cancelError}</p>
                    ) : null}
                    <div className="content-actions">
                      <button
                        className="secondary-button"
                        type="button"
                        onClick={() => setCancellingId(null)}
                      >
                        Keep Approval
                      </button>
                      <button
                        className="primary-button"
                        type="button"
                        style={{ backgroundColor: '#e53e3e', color: 'white', borderColor: '#e53e3e' }}
                        onClick={() => submitCancel(request.id)}
                      >
                        Confirm Cancel
                      </button>
                    </div>
                  </div>
                ) : null}

                {!rejectingId && !cancellingId && (allowApprove || allowReject || (allowCancel && isApproved) || (request.status === 'Rejected' && !request.archivedAt)) && (
                  <div className="details-actions" style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px solid var(--border-light)', display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                    {request.status === 'Rejected' && !request.archivedAt ? (
                      <button className="secondary-button" type="button" onClick={() => {
                        if (window.confirm("Are you sure you want to undo the rejection? This will move the request back to Pending.")) {
                          undoRejectRequest(request.id)
                        }
                      }}>Undo Reject</button>
                    ) : null}
                    {allowCancel && isApproved ? (
                      <button className="secondary-button" type="button" onClick={() => startCancel(request.id)}>Cancel Approval</button>
                    ) : null}
                    {allowReject ? (
                      <button className="secondary-button" type="button" style={{ color: '#e53e3e', borderColor: '#e53e3e' }} onClick={() => startReject(request.id)}>Reject</button>
                    ) : null}
                    {allowApprove ? (
                      <button className="primary-button" type="button" onClick={() => approveRequest(request.id)}>Approve</button>
                    ) : null}
                  </div>
                )}
              </div>
            </td>
          </tr>
        ) : null}
      </Fragment>
    )
  }

  const pendingRequests = requests.filter(
    (request) =>
      (!request.status || request.status === 'Pending') && !request.archivedAt
  )
  const allActiveRequests = requests.filter((request) => !request.archivedAt)
  const archivedRequests = requests.filter((request) => request.archivedAt)

  return (
    <RoleGate allow={['SK Chairman']}>
      <header className="dashboard-header">
        <div className="header-left">
          <div>
            <p className="eyebrow">Request Review</p>
            <h1>Budget requests</h1>
            <p>Requests submitted by the SK Treasurer appear here.</p>
          </div>
        </div>
        <div
          className="header-actions page-tabs"
          role="tablist"
          aria-label="Request Review views"
        >
          <button
            className={`page-tab ${
              activeTab === 'pending' ? 'is-active' : ''
            }`}
            type="button"
            role="tab"
            aria-selected={activeTab === 'pending'}
            onClick={() => handleTabChange('pending')}
          >
            Pending
          </button>
          <button
            className={`page-tab ${
              activeTab === 'all' ? 'is-active' : ''
            }`}
            type="button"
            role="tab"
            aria-selected={activeTab === 'all'}
            onClick={() => handleTabChange('all')}
          >
            All Requests
          </button>
          <button
            className={`page-tab ${
              activeTab === 'archive' ? 'is-active' : ''
            }`}
            type="button"
            role="tab"
            aria-selected={activeTab === 'archive'}
            onClick={() => handleTabChange('archive')}
          >
            Archive
          </button>
        </div>
      </header>

      <section className="dashboard-content">
        {activeTab === 'pending' ? (
          <div className="overview-card">
            <p className="eyebrow">Pending requests</p>
            <h2>Awaiting SK Chairman review</h2>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Event</th>
                  <th>Category</th>
                  <th>Total amount</th>
                  <th>Event Date</th>
                  <th>Venue</th>
                  <th>Project Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {pendingRequests.length ? (
                  pendingRequests.map((request) =>
                    renderRequestRow(request, {
                      allowApprove: true,
                      allowReject: true,
                      allowArchive: true,
                    })
                  )
                ) : (
                  <tr>
                    <td colSpan="7" className="empty-state">
                      No pending requests right now.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        ) : activeTab === 'all' ? (
          <div className="overview-card">
            <p className="eyebrow">All requests</p>
            <h2>All active budget requests</h2>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Event</th>
                  <th>Category</th>
                  <th>Total amount</th>
                  <th>Event Date</th>
                  <th>Venue</th>
                  <th>Project Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {allActiveRequests.length ? (
                  allActiveRequests.map((request) =>
                    renderRequestRow(request, {
                      allowArchive: true,
                      allowCancel: true,
                    })
                  )
                ) : (
                  <tr>
                    <td colSpan="7" className="empty-state">
                      No requests yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="overview-card">
            <p className="eyebrow">Archive</p>
            <h2>Archived requests</h2>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Event</th>
                  <th>Category</th>
                  <th>Total amount</th>
                  <th>Event Date</th>
                  <th>Venue</th>
                  <th>Project Status</th>
                  <th>Archived</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {archivedRequests.length ? (
                  archivedRequests.map((request) =>
                    renderRequestRow(request, {
                      showArchivedAt: true,
                      allowRestore: true,
                    })
                  )
                ) : (
                  <tr>
                    <td colSpan="8" className="empty-state">
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

export default ApprovalsPage
