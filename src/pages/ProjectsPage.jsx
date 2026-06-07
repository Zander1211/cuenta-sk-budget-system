import RoleGate from '../components/RoleGate'
import { useBudget } from '../context/BudgetContext'

const currency = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  maximumFractionDigits: 0,
})

function ProjectsPage() {
  const { expenses, updateProjectStatus } = useBudget()
  const completed = expenses.filter((item) => {
    const status = item.status || 'Approved'
    return ['Approved', 'Released'].includes(status)
  })

  return (
    <RoleGate allow={['SK Chairman', 'SK Treasurer']}>
      <header className="dashboard-header">
        <div className="header-left">
          <div>
            <p className="eyebrow">Projects</p>
            <h1>Completed events and projects</h1>
            <p>Approved budget requests automatically appear here.</p>
          </div>
        </div>
      </header>

      <section className="dashboard-content">
        <div className="overview-card">
          <p className="eyebrow">Completed</p>
          <h2>Approved projects</h2>
          <table className="data-table">
            <thead>
              <tr>
                <th>Project / Event</th>
                <th>Category</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Project Status</th>
                <th>Approved</th>
              </tr>
            </thead>
            <tbody>
              {completed.length ? (
                completed.map((item) => {
                  const projectStatus = item.projectStatus || 'Ongoing'
                  return (
                    <tr key={item.id}>
                      <td>{item.project || item.event}</td>
                      <td>{item.category}</td>
                      <td>{currency.format(item.amount)}</td>
                      <td>
                        <span className="status-pill status-approved">
                          {item.status || 'Approved'}
                        </span>
                      </td>
                      <td>
                        <select
                          className="project-status-select"
                          value={projectStatus}
                          onChange={(e) =>
                            updateProjectStatus(item.id, e.target.value)
                          }
                        >
                          <option value="Ongoing">Ongoing</option>
                          <option value="Completed">Completed</option>
                        </select>
                      </td>
                      <td>{new Date(item.approvedAt).toLocaleDateString()}</td>
                    </tr>
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

