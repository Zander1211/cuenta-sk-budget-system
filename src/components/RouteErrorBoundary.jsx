import React from 'react'

// Without a boundary here, any render-time exception unmounts the entire React
// tree and the user just sees a blank white page with no sidebar and no clue
// what happened. This catches the throw and shows what actually broke.
class RouteErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { error: null, info: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('Route crashed:', error, info)
    this.setState({ info })
  }

  handleReload = () => {
    this.setState({ error: null, info: null })
    window.location.reload()
  }

  render() {
    if (!this.state.error) return this.props.children

    const { error, info } = this.state
    const isDev = import.meta.env?.DEV

    return (
      <div className="route-error">
        <div className="route-error-card">
          <p className="eyebrow">Something went wrong</p>
          <h2>This page failed to load</h2>
          <p className="route-error-message">
            {error?.message || 'An unexpected error occurred while rendering this page.'}
          </p>

          {isDev && info?.componentStack ? (
            <details className="route-error-details" open>
              <summary>Technical details (development only)</summary>
              <pre>{error?.stack || String(error)}</pre>
              <pre>{info.componentStack}</pre>
            </details>
          ) : null}

          <div className="route-error-actions">
            <button type="button" className="primary-button" onClick={this.handleReload}>
              Reload page
            </button>
            <a className="secondary-button" href="/dashboard">
              Back to dashboard
            </a>
          </div>
        </div>
      </div>
    )
  }
}

export default RouteErrorBoundary
