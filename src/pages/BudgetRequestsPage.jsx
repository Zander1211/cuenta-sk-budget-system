import { Fragment, useState } from 'react'
import RoleGate from '../components/RoleGate'
import { useBudget } from '../context/BudgetContext'

const currency = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  maximumFractionDigits: 0,
})

function BudgetRequestsPage() {
  const { requests } = useBudget()
  const [expanded, setExpanded] = useState({})
  const [activeTab, setActiveTab] = useState('approved')

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

  const approvedRequests = requests.filter(
    (r) => r.status === 'Approved' && !r.archivedAt
  )
  const pendingRequests = requests.filter(
    (r) => (!r.status || r.status === 'Pending') && !r.archivedAt
  )
  const rejectedRequests = requests.filter(
    (r) => r.status === 'Rejected' && !r.archivedAt
  )
  const ongoingRequests = requests.filter(
    (r) =>
      r.status === 'Approved' &&
      (r.projectStatus === 'Ongoing' || (!r.projectStatus && r.status === 'Approved')) &&
      !r.archivedAt
  )

  const tabs = [
    { key: 'approved', label: 'Approved', count: approvedRequests.length },
    { key: 'pending', label: 'Pending', count: pendingRequests.length },
    { key: 'ongoing', label: 'Ongoing', count: ongoingRequests.length },
    { key: 'rejected', label: 'Rejected', count: rejectedRequests.length },
  ]

  function getFilteredRequests() {
    switch (activeTab) {
      case 'approved':
        return approvedRequests
      case 'pending':
        return pendingRequests
      case 'rejected':
        return rejectedRequests
      case 'ongoing':
        return ongoingRequests
      default:
        return approvedRequests
    }
  }

  const filteredRequests = getFilteredRequests()

  function renderRequestRow(request) {
    const breakdownItems = Array.isArray(request.breakdown)
      ? request.breakdown
      : []
    const breakdownTotal = getBreakdownTotal(breakdownItems)
    const requestedAmount = Number(request.amount) || 0
    const totalAmount = requestedAmount > 0 ? requestedAmount : breakdownTotal
    const hasBreakdown = breakdownItems.length > 0
    const projectStatus = request.projectStatus || 'Pending'

    return (
      <Fragment key={request.id}>
        <tr>
          <td>{request.event}</td>
          <td>{request.category}</td>
          <td>{currency.format(totalAmount)}</td>
          <td>
            {request.eventDate
              ? new Date(request.eventDate).toLocaleDateString()
              : '\u2014'}
          </td>
          <td>{request.venue || '\u2014'}</td>
          <td>
            <span
              className={`status-pill status-${(
                request.status || 'Pending'
              ).toLowerCase()}`}
            >
              {request.status || 'Pending'}
            </span>
          </td>
          <td>
            <span
              className={`status-pill status-${projectStatus.toLowerCase()}`}
            >
              {projectStatus}
            </span>
          </td>
          <td>{request.requestedBy}</td>
          <td className="table-actions">
            <button
              className="secondary-button"
              type="button"
              onClick={() => toggleDetails(request.id)}
            >
              {expanded[request.id] ? 'Hide' : 'View'}
            </button>
          </td>
        </tr>
        {expanded[request.id] ? (
          <tr className="details-row">
            <td colSpan="9">
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
                      {hasBreakdown ? currency.format(breakdownTotal) : '\u2014'}
                    </p>
                  </div>
                  <div>
                    <p className="details-label">Approval status</p>
                    <p className="details-value">
                      <span
                        className={`status-pill status-${(
                          request.status || 'Pending'
                        ).toLowerCase()}`}
                      >
                        {request.status || 'Pending'}
                      </span>
                    </p>
                  </div>
                  <div>
                    <p className="details-label">Project status</p>
                    <p className="details-value">
                      <span
                        className={`status-pill status-${projectStatus.toLowerCase()}`}
                      >
                        {projectStatus}
                      </span>
                    </p>
                  </div>
                  <div>
                    <p className="details-label">Project description</p>
                    <p className="details-value">
                      {request.description || '\u2014'}
                    </p>
                  </div>
                  <div>
                    <p className="details-label">Notes / supporting info</p>
                    <p className="details-value">
                      {request.notes || '\u2014'}
                    </p>
                  </div>
                  {request.rejectionReason ? (
                    <div>
                      <p className="details-label">Rejection note</p>
                      <p className="details-value">
                        {request.rejectionReason}
                      </p>
                    </div>
                  ) : null}
                  <div>
                    <p className="details-label">Event date</p>
                    <p className="details-value">
                      {request.eventDate
                        ? new Date(request.eventDate).toLocaleDateString()
                        : '\u2014'}
                    </p>
                  </div>
                  <div>
                    <p className="details-label">Venue</p>
                    <p className="details-value">{request.venue || '\u2014'}</p>
                  </div>
                  <div>
                    <p className="details-label">Requested by</p>
                    <p className="details-value">{request.requestedBy}</p>
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
                          <th>Other expenses</th>
                          <th>Quantity</th>
                          <th>Unit cost</th>
                          <th>Total cost</th>
                        </tr>
                      </thead>
                      <tbody>
                        {breakdownItems.map((item, index) => (
                          <tr key={`${request.id}-item-${index}`}>
                            <td>{item.itemName || '\u2014'}</td>
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
                        <tr>
                          <th colSpan="3">Total amount</th>
                          <th>{currency.format(totalAmount)}</th>
                        </tr>
                      </tfoot>
                    </table>
                  ) : (
                    <p className="details-value">No breakdown provided.</p>
                  )}
                </div>
              </div>
            </td>
          </tr>
        ) : null}
      </Fragment>
    )
  }

  return (
    <RoleGate allow={['SK Kagawad', 'Barangay Treasurer']}>
      <header className="dashboard-header">
        <div className="header-left">
          <div>
            <p className="eyebrow">Projects and Events</p>
            <h1>Projects and events overview</h1>
            <p>View all budget requests for events and projects.</p>
          </div>
        </div>
        <div
          className="header-actions page-tabs"
          role="tablist"
          aria-label="Budget request views"
        >
          {tabs.map((tab) => (
            <button
              key={tab.key}
              className={`page-tab ${activeTab === tab.key ? 'is-active' : ''}`}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.key}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label} ({tab.count})
            </button>
          ))}
        </div>
      </header>

      <section className="dashboard-content">
        <div className="overview-card">
          <p className="eyebrow">
            {tabs.find((t) => t.key === activeTab)?.label} requests
          </p>
          <h2>
            {activeTab === 'approved'
              ? 'Approved budget requests'
              : activeTab === 'pending'
                ? 'Pending budget requests'
                : activeTab === 'ongoing'
                  ? 'Ongoing events and projects'
                  : 'Rejected budget requests'}
          </h2>
          <table className="data-table">
            <thead>
              <tr>
                <th>Event</th>
                <th>Category</th>
                <th>Total amount</th>
                <th>Event Date</th>
                <th>Venue</th>
                <th>Status</th>
                <th>Project Status</th>
                <th>Requested by</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredRequests.length ? (
                filteredRequests.map((request) => renderRequestRow(request))
              ) : (
                <tr>
                  <td colSpan="9" className="empty-state">
                    No {activeTab} requests found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </RoleGate>
  )
}

export default BudgetRequestsPage
