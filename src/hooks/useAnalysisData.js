import { useMemo } from 'react'
import { useBudget } from '../context/BudgetContext'
import {
  filterBudgets,
  filterExpenses,
  sumAmount,
  safeDivide,
  getPerformance,
  groupExpensesByCategory,
  groupExpensesByProject,
  groupExpensesByMonth,
  budgetByMonth,
  calculateTrend,
  calculateVariance,
  previousPeriod,
  isMissingReceipt,
  MONTHS_SHORT,
} from '../utils/analytics'

// Apply the optional project/category cross-filters on top of a period-filtered list.
function applyCrossFilters(expenses, filters) {
  return expenses.filter((e) => {
    if (filters.project && filters.project !== 'all') {
      const p = (e.project || e.event || 'Unlabeled').toString()
      if (p !== filters.project) return false
    }
    if (filters.category && filters.category !== 'all') {
      const c = (e.category || 'Uncategorized').toString()
      if (c !== filters.category) return false
    }
    return true
  })
}

// Base hook: normalizes the dataset once for the selected period.
export function useAnalysisData(filters) {
  const { budgets, expenses, requests } = useBudget()

  return useMemo(() => {
    const periodBudgets = filterBudgets(budgets, filters)
    const periodExpensesRaw = filterExpenses(expenses, filters)
    const periodExpenses = applyCrossFilters(periodExpensesRaw, filters)

    const prev = previousPeriod(filters)
    const prevExpenses = applyCrossFilters(filterExpenses(expenses, prev), prev)
    const prevBudgets = filterBudgets(budgets, prev)

    const projectOptions = Array.from(
      new Set(
        filterExpenses(expenses, filters).map((e) =>
          (e.project || e.event || 'Unlabeled').toString().trim() || 'Unlabeled'
        )
      )
    ).sort()

    const categoryOptions = Array.from(
      new Set(
        filterExpenses(expenses, filters).map((e) =>
          (e.category || 'Uncategorized').toString().trim() || 'Uncategorized'
        )
      )
    ).sort()

    const pendingRequests = (requests || []).filter(
      (r) => (!r.status || r.status === 'Pending') && !r.archivedAt
    )

    const missingReceipts = periodExpenses.filter(isMissingReceipt).length

    return {
      periodBudgets,
      periodExpenses,
      prevExpenses,
      prevBudgets,
      projectOptions,
      categoryOptions,
      pendingRequests,
      missingReceipts,
      hasAnyData:
        periodBudgets.some((b) => Number(b.amount) > 0) || periodExpenses.length > 0,
    }
  }, [budgets, expenses, requests, filters])
}

// ---------- Summary metrics (overview + reused everywhere) ----------
export function useFinancialSummary(filters) {
  const data = useAnalysisData(filters)
  return useMemo(() => {
    const totalBudget = sumAmount(data.periodBudgets)
    const totalExpenses = sumAmount(data.periodExpenses)
    const remainingBalance = totalBudget - totalExpenses
    const utilizationRate = safeDivide(totalExpenses, totalBudget) * 100
    const performance = getPerformance(utilizationRate)

    const prevTotalExpenses = sumAmount(data.prevExpenses)
    const expensesChangePct = data.prevExpenses.length
      ? safeDivide(totalExpenses - prevTotalExpenses, prevTotalExpenses) * 100
      : null

    return {
      ...data,
      totalBudget,
      totalExpenses,
      remainingBalance,
      utilizationRate,
      performance,
      prevTotalExpenses,
      expensesChangePct,
      hasBudgetData: totalBudget > 0,
    }
  }, [data])
}

// ---------- Category analysis ----------
export function useCategoryAnalysis(filters) {
  const data = useAnalysisData(filters)
  return useMemo(() => {
    const categories = groupExpensesByCategory(data.periodExpenses)
    const prevMap = new Map(
      groupExpensesByCategory(data.prevExpenses).map((c) => [c.name, c.value])
    )
    const hasPrev = data.prevExpenses.length > 0

    const withChange = categories.map((c, i) => {
      const prevValue = prevMap.get(c.name)
      const changePct =
        hasPrev && prevValue != null && prevValue > 0
          ? ((c.value - prevValue) / prevValue) * 100
          : null
      return { ...c, rank: i + 1, prevValue: prevValue ?? null, changePct, hasPrev }
    })

    const total = categories.reduce((a, c) => a + c.value, 0)
    const highest = withChange[0] || null
    const lowest = withChange.length ? withChange[withChange.length - 1] : null
    const average = withChange.length ? total / withChange.length : 0

    return { categories: withChange, total, highest, lowest, average, hasPrev, missingReceipts: data.missingReceipts }
  }, [data])
}

