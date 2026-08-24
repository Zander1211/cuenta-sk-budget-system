import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Landmark,
  Lock,
  Menu,
  Receipt,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react'
import { getPublicTransparencyData } from '../services/publicTransparencyService'
import { AllocationComposition, SpendComparison } from '../components/transparency/AllocationCharts'
import { useAllocationByCategory } from '../hooks/useAllocationByCategory'
import { useScrollReveal } from '../hooks/useScrollReveal'
import skLogo from '../assets/cuenta-logo.png'
import './PublicTransparencyPage.css'

const peso = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 })
const money = value => peso.format(Number(value) || 0)

const monthYear = value =>
  value
    ? new Intl.DateTimeFormat('en-PH', { month: 'short', year: 'numeric' }).format(new Date(`${value}T00:00:00`))
    : 'To be announced'

const NAV_LINKS = [
  ['#home', 'Home'],
  ['#budget', 'Budget Allocation'],
  ['#projects', 'Completed Projects'],
  ['#about', 'About'],
]

function Header() {
  const [open, setOpen] = useState(false)
  return (
    <header className="public-header">
      <nav className="public-nav" aria-label="Public navigation">
        <a className="public-brand" href="#home">
          <img className="public-brand-logo" src={skLogo} alt="Sangguniang Kabataan logo" />
          <span className="public-brand-copy">
            <strong>CUENTA</strong>
            <small>SK Financial Transparency</small>
          </span>
        </a>
        <button
          type="button"
          className="public-menu"
          onClick={() => setOpen(value => !value)}
          aria-expanded={open}
          aria-label={open ? 'Close navigation' : 'Open navigation'}
        >
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
        <div className={`public-links ${open ? 'is-open' : ''}`}>
          {NAV_LINKS.map(([href, label]) => (
            <a key={href} href={href} onClick={() => setOpen(false)}>
              {label}
            </a>
          ))}
          <Link className="staff-login" to="/login">
            Get Started
          </Link>
        </div>
      </nav>
    </header>
  )
}

function SectionHead({ title, copy }) {
  return (
    <div className="pub-section-head pub-reveal">
      <h2>{title}</h2>
      {copy && <p>{copy}</p>}
    </div>
  )
}

function Empty({ children }) {
  return (
    <div className="pub-empty">
      <ShieldCheck aria-hidden="true" />
      <h3>{children}</h3>
      <p>Please check again once verified information becomes available.</p>
    </div>
  )
}

