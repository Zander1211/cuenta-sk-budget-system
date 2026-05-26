function SectionPage({
  eyebrow,
  title,
  description,
  primaryAction,
  actions = [],
  stats = [],
  overviewEyebrow = 'Today',
  overviewTitle = 'Priority actions',
}) {
  return (
    <>
      <header className="dashboard-header">
        <div className="header-left">
          <div>
            <p className="eyebrow">{eyebrow}</p>
            <h1>{title}</h1>
            <p>{description}</p>
          </div>
        </div>
      </header>

      <section className="dashboard-content">
        {primaryAction ? (
          <div className="content-actions">
            <button className="primary-button" type="button">
              {primaryAction}
            </button>
          </div>
        ) : null}

        {actions.length ? (
          <div className="overview-card">
            <p className="eyebrow">{overviewEyebrow}</p>
            <h2>{overviewTitle}</h2>
            <ul>
              {actions.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {stats.length ? (
          <div className="stat-grid">
            {stats.map((stat) => (
              <div key={stat.label} className="stat-card">
                <span className="stat-title">{stat.label}</span>
                <span className="stat-value">{stat.value}</span>
                <span className="stat-meta">{stat.meta}</span>
              </div>
            ))}
          </div>
        ) : null}
      </section>
    </>
  )
}

export default SectionPage
