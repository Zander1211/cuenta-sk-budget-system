import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, X, Eye, Download, Archive, RotateCcw, Search, Calendar, Pencil } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useDocuments } from '../../context/DocumentContext'
import AnnualReportPreview from '../../components/documents/AnnualReportPreview'
import PaginationControls from '../../components/PaginationControls'

const DOCUMENTS_PAGE_SIZE = 10

function DocumentsPanel() {
  const navigate = useNavigate()
  const { role } = useAuth()
  const {
    documents,
    isLoadingDocuments,
    documentsError,
    totalCount,
    documentStats,
    documentYears,
    refreshDocuments,
    refreshDocumentStats,
    archiveDocument,
    restoreDocument,
  } = useDocuments()

  const canCreate = ['SK Chairman', 'SK Treasurer'].includes(role)

  const [viewDetailsDoc, setViewDetailsDoc] = useState(null)
  const [viewingDoc, setViewingDoc] = useState(null)
  const [activeTab, setActiveTab] = useState('active')
  const [archiveModal, setArchiveModal] = useState({ open: false, docId: null })

  // Filters
  const [searchTerm, setSearchTerm] = useState('')
  const [yearFilter, setYearFilter] = useState('All')
  const [currentPage, setCurrentPage] = useState(1)

  const totalPages = Math.max(1, Math.ceil(totalCount / DOCUMENTS_PAGE_SIZE))
  const safeCurrentPage = Math.min(currentPage, totalPages)
  const hasActiveFilters = Boolean(searchTerm.trim() || yearFilter !== 'All')

  useEffect(() => {
    refreshDocuments({
      page: currentPage,
      pageSize: DOCUMENTS_PAGE_SIZE,
      search: searchTerm,
      type: 'Annual Report',
      year: yearFilter,
      archived: activeTab === 'archive',
    })
  }, [activeTab, currentPage, refreshDocuments, searchTerm, yearFilter])

  useEffect(() => {
    refreshDocumentStats()
  }, [refreshDocumentStats])

  useEffect(() => {
    const handleDocumentCreated = () => {
      setActiveTab('active')
      setSearchTerm('')
      setYearFilter('All')
      setCurrentPage(1)
    }

    window.addEventListener('cuenta:document-created', handleDocumentCreated)
    return () => window.removeEventListener('cuenta:document-created', handleDocumentCreated)
  }, [])

  function handleCreateAnnualReport() {
    navigate('/dashboard/annual-report')
  }

  function handleEditAnnualReport(doc) {
    const year = doc.relatedEntityId || new Date(doc.dateGenerated).getFullYear()
    navigate('/dashboard/annual-report', { state: { year: Number(year) } })
  }

  function renderViewingDoc() {
    if (!viewingDoc) return null
    const storedData = viewingDoc.data || {}
    const type = storedData.type || (viewingDoc.type === 'Annual Report' ? 'annual' : null)
    const data = storedData.data || storedData
    const onClose = () => setViewingDoc(null)

    if (type === 'annual') return <AnnualReportPreview data={data} onClose={onClose} />
    return null
  }

  return (
    <>
      <section className="dashboard-content">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', gap: '16px', flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ margin: '0 0 4px', fontSize: '1.4rem', color: 'var(--text-primary)' }}>Annual Report</h2>
            <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
              Create, view, edit, print, and export your SK Annual Report.
            </p>
          </div>
          {canCreate && (
            <button
              type="button"
              className="primary-button"
              onClick={handleCreateAnnualReport}
            >
              <Plus size={16} />
              New Annual Report
            </button>
          )}
        </div>

        {/* Document Summary Cards */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '16px',
          marginBottom: '24px'
        }}>
          <div style={{ backgroundColor: 'var(--surface)', padding: '20px', borderRadius: 'var(--radius-surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)' }}>
            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total Annual Reports</p>
            <h3 style={{ margin: '8px 0 0', fontSize: '1.75rem', color: 'var(--text-primary)' }}>{documentStats.total}</h3>
          </div>
          <div style={{ backgroundColor: 'var(--surface)', padding: '20px', borderRadius: 'var(--radius-surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)' }}>
            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Generated</p>
            <h3 style={{ margin: '8px 0 0', fontSize: '1.75rem', color: 'var(--text-primary)' }}>{documentStats.active}</h3>
          </div>
          <div style={{ backgroundColor: 'var(--surface)', padding: '20px', borderRadius: 'var(--radius-surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)' }}>
            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Archived</p>
            <h3 style={{ margin: '8px 0 0', fontSize: '1.75rem', color: 'var(--text-primary)' }}>{documentStats.archived}</h3>
          </div>
        </div>

        <div className="overview-card" style={{ backgroundColor: 'var(--surface)', borderRadius: 'var(--radius-surface)', overflow: 'hidden', border: '1px solid var(--border)' }}>

          {/* Header & Tabs */}
          <div style={{ padding: '24px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', marginBottom: '20px' }}>
              <div>
                <h2 style={{ margin: '0 0 8px', fontSize: '1.25rem', color: 'var(--text-primary)' }}>
                  {activeTab === 'active' ? 'Active Annual Reports' : 'Archived Annual Reports'}
                </h2>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: 0 }}>
                  {activeTab === 'active' ? 'Manage and preview your Annual Reports.' : 'View and restore archived Annual Reports.'}
                </p>
              </div>
              <div className="page-tabs" role="tablist">
                <button
                  className={`page-tab ${activeTab === 'active' ? 'is-active' : ''}`}
                  onClick={() => { setActiveTab('active'); setSearchTerm(''); setYearFilter('All'); setCurrentPage(1); }}
                >
                  Active
                </button>
                <button
                  className={`page-tab ${activeTab === 'archive' ? 'is-active' : ''}`}
                  onClick={() => { setActiveTab('archive'); setSearchTerm(''); setYearFilter('All'); setCurrentPage(1); }}
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
                  placeholder="Search Annual Reports by name..."
                  value={searchTerm}
                  onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                  style={{
                    width: '100%', padding: '10px 12px 10px 40px', borderRadius: 'var(--radius-control)',
                    border: '1px solid var(--border)', fontSize: '0.95rem'
                  }}
                />
              </div>
              <div style={{ flex: '1 1 200px', position: 'relative' }}>
                <Calendar size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <select
                  value={yearFilter}
                  onChange={(e) => { setYearFilter(e.target.value); setCurrentPage(1); }}
                  style={{
                    width: '100%', padding: '10px 12px 10px 40px', borderRadius: 'var(--radius-control)',
                    border: '1px solid var(--border)', fontSize: '0.95rem', backgroundColor: 'var(--surface)'
                  }}
                >
                  <option value="All">All Years</option>
                  {documentYears.map(year => (
                    <option key={year} value={year}>{year}</option>
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
                  <th style={{ padding: '16px 24px', textAlign: 'left', fontSize: '0.8rem', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 600 }}>Year</th>
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
                      <td data-label="Year" style={{ padding: '16px 24px', color: 'var(--text-primary)' }}>{doc.relatedEntityId || new Date(doc.dateGenerated).getFullYear()}</td>
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
                          {canCreate && !doc.archivedAt && (
                            <button className="secondary-button" style={{ padding: '6px 12px' }} onClick={() => handleEditAnnualReport(doc)}>
                              <Pencil size={14} /> Edit
                            </button>
                          )}
                          <button className="secondary-button" style={{ padding: '6px 12px' }} onClick={() => {
                            setViewingDoc(doc)
                            setTimeout(() => window.print(), 500)
                          }}>
                            <Download size={14} /> Print / Export PDF
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="5" style={{ padding: '48px 24px', textAlign: 'center' }}>
                      <p style={{ color: 'var(--text-secondary)', fontSize: '1rem', margin: 0 }}>
                        No Annual Reports found for the selected filters.
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

      </section>

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
                    <p style={{ margin: 0, fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: '0.5px' }}>Reporting Year</p>
                    <p style={{ margin: 0, fontSize: '1rem', color: 'var(--text-primary)', fontWeight: '400' }}>{viewDetailsDoc.relatedEntityId || new Date(viewDetailsDoc.dateGenerated).getFullYear()}</p>
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
              <h2 style={{ fontSize: '1.25rem', margin: 0, color: 'var(--text-primary)' }}>Archive Annual Report</h2>
            </div>
            <div className="modal-body" style={{ marginBottom: '24px' }}>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', margin: 0, lineHeight: '1.5' }}>
                Are you sure you want to archive this Annual Report? It will be moved to the Archived section.
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
    </>
  )
}

export default DocumentsPanel