// ---------- Monthly trend ----------
export function useMonthlyTrend(filters) {
  const { budgets, expenses } = useBudget()
  return useMemo(() => {
    const year = filters.year
    const rows = groupExpensesByMonth(expenses, year)
    const budgetRow = budgetByMonth(budgets, year)
    const prevYearRows = groupExpensesByMonth(expenses, year - 1)

    const merged = rows.map((r, i) => ({
      ...r,
      budget: budgetRow[i],
      prevYear: prevYearRows[i].total,
    }))

    // Only months up to and including any month that has data (avoid misleading future zeros).
    const lastActive = merged.reduce((acc, r, i) => (r.total > 0 || r.count > 0 ? i : acc), -1)
    const activeRows = lastActive >= 0 ? merged.slice(0, lastActive + 1) : merged

    const totals = activeRows.map((r) => r.total)
    const trend = calculateTrend(totals)
    const nonZero = totals.filter((t) => t > 0)
    const average = nonZero.length ? nonZero.reduce((a, b) => a + b, 0) / nonZero.length : 0

    const currentMonthIndex = new Date().getMonth()
    const currentMonth =
      year === new Date().getFullYear() ? merged[currentMonthIndex] : merged[lastActive] || merged[0]
    const highestMonth = merged.reduce((max, r) => (r.total > (max?.total || 0) ? r : max), null)

    const average12 = merged.reduce((a, r) => a + r.total, 0) / 12

    return {
      rows: merged,
      activeRows,
      trend,
      average,
      average12,
      currentMonth,
      highestMonth,
      hasData: nonZero.length > 0,
    }
  }, [budgets, expenses, filters.year])
}

// ---------- Budget utilization ----------
export function useBudgetUtilization(filters) {
  const summary = useFinancialSummary(filters)
  return useMemo(() => {
    const { totalBudget, totalExpenses, remainingBalance, utilizationRate, performance } = summary

    // Project-level utilization. In this data model an approved request's allocation
    // equals its recorded expense, so we surface category-level utilization against
    // an even share of the period budget when project budgets aren't separable.
    const byProject = groupExpensesByProject(summary.periodExpenses)
    const rows = byProject.map((p) => {
      // Allocation is not separately stored per project; treat the period as the pool.
      const utilized = p.value
      const share = safeDivide(utilized, totalExpenses) * 100
      return {
        name: p.name,
        utilized,
        share,
      }
    })

    return {
      ...summary,
      utilizedBudget: totalExpenses,
      remainingBudget: remainingBalance,
      utilizationRate,
      performance,
      totalBudget,
      projectRows: rows,
    }
  }, [summary])
}

// ---------- Budget vs Actual (allocated vs approved spending) ----------
export function useBudgetVsActual(filters) {
  const { budgets, expenses } = useBudget()
  return useMemo(() => {
    const year = filters.year
    const budgetRow = budgetByMonth(budgets, year)
    const expenseRows = groupExpensesByMonth(expenses, year)

    const monthly = MONTHS_SHORT.map((label, i) => {
      const budget = budgetRow[i]
      const spending = expenseRows[i].total
      const v = calculateVariance(budget, spending)
      return {
        key: label,
        label: expenseRows[i].monthFull,
        budget,
        spending,
        variance: v.amount,
        percentUsed: v.percentUsed,
        status: v.status,
      }
    })

    // For "monthly" view restrict to the single month; else full year.
    const scoped =
      filters.view === 'monthly' ? monthly.filter((_, i) => i + 1 === filters.month) : monthly

    const rowsWithData = scoped.filter((r) => r.budget > 0 || r.spending > 0)
    const totalBudget = scoped.reduce((a, r) => a + r.budget, 0)
    const totalSpending = scoped.reduce((a, r) => a + r.spending, 0)
    const totalVariance = totalBudget - totalSpending
    const performance = getPerformance(safeDivide(totalSpending, totalBudget) * 100)

    const underCount = rowsWithData.filter((r) => r.status === 'Under Budget').length
    const overCount = rowsWithData.filter((r) => r.status === 'Over Budget').length
    const largestVariance = rowsWithData
      .slice()
      .sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance))[0] || null
    const highestUtilization = rowsWithData
      .slice()
      .sort((a, b) => b.percentUsed - a.percentUsed)[0] || null

    return {
      monthly: scoped,
      rowsWithData,
      totalBudget,
      totalSpending,
      totalVariance,
      performance,
      underCount,
      overCount,
      largestVariance,
      highestUtilization,
      hasData: rowsWithData.length > 0,
    }
  }, [budgets, expenses, filters.year, filters.view, filters.month])
}
