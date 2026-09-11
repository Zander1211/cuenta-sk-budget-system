import { useEffect, useMemo, useState } from 'react'
import { Download, Eye, Pencil, Printer, Search } from 'lucide-react'
import { supabase } from '../../supabase/supabaseClient'
import PaginationControls from '../PaginationControls'
import RowActionsMenu from '../RowActionsMenu'
import PurchaseRequestPreview from '../PurchaseRequestPreview'
import DisbursementVoucherPreview from './DisbursementVoucherPreview'
import PayrollPreview from './PayrollPreview'
import ProjectDesignPreview from './ProjectDesignPreview'
import ItineraryOfTravelPreview from './ItineraryOfTravelPreview'
import TransmittalLetterPreview from './TransmittalLetterPreview'
import NarrativeReportPreview from './NarrativeReportPreview'

const GENERATED_DOCUMENTS_BUCKET = 'generated-documents'
const PAGE_SIZE = 6

function formatDateTime(value) {
  if (!value) return { date: '—', time: '' }
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return { date: '—', time: '' }
  return {
    date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    time: d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
  }
}

function mapRow(row) {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    generatedBy: row.generated_by,
    dateGenerated: row.date_generated,
    fileName: row.file_name,
    filePath: row.file_path,
    data: row.data || {},
  }
}

// Re-dispatches a saved document's stored form data (previewData.data) to the
// matching *Preview component — the same shape DocumentGenerator's own
// renderPreview() switches on when generating fresh. Narrative & Photo
// Documentation is the one type this list can View/Print Again but not Edit:
// its full builder lives on a separate page (photos live in IndexedDB, not
// in this saved row).
function renderPreviewFor(doc, { onClose }) {
  const type = doc.data?.type
  const data = doc.data?.data
  if (!type || !data) return null

  // No onSave passed — this is a read-only view/reprint of an
  // already-saved document, so it must never create another row.
  const props = { data, onClose }

  switch (type) {
    case 'pr':
      return <PurchaseRequestPreview {...props} />
    case 'dv':
      return <DisbursementVoucherPreview {...props} />
    case 'payroll':
      return <PayrollPreview {...props} />
    case 'project':
      return <ProjectDesignPreview {...props} />
    case 'itinerary':
      return <ItineraryOfTravelPreview {...props} />
    case 'transmittal':
      return <TransmittalLetterPreview {...props} />
    case 'narrative':
      return <NarrativeReportPreview {...props} />
    default:
      return null
  }
}

