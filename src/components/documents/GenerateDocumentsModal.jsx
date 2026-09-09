import { X } from 'lucide-react'
import DocumentGenerator from '../DocumentGenerator'

const RECORD_KIND_LABEL = { project: 'Project', event: 'Event', payroll: 'Payroll' }

// The COA-mandated forms every Project or Event can need. Project Design is
// added separately, only for kind === 'project' — Events don't get it.
const PROJECT_EVENT_DOC_TYPES = ['pr', 'dv', 'itinerary', 'transmittal', 'narrative']

// Generate-from-record entry point used by the "Generate Documents" button on
// Projects & Events rows and the "Generate Payroll Documents" button on
// Payroll rows. `record` is the approved expenses row for that Project,
// Event, or Payroll; `kind` says which one it is. Everything about which
// document types are offered, and how the saved document gets linked back to
// this exact record, is delegated to DocumentGenerator via presetRecord /
// recordKind — this component only frames it as a modal.
function GenerateDocumentsModal({ record, kind, onClose }) {
  if (!record) return null

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
        style={{ width: 'min(760px, 100%)', maxWidth: '760px' }}
      >
        <div
          className="modal-header"
          style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px' }}
        >
          <div>
            <p className="eyebrow" style={{ margin: '0 0 4px' }}>
              {kindLabel} &middot; Generate Documents
            </p>
            <h2 style={{ margin: 0 }}>{title}</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>

        <div className="modal-body">
          {/* Deliberately not closing on save: the preview overlay's own
              "Print / Save as PDF" step still needs to run, and closing the
              modal would unmount that overlay mid-print. The user dismisses
              this modal themselves once they're done, same as the standalone
              Documents → Create Document flow. */}
          <DocumentGenerator
            initialDocType={kind === 'payroll' ? 'payroll' : 'pr'}
            presetRecord={record}
            recordKind={kind}
            allowedDocTypes={allowedDocTypes}
          />
        </div>
      </div>
    </div>
  )
}

export default GenerateDocumentsModal
