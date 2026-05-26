import RoleGate from '../components/RoleGate'
import { useAuditLog } from '../context/AuditLogContext'

function AuditLogsPage() {
  const { logs } = useAuditLog()

  return (
    <RoleGate allow={['SK Chairman']}>
      <header className="dashboard-header">
        <div className="header-left">
          <div>
            <p className="eyebrow">Audit Logs</p>
            <h1>System activity</h1>
            <p>
              Track key actions taken by users across the SK Chairman dashboard.
            </p>
          </div>
        </div>
      </header>

      <section className="dashboard-content">
        <div className="overview-card">
          <p className="eyebrow">Recent activity</p>
          <h2>Latest actions</h2>
          <table className="audit-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Action</th>
                <th>Actor</th>
              </tr>
            </thead>
            <tbody>
              {logs.length ? (
                logs.map((log) => (
                  <tr key={log.id}>
                    <td>{new Date(log.timestamp).toLocaleString()}</td>
                    <td>{log.action}</td>
                    <td>{log.actor}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="3" className="empty-state">
                    No activity yet. Logs will appear as actions happen.
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

export default AuditLogsPage
