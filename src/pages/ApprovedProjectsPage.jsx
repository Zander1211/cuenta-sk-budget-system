import { Fragment, useEffect, useMemo, useState } from 'react'
import { useBudget } from '../context/BudgetContext'
import RoleGate from '../components/RoleGate'
import { supabase } from '../supabase/supabaseClient'
import { getBreakdownTotal } from '../utils/budgetUtils'
import BudgetBreakdownTable from '../components/BudgetBreakdownTable'

const currency = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  maximumFractionDigits: 0,
})



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

  function renderProjectDetails(project) {
    if (!expanded[project.id]) return null

    const breakdownItems = Array.isArray(project.breakdown) ? project.breakdown : []
    const breakdownTotal = getBreakdownTotal(breakdownItems, project.type === 'Payroll')
    const requestedAmount = Number(project.amount) || 0
    const totalAmount = requestedAmount > 0 ? requestedAmount : breakdownTotal
    const hasReceipt = project.receiptUrl || project.receipt_url || receiptLinks[project.id]

    return (
      <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #e5e7eb' }}>
        <div className="details-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
          <div>
            <p className="details-label" style={{ fontWeight: 600, fontSize: '0.85rem', color: '#6b7280', margin: '0 0 4px' }}>Description</p>
            <p className="details-value" style={{ margin: 0, fontSize: '0.95rem' }}>{project.description || '—'}</p>
          </div>
          <div>
            <p className="details-label" style={{ fontWeight: 600, fontSize: '0.85rem', color: '#6b7280', margin: '0 0 4px' }}>Total Cost (Breakdown)</p>
            <p className="details-value" style={{ margin: 0, fontSize: '0.95rem' }}>
              {breakdownItems.length ? currency.format(breakdownTotal) : '—'}
            </p>
          </div>
          <div>
            <p className="details-label" style={{ fontWeight: 600, fontSize: '0.85rem', color: '#6b7280', margin: '0 0 4px' }}>Event Date</p>
            <p className="details-value" style={{ margin: 0, fontSize: '0.95rem' }}>
              {project.eventDate
                ? new Date(project.eventDate).toLocaleDateString()
                : '—'}
            </p>
          </div>
          <div>
            <p className="details-label" style={{ fontWeight: 600, fontSize: '0.85rem', color: '#6b7280', margin: '0 0 4px' }}>Requested By</p>
            <p className="details-value" style={{ margin: 0, fontSize: '0.95rem' }}>{project.requestedBy || '—'}</p>
          </div>
        </div>

        <div className="details-breakdown" style={{ marginBottom: '24px' }}>
          <p className="details-label" style={{ fontWeight: 600, fontSize: '0.85rem', color: '#6b7280', marginBottom: '12px' }}>Budget Breakdown</p>
          <BudgetBreakdownTable request={project} breakdownItems={breakdownItems} currency={currency} totalAmount={totalAmount} />
        </div>

        <div className="details-receipt-section">
          <p className="details-label" style={{ fontWeight: 600, fontSize: '0.85rem', color: '#6b7280', marginBottom: '8px' }}>Uploaded Documents and Receipts</p>
          <div className="details-receipt-actions">
            {hasReceipt ? (
              receiptLinks[project.id] ? (
                <a
                  className="file-link"
                  href={receiptLinks[project.id]}
                  target="_blank"
                  rel="noreferrer"
                  style={{ display: 'inline-block', padding: '8px 16px', backgroundColor: '#f3f4f6', borderRadius: '6px', color: '#2563eb', textDecoration: 'none', fontWeight: 500 }}
                >
                  View Receipt/Document
                </a>
              ) : (
                <span className="status-pill status-approved">Document Uploaded</span>
              )
            ) : (
              <p className="details-value" style={{ margin: 0, fontStyle: 'italic', color: '#9ca3af' }}>No documents uploaded.</p>
            )}
          </div>
        </div>
      </div>
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
        <div className="overview-card" style={{ padding: '24px' }}>
          <p className="eyebrow">Overview</p>
          <h2 style={{ marginBottom: '24px' }}>All Approved Projects</h2>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '24px' }}>
            {approvedProjects.length ? (
              approvedProjects.map((project) => (
                <div key={project.id} style={{ border: '1px solid #e5e7eb', borderRadius: '12px', padding: '20px', backgroundColor: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column' }}>
                  
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                    <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600, color: '#111827', lineHeight: '1.3' }}>
                      {project.project || project.event || 'Untitled'}
                    </h3>
                    <span className={`status-pill status-${(project.projectStatus || 'Ongoing').toLowerCase()}`} style={{ flexShrink: 0, marginLeft: '12px' }}>
                      {project.projectStatus || 'Ongoing'}
                    </span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                    <div>
                      <p style={{ margin: '0 0 2px', fontSize: '0.8rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>Category</p>
                      <p style={{ margin: 0, fontSize: '0.95rem', color: '#374151' }}>{project.category}</p>
                    </div>
                    <div>
                      <p style={{ margin: '0 0 2px', fontSize: '0.8rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>Approved Budget</p>
                      <p style={{ margin: 0, fontSize: '0.95rem', fontWeight: 500, color: '#059669' }}>{currency.format(project.amount || 0)}</p>
                    </div>
                    <div>
                      <p style={{ margin: '0 0 2px', fontSize: '0.8rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>Date Approved</p>
                      <p style={{ margin: 0, fontSize: '0.95rem', color: '#374151' }}>
                        {project.approvedAt ? new Date(project.approvedAt).toLocaleDateString() : '—'}
                      </p>
                    </div>
                  </div>

                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => toggleDetails(project.id)}
                    style={{ width: '100%', marginTop: 'auto', justifyContent: 'center' }}
                  >
                    {expanded[project.id] ? 'Hide Details' : 'View Details'}
                  </button>

                  {renderProjectDetails(project)}
                </div>
              ))
            ) : (
              <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '40px', color: '#6b7280', backgroundColor: '#f9fafb', borderRadius: '12px' }}>
                No approved projects yet.
              </div>
            )}
          </div>
        </div>
      </section>
    </RoleGate>
  )
}

export default ApprovedProjectsPage
