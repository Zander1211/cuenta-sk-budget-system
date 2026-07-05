import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileText, Plus, X, Eye, Download } from 'lucide-react'
import RoleGate from '../components/RoleGate'
import DocumentGenerator from '../components/DocumentGenerator'
import { useAuth } from '../context/AuthContext'
import { useDocuments } from '../context/DocumentContext'
import PurchaseRequestPreview from '../components/PurchaseRequestPreview'
import PurchaseOrderPreview from '../components/PurchaseOrderPreview'
import DisbursementVoucherPreview from '../components/documents/DisbursementVoucherPreview'
import PayrollPreview from '../components/documents/PayrollPreview'
import ProjectDesignPreview from '../components/documents/ProjectDesignPreview'
import ItineraryOfTravelPreview from '../components/documents/ItineraryOfTravelPreview'
import TransmittalLetterPreview from '../components/documents/TransmittalLetterPreview'

function DocumentsPage() {
  const navigate = useNavigate()
  const { role } = useAuth()
  const { documents, archiveDocument, restoreDocument } = useDocuments()
  
  const canCreate = ['SK Chairman', 'SK Treasurer'].includes(role)
  
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [activeGeneratorType, setActiveGeneratorType] = useState(null)
  
  const [viewingDoc, setViewingDoc] = useState(null)
  const [activeTab, setActiveTab] = useState('active')
  const [archiveModal, setArchiveModal] = useState({ open: false, docId: null })

  const activeDocuments = documents.filter((doc) => !doc.archivedAt)
  const archivedDocuments = documents.filter((doc) => doc.archivedAt)
  const displayedDocuments = activeTab === 'active' ? activeDocuments : archivedDocuments

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
    const { type, data } = viewingDoc.data
    const onClose = () => setViewingDoc(null)

    switch (type) {
      case 'pr': return <PurchaseRequestPreview data={data} onClose={onClose} />
      case 'po': return <PurchaseOrderPreview data={data} onClose={onClose} />
      case 'dv': return <DisbursementVoucherPreview data={data} onClose={onClose} />
      case 'payroll': return <PayrollPreview data={data} onClose={onClose} />
      case 'project': return <ProjectDesignPreview data={data} onClose={onClose} />
      case 'itinerary': return <ItineraryOfTravelPreview data={data} onClose={onClose} />
      case 'transmittal': return <TransmittalLetterPreview data={data} onClose={onClose} />
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
            <p>Generate, view, and print official COA-mandated forms.</p>
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
              Back to History
            </button>
          )}
        </div>
      </header>

      <section className="dashboard-content">
        {activeGeneratorType ? (
          <div className="overview-card">
            <DocumentGenerator initialDocType={activeGeneratorType} />
          </div>
        ) : (
          <div className="overview-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <h2>{activeTab === 'active' ? 'Past Generated Documents' : 'Archived Documents'}</h2>
                <p style={{ color: 'var(--ink-soft)', fontSize: '0.9rem', margin: 0 }}>
                  {activeTab === 'active' ? 'View and download previously generated official documents.' : 'View and manage archived documents.'}
                </p>
              </div>
              <div className="page-tabs" role="tablist">
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
                  Archived
                </button>
              </div>
            </div>
            
            <table className="data-table">
              <thead>
                <tr>
                  <th>Document Name</th>
                  <th>Project/Event Name</th>
                  <th>Date & Time Generated</th>
                  <th>Generated By</th>
                  <th>Document Type</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {displayedDocuments.length > 0 ? (
                  displayedDocuments.map((doc) => (
                    <tr key={doc.id} style={{ opacity: doc.archivedAt ? 0.7 : 1 }}>
                      <td style={{ fontWeight: 500 }}>{doc.name}</td>
                      <td>{doc.project || '—'}</td>
                      <td>{new Date(doc.dateGenerated).toLocaleString()}</td>
                      <td>{doc.generatedBy}</td>
                      <td>
                        <span className="status-chip is-neutral">{doc.type}</span>
                      </td>
                      <td>
                        <div className="action-group is-right">
                          <button
                            className="text-button"
                            onClick={() => setViewingDoc(doc)}
                          >
                            <Eye size={16} style={{ marginRight: '4px' }}/> View
                          </button>
                          <button
                            className="text-button"
                            onClick={() => {
                              // Open preview and immediately trigger print
                              setViewingDoc(doc)
                              setTimeout(() => window.print(), 500)
                            }}
                          >
                            <Download size={16} style={{ marginRight: '4px' }}/> Download
                          </button>
                          {canCreate && (
                            activeTab === 'active' ? (
                              <button
                                className="text-button"
                                onClick={() => setArchiveModal({ open: true, docId: doc.id })}
                                style={{ color: '#e53e3e' }}
                              >
                                Archive
                              </button>
                            ) : (
                              <button
                                className="text-button"
                                onClick={() => restoreDocument(doc.id)}
                                style={{ color: 'var(--accent)' }}
                              >
                                Restore
                              </button>
                            )
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="6" className="empty-state">
                      {activeTab === 'active' ? 'No documents have been generated yet.' : 'No archived documents.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
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
            <div className="modal-body" style={{ margin: '16px 0', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <button className="secondary-button" style={{ justifyContent: 'flex-start' }} onClick={() => handleCreateSelect('pr')}>Purchase Request</button>
              <button className="secondary-button" style={{ justifyContent: 'flex-start' }} onClick={() => handleCreateSelect('po')}>Purchase Order</button>
              <button className="secondary-button" style={{ justifyContent: 'flex-start' }} onClick={() => handleCreateSelect('dv')}>Disbursement Voucher</button>
              <button className="secondary-button" style={{ justifyContent: 'flex-start' }} onClick={() => handleCreateSelect('payroll')}>Payroll</button>
              <button className="secondary-button" style={{ justifyContent: 'flex-start' }} onClick={() => handleCreateSelect('project')}>Project Design</button>
              <button className="secondary-button" style={{ justifyContent: 'flex-start' }} onClick={() => handleCreateSelect('itinerary')}>Itinerary of Travel</button>
              <button className="secondary-button" style={{ justifyContent: 'flex-start' }} onClick={() => handleCreateSelect('transmittal')}>Transmittal Letter</button>
              <hr style={{ margin: '8px 0', borderColor: 'var(--border)' }} />
              <button className="secondary-button" style={{ justifyContent: 'flex-start' }} onClick={() => handleCreateSelect('annual-report')}>Annual Report</button>
              <button className="secondary-button" style={{ justifyContent: 'flex-start' }} onClick={() => handleCreateSelect('narrative-report')}>Narrative & Photo Doc</button>
            </div>
          </div>
        </div>
      )}

      {/* Viewing Document Preview */}
      {renderViewingDoc()}

      {/* Archive Confirmation Modal */}
      {archiveModal.open && archiveModal.docId && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '440px' }}>
            <div className="modal-header">
              <h2>Archive Document</h2>
            </div>
            <div className="modal-body" style={{ margin: '16px 0' }}>
              <p>
                Are you sure you want to archive this document? It will be moved to the Archived Documents section.
              </p>
            </div>
            <div
              className="modal-footer"
              style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}
            >
              <button
                type="button"
                className="secondary-button"
                onClick={() => setArchiveModal({ open: false, docId: null })}
              >
                Cancel
              </button>
              <button
                type="button"
                className="primary-button"
                style={{ backgroundColor: '#e53e3e', color: 'white', borderColor: '#e53e3e' }}
                onClick={() => {
                  archiveDocument(archiveModal.docId)
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
