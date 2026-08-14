import { Fragment, useState, useMemo } from 'react'
import RoleGate from '../components/RoleGate'
import { getBreakdownTotal } from '../utils/budgetUtils'
import BudgetBreakdownTable from '../components/BudgetBreakdownTable'
import { useBudget } from '../context/BudgetContext'
import { useNotifications } from '../context/NotificationContext'
import YearSpinner from '../components/YearSpinner'
import { Search, Filter, Eye, Check, X, Archive, RotateCcw } from 'lucide-react'

const currency = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  maximumFractionDigits: 0,
})

const monthLabels = [
  'All', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]

function ApprovalsPage() {
  const { addNotification } = useNotifications()
  const {
    requests,
    approveRequest,
    rejectRequest,
    cancelApproval,
    archiveRequest,
    restoreRequest,
    undoRejectRequest,
  } = useBudget()

  const [viewDetailsReq, setViewDetailsReq] = useState(null)
  
  // Filters
  const [searchTerm, setSearchTerm] = useState('')
  const [typeFilter, setTypeFilter] = useState('All')
  const [statusFilter, setStatusFilter] = useState('Pending')
  const [monthFilter, setMonthFilter] = useState('All')
  const [yearFilter, setYearFilter] = useState(new Date().getFullYear())

  // Approval/Rejection states
  const [rejectingId, setRejectingId] = useState(null)
  const [rejectNote, setRejectNote] = useState('')
  const [cancellingId, setCancellingId] = useState(null)
  const [cancelNote, setCancelNote] = useState('')
  const [approvingId, setApprovingId] = useState(null)
  const [approveConfirmId, setApproveConfirmId] = useState(null)
  
  const pendingCount = requests.filter(r => (!r.status || r.status === 'Pending') && !r.archivedAt).length
  const approvedCount = requests.filter(r => r.status === 'Approved' && !r.archivedAt).length
  const rejectedCount = requests.filter(r => r.status === 'Rejected' && !r.archivedAt).length
  const totalRequestedAmount = requests
    .filter(r => (!r.status || r.status === 'Pending') && !r.archivedAt)
    .reduce((sum, r) => sum + (Number(r.amount) || getBreakdownTotal(r.breakdown, r.type === 'Payroll')), 0)

  const displayedRequests = useMemo(() => {
    return requests.filter(req => {
      // Text search
      const text = `${req.event || ''} ${req.description || ''} ${req.category || ''} ${req.requestedBy || ''}`.toLowerCase()
      const matchesSearch = !searchTerm || text.includes(searchTerm.toLowerCase())
      
      // Type
      const matchesType = typeFilter === 'All' || req.type === typeFilter
      
      // Status
      const matchesStatus = statusFilter === 'All' || 
        (statusFilter === 'Pending' && (!req.status || req.status === 'Pending') && !req.archivedAt) ||
        (statusFilter === 'Approved' && req.status === 'Approved' && !req.archivedAt) ||
        (statusFilter === 'Rejected' && req.status === 'Rejected' && !req.archivedAt) ||
        (statusFilter === 'Cancelled' && req.status === 'Cancelled' && !req.archivedAt) ||
        (statusFilter === 'Archived' && req.archivedAt)
      
      // Date
      const reqDate = new Date(req.eventDate || req.submittedAt || Date.now())
      const reqMonth = reqDate.getMonth() + 1
      const reqYearStr = reqDate.getFullYear()
      const matchesMonth = monthFilter === 'All' || reqMonth.toString() === monthFilter.toString()
      const matchesYear = !yearFilter || reqYearStr === yearFilter
      
      return matchesSearch && matchesType && matchesStatus && matchesMonth && matchesYear
    }).sort((a, b) => new Date(b.submittedAt || 0) - new Date(a.submittedAt || 0))
  }, [requests, searchTerm, typeFilter, statusFilter, monthFilter, yearFilter])

  const requestTypes = ['All', 'Project', 'Event', 'Payroll']
  const statusOptions = ['All', 'Pending', 'Approved', 'Rejected', 'Cancelled', 'Archived']

  // Keep modal data fresh
  const activeViewDetailsReq = viewDetailsReq ? requests.find(r => String(r.id) === String(viewDetailsReq.id)) || viewDetailsReq : null

  async function handleApproveConfirm() {
    if (!approveConfirmId) return
    setApprovingId(approveConfirmId)
    const { error } = await approveRequest(approveConfirmId)
    if (error) {
      addNotification({ type: 'error', title: 'Approval Failed', message: error.message || 'The request could not be approved.' })
    }
    setApprovingId(null)
    setApproveConfirmId(null)
  }

  function handleRejectSubmit() {
    if (!rejectNote.trim()) {
      addNotification({ type: 'error', title: 'Error', message: 'Please add a rejection reason.' })
      return
    }
    rejectRequest(rejectingId, rejectNote.trim())
    setRejectingId(null)
    setRejectNote('')
  }
  
  function handleCancelSubmit() {
    if (!cancelNote.trim()) {
      addNotification({ type: 'error', title: 'Error', message: 'Please add a cancellation reason.' })
      return
    }
    cancelApproval(cancellingId, cancelNote.trim())
    setCancellingId(null)
    setCancelNote('')
  }

  return (
    <RoleGate allow={['SK Chairman']}>
      <header className="dashboard-header">
        <div className="header-left">
          <div>
            <p className="eyebrow">Request Review</p>
            <h1>Budget requests</h1>
            <p>Review and manage submitted Project, Event, and Payroll budget requests.</p>
          </div>
        </div>
      </header>

      <section className="dashboard-content">
        {/* Summary Cards */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '16px',
          marginBottom: '24px'
        }}>
          <div style={{ backgroundColor: 'var(--surface)', padding: '20px', borderRadius: '12px', border: '1px solid var(--border)', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Pending Requests</p>
            <h3 style={{ margin: '8px 0 0', fontSize: '1.75rem', color: '#d97706' }}>{pendingCount}</h3>
          </div>
          <div style={{ backgroundColor: 'var(--surface)', padding: '20px', borderRadius: '12px', border: '1px solid var(--border)', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Approved Requests</p>
            <h3 style={{ margin: '8px 0 0', fontSize: '1.75rem', color: 'var(--accent)' }}>{approvedCount}</h3>
          </div>
          <div style={{ backgroundColor: 'var(--surface)', padding: '20px', borderRadius: '12px', border: '1px solid var(--border)', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Rejected Requests</p>
            <h3 style={{ margin: '8px 0 0', fontSize: '1.75rem', color: '#e53e3e' }}>{rejectedCount}</h3>
          </div>
          <div style={{ backgroundColor: 'var(--surface)', padding: '20px', borderRadius: '12px', border: '1px solid var(--border)', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total Requested Amount</p>
            <h3 style={{ margin: '8px 0 0', fontSize: '1.75rem', color: 'var(--text-primary)' }}>{currency.format(totalRequestedAmount)}</h3>
          </div>
        </div>

        <div className="overview-card" style={{ backgroundColor: 'var(--surface)', borderRadius: '12px', overflow: 'hidden', border: '1px solid var(--border)' }}>
          
          {/* Header & Filters */}
          <div style={{ padding: '24px', borderBottom: '1px solid var(--border)' }}>
            <h2 style={{ margin: '0 0 16px', fontSize: '1.25rem', color: 'var(--text-primary)' }}>Request List</h2>
            
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
              <div className="search-input-container" style={{ flex: '1 1 250px', position: 'relative' }}>
                <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input
                  type="text"
                  placeholder="Search by title, category, or description..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  style={{
                    width: '100%', padding: '10px 12px 10px 40px', borderRadius: '8px',
                    border: '1px solid var(--border)', fontSize: '0.95rem'
                  }}
                />
              </div>
              <div style={{ flex: '1 1 120px', position: 'relative' }}>
                <Filter size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                  style={{
                    width: '100%', padding: '10px 12px 10px 40px', borderRadius: '8px',
                    border: '1px solid var(--border)', fontSize: '0.95rem', backgroundColor: '#fff'
                  }}
                >
                  {requestTypes.map(t => <option key={t} value={t}>{t === 'All' ? 'All Types' : t}</option>)}
                </select>
              </div>
              <div style={{ flex: '1 1 140px', position: 'relative' }}>
                <Filter size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  style={{
                    width: '100%', padding: '10px 12px 10px 40px', borderRadius: '8px',
                    border: '1px solid var(--border)', fontSize: '0.95rem', backgroundColor: '#fff'
                  }}
                >
                  {statusOptions.map(t => <option key={t} value={t}>{t === 'All' ? 'All Statuses' : t}</option>)}
                </select>
              </div>
              <div style={{ flex: '1 1 140px', position: 'relative' }}>
                <Filter size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <select
                  value={monthFilter}
                  onChange={(e) => setMonthFilter(e.target.value)}
                  style={{
                    width: '100%', padding: '10px 12px 10px 40px', borderRadius: '8px',
                    border: '1px solid var(--border)', fontSize: '0.95rem', backgroundColor: '#fff'
                  }}
                >
                  {monthLabels.map((m, i) => <option key={m} value={i === 0 ? 'All' : i}>{m}</option>)}
                </select>
              </div>
              <div style={{ width: '120px' }}>
                <YearSpinner year={yearFilter} onYearChange={setYearFilter} />
              </div>
            </div>
          </div>

          {/* Desktop and Mobile Table */}
          <div style={{ width: '100%', overflowX: 'auto' }}>
            <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: 'var(--table-header-bg, #f8fafc)', borderBottom: '1px solid var(--border)' }}>
                  <th style={{ padding: '16px 24px', textAlign: 'left', fontSize: '0.8rem', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 600 }}>Request</th>
                  <th style={{ padding: '16px 24px', textAlign: 'left', fontSize: '0.8rem', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 600 }}>Type</th>
                  <th style={{ padding: '16px 24px', textAlign: 'left', fontSize: '0.8rem', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 600 }}>Requested Amount</th>
                  <th style={{ padding: '16px 24px', textAlign: 'left', fontSize: '0.8rem', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 600 }}>Date</th>
                  <th style={{ padding: '16px 24px', textAlign: 'left', fontSize: '0.8rem', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 600 }}>Requested By</th>
                  <th style={{ padding: '16px 24px', textAlign: 'left', fontSize: '0.8rem', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 600 }}>Status</th>
                  <th style={{ padding: '16px 24px', textAlign: 'right', fontSize: '0.8rem', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 600 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {displayedRequests.length > 0 ? (
                  displayedRequests.map((req) => {
                    const amount = Number(req.amount) || getBreakdownTotal(req.breakdown, req.type === 'Payroll');
                    const isPending = (!req.status || req.status === 'Pending') && !req.archivedAt;
                    return (
                      <tr key={req.id} style={{ borderBottom: '1px solid var(--border)', transition: 'background-color 0.2s', opacity: req.archivedAt ? 0.7 : 1 }} className="hover-row">
                        <td data-label="Request" style={{ padding: '16px 24px' }}>
                          <p style={{ margin: 0, fontWeight: 500, color: 'var(--text-primary)' }}>{req.event || '—'}</p>
                          <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{req.category || '—'}</p>
                        </td>
                        <td data-label="Type" style={{ padding: '16px 24px', color: 'var(--text-primary)' }}>{req.type || 'Project'}</td>
                        <td data-label="Requested Amount" style={{ padding: '16px 24px', color: 'var(--text-primary)' }}>
                          <p style={{ margin: 0, fontWeight: 500 }}>{currency.format(amount)}</p>
                        </td>
                        <td data-label="Date" style={{ padding: '16px 24px', color: 'var(--text-primary)' }}>
                          {new Date(req.submittedAt || req.eventDate || Date.now()).toLocaleDateString()}
                        </td>
                        <td data-label="Requested By" style={{ padding: '16px 24px', color: 'var(--text-primary)' }}>
                           {req.requestedBy || 'SK Treasurer'}
                        </td>
                        <td data-label="Status" style={{ padding: '16px 24px' }}>
                          <span className={`status-pill ${req.archivedAt ? 'status-cancelled' : `status-${(req.status || 'pending').toLowerCase()}`}`} style={{ margin: 0 }}>
                            {req.archivedAt ? 'Archived' : (req.status || 'Pending')}
                          </span>
                        </td>
                        <td data-label="Actions" style={{ padding: '16px 24px', textAlign: 'right' }}>
                          <div className="field-row" style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                            <button className="secondary-button" style={{ padding: '6px 12px' }} onClick={() => setViewDetailsReq(req)}>
                              <Eye size={14} /> View
                            </button>
                            {isPending && (
                              <>
                                <button className="primary-button" style={{ padding: '6px 12px' }} disabled={approvingId === req.id} onClick={() => setApproveConfirmId(req.id)}>
                                  {approvingId === req.id ? 'Approving...' : 'Approve'}
                                </button>
                                <button className="secondary-button" style={{ padding: '6px 12px', color: '#e53e3e', borderColor: '#e53e3e' }} onClick={() => setRejectingId(req.id)}>
                                  Reject
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })
                ) : (
                  <tr>
                    <td colSpan="7" style={{ padding: '48px 24px', textAlign: 'center' }}>
                      <p style={{ color: 'var(--text-secondary)', fontSize: '1rem', margin: 0, fontWeight: 500 }}>No requests found</p>
                      <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', margin: '4px 0 0' }}>There are no budget requests available for the selected filters.</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Details Modal */}
      {activeViewDetailsReq && (
        <div className="modal-overlay" onClick={() => setViewDetailsReq(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '800px', width: '95%', maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="modal-header" style={{ marginBottom: '24px' }}>
              <h2 style={{ fontSize: '1.25rem', margin: 0, color: 'var(--text-primary)' }}>Request Details</h2>
              <button className="icon-button" onClick={() => setViewDetailsReq(null)}><X size={20} /></button>
            </div>
            
            <div className="modal-body">
              {/* Request Information Grid */}
              <div style={{ backgroundColor: 'var(--background-color, #ffffff)', padding: '24px', borderRadius: '12px', border: '1px solid var(--border)', marginBottom: '24px' }}>
                <h3 style={{ fontSize: '1rem', marginBottom: '16px', color: 'var(--text-primary)' }}>Request Information</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <p style={{ margin: 0, fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: '0.5px', fontWeight: 600 }}>Request Title</p>
                    <p style={{ margin: 0, fontSize: '1rem', color: 'var(--text-primary)' }}>{activeViewDetailsReq.event || '—'}</p>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <p style={{ margin: 0, fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: '0.5px', fontWeight: 600 }}>Request Type</p>
                    <p style={{ margin: 0, fontSize: '1rem', color: 'var(--text-primary)' }}>{activeViewDetailsReq.type || 'Project'}</p>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <p style={{ margin: 0, fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: '0.5px', fontWeight: 600 }}>Category</p>
                    <p style={{ margin: 0, fontSize: '1rem', color: 'var(--text-primary)' }}>{activeViewDetailsReq.category || '—'}</p>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <p style={{ margin: 0, fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: '0.5px', fontWeight: 600 }}>Status</p>
                    <div>
                      <span className={`status-pill ${activeViewDetailsReq.archivedAt ? 'status-cancelled' : `status-${(activeViewDetailsReq.status || 'pending').toLowerCase()}`}`} style={{ margin: 0 }}>
                        {activeViewDetailsReq.archivedAt ? 'Archived' : (activeViewDetailsReq.status || 'Pending')}
                      </span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <p style={{ margin: 0, fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: '0.5px', fontWeight: 600 }}>Request Date</p>
                    <p style={{ margin: 0, fontSize: '1rem', color: 'var(--text-primary)' }}>{new Date(activeViewDetailsReq.submittedAt || activeViewDetailsReq.eventDate || Date.now()).toLocaleDateString()}</p>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <p style={{ margin: 0, fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: '0.5px', fontWeight: 600 }}>Requested By</p>
                    <p style={{ margin: 0, fontSize: '1rem', color: 'var(--text-primary)' }}>{activeViewDetailsReq.requestedBy || 'SK Treasurer'}</p>
                  </div>
                </div>
                
                {activeViewDetailsReq.description && (
                  <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <p style={{ margin: 0, fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: '0.5px', fontWeight: 600 }}>Description</p>
                    <p style={{ margin: 0, fontSize: '1rem', color: 'var(--text-primary)' }}>{activeViewDetailsReq.description}</p>
                  </div>
                )}
                
                {activeViewDetailsReq.status === 'Rejected' && activeViewDetailsReq.rejectionReason && (
                   <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '6px', padding: '16px', backgroundColor: '#fff5f5', borderRadius: '8px', border: '1px solid #fed7d7' }}>
                    <p style={{ margin: 0, fontSize: '0.75rem', textTransform: 'uppercase', color: '#c53030', letterSpacing: '0.5px', fontWeight: 600 }}>Rejection Reason</p>
                    <p style={{ margin: 0, fontSize: '1rem', color: '#c53030' }}>{activeViewDetailsReq.rejectionReason}</p>
                  </div>
                )}
                
                {activeViewDetailsReq.status === 'Cancelled' && activeViewDetailsReq.cancellationReason && (
                   <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '6px', padding: '16px', backgroundColor: '#fff5f5', borderRadius: '8px', border: '1px solid #fed7d7' }}>
                    <p style={{ margin: 0, fontSize: '0.75rem', textTransform: 'uppercase', color: '#c53030', letterSpacing: '0.5px', fontWeight: 600 }}>Cancellation Reason</p>
                    <p style={{ margin: 0, fontSize: '1rem', color: '#c53030' }}>{activeViewDetailsReq.cancellationReason}</p>
                  </div>
                )}
              </div>

              {/* Financial Details Grid */}
              <div style={{ backgroundColor: 'var(--background-color, #ffffff)', padding: '24px', borderRadius: '12px', border: '1px solid var(--border)', marginBottom: '24px' }}>
                <h3 style={{ fontSize: '1rem', marginBottom: '16px', color: 'var(--text-primary)' }}>Financial Details</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <p style={{ margin: 0, fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: '0.5px', fontWeight: 600 }}>Requested Budget</p>
                    <p style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-primary)', fontWeight: 600 }}>
                      {currency.format(Number(activeViewDetailsReq.amount) || getBreakdownTotal(activeViewDetailsReq.breakdown, activeViewDetailsReq.type === 'Payroll'))}
                    </p>
                  </div>
                  {activeViewDetailsReq.status === 'Approved' && (
                    <>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <p style={{ margin: 0, fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: '0.5px', fontWeight: 600 }}>Approved Budget</p>
                        <p style={{ margin: 0, fontSize: '1.1rem', color: 'var(--accent)', fontWeight: 600 }}>{currency.format(activeViewDetailsReq.approvedAmount || activeViewDetailsReq.amount)}</p>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <p style={{ margin: 0, fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: '0.5px', fontWeight: 600 }}>Date Approved</p>
                        <p style={{ margin: 0, fontSize: '1rem', color: 'var(--text-primary)' }}>{activeViewDetailsReq.approvedAt ? new Date(activeViewDetailsReq.approvedAt).toLocaleDateString() : '—'}</p>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Budget Breakdown Table */}
              <div style={{ backgroundColor: 'var(--background-color, #ffffff)', padding: '24px', borderRadius: '12px', border: '1px solid var(--border)', overflowX: 'auto' }}>
                 <h3 style={{ fontSize: '1rem', marginBottom: '16px', color: 'var(--text-primary)' }}>Budget Breakdown</h3>
                 <BudgetBreakdownTable 
                    request={activeViewDetailsReq} 
                    breakdownItems={Array.isArray(activeViewDetailsReq.breakdown) ? activeViewDetailsReq.breakdown : []} 
                    currency={currency} 
                 />
              </div>
            </div>
            
            <div className="modal-footer" style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', justifyContent: 'flex-end', marginTop: '24px' }}>
              <button type="button" className="secondary-button" onClick={() => setViewDetailsReq(null)}>
                Close
              </button>
              
              {(!activeViewDetailsReq.status || activeViewDetailsReq.status === 'Pending') && !activeViewDetailsReq.archivedAt && (
                <>
                  <button type="button" className="secondary-button" style={{ color: '#e53e3e', borderColor: '#e53e3e' }} onClick={() => setRejectingId(activeViewDetailsReq.id)}>
                    <X size={16} /> Reject
                  </button>
                  <button type="button" className="primary-button" onClick={() => setApproveConfirmId(activeViewDetailsReq.id)}>
                    <Check size={16} /> Approve
                  </button>
                </>
              )}
              
              {activeViewDetailsReq.status === 'Approved' && !activeViewDetailsReq.archivedAt && (
                 <button type="button" className="secondary-button" style={{ color: '#e53e3e', borderColor: '#e53e3e' }} onClick={() => setCancellingId(activeViewDetailsReq.id)}>
                    Cancel Approval
                 </button>
              )}
              
              {activeViewDetailsReq.status === 'Rejected' && !activeViewDetailsReq.archivedAt && (
                 <button type="button" className="secondary-button" onClick={() => {
                   if (window.confirm("Are you sure you want to undo the rejection? This will move the request back to Pending.")) {
                     undoRejectRequest(activeViewDetailsReq.id);
                     setViewDetailsReq(null);
                   }
                 }}>
                    <RotateCcw size={16} /> Undo Reject
                 </button>
              )}

              {/* Archive / Restore actions */}
              {!activeViewDetailsReq.archivedAt ? (
                 <button type="button" className="secondary-button" onClick={() => {
                   if (window.confirm("Are you sure you want to archive this request?")) {
                     archiveRequest(activeViewDetailsReq.id);
                     setViewDetailsReq(null);
                   }
                 }}>
                    <Archive size={16} /> Archive
                 </button>
              ) : (
                 <button type="button" className="secondary-button" onClick={() => {
                   restoreRequest(activeViewDetailsReq.id);
                   setViewDetailsReq(null);
                 }}>
                    <RotateCcw size={16} /> Restore
                 </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modals */}
      
      {/* Approve Confirm Modal */}
      {approveConfirmId && (
        <div className="modal-overlay" onClick={() => setApproveConfirmId(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '440px', padding: '24px' }}>
            <div className="modal-header" style={{ marginBottom: '16px' }}>
              <h2 style={{ fontSize: '1.25rem', margin: 0, color: 'var(--text-primary)' }}>Approve Request</h2>
            </div>
            <div className="modal-body" style={{ marginBottom: '24px' }}>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', margin: 0, lineHeight: '1.5' }}>
                Are you sure you want to approve this budget request?
              </p>
            </div>
            <div className="modal-footer" style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button type="button" className="secondary-button" onClick={() => setApproveConfirmId(null)}>
                Cancel
              </button>
              <button type="button" className="primary-button" onClick={handleApproveConfirm}>
                Approve
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {rejectingId && (
        <div className="modal-overlay" onClick={() => setRejectingId(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '440px', padding: '24px' }}>
            <div className="modal-header" style={{ marginBottom: '16px' }}>
              <h2 style={{ fontSize: '1.25rem', margin: 0, color: 'var(--text-primary)' }}>Reject Request</h2>
              <button className="icon-button" onClick={() => setRejectingId(null)}><X size={20} /></button>
            </div>
            <div className="modal-body" style={{ marginBottom: '24px' }}>
               <label className="field">
                <span style={{ fontSize: '0.9rem', fontWeight: 500, color: 'var(--text-primary)', display: 'block', marginBottom: '8px' }}>Rejection Reason</span>
                <textarea
                  rows="3"
                  value={rejectNote}
                  onChange={(e) => setRejectNote(e.target.value)}
                  placeholder="Explain why this request was rejected"
                  style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '0.95rem', fontFamily: 'inherit' }}
                />
              </label>
            </div>
            <div className="modal-footer" style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button type="button" className="secondary-button" onClick={() => setRejectingId(null)}>
                Cancel
              </button>
              <button type="button" className="primary-button" style={{ backgroundColor: '#e53e3e', color: 'white', borderColor: '#e53e3e' }} onClick={handleRejectSubmit}>
                Confirm Reject
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Approval Modal */}
      {cancellingId && (
        <div className="modal-overlay" onClick={() => setCancellingId(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '440px', padding: '24px' }}>
            <div className="modal-header" style={{ marginBottom: '16px' }}>
              <h2 style={{ fontSize: '1.25rem', margin: 0, color: 'var(--text-primary)' }}>Cancel Approval</h2>
              <button className="icon-button" onClick={() => setCancellingId(null)}><X size={20} /></button>
            </div>
            <div className="modal-body" style={{ marginBottom: '24px' }}>
               <label className="field">
                <span style={{ fontSize: '0.9rem', fontWeight: 500, color: 'var(--text-primary)', display: 'block', marginBottom: '8px' }}>Cancellation Reason</span>
                <textarea
                  rows="3"
                  value={cancelNote}
                  onChange={(e) => setCancelNote(e.target.value)}
                  placeholder="Explain why this approval is being cancelled"
                  style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '0.95rem', fontFamily: 'inherit' }}
                />
              </label>
            </div>
            <div className="modal-footer" style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button type="button" className="secondary-button" onClick={() => setCancellingId(null)}>
                Keep Approval
              </button>
              <button type="button" className="primary-button" style={{ backgroundColor: '#e53e3e', color: 'white', borderColor: '#e53e3e' }} onClick={handleCancelSubmit}>
                Confirm Cancel
              </button>
            </div>
          </div>
        </div>
      )}

    </RoleGate>
  )
}

export default ApprovalsPage
