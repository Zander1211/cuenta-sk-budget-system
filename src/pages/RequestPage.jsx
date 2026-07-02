import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronDown } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import RoleGate from '../components/RoleGate'
import { useBudget } from '../context/BudgetContext'
import ArchivedRequestModal from '../components/ArchivedRequestModal'

const currency = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  maximumFractionDigits: 2,
})

function RequestPage() {
  const { requests, archiveRequest, restoreRequest } = useBudget()
  const navigate = useNavigate()
  const { profileName, profileSurname } = useAuth()
  
  const [activeTab, setActiveTab] = useState('active')
  const [requestType, setRequestType] = useState('Project') // 'Project', 'Event', 'Payroll'
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const [selectedArchivedRequest, setSelectedArchivedRequest] = useState(null)

  const activeRequests = requests.filter((request) => !request.archivedAt && (request.type || 'Project') === requestType)
  const archivedRequests = requests.filter((request) => request.archivedAt && (request.type || 'Project') === requestType)

  function handleArchive(requestId) {
    archiveRequest(requestId, `${profileName} ${profileSurname}`.trim())
    setActiveTab('archive')
  }

  function handleEdit(request) {
    navigate(`/dashboard/request/new?type=${request.type || 'Project'}&editId=${request.id}`)
  }

  return (
    <RoleGate allow={['SK Treasurer']}>
      <header className="dashboard-header">
        <div className="header-left">
          <div>
            <p className="eyebrow">Request</p>
            <h1>Budget requests</h1>
            <p>Create and manage budget requests for SK Chairman approval.</p>
          </div>
        </div>
        <div className="header-actions">
          <div style={{ position: 'relative' }}>
            <button
              className="primary-button"
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            >
              Create Request <ChevronDown size={16} style={{ marginLeft: '8px' }} />
            </button>
            {isDropdownOpen && (
              <div className="request-dropdown-menu">
                <button
                  className="request-dropdown-item"
                  onClick={() => { setIsDropdownOpen(false); navigate('/dashboard/request/new?type=Project'); }}
                >
                  Project Budget Request
                </button>
                <button
                  className="request-dropdown-item"
                  onClick={() => { setIsDropdownOpen(false); navigate('/dashboard/request/new?type=Event'); }}
                >
                  Event Budget Request
                </button>
                <button
                  className="request-dropdown-item"
                  onClick={() => { setIsDropdownOpen(false); navigate('/dashboard/request/new?type=Payroll'); }}
                >
                  Payroll Budget Request
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <section className="dashboard-content">
        <div className="page-tabs" role="tablist" style={{ marginBottom: '24px' }}>
          <button
            className={`page-tab ${activeTab === 'active' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('active')}
          >
            Active
          </button>
          <button
            className={`page-tab ${activeTab === 'archive' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('archive')}
          >
            Archive
          </button>
        </div>

        <div className="overview-card" style={{ marginBottom: '24px' }}>
          <div className="filter-group">
            <span className="filter-label" style={{ marginRight: '16px', fontWeight: 600 }}>Filter by Type:</span>
            <div className="filter-toggle">
              <button
                className={`filter-toggle-btn ${requestType === 'Project' ? 'is-active' : ''}`}
                onClick={() => setRequestType('Project')}
              >
                Projects
              </button>
              <button
                className={`filter-toggle-btn ${requestType === 'Event' ? 'is-active' : ''}`}
                onClick={() => setRequestType('Event')}
              >
                Events
              </button>
              <button
                className={`filter-toggle-btn ${requestType === 'Payroll' ? 'is-active' : ''}`}
                onClick={() => setRequestType('Payroll')}
              >
                Payroll
              </button>
            </div>
          </div>
        </div>

        {activeTab === 'active' ? (
          <div className="overview-card">
            <p className="eyebrow">Requests</p>
            <h2>Active {requestType} requests</h2>
            <table className="data-table">
              <thead>
                <tr>
                  <th>{requestType === 'Payroll' ? 'Payroll Title' : 'Title'}</th>
                  {requestType !== 'Payroll' && <th>Category</th>}
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
                      {requestType !== 'Payroll' && <td>{request.category}</td>}
                      <td>{currency.format(request.amount)}</td>
                      <td>
                        <span className={`status-pill status-${(request.status || 'Pending').toLowerCase()}`}>
                          {request.status || 'Pending'}
                        </span>
                      </td>
                      <td>{request.rejectionReason || '—'}</td>
                      <td>{new Date(request.submittedAt || new Date()).toLocaleDateString()}</td>
                      <td className="table-actions">
                        {request.status === 'Rejected' && (
                          <button
                            className="text-button"
                            type="button"
                            onClick={() => handleEdit(request)}
                            style={{ marginRight: '8px', fontWeight: 500 }}
                          >
                            Edit
                          </button>
                        )}
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
                    <td colSpan={requestType === 'Payroll' ? 6 : 7} className="empty-state">
                      No {requestType.toLowerCase()} requests submitted yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="overview-card">
            <p className="eyebrow">Archive</p>
            <h2>Archived {requestType} requests</h2>
            <table className="data-table">
              <thead>
                <tr>
                  <th>{requestType === 'Payroll' ? 'Payroll Title' : 'Title'}</th>
                  {requestType !== 'Payroll' && <th>Category</th>}
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Note</th>
                  <th>Archived Date</th>
                  <th>Archived By</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {archivedRequests.length ? (
                  archivedRequests.map((request) => (
                    <tr key={request.id}>
                      <td>{request.event}</td>
                      {requestType !== 'Payroll' && <td>{request.category}</td>}
                      <td>{currency.format(request.amount)}</td>
                      <td>
                        <span className={`status-pill status-${(request.status || 'Pending').toLowerCase()}`}>
                          {request.status || 'Pending'}
                        </span>
                      </td>
                      <td>{request.rejectionReason || '—'}</td>
                      <td>{new Date(request.archivedAt).toLocaleDateString()}</td>
                      <td>{request.archivedBy || '—'}</td>
                      <td className="table-actions">
                        <button className="secondary-button" type="button" onClick={() => setSelectedArchivedRequest(request)}>
                          View Details
                        </button>
                        <button className="secondary-button" type="button" onClick={() => restoreRequest(request.id)}>
                          Restore
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={requestType === 'Payroll' ? 6 : 7} className="empty-state">No archived requests yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selectedArchivedRequest && (
        <ArchivedRequestModal
          request={selectedArchivedRequest}
          onClose={() => setSelectedArchivedRequest(null)}
        />
      )}
    </RoleGate>
  )
}

export default RequestPage
