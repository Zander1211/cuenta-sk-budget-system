import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import RoleGate from '../RoleGate'
import { monthOptions } from '../../utils/analytics'
import YearSpinner from '../YearSpinner'

// Every role sees the same analysis: the overview charts, the drill-down
// graph pages, and the AI Insights panel. Keep this in sync with the
// `Analysis` entry in DashboardLayout's navItems — if a role is listed
// there but missing here, its nav link renders and then bounces the user
// back to /dashboard.
const ANALYSIS_ROLES = ['SK Chairman', 'SK Treasurer', 'SK Kagawad', 'Barangay Treasurer']

function Breadcrumb({ trail }) {
  return (
    <nav className="an-breadcrumb" aria-label="Breadcrumb">
      {trail.map((item, i) => {
        const last = i === trail.length - 1
        return (
          <span key={item.label} className="an-crumb">
            {item.to && !last ? (
              <Link to={item.to}>{item.label}</Link>
            ) : (
              <span aria-current={last ? 'page' : undefined}>{item.label}</span>
            )}
            {!last ? <ChevronRight size={14} className="an-crumb-sep" /> : null}
          </span>
        )
      })}
    </nav>
  )
}

// Shared analysis filter bar. Only renders the controls relevant to the page.
export function AnalysisFilterBar({
  filters,
  setFilter,
  projectOptions = [],
  categoryOptions = [],
  showView = true,
  showProject = false,
  showCategory = false,
}) {
  return (
    <div className="an-filterbar" role="group" aria-label="Analysis filters">
      {showView ? (
        <div className="an-filter">
          <span className="an-filter-label">View</span>
          <div className="an-toggle">
            <button
              type="button"
              className={filters.view === 'monthly' ? 'is-active' : ''}
              onClick={() => setFilter({ view: 'monthly' })}
            >
              Monthly
            </button>
            <button
              type="button"
              className={filters.view === 'yearly' ? 'is-active' : ''}
              onClick={() => setFilter({ view: 'yearly' })}
            >
              Yearly
            </button>
          </div>
        </div>
      ) : null}

      {filters.view === 'monthly' && showView ? (
        <label className="an-filter">
          <span className="an-filter-label">Month</span>
          <select
            className="an-select"
            value={filters.month}
            onChange={(e) => setFilter({ month: Number(e.target.value) })}
          >
            {monthOptions.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </label>
      ) : null}

      <div className="an-filter">
        <span className="an-filter-label">Year</span>
        <YearSpinner year={filters.year} onYearChange={(y) => setFilter({ year: y })} />
      </div>

      {showProject ? (
        <label className="an-filter">
          <span className="an-filter-label">Project</span>
          <select
            className="an-select"
            value={filters.project}
            onChange={(e) => setFilter({ project: e.target.value })}
          >
            <option value="all">All projects</option>
            {projectOptions.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </label>
      ) : null}

      {showCategory ? (
        <label className="an-filter">
          <span className="an-filter-label">Category</span>
          <select
            className="an-select"
            value={filters.category}
            onChange={(e) => setFilter({ category: e.target.value })}
          >
            <option value="all">All categories</option>
            {categoryOptions.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </label>
      ) : null}


    </div>
  )
}
// Page wrapper: role-guards, renders breadcrumb + title + description + filter bar.
export function AnalysisLayout({ breadcrumb, title, description, filterBar, children }) {
  return (
    <RoleGate allow={ANALYSIS_ROLES}>
      <div className="an-page">
        <header className="an-page-head">
          <Breadcrumb trail={breadcrumb} />
          <div className="an-page-title-row">
            <div>
              <h1 className="an-page-title">{title}</h1>
              {description ? <p className="an-page-desc">{description}</p> : null}
            </div>
          </div>
          {filterBar}
        </header>
        {children}
      </div>
    </RoleGate>
  )
}
