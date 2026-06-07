import { useState, useMemo, useEffect, useRef } from 'react'
import { Search, X, FileText, ArrowRight } from 'lucide-react'
import { useBudget } from '../context/BudgetContext'

const currency = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  maximumFractionDigits: 0,
})

function getBreakdownTotal(breakdown = []) {
  return breakdown.reduce((sum, item) => {
    const qty = Number(item.quantity) || 0
    const unit = Number(item.unitCost) || 0
    return sum + qty * unit
  }, 0)
}

function GlobalSearch({ isOpen, onClose }) {
  const { expenses } = useBudget()
  const [query, setQuery] = useState('')
  const [selectedProjectId, setSelectedProjectId] = useState(null)
  const inputRef = useRef(null)

  // Focus input on open
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50)
      setQuery('')
      setSelectedProjectId(null)
    }
  }, [isOpen])

  // Handle escape to close or clear
  useEffect(() => {
    function handleKeyDown(e) {
      if (!isOpen) return
      if (e.key === 'Escape') {
        if (selectedProjectId) {
          setSelectedProjectId(null)
        } else if (query) {
          setQuery('')
        } else {
          onClose()
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, query, selectedProjectId, onClose])

  const approvedProjects = useMemo(() => {
    return expenses.filter((item) => {
      const status = item.status || 'Approved'
      return ['Approved', 'Released'].includes(status) && !item.archivedAt
    })
  }, [expenses])

  const searchResults = useMemo(() => {
    if (!query.trim()) return []
    const lowerQuery = query.toLowerCase()
    
    return approvedProjects.filter((p) => {
      const titleMatch = (p.event || p.project || '').toLowerCase().includes(lowerQuery)
      const descMatch = (p.description || '').toLowerCase().includes(lowerQuery)
      const catMatch = (p.category || '').toLowerCase().includes(lowerQuery)
      const notesMatch = (p.notes || '').toLowerCase().includes(lowerQuery)
      
      let breakdownMatch = false
      if (Array.isArray(p.breakdown)) {
        breakdownMatch = p.breakdown.some(b => (b.itemName || '').toLowerCase().includes(lowerQuery))
      }
      
      return titleMatch || descMatch || catMatch || notesMatch || breakdownMatch
    })
  }, [approvedProjects, query])

  const selectedProject = selectedProjectId 
    ? approvedProjects.find((p) => p.id === selectedProjectId)
    : null

  if (!isOpen) return null

  function renderProjectDetails() {
    if (!selectedProject) return null

    const breakdownItems = Array.isArray(selectedProject.breakdown) ? selectedProject.breakdown : []
    const breakdownTotal = getBreakdownTotal(breakdownItems)
    const requestedAmount = Number(selectedProject.amount) || 0
    const totalAmount = requestedAmount > 0 ? requestedAmount : breakdownTotal

    return (
      <div className="gs-details-pane">
        <div className="gs-details-header">
          <button type="button" className="icon-button" onClick={() => setSelectedProjectId(null)}>
            <ArrowRight style={{ transform: 'rotate(180deg)' }} size={18} />
          </button>
          <h2>{selectedProject.event || selectedProject.project || 'Untitled Project'}</h2>
        </div>
        
        <div className="gs-details-content">
          <div className="details-panel" style={{ marginTop: 0, border: 'none', background: 'transparent', padding: 0 }}>
            <div className="details-grid">
              <div>
                <p className="details-label">Description</p>
                <p className="details-value">{selectedProject.description || '—'}</p>
              </div>
              <div>
                <p className="details-label">Total Amount</p>
                <p className="details-value">{currency.format(totalAmount)}</p>
              </div>
              <div>
                <p className="details-label">Date Approved</p>
                <p className="details-value">
                  {selectedProject.approvedAt
                    ? new Date(selectedProject.approvedAt).toLocaleDateString()
                    : '—'}
                </p>
              </div>
              <div>
                <p className="details-label">Current Status</p>
                <p className="details-value">
                  {selectedProject.projectStatus || 'Ongoing'}
                </p>
              </div>
              <div>
                <p className="details-label">Category</p>
                <p className="details-value">{selectedProject.category || '—'}</p>
              </div>
              <div>
                <p className="details-label">Event Date</p>
                <p className="details-value">
                  {selectedProject.eventDate
                    ? new Date(selectedProject.eventDate).toLocaleDateString()
                    : '—'}
                </p>
              </div>
            </div>

            <div className="details-breakdown">
              <p className="details-label">Budget Breakdown</p>
              {breakdownItems.length ? (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th>Quantity</th>
                      <th>Unit Cost</th>
                      <th>Total Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {breakdownItems.map((item, index) => (
                      <tr key={`${selectedProject.id}-item-${index}`}>
                        <td>{item.itemName || '—'}</td>
                        <td>{item.quantity || 0}</td>
                        <td>{currency.format(item.unitCost || 0)}</td>
                        <td>
                          {currency.format(
                            (item.quantity || 0) * (item.unitCost || 0)
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <th colSpan="3">Total Cost</th>
                      <th>{currency.format(breakdownTotal)}</th>
                    </tr>
                    <tr>
                      <th colSpan="3">Total Amount</th>
                      <th>{currency.format(totalAmount)}</th>
                    </tr>
                  </tfoot>
                </table>
              ) : (
                <p className="details-value">No breakdown provided.</p>
              )}
            </div>
            
            <div className="details-receipt-section">
              <p className="details-label">Documentation</p>
              <div className="details-receipt-actions">
                {selectedProject.receiptUrl || selectedProject.receipt_url ? (
                  <span className="status-pill status-approved">Document Uploaded</span>
                ) : (
                  <p className="details-value" style={{ margin: 0 }}>No documents uploaded.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="global-search-overlay" onClick={onClose}>
      <div className="global-search-modal" onClick={(e) => e.stopPropagation()}>
        
        {/* Search Input Area */}
        <div className="gs-header">
          <Search size={20} className="gs-search-icon" />
          <input
            ref={inputRef}
            type="text"
            className="gs-input"
            placeholder="Search approved projects, descriptions, categories..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              if (selectedProjectId) setSelectedProjectId(null)
            }}
          />
          <button className="icon-button" type="button" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {/* Dynamic Content Area */}
        <div className="gs-body">
          {selectedProject ? (
            renderProjectDetails()
          ) : query.trim().length === 0 ? (
            <div className="gs-empty-state">
              <FileText size={48} className="gs-empty-icon" />
              <p>Type to search all approved projects & events.</p>
            </div>
          ) : searchResults.length > 0 ? (
            <div className="gs-results-list">
              {searchResults.map((project) => (
                <button 
                  key={project.id} 
                  className="gs-result-item" 
                  onClick={() => setSelectedProjectId(project.id)}
                  type="button"
                >
                  <div className="gs-result-info">
                    <span className="gs-result-title">{project.event || project.project || 'Untitled'}</span>
                    <span className="gs-result-meta">{project.category} • {currency.format(project.amount || 0)}</span>
                  </div>
                  <ArrowRight size={16} className="gs-result-arrow" />
                </button>
              ))}
            </div>
          ) : (
            <div className="gs-empty-state">
              <p>No projects found matching "{query}"</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default GlobalSearch
