import { useMemo } from 'react'
import { useBudget } from '../context/BudgetContext'
import { getBudgetTotalForPeriod } from '../utils/budgetUtils'
import {
  filterBudgets,
  safeDivide,
  getPerformance,
  groupExpensesByCategory,
  groupExpensesByMonth,
  calculateTrend,
  calculateVariance,
  previousPeriod,
  isMissingReceipt,
  MONTHS_SHORT,
} from '../utils/analytics'
import {
  getActualExpenseRowsForApprovedRecords,
  materializeActualExpenseRows,
  summarizeApprovedBudgetFinancials,
} from '../utils/projectEventFinancials'

// Base hook: normalizes the dataset once for the selected period.
export function useAnalysisData(filters) {
  const { budgets, expenses, requests, verifiedReceiptTotals } = useBudget()

  return useMemo(() => {
    const periodBudgets = filterBudgets(budgets, filters)
    const approvedFinancials = summarizeApprovedBudgetFinancials(
      expenses,
      verifiedReceiptTotals,
      filters,
    )
    const periodExpenses = getActualExpenseRowsForApprovedRecords(
      expenses,
      verifiedReceiptTotals,
      approvedFinancials.records,
    )

    const prev = {
      ...previousPeriod(filters),
      project: filters.project,
      category: filters.category,
    }
    const previousFinancials = summarizeApprovedBudgetFinancials(
      expenses,
      verifiedReceiptTotals,
      prev,
    )
    const prevExpenses = getActualExpenseRowsForApprovedRecords(
      expenses,
      verifiedReceiptTotals,
      previousFinancials.records,
    )
    const prevBudgets = filterBudgets(budgets, prev)

    const optionFilters = { ...filters, project: 'all', category: 'all' }
    const optionRecords = summarizeApprovedBudgetFinancials(
      expenses,
      verifiedReceiptTotals,
      optionFilters,
    ).records

    const projectOptions = Array.from(
      new Set(
        optionRecords.map((e) =>
          (e.project || e.event || 'Unlabeled').toString().trim() || 'Unlabeled'
        )
      )
    ).sort()

    const categoryOptions = Array.from(
      new Set(
        optionRecords.map((e) =>
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
      approvedBudgetRecords: approvedFinancials.records,
      approvedFinancials,
      periodExpenses,
      prevExpenses,
      prevBudgets,
      previousFinancials,
      projectOptions,
      categoryOptions,
      pendingRequests,
      missingReceipts,
      hasAnyData:
        approvedFinancials.records.length > 0
        || pendingRequests.length > 0,
    }
  }, [budgets, expenses, requests, verifiedReceiptTotals, filters])
}

// ---------- Summary metrics (overview + reused everywhere) ----------
export function useFinancialSummary(filters) {
  const { budgets } = useBudget()
  const data = useAnalysisData(filters)
  return useMemo(() => {
    const totalApprovedAllocations = data.approvedFinancials.totalApprovedBudget
    // Receipt/OCR-based actual expenses — kept separate for project-level pages
    const actualExpenses = data.approvedFinancials.totalExpenses
    // Monthly Budget for the selected period
    const targetMonth = filters?.view === 'yearly' ? null : (filters?.month ?? null)
    const targetYear = filters?.year ?? null
    const monthlyBudget = getBudgetTotalForPeriod(budgets, targetMonth, targetYear)
    // Monthly Remaining Balance = Monthly Budget − Total Approved Allocations
    const remainingBalance = monthlyBudget - totalApprovedAllocations
    // totalBudget = monthlyBudget for consistent budget comparisons
    const totalBudget = monthlyBudget
    // totalExpenses = approved allocations (what's been officially committed)
    const totalExpenses = totalApprovedAllocations
    // utilizationRate = how much of the monthly budget has been allocated
    const utilizationRate = monthlyBudget > 0 ? safeDivide(totalApprovedAllocations, monthlyBudget) * 100 : 0
    const performance = getPerformance(utilizationRate)

    const prevTotalExpenses = data.previousFinancials.totalApprovedBudget
    const expensesChangePct = data.previousFinancials.records.length
      ? safeDivide(totalExpenses - prevTotalExpenses, prevTotalExpenses) * 100
      : null

    // Unused budget automatically returned by completed Projects/Events in
    // this period. The freed amounts are already reflected in
    // totalApprovedAllocations (the records were reduced at completion);
    // these figures surface the recovery itself for reporting and AI.
    const returnedRecords = data.approvedFinancials.records.filter(
      (record) => (Number(record.returnedBudget) || 0) > 0,
    )
    const returnedBudget = returnedRecords.reduce(
      (sum, record) => sum + (Number(record.returnedBudget) || 0),
      0,
    )

    return {
      ...data,
      monthlyBudget,
      totalBudget,
      totalExpenses,
      actualExpenses,
      remainingBalance,
      utilizationRate,
      performance,
      prevTotalExpenses,
      expensesChangePct,
      returnedBudget,
      returnedRecordCount: returnedRecords.length,
      hasBudgetData: monthlyBudget > 0,
    }
  }, [data, budgets, filters])
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

// ---------- Budget distribution by category ----------
export function useApprovedBudgetDistribution(filters) {
  const data = useAnalysisData(filters)
  return useMemo(() => {
    const categoryMap = new Map()

    ;(data.approvedBudgetRecords || []).forEach((r) => {
      const amount = Number(r.approvedBudget) || 0
      if (amount <= 0) return

      const category = String(r.category || 'Uncategorized').trim()
      const entry = categoryMap.get(category) || { value: 0, count: 0 }
      entry.value += amount
      entry.count += 1
      categoryMap.set(category, entry)
    })

    const distribution = Array.from(categoryMap.entries())
      .map(([name, entry]) => ({ name, value: entry.value, count: entry.count }))
      .filter((c) => c.value > 0)

    // Sort descending
    distribution.sort((a, b) => b.value - a.value)

    const total = distribution.reduce((sum, c) => sum + c.value, 0)
    const totalProjectsEvents = distribution.reduce((sum, c) => sum + c.count, 0)

    return { distribution, total, totalProjectsEvents, hasData: total > 0 }
  }, [data.approvedBudgetRecords])
}

// ---------- Monthly trend ----------
export function useMonthlyTrend(filters) {
  const { expenses, verifiedReceiptTotals } = useBudget()
  return useMemo(() => {
    const year = filters.year
    const actualExpenses = materializeActualExpenseRows(expenses, verifiedReceiptTotals)
    const rows = groupExpensesByMonth(actualExpenses, year)
    
    const budgetStats = MONTHS_SHORT.map((_, index) => (
      summarizeApprovedBudgetFinancials(
        expenses,
        verifiedReceiptTotals,
        { ...filters, view: 'monthly', month: index + 1, year },
      )
    ))
    
    const prevYearBudgetStats = MONTHS_SHORT.map((_, index) => (
      summarizeApprovedBudgetFinancials(
        expenses,
        verifiedReceiptTotals,
        { ...filters, view: 'monthly', month: index + 1, year: year - 1 },
      )
    ))

    const merged = rows.map((r, i) => {
      const budgetTotal = budgetStats[i].totalApprovedBudget
      const prevBudgetTotal = prevYearBudgetStats[i].totalApprovedBudget
      const budgetCount = budgetStats[i].records.length

      return {
        ...r,
        total: budgetTotal,
        budget: budgetTotal,
        prevYear: prevBudgetTotal,
        count: budgetCount,
        actualReceiptsTotal: r.total,
        actualReceiptsCount: r.count,
      }
    })

    // A monthly selection shows the year-to-date trajectory through that month;
    // yearly mode shows the complete active trajectory. This keeps the trend
    // meaningful while ensuring a month change actually refreshes the series.
    const lastActive = merged.reduce((acc, r, i) => (r.total > 0 || r.count > 0 || r.actualReceiptsTotal > 0 ? i : acc), -1)
    const activeRows = filters.view === 'monthly'
      ? merged.slice(0, filters.month)
      : lastActive >= 0 ? merged.slice(0, lastActive + 1) : merged

    const totals = activeRows.map((r) => r.total)
    const trend = calculateTrend(totals)
    const nonZero = totals.filter((t) => t > 0)
    const average = nonZero.length ? nonZero.reduce((a, b) => a + b, 0) / nonZero.length : 0

    const currentMonthIndex = filters.view === 'monthly' ? filters.month - 1 : new Date().getMonth()
    const currentMonth =
      filters.view === 'monthly' || year === new Date().getFullYear()
        ? merged[currentMonthIndex]
        : merged[lastActive] || merged[0]
    const highestMonth = activeRows.reduce((max, r) => (r.total > (max?.total || 0) ? r : max), null)

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
  }, [expenses, verifiedReceiptTotals, filters])
}

// ---------- Budget utilization ----------
export function useBudgetUtilization(filters) {
  const summary = useFinancialSummary(filters)
  return useMemo(() => {
    const { totalBudget, totalExpenses, remainingBalance, utilizationRate, performance } = summary

    const rows = summary.approvedBudgetRecords.map((record) => ({
      id: record.id,
      name: record.event || record.project || 'Unlabeled',
      type: record.type || 'Project',
      category: record.category || 'Uncategorized',
      allocation: record.approvedBudget,
      utilized: record.totalExpenses,
      remaining: record.remainingBudget,
      rate: record.budgetUtilization,
    }))

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

// ---------- Budget vs Actual (Monthly Budget vs Approved Budgets) ----------
export function useBudgetVsActual(filters) {
  const { budgets, expenses, verifiedReceiptTotals } = useBudget()
  return useMemo(() => {
    const year = filters.year

    const monthly = MONTHS_SHORT.map((label, i) => {
      const targetMonth = i + 1
      const monthlyBudget = getBudgetTotalForPeriod(budgets, targetMonth, year)

      const financials = summarizeApprovedBudgetFinancials(
        expenses,
        verifiedReceiptTotals,
        { ...filters, view: 'monthly', year, month: targetMonth },
      )
      
      const approvedBudgets = financials.totalApprovedBudget
      const v = calculateVariance(monthlyBudget, approvedBudgets)
      return {
        key: label,
        label: new Date(year, i, 1).toLocaleString('en-US', { month: 'long' }),
        budget: monthlyBudget,
        spending: approvedBudgets,
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
  }, [expenses, verifiedReceiptTotals, filters])
}
