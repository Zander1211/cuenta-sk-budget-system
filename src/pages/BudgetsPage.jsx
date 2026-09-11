import { lazy, Suspense } from 'react'
import { useSearchParams } from 'react-router-dom'
import BudgetAllocationPanel from './budgets/BudgetAllocationPanel'

// The analysis overview pulls in recharts and the AI hooks, so it stays out of
// the Budgets bundle until someone opens the tab.
const AnalysisOverviewPage = lazy(() => import('./analysis/AnalysisOverviewPage'))

const TABS = [
  {
    key: 'allocation',
    label: 'Budgets',
    title: 'Budget allocation',
    description: 'Set the budget for SK programs.',
  },
  {
    key: 'analysis',
    label: 'Analysis',
    title: 'Financial Analysis & AI Insights',
    description: 'Consolidated intelligence on budgets, spending velocity, category concentrations, and AI-driven risk detection.',
  },
]

function BudgetsPage() {
  // The tab lives in the URL so the Analysis breadcrumbs on the drill-down
  // pages, and the old /dashboard/analysis bookmarks, can land on it directly.
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = searchParams.get('tab') === 'analysis' ? 'analysis' : 'allocation'
  const current = TABS.find((tab) => tab.key === activeTab) || TABS[0]

  function selectTab(key) {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (key === 'allocation') next.delete('tab')
        else next.set('tab', key)
        return next
      },
      { replace: true },
    )
  }

  return (
    <>
      <header className="dashboard-header">
        <div className="header-left">
          <div>
            <p className="eyebrow">Budgets &amp; Analysis</p>
            <h1>{current.title}</h1>
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
                onClick={() => selectTab(tab.key)}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {activeTab === 'analysis' ? (
        <Suspense fallback={<p className="form-note" style={{ padding: '24px' }}>Loading analysis…</p>}>
          <AnalysisOverviewPage embedded />
        </Suspense>
      ) : (
        <BudgetAllocationPanel />
      )}
    </>
  )
}

export default BudgetsPage
