import { useState } from 'react'
import RoleGate from '../components/RoleGate'
import { useAuth } from '../context/AuthContext'
import DocumentsPanel from './documents/DocumentsPanel'
import ReceiptsPanel from './documents/ReceiptsPanel'
import ReportsSummaryPanel from './documents/ReportsSummaryPanel'

const ALL_TABS = [
  {
    key: 'summary',
    label: 'Summary',
    description: 'Consolidated overview of all reports, documents, receipts, and financial records.',
    rolesOnly: ['SK Chairman', 'SK Treasurer'],
  },
  {
    key: 'documents',
    label: 'Documents',
    description: 'Generate, view, print, and export the SK Annual Report. Generated reports are final; changes are made by generating a new version.',
  },
  {
    key: 'receipts',
    label: 'Receipts',
    description: 'Upload and manage receipts for approved Projects, Events, and Payroll records.',
  },
]

function DocumentsPage() {
  const { role } = useAuth()
  const tabs = ALL_TABS.filter(tab => !tab.rolesOnly || tab.rolesOnly.includes(role))
  const defaultTab = tabs[0]?.key || 'documents'
  const [activeTab, setActiveTab] = useState(defaultTab)
  const current = tabs.find((tab) => tab.key === activeTab) || tabs[0]

  return (
    <RoleGate allow={['SK Chairman', 'SK Treasurer', 'SK Kagawad', 'Barangay Treasurer']}>
      <header className="dashboard-header">
        <div className="header-left">
          <div>
            <p className="eyebrow">Compliance</p>
            <h1>Documents &amp; Receipts</h1>
            <p>{current?.description}</p>
          </div>
        </div>
        <div className="header-actions">
          <div className="page-tabs" role="tablist">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.key}
                className={`page-tab ${activeTab === tab.key ? 'is-active' : ''}`}
                onClick={() => setActiveTab(tab.key)}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {activeTab === 'summary' && <ReportsSummaryPanel />}
      {activeTab === 'documents' && <DocumentsPanel />}
      {activeTab === 'receipts' && <ReceiptsPanel />}
    </RoleGate>
  )
}

export default DocumentsPage
