import { Fragment, useState } from 'react'
import RoleGate from '../components/RoleGate'
import { useBudget } from '../context/BudgetContext'

const currency = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  maximumFractionDigits: 0,
})

function ArchivedRequestsPage() {
  const { requests, restoreRequest } = useBudget()
  const [expanded, setExpanded] = useState({})

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

  const archivedRequests = requests.filter((request) => request.archivedAt)

  return (
    <RoleGate allow={['SK Chairman', 'SK Treasurer']}>
      <header className="dashboard-header">
        <div className="header-left">
          <div>
            <p className="eyebrow">Archive</p>
            <h1>Archived budget requests</h1>
            <p>Review and restore archived requests when needed.</p>
          </div>
        </div>
      </header>

      <section className="dashboard-content">
        <div className="overview-card">
          <p className="eyebrow">Archived</p>
          <h2>Archived requests</h2>
          <table className="data-table">
            <thead>
              <tr>
                <th>Event</th>
                <th>Category</th>
                <th>Total amount</th>
                <th>Event Date</th>
                <th>Venue</th>
                <th>Requested by</th>
                <th>Submitted</th>
                <th>Archived</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {archivedRequests.length ? (
                archivedRequests.map((request) => {
                  const breakdownItems = Array.isArray(request.breakdown)
                    ? request.breakdown
                    : []
                  const breakdownTotal = getBreakdownTotal(breakdownItems)
                  const requestedAmount = Number(request.amount) || 0
                  const totalAmount =
                    requestedAmount > 0 ? requestedAmount : breakdownTotal
                  const hasBreakdown = breakdownItems.length > 0

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
                        <td>{request.requestedBy}</td>
                        <td>
                          {new Date(request.submittedAt).toLocaleDateString()}
                        </td>
                        <td>
                          {request.archivedAt
                            ? new Date(request.archivedAt).toLocaleDateString()
                            : '—'}
                        </td>
                        <td className="table-actions">
                          <button
                            className="secondary-button"
                            type="button"
                            onClick={() => toggleDetails(request.id)}
                          >
                            {expanded[request.id] ? 'Hide' : 'View'}
                          </button>
                          <button
                            className="secondary-button"
                            type="button"
                            onClick={() => restoreRequest(request.id)}
                          >
                            Restore
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
                                  <p className="details-value">
                                    {request.event}
                                  </p>
                                </div>
                                <div>
                                  <p className="details-label">Category</p>
                                  <p className="details-value">
                                    {request.category}
                                  </p>
                                </div>
                                <div>
                                  <p className="details-label">Status</p>
                                  <p className="details-value">
                                    {request.status || 'Pending'}
                                  </p>
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
                                    {hasBreakdown
                                      ? currency.format(breakdownTotal)
                                      : '—'}
                                  </p>
                                </div>
                                <div>
                                  <p className="details-label">Project description</p>
                                  <p className="details-value">
                                    {request.description || '—'}
                                  </p>
                                </div>
                                <div>
                                  <p className="details-label">Notes / supporting info</p>
                                  <p className="details-value">
                                    {request.notes || '—'}
                                  </p>
                                </div>
                                <div>
                                  <p className="details-label">Rejection note</p>
                                  <p className="details-value">
                                    {request.rejectionReason || '—'}
                                  </p>
                                </div>
                                <div>
                                  <p className="details-label">Event date</p>
                                  <p className="details-value">
                                    {request.eventDate
                                      ? new Date(
                                          request.eventDate
                                        ).toLocaleDateString()
                                      : '—'}
                                  </p>
                                </div>
                                <div>
                                  <p className="details-label">Venue</p>
                                  <p className="details-value">
                                    {request.venue || '—'}
                                  </p>
                                </div>
                                <div>
                                  <p className="details-label">Requested by</p>
                                  <p className="details-value">
                                    {request.requestedBy}
                                  </p>
                                </div>
                                <div>
                                  <p className="details-label">Submitted</p>
                                  <p className="details-value">
                                    {new Date(
                                      request.submittedAt
                                    ).toLocaleDateString()}
                                  </p>
                                </div>
                                <div>
                                  <p className="details-label">Archived</p>
                                  <p className="details-value">
                                    {request.archivedAt
                                      ? new Date(
                                          request.archivedAt
                                        ).toLocaleDateString()
                                      : '—'}
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
                                          <td>{item.itemName || '—'}</td>
                                          <td>{item.quantity || 0}</td>
                                          <td>
                                            {currency.format(item.unitCost || 0)}
                                          </td>
                                          <td>
                                            {currency.format(
                                              (item.quantity || 0) *
                                                (item.unitCost || 0)
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
                                  <p className="details-value">
                                    No breakdown provided.
                                  </p>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  )
                })
              ) : (
                <tr>
                  <td colSpan="9" className="empty-state">
                    No archived requests yet.
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

export default ArchivedRequestsPage
