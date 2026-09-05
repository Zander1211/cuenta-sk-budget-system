import { useState } from 'react'
import RoleGate from '../components/RoleGate'
import DocumentsPanel from './documents/DocumentsPanel'
import ReceiptsPanel from './documents/ReceiptsPanel'

const TABS = [
  {
    key: 'documents',
    label: 'Documents',
    description: 'Generate, view, manage, and print official COA-mandated forms.',
  },
  {
    key: 'receipts',
    label: 'Receipts',
    description: 'Upload and manage receipts for approved Projects, Events, and Payroll records.',
  },
]

function DocumentsPage() {
  const [activeTab, setActiveTab] = useState('documents')
  const current = TABS.find((tab) => tab.key === activeTab) || TABS[0]

  return (
    <RoleGate allow={['SK Chairman', 'SK Treasurer', 'SK Kagawad', 'Barangay Treasurer']}>
      <header className="dashboard-header">
        <div className="header-left">
          <div>
            <p className="eyebrow">Compliance</p>
            <h1>Documents &amp; Receipts</h1>
            <p>{current.description}</p>
          </div>
        </div>
        <div className="header-actions">
          <div className="page-tabs" role="tablist">
            {TABS.map((tab) => (
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

      {activeTab === 'documents' ? <DocumentsPanel /> : <ReceiptsPanel />}
    </RoleGate>
  )
}

export default DocumentsPage
