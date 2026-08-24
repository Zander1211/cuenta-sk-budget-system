import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileText, Plus, X, Eye, Download, Archive, RotateCcw, Search, Filter, Receipt } from 'lucide-react'
import RoleGate from '../components/RoleGate'
import DocumentGenerator from '../components/DocumentGenerator'
import { useAuth } from '../context/AuthContext'
import { useDocuments } from '../context/DocumentContext'
import PurchaseRequestPreview from '../components/PurchaseRequestPreview'
import DisbursementVoucherPreview from '../components/documents/DisbursementVoucherPreview'
import PayrollPreview from '../components/documents/PayrollPreview'
import ProjectDesignPreview from '../components/documents/ProjectDesignPreview'
import ItineraryOfTravelPreview from '../components/documents/ItineraryOfTravelPreview'
import TransmittalLetterPreview from '../components/documents/TransmittalLetterPreview'
import AnnualReportPreview from '../components/documents/AnnualReportPreview'
import NarrativeReportPreview from '../components/documents/NarrativeReportPreview'
import PaginationControls from '../components/PaginationControls'
import { useBudget } from '../context/BudgetContext'
import { supabase } from '../supabase/supabaseClient'

const DOCUMENTS_PAGE_SIZE = 10

function DocumentsPage() {
  const navigate = useNavigate()
  const { role } = useAuth()
  const { expenses } = useBudget()
  const {
    documents,
    isLoadingDocuments,
    documentsError,
    totalCount,
    documentStats,
    documentTypes,
    refreshDocuments,
    refreshDocumentStats,
    archiveDocument,
    restoreDocument,
  } = useDocuments()
  
  const canCreate = ['SK Chairman', 'SK Treasurer'].includes(role)
  
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [activeGeneratorType, setActiveGeneratorType] = useState(null)
  
  const [viewDetailsDoc, setViewDetailsDoc] = useState(null)
  const [viewingDoc, setViewingDoc] = useState(null)
  const [activeTab, setActiveTab] = useState('active')
  const [archiveModal, setArchiveModal] = useState({ open: false, docId: null })
  const [receiptDocuments, setReceiptDocuments] = useState([])

  // Filters
  const [searchTerm, setSearchTerm] = useState('')
  const [typeFilter, setTypeFilter] = useState('All')
  const [currentPage, setCurrentPage] = useState(1)

  const totalPages = Math.max(1, Math.ceil(totalCount / DOCUMENTS_PAGE_SIZE))
  const safeCurrentPage = Math.min(currentPage, totalPages)
  const hasActiveFilters = Boolean(searchTerm.trim() || typeFilter !== 'All')

  useEffect(() => {
    refreshDocuments({
      page: currentPage,
      pageSize: DOCUMENTS_PAGE_SIZE,
      search: searchTerm,
      type: typeFilter,
      archived: activeTab === 'archive',
    })
  }, [activeTab, currentPage, refreshDocuments, searchTerm, typeFilter])

  useEffect(() => {
    refreshDocumentStats()
  }, [refreshDocumentStats])

  useEffect(() => {
    const handleDocumentCreated = () => {
      setActiveTab('active')
      setSearchTerm('')
      setTypeFilter('All')
      setCurrentPage(1)
    }

    window.addEventListener('cuenta:document-created', handleDocumentCreated)
    return () => window.removeEventListener('cuenta:document-created', handleDocumentCreated)
  }, [])

  useEffect(() => {
    let mounted = true
    const recordIds = expenses.map(expense => String(expense.id))
    if (!recordIds.length) return undefined

    const parents = new Map()
    expenses.filter(expense => !expense.isAdditional).forEach(parent => {
      parents.set(String(parent.id), parent)
      if (parent.requestId) parents.set(String(parent.requestId), parent)
    })
    const requisitions = new Map()
    expenses.filter(expense => expense.isAdditional).forEach(requisition => {
      requisitions.set(String(requisition.id), requisition)
    })

    ;(async () => {
      let { data, error } = await supabase
        .from('receipt_records')
        .select('id, record_id, requisition_id, file_path, file_name, uploaded_at')
        .in('record_id', recordIds)
        .order('uploaded_at', { ascending: false })
        .limit(50)

      if (error) {
        const legacy = await supabase
          .from('receipt_records')
          .select('id, record_id, file_path, file_name, uploaded_at')
          .in('record_id', recordIds)
          .order('uploaded_at', { ascending: false })
          .limit(50)
        data = legacy.data
        error = legacy.error
      }
      if (error || !mounted) return

      const rows = await Promise.all((data || []).map(async receipt => {
        const legacyRequisition = requisitions.get(String(receipt.record_id))
        const requisition = requisitions.get(String(receipt.requisition_id)) || legacyRequisition
        const parent = parents.get(String(receipt.record_id))
          || parents.get(String(requisition?.parentProjectId))
        const { data: signed } = await supabase.storage
          .from('receipts')
          .createSignedUrl(receipt.file_path, 60 * 60)
        return {
          ...receipt,
          url: signed?.signedUrl || null,
          parentTitle: parent?.event || parent?.project || 'Approved record',
          parentType: parent?.type || 'Record',
          requisitionTitle: requisition?.description || requisition?.category || null,
        }
      }))
      if (mounted) setReceiptDocuments(rows)
    })()

    return () => { mounted = false }
  }, [expenses])

  function handleCreateSelect(type) {
    if (type === 'annual-report') {
      navigate('/dashboard/annual-report')
    } else if (type === 'narrative-report') {
      navigate('/dashboard/narrative-report')
    } else {
      setActiveGeneratorType(type)
    }
    setIsCreateModalOpen(false)
  }

  function renderViewingDoc() {
    if (!viewingDoc) return null
    const storedData = viewingDoc.data || {}
    const legacyTypeByLabel = {
      'Annual Report': 'annual',
      'Narrative Report': 'narrative',
      'Photo Documentation': 'narrative',
      'Narrative Report & Photo Documentation': 'narrative',
    }
    const type = storedData.type || legacyTypeByLabel[viewingDoc.type]
    const data = storedData.data || storedData
    const onClose = () => setViewingDoc(null)

    switch (type) {
      case 'pr': return <PurchaseRequestPreview data={data} onClose={onClose} />
      case 'dv': return <DisbursementVoucherPreview data={data} onClose={onClose} />
      case 'payroll': return <PayrollPreview data={data} onClose={onClose} />
      case 'project': return <ProjectDesignPreview data={data} onClose={onClose} />
      case 'itinerary': return <ItineraryOfTravelPreview data={data} onClose={onClose} />
      case 'transmittal': return <TransmittalLetterPreview data={data} onClose={onClose} />
      case 'annual': return <AnnualReportPreview data={data} onClose={onClose} />
      case 'narrative': return <NarrativeReportPreview data={data} onClose={onClose} />
      default: return null
    }
  }

  return (
    <RoleGate allow={['SK Chairman', 'SK Treasurer', 'SK Kagawad', 'Barangay Treasurer']}>
      <header className="dashboard-header">
        <div className="header-left">
          <div>
            <p className="eyebrow">Compliance</p>
            <h1>Documents</h1>
            <p>Generate, view, manage, and print official COA-mandated forms.</p>
          </div>
        </div>
        <div className="header-actions">
          {canCreate && !activeGeneratorType && (
            <button
              type="button"
              className="primary-button"
              onClick={() => setIsCreateModalOpen(true)}
            >
              <Plus size={16} />
              Create Document
            </button>
          )}
          {activeGeneratorType && (
            <button
              type="button"
              className="secondary-button"
              onClick={() => setActiveGeneratorType(null)}
            >
              Back to Documents
            </button>
          )}
        </div>
      </header>

      <section className="dashboard-content">
        {activeGeneratorType ? (
          <div className="overview-card" style={{ backgroundColor: 'var(--surface)', padding: '24px', borderRadius: 'var(--radius-surface)' }}>
            <DocumentGenerator initialDocType={activeGeneratorType} />
          </div>
        ) : (
          <>
            {/* Document Summary Cards */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '16px',
              marginBottom: '24px'
            }}>
              <div style={{ backgroundColor: 'var(--surface)', padding: '20px', borderRadius: 'var(--radius-surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)' }}>
                <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total Documents</p>
                <h3 style={{ margin: '8px 0 0', fontSize: '1.75rem', color: 'var(--text-primary)' }}>{documentStats.total}</h3>
              </div>
              <div style={{ backgroundColor: 'var(--surface)', padding: '20px', borderRadius: 'var(--radius-surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)' }}>
                <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Generated Documents</p>
                <h3 style={{ margin: '8px 0 0', fontSize: '1.75rem', color: 'var(--text-primary)' }}>{documentStats.active}</h3>
              </div>
              <div style={{ backgroundColor: 'var(--surface)', padding: '20px', borderRadius: 'var(--radius-surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)' }}>
                <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Uploaded Documents</p>
                <h3 style={{ margin: '8px 0 0', fontSize: '1.75rem', color: 'var(--text-primary)' }}>{documentStats.uploaded}</h3>
              </div>
              <div style={{ backgroundColor: 'var(--surface)', padding: '20px', borderRadius: 'var(--radius-surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)' }}>
                <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Archived Documents</p>
                <h3 style={{ margin: '8px 0 0', fontSize: '1.75rem', color: 'var(--text-primary)' }}>{documentStats.archived}</h3>
              </div>
            </div>

            <div className="overview-card" style={{ backgroundColor: 'var(--surface)', borderRadius: 'var(--radius-surface)', overflow: 'hidden', border: '1px solid var(--border)' }}>
              
              {/* Header & Tabs */}
              <div style={{ padding: '24px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', marginBottom: '20px' }}>
                  <div>
                    <h2 style={{ margin: '0 0 8px', fontSize: '1.25rem', color: 'var(--text-primary)' }}>
                      {activeTab === 'active' ? 'Active Documents' : 'Archived Documents'}
                    </h2>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: 0 }}>
                      {activeTab === 'active' ? 'Manage and preview active system-generated documents.' : 'View and restore archived documents.'}
                    </p>
                  </div>
                  <div className="page-tabs" role="tablist">
                    <button
                      className={`page-tab ${activeTab === 'active' ? 'is-active' : ''}`}
                      onClick={() => { setActiveTab('active'); setSearchTerm(''); setTypeFilter('All'); setCurrentPage(1); }}
                    >
                      Active
                    </button>
                    <button
                      className={`page-tab ${activeTab === 'archive' ? 'is-active' : ''}`}
                      onClick={() => { setActiveTab('archive'); setSearchTerm(''); setTypeFilter('All'); setCurrentPage(1); }}
                    >
                      Archived
                    </button>
                  </div>
                </div>

                {/* Filter Toolbar */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
                  <div className="search-input-container" style={{ flex: '1 1 300px', position: 'relative' }}>
                    <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                    <input
                      type="text"
                      placeholder="Search documents by name or project..."
                      value={searchTerm}
                      onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                      style={{
                        width: '100%', padding: '10px 12px 10px 40px', borderRadius: 'var(--radius-control)',
                        border: '1px solid var(--border)', fontSize: '0.95rem'
                      }}
                    />
                  </div>
                  <div style={{ flex: '1 1 200px', position: 'relative' }}>
                    <Filter size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                    <select
                      value={typeFilter}
                      onChange={(e) => { setTypeFilter(e.target.value); setCurrentPage(1); }}
                      style={{
                        width: '100%', padding: '10px 12px 10px 40px', borderRadius: 'var(--radius-control)',
                        border: '1px solid var(--border)', fontSize: '0.95rem', backgroundColor: 'var(--surface)'
                      }}
                    >
                      {['All', ...documentTypes].map(type => (
                        <option key={type} value={type}>{type === 'All' ? 'All Types' : type}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Desktop and Mobile Table (handled by data-table CSS) */}
              <div style={{ width: '100%', overflowX: 'auto' }}>
                <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ backgroundColor: 'var(--table-header-bg, #f8fafc)', borderBottom: '1px solid var(--border)' }}>
                      <th style={{ padding: '16px 24px', textAlign: 'left', fontSize: '0.8rem', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 600 }}>Document Name</th>
                      <th style={{ padding: '16px 24px', textAlign: 'left', fontSize: '0.8rem', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 600 }}>Project/Event</th>
                      <th style={{ padding: '16px 24px', textAlign: 'left', fontSize: '0.8rem', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 600 }}>Date Created</th>
                      <th style={{ padding: '16px 24px', textAlign: 'left', fontSize: '0.8rem', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 600 }}>Status</th>
                      <th style={{ padding: '16px 24px', textAlign: 'right', fontSize: '0.8rem', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 600 }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {isLoadingDocuments ? (
                      <tr>
                        <td colSpan="5" style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                          Loading documents...
                        </td>
                      </tr>
                    ) : documentsError ? (
                      <tr>
                        <td colSpan="5" style={{ padding: '48px 24px', textAlign: 'center' }}>
                          <p role="alert" style={{ color: 'var(--negative)', fontSize: '0.95rem', margin: '0 0 16px' }}>
                            {documentsError}
                          </p>
                          <button type="button" className="secondary-button" onClick={() => refreshDocuments()}>
                            Try again
                          </button>
                        </td>
                      </tr>
                    ) : documents.length > 0 ? (
                      documents.map((doc) => (
                        <tr key={doc.id} style={{ borderBottom: '1px solid var(--border)', transition: 'background-color 0.2s', opacity: doc.archivedAt ? 0.7 : 1 }} className="hover-row">
                          <td data-label="Document Name" style={{ padding: '16px 24px' }}>
                            <p style={{ margin: 0, fontWeight: 500, color: 'var(--text-primary)' }}>{doc.name}</p>
                            <p style={{ margin: '2px 0 0', fontSize: '0.82rem', color: 'var(--text-muted)' }}>{doc.type}</p>
                          </td>
                          <td data-label="Project/Event" style={{ padding: '16px 24px', color: 'var(--text-primary)' }}>{doc.project || '—'}</td>
                          <td data-label="Date Created" style={{ padding: '16px 24px', color: 'var(--text-primary)' }}>
                            <p style={{ margin: 0 }}>{new Date(doc.dateGenerated).toLocaleDateString()}</p>
                            <p style={{ margin: '2px 0 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>{new Date(doc.dateGenerated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                          </td>
                          <td data-label="Status" style={{ padding: '16px 24px' }}>
                            <span className={`status-pill ${doc.archivedAt ? 'status-rejected' : 'status-completed'}`} style={{ margin: 0 }}>
                              {doc.archivedAt ? 'Archived' : 'Generated'}
                            </span>
                          </td>
                          <td data-label="Actions" style={{ padding: '16px 24px', textAlign: 'right' }}>
                            <div className="field-row" style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                              <button className="secondary-button" style={{ padding: '6px 12px' }} onClick={() => setViewDetailsDoc(doc)}>
                                <Eye size={14} /> View
                              </button>
                              <button className="secondary-button" style={{ padding: '6px 12px' }} onClick={() => {
                                setViewingDoc(doc)
                                setTimeout(() => window.print(), 500)
                              }}>
                                <Download size={14} /> Print
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="5" style={{ padding: '48px 24px', textAlign: 'center' }}>
                          <p style={{ color: 'var(--text-secondary)', fontSize: '1rem', margin: 0 }}>
                            No documents found for the selected filters.
                          </p>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              {!isLoadingDocuments && !documentsError ? (
                <PaginationControls
                  currentPage={safeCurrentPage}
                  totalPages={totalPages}
                  totalItems={totalCount}
                  pageSize={DOCUMENTS_PAGE_SIZE}
                  onPageChange={setCurrentPage}
                  isFiltered={hasActiveFilters}
                  idPrefix="documents"
                />
              ) : null}
            </div>

            {activeTab === 'active' ? (
              <section className="overview-card" style={{ marginTop: '24px', overflow: 'hidden' }}>
                <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)' }}>
                  <p className="eyebrow">Supporting documents</p>
                  <h2 style={{ margin: '4px 0 6px' }}>Receipt attachments</h2>
                  <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
                    Original and requisition receipts remain grouped under their approved Project, Event, or Payroll.
                  </p>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Approved record</th>
                        <th>Receipt</th>
                        <th>Scope</th>
                        <th>Date uploaded</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {receiptDocuments.length ? receiptDocuments.map(receipt => (
                        <tr key={receipt.id}>
                          <td data-label="Approved record">
                            <strong>{receipt.parentTitle}</strong><br />
                            <span style={{ color: 'var(--text-secondary)', fontSize: '.82rem' }}>{receipt.parentType}</span>
                          </td>
                          <td data-label="Receipt">{receipt.file_name || 'Receipt attachment'}</td>
                          <td data-label="Scope">{receipt.requisitionTitle ? `Requisition: ${receipt.requisitionTitle}` : 'Original budget receipt'}</td>
                          <td data-label="Date uploaded">{receipt.uploaded_at ? new Date(receipt.uploaded_at).toLocaleDateString() : '—'}</td>
                          <td data-label="Action">
                            {receipt.url ? (
                              <a className="secondary-button" href={receipt.url} target="_blank" rel="noreferrer">
                                <Receipt size={15} /> View receipt
                              </a>
                            ) : 'Unavailable'}
                          </td>
                        </tr>
                      )) : (
                        <tr><td colSpan="5" className="empty-state">No receipt attachments found.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            ) : null}
          </>
        )}
      </section>

      {/* Create Document Modal */}
      {isCreateModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '400px' }}>
            <div className="modal-header">
              <h2>Select Document Type</h2>
              <button className="icon-button" onClick={() => setIsCreateModalOpen(false)}>
                <X size={20} />
              </button>
            </div>
            <div className="modal-body" style={{ margin: '16px 0', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <button className="secondary-button" style={{ justifyContent: 'flex-start', padding: '12px' }} onClick={() => handleCreateSelect('pr')}><FileText size={18} style={{ color: 'var(--text-muted)' }}/> Purchase Request</button>
              <button className="secondary-button" style={{ justifyContent: 'flex-start', padding: '12px' }} onClick={() => handleCreateSelect('dv')}><FileText size={18} style={{ color: 'var(--text-muted)' }}/> Disbursement Voucher</button>
              <button className="secondary-button" style={{ justifyContent: 'flex-start', padding: '12px' }} onClick={() => handleCreateSelect('payroll')}><FileText size={18} style={{ color: 'var(--text-muted)' }}/> Payroll</button>
              <button className="secondary-button" style={{ justifyContent: 'flex-start', padding: '12px' }} onClick={() => handleCreateSelect('project')}><FileText size={18} style={{ color: 'var(--text-muted)' }}/> Project Design</button>
              <button className="secondary-button" style={{ justifyContent: 'flex-start', padding: '12px' }} onClick={() => handleCreateSelect('itinerary')}><FileText size={18} style={{ color: 'var(--text-muted)' }}/> Itinerary of Travel</button>
              <button className="secondary-button" style={{ justifyContent: 'flex-start', padding: '12px' }} onClick={() => handleCreateSelect('transmittal')}><FileText size={18} style={{ color: 'var(--text-muted)' }}/> Transmittal Letter</button>
              <hr style={{ margin: '8px 0', borderColor: 'var(--border)' }} />
              <button className="secondary-button" style={{ justifyContent: 'flex-start', padding: '12px' }} onClick={() => handleCreateSelect('annual-report')}><FileText size={18} style={{ color: 'var(--text-muted)' }}/> Annual Report</button>
              <button className="secondary-button" style={{ justifyContent: 'flex-start', padding: '12px' }} onClick={() => handleCreateSelect('narrative-report')}><FileText size={18} style={{ color: 'var(--text-muted)' }}/> Narrative & Photo Doc</button>
            </div>
          </div>
        </div>
      )}

      {/* Document Details Modal */}
      {viewDetailsDoc && (
        <div className="modal-overlay" onClick={() => setViewDetailsDoc(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '600px', width: '100%', padding: '24px' }}>
            <div className="modal-header" style={{ marginBottom: '24px' }}>
              <h2 style={{ fontSize: '1.25rem', margin: 0, color: 'var(--text-primary)' }}>Document Details</h2>
              <button className="icon-button" onClick={() => setViewDetailsDoc(null)}>
                <X size={20} />
              </button>
            </div>
            <div className="modal-body">
              <div style={{ backgroundColor: 'var(--background-color, #ffffff)', padding: '24px', borderRadius: 'var(--radius-surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <p style={{ margin: 0, fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: '0.5px' }}>Document Name</p>
                    <p style={{ margin: 0, fontSize: '1rem', color: 'var(--text-primary)', fontWeight: '500' }}>{viewDetailsDoc.name}</p>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <p style={{ margin: 0, fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: '0.5px' }}>Status</p>
                    <div>
                      <span className={`status-pill ${viewDetailsDoc.archivedAt ? 'status-rejected' : 'status-completed'}`} style={{ margin: 0 }}>
                        {viewDetailsDoc.archivedAt ? 'Archived' : 'Generated'}
                      </span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <p style={{ margin: 0, fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: '0.5px' }}>Related Project/Event</p>
                    <p style={{ margin: 0, fontSize: '1rem', color: 'var(--text-primary)', fontWeight: '400' }}>{viewDetailsDoc.project || '—'}</p>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <p style={{ margin: 0, fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: '0.5px' }}>Date Created</p>
                    <p style={{ margin: 0, fontSize: '1rem', color: 'var(--text-primary)', fontWeight: '400' }}>{new Date(viewDetailsDoc.dateGenerated).toLocaleString()}</p>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <p style={{ margin: 0, fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: '0.5px' }}>Created By</p>
                    <p style={{ margin: 0, fontSize: '1rem', color: 'var(--text-primary)', fontWeight: '400' }}>{viewDetailsDoc.generatedBy}</p>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <p style={{ margin: 0, fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: '0.5px' }}>Document Type</p>
                    <p style={{ margin: 0, fontSize: '1rem', color: 'var(--text-primary)', fontWeight: '400' }}>{viewDetailsDoc.type}</p>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <p style={{ margin: 0, fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: '0.5px' }}>File Name</p>
                    <p style={{ margin: 0, fontSize: '1rem', color: 'var(--text-primary)', fontWeight: '400', overflowWrap: 'anywhere' }}>{viewDetailsDoc.fileName || 'Not stored as a file'}</p>
                  </div>
                </div>
              </div>
            </div>
            <div className="modal-footer" style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', justifyContent: 'flex-end', marginTop: '24px' }}>
              <button type="button" className="secondary-button" style={{ flex: '1 1 auto', maxWidth: '200px', justifyContent: 'center' }} onClick={() => setViewDetailsDoc(null)}>
                Close
              </button>
              {canCreate && (
                !viewDetailsDoc.archivedAt ? (
                  <button type="button" className="secondary-button" style={{ flex: '1 1 auto', maxWidth: '200px', justifyContent: 'center', color: 'var(--negative)' }} onClick={() => {
                    setArchiveModal({ open: true, docId: viewDetailsDoc.id })
                    setViewDetailsDoc(null)
                  }}>
                    <Archive size={16} /> Archive
                  </button>
                ) : (
                  <button type="button" className="secondary-button" style={{ flex: '1 1 auto', maxWidth: '200px', justifyContent: 'center', color: 'var(--accent)' }} onClick={() => {
                    restoreDocument(viewDetailsDoc.id)
                    setCurrentPage(1)
                    setViewDetailsDoc(null)
                  }}>
                    <RotateCcw size={16} /> Restore
                  </button>
                )
              )}
              <button type="button" className="primary-button" style={{ flex: '1 1 auto', maxWidth: '200px', justifyContent: 'center' }} onClick={() => {
                setViewingDoc(viewDetailsDoc)
                setViewDetailsDoc(null)
              }}>
                <Eye size={16} /> Preview Document
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Viewing Document Preview Fullscreen */}
      {renderViewingDoc()}

      {/* Archive Confirmation Modal */}
      {archiveModal.open && archiveModal.docId && (
        <div className="modal-overlay" onClick={() => setArchiveModal({ open: false, docId: null })}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '440px', padding: '24px' }}>
            <div className="modal-header" style={{ marginBottom: '16px' }}>
              <h2 style={{ fontSize: '1.25rem', margin: 0, color: 'var(--text-primary)' }}>Archive Document</h2>
            </div>
            <div className="modal-body" style={{ marginBottom: '24px' }}>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', margin: 0, lineHeight: '1.5' }}>
                Are you sure you want to archive this document? It will be moved to the Archived Documents section.
              </p>
            </div>
            <div className="modal-footer" style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button type="button" className="secondary-button" onClick={() => setArchiveModal({ open: false, docId: null })}>
                Cancel
              </button>
              <button
                type="button"
                className="primary-button"
                style={{ backgroundColor: 'var(--negative)', color: 'white', borderColor: 'var(--negative)' }}
                onClick={() => {
                  archiveDocument(archiveModal.docId)
                  setCurrentPage(1)
                  setArchiveModal({ open: false, docId: null })
                }}
              >
                Archive
              </button>
            </div>
          </div>
        </div>
      )}
    </RoleGate>
  )
}

export default DocumentsPage