// Generated Documents history for one Project/Event, shown inside
// GenerateDocumentsModal below the generator itself — mirrors
// RecordReceiptsModal's list section (search, table, pagination) so the two
// features feel consistent. Unlike receipts, this reads directly from the
// `documents` table (not DocumentContext, which is shaped for the global
// paginated Documents page) filtered to this exact record.
function RecordGeneratedDocumentsList({ record, kind, canManage, onEdit }) {
  const [documents, setDocuments] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [page, setPage] = useState(1)
  const [viewingDoc, setViewingDoc] = useState(null)
  const [downloadingId, setDownloadingId] = useState(null)
  const [feedback, setFeedback] = useState(null)

  async function loadDocuments() {
    const { data, error } = await supabase
      .from('documents')
      .select('*')
      .eq('related_entity_type', kind)
      .eq('related_entity_id', String(record.id))
      .is('archived_at', null)
      .order('date_generated', { ascending: false })

    if (error) {
      console.error('Could not load generated documents:', error)
      return
    }
    setDocuments((data || []).map(mapRow))
  }

  useEffect(() => {
    let mounted = true
    setIsLoading(true)
    loadDocuments().finally(() => {
      if (mounted) setIsLoading(false)
    })

    // A new document generated above (in this same modal) dispatches this
    // event — refresh so it appears here immediately, without a manual page
    // reload.
    const handleCreated = () => loadDocuments()
    window.addEventListener('cuenta:document-created', handleCreated)
    return () => {
      mounted = false
      window.removeEventListener('cuenta:document-created', handleCreated)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, record.id])

  const filteredDocuments = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) return documents
    return documents.filter((doc) =>
      [doc.name, doc.type, doc.generatedBy].filter(Boolean).join(' ').toLowerCase().includes(query)
    )
  }, [documents, searchQuery])

  const totalPages = Math.max(1, Math.ceil(filteredDocuments.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const pagedDocuments = filteredDocuments.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  async function handleDownload(doc) {
    if (!doc.filePath) return
    setDownloadingId(doc.id)
    try {
      const { data, error } = await supabase.storage
        .from(GENERATED_DOCUMENTS_BUCKET)
        .createSignedUrl(doc.filePath, 60 * 60, { download: doc.fileName || `${doc.name}.pdf` })
      if (error) throw error

      const link = document.createElement('a')
      link.href = data.signedUrl
      link.download = doc.fileName || `${doc.name}.pdf`
      document.body.appendChild(link)
      link.click()
      link.remove()
    } catch (error) {
      setFeedback({ type: 'error', message: error?.message || 'Could not download this document. Please try again.' })
    } finally {
      setDownloadingId(null)
    }
  }

  const isNarrative = (doc) => doc.data?.type === 'narrative'

  return (
    <div className="record-generated-documents">
      {feedback ? (
        <div
          className={feedback.type === 'success' ? 'form-success' : 'form-error'}
          role={feedback.type === 'error' ? 'alert' : 'status'}
          style={{ marginBottom: '16px' }}
        >
          {feedback.message}
        </div>
      ) : null}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <div className="receipts-search-box" style={{ flex: '1 1 240px', maxWidth: '360px' }}>
          <span className="receipts-search-icon"><Search size={16} /></span>
          <input
            type="text"
            placeholder="Search generated documents…"
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setPage(1) }}
          />
        </div>
      </div>

      {isLoading ? (
        <p className="form-note">Loading generated documents…</p>
      ) : filteredDocuments.length === 0 ? (
        <div className="empty-state" style={{ textAlign: 'center', padding: '36px 16px' }}>
          {searchQuery ? 'No generated documents match your search.' : 'No documents generated for this record yet.'}
        </div>
      ) : (
        <>
          <div style={{ maxWidth: '100%', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Document Type</th>
                  <th>Date Generated</th>
                  <th>Generated By</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pagedDocuments.map((doc) => {
                  const { date, time } = formatDateTime(doc.dateGenerated)
                  return (
                    <tr key={doc.id}>
                      <td data-label="Document Type">
                        <strong title={doc.name}>{doc.type}</strong>
                        {doc.name && doc.name !== doc.type ? (
                          <div style={{ fontSize: '0.78rem', color: 'var(--ink-3)' }}>{doc.name}</div>
                        ) : null}
                      </td>
                      <td data-label="Date Generated">
                        {date}
                        {time ? <div style={{ fontSize: '0.78rem', color: 'var(--ink-3)' }}>{time}</div> : null}
                      </td>
                      <td data-label="Generated By">{doc.generatedBy || '—'}</td>
                      <td data-label="Actions" className="table-actions" style={{ justifyContent: 'flex-end' }}>
                        <button
                          type="button"
                          className="secondary-button"
                          style={{ padding: '6px 12px', fontSize: '0.82rem' }}
                          onClick={() => setViewingDoc(doc)}
                        >
                          <Eye size={14} /> View
                        </button>
                        {canManage ? (
                          // Download / Print Again / Edit collapse behind one
                          // "⋮" trigger — the same row-menu pattern Projects
                          // & Events uses for its own secondary actions, so a
                          // row here doesn't turn into a wall of pill
                          // buttons. View-only roles have just the one extra
                          // action below, so it stays a plain button instead
                          // of a one-item menu.
                          <RowActionsMenu label={`More actions for ${doc.name || doc.type || 'this document'}`}>
                            <button
                              type="button"
                              className="row-menu-item"
                              disabled={!doc.filePath || downloadingId === doc.id}
                              title={doc.filePath ? undefined : 'No PDF file was saved for this document'}
                              onClick={() => handleDownload(doc)}
                            >
                              <Download size={14} aria-hidden="true" /> {downloadingId === doc.id ? 'Preparing…' : 'Download'}
                            </button>
                            <button
                              type="button"
                              className="row-menu-item"
                              onClick={() => {
                                setViewingDoc(doc)
                                setTimeout(() => window.print(), 500)
                              }}
                            >
                              <Printer size={14} aria-hidden="true" /> Print Again
                            </button>
                            {!isNarrative(doc) ? (
                              <button
                                type="button"
                                className="row-menu-item"
                                onClick={() => onEdit(doc)}
                              >
                                <Pencil size={14} aria-hidden="true" /> Edit
                              </button>
                            ) : null}
                          </RowActionsMenu>
                        ) : (
                          <button
                            type="button"
                            className="secondary-button"
                            style={{ padding: '6px 12px', fontSize: '0.82rem' }}
                            disabled={!doc.filePath || downloadingId === doc.id}
                            title={doc.filePath ? undefined : 'No PDF file was saved for this document'}
                            onClick={() => handleDownload(doc)}
                          >
                            <Download size={14} /> {downloadingId === doc.id ? 'Preparing…' : 'Download'}
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {totalPages > 1 ? (
            <PaginationControls
              currentPage={safePage}
              totalPages={totalPages}
              totalItems={filteredDocuments.length}
              pageSize={PAGE_SIZE}
              onPageChange={setPage}
              isFiltered={Boolean(searchQuery)}
              idPrefix="record-generated-documents"
            />
          ) : null}
        </>
      )}

      {viewingDoc
        ? renderPreviewFor(viewingDoc, { onClose: () => setViewingDoc(null) })
        : null}
    </div>
  )
}

export default RecordGeneratedDocumentsList
