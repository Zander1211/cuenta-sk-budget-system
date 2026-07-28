import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'

// Shared, URL-synced filter state for every analysis page so filtered views can
// be refreshed / shared. A single source of truth feeds cards, charts, tables & AI.
//
// Query params: view (monthly|yearly), year, month, project, category
export function useAnalysisFilters() {
  const [searchParams, setSearchParams] = useSearchParams()

  const now = new Date()
  const view = searchParams.get('view') === 'yearly' ? 'yearly' : 'monthly'
  const year = Number(searchParams.get('year')) || now.getFullYear()
  const monthParam = Number(searchParams.get('month'))
  const month = monthParam >= 1 && monthParam <= 12 ? monthParam : now.getMonth() + 1
  const project = searchParams.get('project') || 'all'
  const category = searchParams.get('category') || 'all'

  const filters = useMemo(
    () => ({ view, year, month, project, category }),
    [view, year, month, project, category]
  )

  const setFilter = useCallback(
    (patch) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          Object.entries(patch).forEach(([key, value]) => {
            if (value === undefined || value === null || value === 'all' || value === '') {
              next.delete(key)
            } else {
              next.set(key, String(value))
            }
          })
          return next
        },
        { replace: true }
      )
    },
    [setSearchParams]
  )

  return { filters, setFilter }
}
