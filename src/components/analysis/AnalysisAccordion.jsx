import { ChevronDown } from 'lucide-react'

// One collapsible analytics section. The parent owns `open`, so it can enforce
// the one-panel-at-a-time rule; this component only draws the row and carries
// the disclosure semantics.
//
// The body stays in the tree whether or not the section is open, and the whole
// animation is CSS — the panel's grid row goes 0fr → 1fr. Mounting the body on
// demand would be lighter, but the panels hold recharts containers, and one
// mounted inside a collapsed panel measures a zero-height box and comes up with
// no plot area. Keeping them mounted also means each chart is drawn before the
// user ever opens its section, so a panel has its content the moment it slides
// open. It is the same amount of chart work the page did before these sections
// became collapsible.
//
// A collapsed panel is clipped, not removed, so its "view full report" button
// would still be tab-reachable. `visibility: hidden` in the stylesheet — held
// until the collapse transition finishes — takes the closed body out of the tab
// order and the accessibility tree.
export function AccordionSection({
  id,
  icon: Icon,
  title,
  description,
  meta,
  open,
  onToggle,
  children,
}) {
  const triggerId = `${id}-trigger`
  const panelId = `${id}-panel`

  return (
    <section className={`an-acc-item ${open ? 'is-open' : ''}`}>
      <h2 className="an-acc-heading">
        <button
          type="button"
          id={triggerId}
          className="an-acc-trigger"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={onToggle}
        >
          <span className="an-acc-icon" aria-hidden="true">
            <Icon size={18} />
          </span>
          <span className="an-acc-copy">
            <span className="an-acc-title">{title}</span>
            {description ? <span className="an-acc-desc">{description}</span> : null}
          </span>
          {meta ? <span className="an-acc-meta">{meta}</span> : null}
          <span className="an-acc-chevron" aria-hidden="true">
            <ChevronDown size={18} />
          </span>
        </button>
      </h2>

      <div
        id={panelId}
        role="region"
        aria-labelledby={triggerId}
        className={`an-acc-panel ${open ? 'is-expanded' : ''}`}
      >
        <div className="an-acc-panel-inner">
          <div className="an-acc-body">{children}</div>
        </div>
      </div>
    </section>
  )
}

// Wrapper for a run of AccordionSections — spacing only, but it also gives the
// group a single accessible name.
export function Accordion({ label, children }) {
  return (
    <div className="an-accordion" role="group" aria-label={label}>
      {children}
    </div>
  )
}
