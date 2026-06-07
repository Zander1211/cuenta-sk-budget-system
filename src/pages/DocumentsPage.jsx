import { useNavigate } from 'react-router-dom'
import { FileText } from 'lucide-react'
import RoleGate from '../components/RoleGate'
import DocumentGenerator from '../components/DocumentGenerator'

function DocumentsPage() {
  const navigate = useNavigate()

  return (
    <RoleGate allow={['SK Chairman', 'SK Treasurer']}>
      <header className="dashboard-header">
        <div className="header-left">
          <div>
            <p className="eyebrow">Compliance</p>
            <h1>Documents</h1>
            <p>Generate and print official COA-mandated forms.</p>
          </div>
        </div>
        <div className="header-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={() => navigate('/dashboard/annual-report')}
          >
            <FileText size={16} />
            Annual Report
          </button>
          <button
            type="button"
            className="primary-button"
            onClick={() => navigate('/dashboard/narrative-report')}
          >
            <FileText size={16} />
            Narrative Report
          </button>
        </div>
      </header>

      <section className="dashboard-content">
        {/* ── Generate Official Documents ── */}
        <div className="overview-card">
          <p className="eyebrow">Generate</p>
          <h2>Generate official documents</h2>
          <p style={{ marginBottom: '16px', color: 'var(--ink-soft)', fontSize: '0.9rem' }}>
            Create Purchase Requests, Purchase Orders, Disbursement Vouchers, Payroll,
            Project Designs, Itineraries of Travel, and Transmittal Letters.
            Select a document type, fill in the fields, then preview and print.
          </p>
          <DocumentGenerator />
        </div>
      </section>
    </RoleGate>
  )
}

export default DocumentsPage