function ProjectCard({ project }) {
  const approved = Number(project.approved_allocation) || 0

  // Expenditure is null until a verified receipt exists for the project.
  // "Not yet reported" and "nothing was spent" are different claims, and on a
  // completed project the second one is an accusation, so they never share a
  // rendering.
  const reported = project.expenditure_reported === true
  const spent = reported ? Number(project.actual_expenditure) || 0 : null
  const utilization = reported ? Math.max(0, Number(project.progress_percent) || 0) : null
  const isOver = reported && approved > 0 && spent > approved

  return (
    <article className="project-card pub-reveal">
      <div className="project-card-top">
        <span className="project-category">{project.category}</span>
        <b className="project-status">
          <CheckCircle2 aria-hidden="true" />
          {project.status}
        </b>
      </div>

      <h3>{project.name}</h3>
      <p className="project-purpose">{project.description || 'No public project description provided.'}</p>

      <dl className="project-financials">
        <div>
          <dt>Approved</dt>
          <dd className="num">{money(approved)}</dd>
        </div>
        <div>
          <dt>Spent</dt>
          <dd className={reported ? 'num' : 'is-unreported'}>
            {reported ? money(spent) : 'Not yet reported'}
          </dd>
        </div>
        <div>
          <dt>{isOver ? 'Over by' : 'Remaining'}</dt>
          <dd className={reported ? 'num' : 'is-unreported'}>
            {reported ? money(Math.abs(approved - spent)) : 'Not yet reported'}
          </dd>
        </div>
      </dl>

      {reported ? (
        <div className={`util ${isOver ? 'util--over' : ''}`}>
          <div className="util-head">
            <span>Budget utilized</span>
            <b className="num">{Math.round(utilization)}%</b>
          </div>
          <div
            className="util-track"
            role="meter"
            aria-valuenow={Math.round(utilization)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Budget utilized for ${project.name}`}
          >
            <div className="util-fill" style={{ width: `${Math.min(100, utilization)}%` }} />
          </div>
          {isOver && (
            <span className="util-note">
              <AlertTriangle aria-hidden="true" />
              Spending exceeded the approved allocation
            </span>
          )}
        </div>
      ) : (
        <p className="util-pending">
          <Receipt aria-hidden="true" />
          No verified receipts have been published for this project yet.
        </p>
      )}

      <div className="project-meta">
        <span>
          <CalendarDays aria-hidden="true" />
          {monthYear(project.implementation_start)}
          {project.implementation_end ? ` to ${monthYear(project.implementation_end)}` : ''}
        </span>
        {project.target_beneficiaries && (
          <span>
            <Users aria-hidden="true" />
            {project.target_beneficiaries}
          </span>
        )}
      </div>

      {project.progress_update && (
        <p className="progress-update">
          <b>Progress:</b> {project.progress_update}
        </p>
      )}
    </article>
  )
}

function LoadingState() {
  return (
    <div className="pub-loading" aria-live="polite" aria-busy="true">
      <span className="sr-only">Loading transparency information</span>
      <div className="pub-skeleton pub-skeleton--panel" />
      <div className="pub-skeleton--grid">
        {[1, 2, 3].map(key => (
          <div key={key} className="pub-skeleton pub-skeleton--card" />
        ))}
      </div>
    </div>
  )
}

export default function PublicTransparencyPage() {
  const [state, setState] = useState({ loading: true, error: '', projects: [] })

  useEffect(() => {
    let active = true
    getPublicTransparencyData()
      .then(({ projects }) => active && setState({ loading: false, error: '', projects }))
      .catch(() => active && setState({ loading: false, error: 'Transparency information could not be loaded.', projects: [] }))
    return () => {
      active = false
    }
  }, [])

  const { rows, totals } = useAllocationByCategory(state.projects)
  const revealRef = useScrollReveal(state)

  const lastUpdated = state.projects
    .map(project => project.last_updated)
    .filter(Boolean)
    .sort()
    .at(-1)

  return (
    <div className="public-portal" ref={revealRef}>
      <a className="pub-skip" href="#budget">
        Skip to the budget figures
      </a>
      <Header />

      <main id="home">
        <section className="pub-container public-hero">
          <div>
            <span className="hero-badge">
              <ShieldCheck size={16} aria-hidden="true" />
              Verified completed projects
            </span>
            <h1>
              See where your <em>SK budget went.</em>
            </h1>
            <p className="hero-sub">
              Approved allocations, actual spending and results for every completed project, published in full.
            </p>
            <div className="hero-actions">
              <a className="pub-btn pub-btn--primary" href="#budget">
                View budget allocation
                <ArrowRight size={18} aria-hidden="true" />
              </a>
              <a className="pub-btn" href="#projects">
                View completed projects
              </a>
            </div>
          </div>

          <div className="hero-figure">
            <Landmark aria-hidden="true" />
            <dl>
              <dt>Completed project allocations</dt>
              <dd className="num">{money(totals.approved)}</dd>
            </dl>
            <p className="hero-figure-note">
              {state.projects.length} completed project{state.projects.length === 1 ? '' : 's'} across {rows.length}{' '}
              categor{rows.length === 1 ? 'y' : 'ies'}
            </p>
            {lastUpdated && (
              <p className="hero-stamp">
                <CalendarDays size={15} aria-hidden="true" />
                Updated {new Date(lastUpdated).toLocaleDateString('en-PH', { dateStyle: 'medium' })}
              </p>
            )}
          </div>
        </section>

        {state.loading ? (
          <div className="pub-container pub-section">
            <LoadingState />
          </div>
        ) : state.error ? (
          <div className="pub-container pub-section">
            <div className="pub-error" role="alert">
              <AlertTriangle aria-hidden="true" />
              <h2>Transparency information could not be loaded.</h2>
              <p>The published records are temporarily unavailable. Your connection and data are unaffected.</p>
              <button type="button" className="pub-btn pub-btn--primary" onClick={() => window.location.reload()}>
                Try again
              </button>
            </div>
          </div>
        ) : (
          <>
            <section className="pub-section" id="budget">
              <div className="pub-container">
                <SectionHead
                  title="Where the approved budget was allocated"
                  copy="Every completed project grouped by category. The bar shows each category's share of the published total; the list and table below give the exact figures."
                />
                {rows.length ? (
                  <div className="pub-reveal">
                    <AllocationComposition rows={rows} totals={totals} />
                    {totals.reportedCount > 0 ? (
                      <>
                        <SectionHead
                          title="Approved against actually spent"
                          copy="Approved allocation is a ceiling, not a receipt. Spending shown here is the total of receipts that staff have verified against the original documents."
                        />
                        <SpendComparison rows={rows} />
                      </>
                    ) : null}
                  </div>
                ) : (
                  <Empty>No budget allocations have been published yet.</Empty>
                )}
              </div>
            </section>

            <section className="pub-section pub-section--tint" id="projects">
              <div className="pub-container">
                <SectionHead
                  title="How approved funds were used"
                  copy="Only completed projects appear here. Approved allocation and actual expenditure are always shown separately, never merged into a single figure."
                />
                {state.projects.length ? (
                  <div className="project-grid">
                    {state.projects.map(project => (
                      <ProjectCard key={project.id} project={project} />
                    ))}
                  </div>
                ) : (
                  <Empty>No completed projects have been published yet.</Empty>
                )}
              </div>
            </section>

            <section className="pub-section" id="about">
              <div className="pub-container about-layout">
                <div className="about-copy pub-reveal">
                  <h2>Transparency without public accounts</h2>
                  <p>
                    Residents get read-only access to information the council has deliberately published. No sign-up, no
                    account, no request form. What you see here is what has been reviewed, approved and completed.
                  </p>
                  <p>
                    Staff records and working documents stay inside the system. Publishing a project is an explicit step,
                    not a side effect of recording it.
                  </p>
                </div>

                <div className="about-ledger pub-reveal">
                  <h3>What is published, and what is not</h3>
                  <ul>
                    <li data-kind="shown">
                      <CheckCircle2 aria-hidden="true" />
                      <span>
                        <b>Published:</b> project name, purpose, category, approved allocation, the total of verified
                        receipts, implementation dates, beneficiaries and progress notes.
                      </span>
                    </li>
                    <li data-kind="hidden">
                      <Lock aria-hidden="true" />
                      <span>
                        <b>Never published:</b> the receipt documents themselves, internal notes, workflow comments,
                        staff and member personal information, and payroll records. Only the total is shown, never the
                        individual receipts behind it.
                      </span>
                    </li>
                    <li data-kind="hidden">
                      <Lock aria-hidden="true" />
                      <span>
                        <b>Not yet published:</b> projects still in progress or awaiting approval. They appear only once
                        completed and verified.
                      </span>
                    </li>
                  </ul>
                </div>
              </div>
            </section>
          </>
        )}
      </main>

      <footer className="public-footer">
        <div className="pub-container">
          <div>
            <strong>Cuenta, SK Financial Management System</strong>
            <p>
              Approved allocation is not the same as actual expenditure. Only completed, verified projects appear on this
              page.
            </p>
          </div>
          {lastUpdated && (
            <p className="footer-stamp">
              Last data update
              <br />
              {new Date(lastUpdated).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })}
            </p>
          )}
        </div>
      </footer>
    </div>
  )
}
