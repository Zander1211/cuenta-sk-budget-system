import { Fragment, useEffect, useMemo, useState } from 'react'
import { useBudget } from '../context/BudgetContext'
import RoleGate from '../components/RoleGate'
import { supabase } from '../supabase/supabaseClient'

const currency = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  maximumFractionDigits: 0,
})

function getBreakdownTotal(breakdown = []) {
  return breakdown.reduce((sum, item) => {
    const qty = Number(item.quantity) || 0
    const unit = Number(item.unitCost) || 0
    return sum + qty * unit
  }, 0)
}

function ApprovedProjectsPage() {
  const { expenses } = useBudget()
  const [expanded, setExpanded] = useState({})
  const [receiptLinks, setReceiptLinks] = useState({})
  const RECEIPTS_BUCKET = 'receipts'

  // Filter only approved/released expenses representing approved projects
  const approvedProjects = useMemo(() => {
    return expenses.filter((item) => {
      const status = item.status || 'Approved'
      const isProject = !item.type || item.type === 'Project'
      return ['Approved', 'Released'].includes(status) && !item.archivedAt && isProject
    })
  }, [expenses])

  // Generate signed URLs for receipts/documents
  useEffect(() => {
    let mounted = true
    const missing = approvedProjects.filter((expense) => {
      const path = expense.receiptUrl || expense.receipt_url
      return path && !receiptLinks[expense.id]
    })

    if (!missing.length) return

    ;(async () => {
      const updates = {}
      await Promise.all(
        missing.map(async (expense) => {
          const path = expense.receiptUrl || expense.receipt_url
          const { data } = await supabase.storage
            .from(RECEIPTS_BUCKET)
            .createSignedUrl(path, 60 * 60)
          if (data?.signedUrl) {
            updates[expense.id] = data.signedUrl
          }
        })
      )

      if (mounted && Object.keys(updates).length) {
        setReceiptLinks((prev) => ({ ...prev, ...updates }))
      }
    })()

    return () => {
      mounted = false
    }
  }, [approvedProjects, receiptLinks])

  function toggleDetails(projectId) {
    setExpanded((prev) => ({
      ...prev,
      [projectId]: !prev[projectId],
    }))
  }

  function renderProjectDetails(project, columnCount) {
    if (!expanded[project.id]) return null

    const breakdownItems = Array.isArray(project.breakdown) ? project.breakdown : []
    const breakdownTotal = getBreakdownTotal(breakdownItems)
    const requestedAmount = Number(project.amount) || 0
    const totalAmount = requestedAmount > 0 ? requestedAmount : breakdownTotal
    const hasReceipt = project.receiptUrl || project.receipt_url || receiptLinks[project.id]

    return (
      <tr className="details-row">
        <td colSpan={columnCount}>
          <div className="details-panel">
            <div className="details-grid">
              <div>
                <p className="details-label">Description</p>
                <p className="details-value">{project.description || '—'}</p>
              </div>
              <div>
                <p className="details-label">Total Amount</p>
                <p className="details-value">{currency.format(totalAmount)}</p>
              </div>
              <div>
                <p className="details-label">Total Cost (Breakdown)</p>
                <p className="details-value">
                  {breakdownItems.length ? currency.format(breakdownTotal) : '—'}
                </p>
              </div>
              <div>
                <p className="details-label">Date Approved</p>
                <p className="details-value">
                  {project.approvedAt
                    ? new Date(project.approvedAt).toLocaleDateString()
                    : '—'}
                </p>
              </div>
              <div>
                <p className="details-label">Current Status</p>
                <p className="details-value">
                  {project.projectStatus || 'Ongoing'}
                </p>
              </div>
              <div>
                <p className="details-label">Associated Expenses / Category</p>
                <p className="details-value">{project.category || '—'}</p>
              </div>
              <div>
                <p className="details-label">Event Date</p>
                <p className="details-value">
                  {project.eventDate
                    ? new Date(project.eventDate).toLocaleDateString()
                    : '—'}
                </p>
              </div>
              <div>
                <p className="details-label">Requested By</p>
                <p className="details-value">{project.requestedBy || '—'}</p>
              </div>
            </div>

            <div className="details-breakdown">
              <p className="details-label">Budget Breakdown</p>
              {breakdownItems.length ? (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th>Quantity</th>
                      <th>Unit Cost</th>
                      <th>Total Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {breakdownItems.map((item, index) => (
                      <tr key={`${project.id}-item-${index}`}>
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
                      <th colSpan="3">Total Cost</th>
                      <th>{currency.format(breakdownTotal)}</th>
                    </tr>
                    <tr>
                      <th colSpan="3">Total Amount</th>
                      <th>{currency.format(totalAmount)}</th>
                    </tr>
                  </tfoot>
                </table>
              ) : (
                <p className="details-value">No breakdown provided.</p>
              )}
            </div>

            <div className="details-receipt-section">
              <p className="details-label">Uploaded Documents and Receipts</p>
              <div className="details-receipt-actions">
                {hasReceipt ? (
                  receiptLinks[project.id] ? (
                    <a
                      className="file-link"
                      href={receiptLinks[project.id]}
                      target="_blank"
                      rel="noreferrer"
                    >
                      View Receipt/Document
                    </a>
                  ) : (
                    <span className="status-pill status-approved">Document Uploaded</span>
                  )
                ) : (
                  <p className="details-value" style={{ margin: 0 }}>No documents uploaded.</p>
                )}
              </div>
            </div>
          </div>
        </td>
      </tr>
    )
  }

  return (
    <RoleGate allow={['SK Kagawad', 'Barangay Treasurer']}>
      <header className="dashboard-header">
        <div className="header-left">
          <div>
            <p className="eyebrow">Transparency</p>
            <h1>Approved Projects</h1>
            <p>View detailed information and budget breakdowns for all approved projects and events.</p>
          </div>
        </div>
      </header>

      <section className="dashboard-content">
        <div className="overview-card">
          <p className="eyebrow">Overview</p>
          <h2>All Approved Projects</h2>
          <table className="data-table">
            <thead>
              <tr>
                <th>Project / Event Title</th>
                <th>Category</th>
                <th>Approved Budget</th>
                <th>Date Approved</th>
                <th>Current Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {approvedProjects.length ? (
                approvedProjects.map((project) => (
                  <Fragment key={project.id}>
                    <tr>
                      <td>{project.project || project.event || 'Untitled'}</td>
                      <td>{project.category}</td>
                      <td>{currency.format(project.amount || 0)}</td>
                      <td>
                        {project.approvedAt
                          ? new Date(project.approvedAt).toLocaleDateString()
                          : '—'}
                      </td>
                      <td>
                        <span className={`status-pill status-${(project.projectStatus || 'Ongoing').toLowerCase()}`}>
                          {project.projectStatus || 'Ongoing'}
                        </span>
                      </td>
                      <td className="table-actions">
                        <button
                          className="secondary-button"
                          type="button"
                          onClick={() => toggleDetails(project.id)}
                        >
                          {expanded[project.id] ? 'Hide Details' : 'View Details'}
                        </button>
                      </td>
                    </tr>
                    {renderProjectDetails(project, 6)}
                  </Fragment>
                ))
              ) : (
                <tr>
                  <td colSpan="6" className="empty-state">
                    No approved projects yet.
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

export default ApprovedProjectsPage
