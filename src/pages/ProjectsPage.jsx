import { Fragment, useMemo, useState, useEffect } from 'react'
import { useBudget } from '../context/BudgetContext'
import RoleGate from '../components/RoleGate'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabase/supabaseClient'
import { Download, FileText } from 'lucide-react'

const currency = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  maximumFractionDigits: 0,
})

function ProjectsPage() {
  const { role } = useAuth()
  const { expenses, updateProjectStatus } = useBudget()
  const [expanded, setExpanded] = useState({})
  const [receiptLinks, setReceiptLinks] = useState({})

  useEffect(() => {
    let mounted = true
    const expandedIds = Object.keys(expanded).filter(id => expanded[id])
    if (!expandedIds.length) return

    async function fetchReceipts() {
      const updates = {}
      await Promise.all(expandedIds.map(async (id) => {
        const project = expenses.find(e => e.id === id)
        if (!project) return
        
        const additionalExpenses = expenses.filter(e => e.type === 'Expense' && (e.project === project.event || e.event === project.event))
        const allLinked = [project, ...additionalExpenses]
        
        await Promise.all(allLinked.map(async (expense) => {
          const path = expense.receiptUrl || expense.receipt_url
          if (path && !receiptLinks[expense.id]) {
            const { data } = await supabase.storage.from('receipts').createSignedUrl(path, 60 * 60)
            if (data?.signedUrl) {
              updates[expense.id] = { url: data.signedUrl, name: expense.receipt_name || expense.receiptName || 'Receipt' }
            }
          }
        }))
      }))

      if (mounted && Object.keys(updates).length > 0) {
        setReceiptLinks(prev => ({ ...prev, ...updates }))
      }
    }
    
    fetchReceipts()
    return () => { mounted = false }
  }, [expanded, expenses, receiptLinks])

  // Filter only parent expenses (approved requests) of type 'Project'
  const parentProjects = useMemo(() => {
    return expenses.filter((item) => {
      const isProject = !item.type || item.type === 'Project'
      const status = item.status || 'Approved'
      return !item.isAdditional && ['Approved', 'Released'].includes(status) && !item.archivedAt && isProject
    })
  }, [expenses])

  function toggleDetails(id) {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  function renderProjectDetails(project, columnCount) {
    if (!expanded[project.id]) return null

    const additionalExpenses = expenses.filter(e => e.isAdditional && e.parentProjectId === project.id && !e.archivedAt)
    const additionalSum = additionalExpenses.reduce((sum, e) => sum + Number(e.amount || 0), 0)
    
    const approvedBudget = Number(project.amount || 0)
    const totalExpenses = approvedBudget + additionalSum
    const remainingBalance = approvedBudget - totalExpenses
    const utilization = approvedBudget > 0 ? Math.round((totalExpenses / approvedBudget) * 100) : 0

    return (
      <tr className="details-row">
        <td colSpan={columnCount}>
          <div className="details-panel" style={{ backgroundColor: 'var(--surface-color)', padding: '24px', borderTop: '1px solid var(--border-color)' }}>
            <div className="details-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '24px', marginBottom: '24px' }}>
              <div>
                <p className="details-label" style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: '4px' }}>Approved Budget</p>
                <p className="details-value" style={{ fontSize: '1.25rem', fontWeight: '600' }}>{currency.format(approvedBudget)}</p>
              </div>
              <div>
                <p className="details-label" style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: '4px' }}>Total Expenses</p>
                <p className="details-value" style={{ fontSize: '1.25rem', fontWeight: '600' }}>{currency.format(totalExpenses)}</p>
              </div>
              <div>
                <p className="details-label" style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: '4px' }}>Additional Expenses</p>
                <p className="details-value" style={{ fontSize: '1.25rem', fontWeight: '600' }}>{currency.format(additionalSum)}</p>
              </div>
              <div>
                <p className="details-label" style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: '4px' }}>Remaining Balance</p>
                <p className="details-value" style={{ fontSize: '1.25rem', fontWeight: '600', color: remainingBalance < 0 ? 'var(--danger-color)' : 'inherit' }}>
                  {currency.format(remainingBalance)}
                </p>
              </div>
              <div>
                <p className="details-label" style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: '4px' }}>Budget Utilization</p>
                <p className="details-value" style={{ fontSize: '1.25rem', fontWeight: '600' }}>{utilization}%</p>
              </div>
              <div>
                <p className="details-label" style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: '4px' }}>Date Approved</p>
                <p className="details-value" style={{ fontSize: '1.25rem', fontWeight: '600' }}>{project.approvedAt ? new Date(project.approvedAt).toLocaleDateString() : '—'}</p>
              </div>
            </div>

            <div className="details-breakdown">
              <p className="details-label" style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: '12px' }}>Additional Expenses Breakdown</p>
              {additionalExpenses.length > 0 ? (
                <table className="data-table" style={{ marginTop: '0' }}>
                  <thead>
                    <tr>
                      <th>Description</th>
                      <th>Date</th>
                      <th>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {additionalExpenses.map(e => (
                      <tr key={e.id}>
                        <td>{e.description || e.remarks || '—'}</td>
                        <td>{e.date ? new Date(e.date).toLocaleDateString() : '—'}</td>
                        <td>{currency.format(e.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <th colSpan="2">Total Additional</th>
                      <th>{currency.format(additionalSum)}</th>
                    </tr>
                  </tfoot>
                </table>
              ) : (
                <p className="details-value" style={{ color: 'var(--text-secondary)' }}>No additional expenses linked to this project.</p>
              )}
            </div>
            
            <div className="details-breakdown" style={{ marginTop: '24px' }}>
              <p className="details-label" style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: '12px' }}>Attached Receipts</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {[project, ...additionalExpenses].filter(e => receiptLinks[e.id]).length > 0 ? (
                  [project, ...additionalExpenses].map(e => {
                    const receipt = receiptLinks[e.id]
                    if (!receipt) return null
                    return (
                      <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', backgroundColor: 'var(--bg-secondary)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                        <FileText size={20} color="var(--accent)" />
                        <div style={{ flex: 1 }}>
                          <p style={{ margin: 0, fontWeight: 500, fontSize: '0.9rem' }}>{receipt.name}</p>
                          <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--ink-soft)' }}>
                            {e.id === project.id ? 'Main Project Receipt' : `Additional Expense: ${e.description || e.remarks || '—'}`}
                          </p>
                        </div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <a href={receipt.url} target="_blank" rel="noreferrer" className="secondary-button" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            View
                          </a>
                          <a href={receipt.url} download className="secondary-button" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Download size={14} /> Download
                          </a>
                        </div>
                      </div>
                    )
                  })
                ) : (
                  <p className="details-value" style={{ color: 'var(--text-secondary)' }}>No receipts attached to this project or its additional expenses.</p>
                )}
              </div>
            </div>
            
            {project.description && (
              <div style={{ marginTop: '24px' }}>
                <p className="details-label" style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: '4px' }}>Description</p>
                <p className="details-value">{project.description}</p>
              </div>
            )}
          </div>
        </td>
      </tr>
    )
  }

  return (
    <RoleGate allow={['SK Chairman', 'SK Treasurer', 'SK Kagawad', 'Barangay Treasurer']}>
      <header className="dashboard-header">
        <div className="header-left">
          <div>
            <p className="eyebrow">Projects Dashboard</p>
            <h1>Approved Projects</h1>
            <p>Monitor budgets, expenses, and completion status of all approved projects.</p>
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
                <th>Project Title</th>
                <th>Category</th>
                <th>Total Budget</th>
                <th>Utilization</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {parentProjects.length ? (
                parentProjects.map((project) => {
                  const additionalExpenses = expenses.filter(e => e.isAdditional && e.parentProjectId === project.id && !e.archivedAt)
                  const additionalSum = additionalExpenses.reduce((sum, e) => sum + Number(e.amount || 0), 0)
                  const approvedBudget = Number(project.amount || 0)
                  const totalExpenses = approvedBudget + additionalSum
                  const utilization = approvedBudget > 0 ? Math.min(100, Math.round((totalExpenses / approvedBudget) * 100)) : 0
                  
                  return (
                    <Fragment key={project.id}>
                      <tr>
                        <td data-label="Project Title">{project.project || project.event || 'Untitled'}</td>
                        <td data-label="Category">{project.category || '—'}</td>
                        <td data-label="Total Budget">{currency.format(approvedBudget)}</td>
                        <td data-label="Utilization">
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{ flex: 1, height: '6px', background: 'var(--border-color)', borderRadius: '3px', overflow: 'hidden' }}>
                              <div style={{ height: '100%', background: utilization > 100 ? 'var(--danger-color)' : 'var(--primary-color)', width: `${Math.min(utilization, 100)}%` }} />
                            </div>
                            <span style={{ fontSize: '0.75rem' }}>{utilization}%</span>
                          </div>
                        </td>
                        <td data-label="Status">
                          {role === 'SK Chairman' ? (
                            <select
                              className="project-status-select"
                              value={project.projectStatus || 'Ongoing'}
                              onChange={(e) => updateProjectStatus(project.id, e.target.value)}
                              aria-label="Update Project Status"
                            >
                              <option value="Ongoing">Ongoing</option>
                              <option value="Completed">Completed</option>
                            </select>
                          ) : (
                            <span className={`status-pill status-${(project.projectStatus || 'Ongoing').toLowerCase()}`}>
                              {project.projectStatus || 'Ongoing'}
                            </span>
                          )}
                        </td>
                        <td data-label="Actions" className="table-actions">
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
                  )
                })
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

export default ProjectsPage
