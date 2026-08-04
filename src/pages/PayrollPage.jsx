import { Fragment, useMemo, useState } from 'react'
import { useBudget } from '../context/BudgetContext'
import RoleGate from '../components/RoleGate'
import { useAuth } from '../context/AuthContext'

const currency = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  maximumFractionDigits: 0,
})

function getPayrollTotal(breakdown = []) {
  return breakdown.reduce((sum, row) => {
    const hon = Number(row.honoraria) || 0
    const cbc = Number(row.cbcLbf) || 0
    return sum + (hon - cbc)
  }, 0)
}

function PayrollPage() {
  const { role } = useAuth()
  const { expenses, updateProjectStatus } = useBudget()
  const [expanded, setExpanded] = useState({})

  // Filter only parent expenses (approved requests) of type 'Payroll'
  const parentPayroll = useMemo(() => {
    return expenses.filter((item) => {
      const status = item.status || 'Approved'
      return !item.isAdditional && ['Approved', 'Released'].includes(status) && !item.archivedAt && item.type === 'Payroll'
    })
  }, [expenses])

  function toggleDetails(id) {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  function renderPayrollDetails(project, columnCount) {
    if (!expanded[project.id]) return null

    const breakdownItems = Array.isArray(project.breakdown) ? project.breakdown : []
    const breakdownTotal = getPayrollTotal(breakdownItems)

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
              <p className="details-label" style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: '12px' }}>Payroll Entries</p>
              {breakdownItems.length ? (
                <table className="data-table" style={{ marginTop: '0', marginBottom: '24px' }}>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Position</th>
                      <th>Honoraria</th>
                      <th>Service</th>
                      <th>CBC/LBF</th>
                      <th>Net Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {breakdownItems.map((item, index) => {
                      const hon = Number(item.honoraria) || 0
                      const cbc = Number(item.cbcLbf) || 0
                      const net = hon - cbc
                      return (
                        <tr key={`${project.id}-item-${index}`}>
                          <td>{item.name || '—'}</td>
                          <td>{item.position || '—'}</td>
                          <td>{currency.format(hon)}</td>
                          <td>{item.serviceRendered || '—'}</td>
                          <td>{currency.format(cbc)}</td>
                          <td>{currency.format(net)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr>
                      <th colSpan="5">Total Payroll Net Amount</th>
                      <th>{currency.format(breakdownTotal)}</th>
                    </tr>
                  </tfoot>
                </table>
              ) : (
                <p className="details-value" style={{ color: 'var(--text-secondary)' }}>No breakdown provided.</p>
              )}
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
                <p className="details-value" style={{ color: 'var(--text-secondary)' }}>No additional expenses linked to this payroll.</p>
              )}
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
            <p className="eyebrow">Payroll Dashboard</p>
            <h1>Approved Payroll</h1>
            <p>Monitor budgets, expenses, and status of all approved payroll requests.</p>
          </div>
        </div>
      </header>

      <section className="dashboard-content">
        <div className="overview-card">
          <p className="eyebrow">Overview</p>
          <h2>All Approved Payroll</h2>
          <table className="data-table">
            <thead>
              <tr>
                <th>Payroll Title</th>
                <th>Purpose</th>
                <th>Total Budget</th>
                <th>Utilization</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {parentPayroll.length ? (
                parentPayroll.map((project) => {
                  const additionalExpenses = expenses.filter(e => e.isAdditional && e.parentProjectId === project.id && !e.archivedAt)
                  const additionalSum = additionalExpenses.reduce((sum, e) => sum + Number(e.amount || 0), 0)
                  const approvedBudget = Number(project.amount || 0)
                  const totalExpenses = approvedBudget + additionalSum
                  const utilization = approvedBudget > 0 ? Math.min(100, Math.round((totalExpenses / approvedBudget) * 100)) : 0
                  
                  return (
                    <Fragment key={project.id}>
                      <tr>
                        <td data-label="Payroll Title">{project.project || project.event || 'Untitled'}</td>
                        <td data-label="Purpose">{project.description || '—'}</td>
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
                              onChange={(e) => updateProjectStatus(project.requestId || project.id, e.target.value)}
                              aria-label="Update Payroll Status"
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
                      {renderPayrollDetails(project, 6)}
                    </Fragment>
                  )
                })
              ) : (
                <tr>
                  <td colSpan="6" className="empty-state">
                    No approved payroll yet.
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

export default PayrollPage
