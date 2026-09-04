import { useState, useMemo, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, X, FileText, ArrowRight } from 'lucide-react'
import { useBudget } from '../context/BudgetContext'
import { useAuth } from '../context/AuthContext'

const currency = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  maximumFractionDigits: 0,
})

// Keep in sync with the RoleGate allow-list on ProjectsEventsPage — only
// roles that can actually open that page should be redirected there.
const PROJECTS_EVENTS_ROLES = ['SK Chairman', 'SK Treasurer', 'SK Kagawad', 'Barangay Treasurer']

function GlobalSearch({ isOpen, onClose }) {
  const { expenses } = useBudget()
  const { role } = useAuth()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef(null)

  // Focus input on open
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50)
      setQuery('')
      setActiveIndex(0)
    }
  }, [isOpen])

  // Handle escape to close or clear
  useEffect(() => {
    function handleKeyDown(e) {
      if (!isOpen) return
      if (e.key === 'Escape') {
        if (query) {
          setQuery('')
        } else {
          onClose()
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, query, onClose])

  const approvedProjects = useMemo(() => {
    return expenses.filter((item) => {
      const status = item.status || 'Approved'
      return ['Approved', 'Released'].includes(status) && !item.archivedAt && !item.isAdditional
    })
  }, [expenses])

  const searchResults = useMemo(() => {
    const trimmed = query.trim()
    if (!trimmed) return []
    const lowerQuery = trimmed.toLowerCase()

    return approvedProjects.filter((p) => {
      const titleMatch = (p.event || p.project || '').toLowerCase().includes(lowerQuery)
      const descMatch = (p.description || '').toLowerCase().includes(lowerQuery)
      const catMatch = (p.category || '').toLowerCase().includes(lowerQuery)
      const notesMatch = (p.notes || '').toLowerCase().includes(lowerQuery)

      let breakdownMatch = false
      if (Array.isArray(p.breakdown)) {
        breakdownMatch = p.breakdown.some(b =>
          (b.itemName || '').toLowerCase().includes(lowerQuery) ||
          (b.name || '').toLowerCase().includes(lowerQuery) ||
          (b.position || '').toLowerCase().includes(lowerQuery)
        )
      }

      return titleMatch || descMatch || catMatch || notesMatch || breakdownMatch
    })
  }, [approvedProjects, query])

  const canOpenProjectsEvents = PROJECTS_EVENTS_ROLES.includes(role)

  function goToItem(item) {
    if (!item || !canOpenProjectsEvents) return
    const tab = item.type === 'Event' ? 'events' : 'projects'
    navigate(`/dashboard/projects-events?tab=${tab}&highlight=${encodeURIComponent(item.id)}`)
    onClose()
  }

  function handleInputKeyDown(e) {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (searchResults.length) {
        goToItem(searchResults[Math.min(activeIndex, searchResults.length - 1)])
      }
    } else if (e.key === 'ArrowDown' && searchResults.length) {
      e.preventDefault()
      setActiveIndex((i) => Math.min(i + 1, searchResults.length - 1))
    } else if (e.key === 'ArrowUp' && searchResults.length) {
      e.preventDefault()
      setActiveIndex((i) => Math.max(i - 1, 0))
    }
  }

  if (!isOpen) return null

  return (
    <div className="global-search-overlay" onClick={onClose}>
      <div className="global-search-modal" onClick={(e) => e.stopPropagation()}>
        
        {/* Search Input Area */}
        <div className="gs-header">
          <button
            className="gs-submit"
            type="button"
            aria-label="Go to top result"
            disabled={!searchResults.length}
            onClick={() => goToItem(searchResults[Math.min(activeIndex, searchResults.length - 1)])}
          >
            <Search size={20} className="gs-search-icon" />
          </button>
          <input
            ref={inputRef}
            type="text"
            className="gs-input"
            placeholder="Search projects & events by name..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setActiveIndex(0)
            }}
            onKeyDown={handleInputKeyDown}
          />
          <button className="icon-button" type="button" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {/* Dynamic Content Area */}
        <div className="gs-body">
          {query.trim().length === 0 ? (
            <div className="gs-empty-state">
              <FileText size={48} className="gs-empty-icon" />
              <p>Type a project or event name to jump straight to it.</p>
            </div>
          ) : searchResults.length > 0 ? (
            <div className="gs-results-list">
              {searchResults.map((project, index) => (
                <button
                  key={project.id}
                  className={`gs-result-item${index === activeIndex ? ' gs-result-item-active' : ''}`}
                  onClick={() => goToItem(project)}
                  onMouseEnter={() => setActiveIndex(index)}
                  type="button"
                >
                  <div className="gs-result-info">
                    <span className="gs-result-title">{project.event || project.project || 'Untitled'}</span>
                    <span className="gs-result-meta">
                      {project.type === 'Event' ? 'Event' : 'Project'} • {project.category} • {currency.format(project.amount || 0)}
                    </span>
                  </div>
                  <ArrowRight size={16} className="gs-result-arrow" />
                </button>
              ))}
            </div>
          ) : (
            <div className="gs-empty-state">
              <p>No matching Project or Event was found.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default GlobalSearch
