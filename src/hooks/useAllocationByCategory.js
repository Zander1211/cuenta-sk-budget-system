import { useMemo } from 'react'

/* A single hue family stepping down in lightness rather than a categorical
   rainbow, so the composition bar survives greyscale printing and every kind
   of colour vision. Categories are sorted by amount, which makes a sequential
   ramp semantically correct here rather than merely decorative. */
const RAMP = [
  'var(--pub-c1)',
  'var(--pub-c2)',
  'var(--pub-c3)',
  'var(--pub-c4)',
  'var(--pub-c5)',
  'var(--pub-c6)',
  'var(--pub-c7)',
  'var(--pub-c8)',
]

/**
 * Groups published projects by category, largest approved allocation first,
 * and returns the page totals alongside.
 *
 * @param {Array<object>} projects rows from the `public_projects` view.
 * @returns {{rows: Array<object>, totals: {approved: number, spent: number}}}
 */
export function useAllocationByCategory(projects) {
  return useMemo(() => {
    const grouped = new Map()

    for (const project of projects) {
      const category = project.category || 'Other Approved Programs'
      const entry = grouped.get(category) || {
        category,
        approved: 0,
        spent: 0,
        count: 0,
        reportedCount: 0,
      }
      entry.approved += Number(project.approved_allocation || 0)
      entry.count += 1

      // Only projects with a verified expenditure figure contribute to the
      // spend total. Treating an unreported project as zero would understate
      // every category it appears in.
      if (project.expenditure_reported === true) {
        entry.spent += Number(project.actual_expenditure || 0)
        entry.reportedCount += 1
      }

      grouped.set(category, entry)
    }

    const rows = [...grouped.values()]
      .map(row => ({ ...row, spendComplete: row.reportedCount === row.count }))
      .sort((a, b) => b.approved - a.approved)

    const totals = rows.reduce(
      (sum, row) => ({
        approved: sum.approved + row.approved,
        spent: sum.spent + row.spent,
        reportedCount: sum.reportedCount + row.reportedCount,
        count: sum.count + row.count,
      }),
      { approved: 0, spent: 0, reportedCount: 0, count: 0 },
    )

    return { rows: rows.map((row, index) => ({ ...row, color: RAMP[index % RAMP.length] })), totals }
  }, [projects])
}
