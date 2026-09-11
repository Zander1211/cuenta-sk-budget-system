import { useState } from 'react'
import { X } from 'lucide-react'
import DocumentGenerator from '../DocumentGenerator'
import RecordGeneratedDocumentsList from './RecordGeneratedDocumentsList'

const RECORD_KIND_LABEL = { project: 'Project', event: 'Event', payroll: 'Payroll' }

// The COA-mandated forms every Project or Event can need. Project Design is
// added separately, only for kind === 'project' — Events don't get it.
const PROJECT_EVENT_DOC_TYPES = ['pr', 'dv', 'itinerary', 'transmittal', 'narrative']

// Generate-from-record entry point used by the "Documents" button on
// Projects & Events rows and the "Generate Payroll Documents" button on
// Payroll rows. `record` is the approved expenses row for that Project,
// Event, or Payroll; `kind` says which one it is. Everything about which
// document types are offered, and how the saved document gets linked back to
// this exact record, is delegated to DocumentGenerator via presetRecord /
// recordKind — this component frames it as a modal and adds the Generated
// Documents history below it (mirrors RecordReceiptsModal's combined
// upload-and-list layout). `canGenerateDocs` (SK Chairman/Treasurer only)
// gates the generator section and the list's Print Again/Edit actions —
// everyone else who can open this modal still sees the list, View, and
// Download.
function GenerateDocumentsModal({ record, kind, canGenerateDocs, initialTab, onClose }) {
  const [editingDoc, setEditingDoc] = useState(null)
  // View-only roles (SK Kagawad, Barangay Treasurer) have nothing to
  // generate, so they land straight on the history tab — no tab bar shown at
  // all for them, matching what they can actually do here. `initialTab` lets
  // a caller open straight to the history tab (e.g. returning from the
  // Narrative & Photo Documentation builder, a separate page — see
  // ProjectsEventsPage's `openDocs` deep link).
  const [activeTab, setActiveTab] = useState(
    initialTab === 'history' ? 'history' : (canGenerateDocs ? 'generate' : 'history')
  )

  if (!record) return null

  function startEditing(doc) {
    setEditingDoc(doc)
    setActiveTab('generate')
  }

  const allowedDocTypes =
    kind === 'payroll'
      ? ['payroll']
      : kind === 'project'
        ? [...PROJECT_EVENT_DOC_TYPES, 'project']
        : PROJECT_EVENT_DOC_TYPES

  const title = record.project || record.event || 'this record'
  const kindLabel = RECORD_KIND_LABEL[kind] || 'Record'

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{ width: 'min(880px, 100%)', maxWidth: '880px' }}
      >
        <div
          className="modal-header"
          style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px' }}
        >
          <div>
            <p className="eyebrow" style={{ margin: '0 0 4px' }}>
              {kindLabel} &middot; Documents
            </p>
            <h2 style={{ margin: 0 }}>{title}</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>

        <div className="modal-body">
          {canGenerateDocs ? (
            <div className="page-tabs" role="tablist" style={{ marginBottom: '20px' }}>
              <button
                type="button"
                className={`page-tab ${activeTab === 'generate' ? 'is-active' : ''}`}
                onClick={() => setActiveTab('generate')}
              >
                {editingDoc ? 'Edit Document' : 'Generate New Document'}
              </button>
              <button
                type="button"
                className={`page-tab ${activeTab === 'history' ? 'is-active' : ''}`}
                onClick={() => setActiveTab('history')}
              >
                Generated Documents
              </button>
            </div>
          ) : null}

          {canGenerateDocs && activeTab === 'generate' ? (
            /* Deliberately not closing on save: the preview overlay's own
               "Print / Save as PDF" step still needs to run, and closing the
               modal would unmount that overlay mid-print. The user dismisses
               this modal themselves once they're done, same as the standalone
               Documents → Create Document flow. `key` forces the generator
               (and whichever form it renders) to remount and re-seed its
               fields whenever the Edit target changes. */
            <DocumentGenerator
              key={editingDoc?.id || 'new'}
              initialDocType={editingDoc ? editingDoc.data?.type : (kind === 'payroll' ? 'payroll' : 'pr')}
              editingDocument={editingDoc}
              presetRecord={record}
              recordKind={kind}
              allowedDocTypes={allowedDocTypes}
              onPreviewClosed={() => {
                // Fires once the preview overlay is dismissed after an
                // actual save (not on a plain cancel) — only then is it safe
                // to clear the Edit target and switch tabs. Doing either at
                // save time instead (before the overlay's own "Print / Save
                // as PDF" step has actually run window.print()) would change
                // `editingDoc`, which changes DocumentGenerator's `key` below
                // and unmounts it — taking the still-open preview overlay
                // down with it mid-print.
                setEditingDoc(null)
                setActiveTab('history')
              }}
            />
          ) : (
            <RecordGeneratedDocumentsList
              record={record}
              kind={kind}
              canManage={Boolean(canGenerateDocs)}
              onEdit={startEditing}
            />
          )}
        </div>
      </div>
    </div>
  )
}

export default GenerateDocumentsModal
