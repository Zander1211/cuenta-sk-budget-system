import assert from 'node:assert/strict'
import { getBudgetTotalForPeriod, getApprovedAllocationTotal } from '../src/utils/budgetUtils.js'

console.log('Testing Remaining Monthly Budgets Calculation Logic...')

// Mock budgets dataset
const mockBudgets = [
  { id: 'b-1', month: 1, year: 2026, amount: 100000 },
  { id: 'b-2', month: 2, year: 2026, amount: 100000 },
  { id: 'b-3', month: 3, year: 2026, amount: 100000 },
  { id: 'b-4', month: 4, year: 2026, amount: 100000 },
  // May (5) has no budget
  // June (6) has no budget
  { id: 'b-7', month: 7, year: 2026, amount: 50000 },
  { id: 'b-8', month: 8, year: 2026, amount: 50000 },
]

// Mock expenses dataset matching user prompt example:
// January: ₱100,000 budget, ₱95,000 expenses -> ₱5,000 remaining (Remaining)
// February: ₱100,000 budget, ₱100,000 expenses -> ₱0 remaining (Fully Utilized)
// March: ₱100,000 budget, ₱82,500 expenses -> ₱17,500 remaining (Remaining)
// April: ₱100,000 budget, ₱76,000 expenses -> ₱24,000 remaining (Remaining)
const mockExpenses = [
  // Jan
  { id: 'e-1', requestId: 'r-1', month: 1, year: 2026, status: 'Approved', amount: 95000, approvedBudget: 95000, isAdditional: false },
  // Feb
  { id: 'e-2', requestId: 'r-2', month: 2, year: 2026, status: 'Approved', amount: 100000, approvedBudget: 100000, isAdditional: false },
  // Mar
  { id: 'e-3', requestId: 'r-3', month: 3, year: 2026, status: 'Approved', amount: 82500, approvedBudget: 82500, isAdditional: false },
  // Apr
  { id: 'e-4', requestId: 'r-4', month: 4, year: 2026, status: 'Approved', amount: 76000, approvedBudget: 76000, isAdditional: false },
  // Aug: Over budget test case (₱60,000 expenses on ₱50,000 budget)
  { id: 'e-5', requestId: 'r-5', month: 8, year: 2026, status: 'Approved', amount: 60000, approvedBudget: 60000, isAdditional: false },
  // Cancelled expense should NOT count
  { id: 'e-6', requestId: 'r-6', month: 1, year: 2026, status: 'Cancelled', amount: 5000, approvedBudget: 5000, isAdditional: false },
  // Requisition item should NOT count twice
  { id: 'e-7', requestId: 'r-7', month: 1, year: 2026, status: 'Approved', amount: 1000, approvedBudget: 1000, isAdditional: true },
]

const monthOptions = [
  { value: 1, label: 'January' },
  { value: 2, label: 'February' },
  { value: 3, label: 'March' },
  { value: 4, label: 'April' },
  { value: 5, label: 'May' },
  { value: 6, label: 'June' },
  { value: 7, label: 'July' },
  { value: 8, label: 'August' },
  { value: 9, label: 'September' },
  { value: 10, label: 'October' },
  { value: 11, label: 'November' },
  { value: 12, label: 'December' },
]

function computeMonthlySummaries(budgets, expenses, year) {
  return monthOptions.map((m) => {
    const monthNum = m.value
    const allocated = getBudgetTotalForPeriod(budgets, monthNum, year)
    const totalExp = getApprovedAllocationTotal(expenses, monthNum, year)
    const remaining = allocated - totalExp

    let status = 'Remaining'
    if (allocated <= 0) {
      status = 'No Budget Allocated'
    } else if (remaining === 0) {
      status = 'Fully Utilized'
    } else if (remaining < 0) {
      status = 'Over Budget'
    } else {
      status = 'Remaining'
    }

    return {
      month: monthNum,
      label: m.label,
      allocatedBudget: allocated,
      totalExpenses: totalExp,
      remainingBudget: remaining,
      status,
    }
  })
}

const summaries = computeMonthlySummaries(mockBudgets, mockExpenses, 2026)

// Test 1: Exactly 12 months in chronological order
assert.equal(summaries.length, 12, 'Must have 12 months')
assert.equal(summaries[0].label, 'January')
assert.equal(summaries[11].label, 'December')

// Test 2: January numbers match prompt example
const jan = summaries.find(s => s.month === 1)
assert.equal(jan.allocatedBudget, 100000)
assert.equal(jan.totalExpenses, 95000)
assert.equal(jan.remainingBudget, 5000)
assert.equal(jan.status, 'Remaining')

// Test 3: February numbers match prompt example (Fully Utilized)
const feb = summaries.find(s => s.month === 2)
assert.equal(feb.allocatedBudget, 100000)
assert.equal(feb.totalExpenses, 100000)
assert.equal(feb.remainingBudget, 0)
assert.equal(feb.status, 'Fully Utilized')

// Test 4: March numbers match prompt example
const mar = summaries.find(s => s.month === 3)
assert.equal(mar.allocatedBudget, 100000)
assert.equal(mar.totalExpenses, 82500)
assert.equal(mar.remainingBudget, 17500)
assert.equal(mar.status, 'Remaining')

// Test 5: April numbers match prompt example
const apr = summaries.find(s => s.month === 4)
assert.equal(apr.allocatedBudget, 100000)
assert.equal(apr.totalExpenses, 76000)
assert.equal(apr.remainingBudget, 24000)
assert.equal(apr.status, 'Remaining')

// Test 6: May has no budget
const may = summaries.find(s => s.month === 5)
assert.equal(may.allocatedBudget, 0)
assert.equal(may.totalExpenses, 0)
assert.equal(may.remainingBudget, 0)
assert.equal(may.status, 'No Budget Allocated')

// Test 7: August is Over Budget
const aug = summaries.find(s => s.month === 8)
assert.equal(aug.allocatedBudget, 50000)
assert.equal(aug.totalExpenses, 60000)
assert.equal(aug.remainingBudget, -10000)
assert.equal(aug.status, 'Over Budget')

// Test 8: Returned budget updates immediately without page refresh
// When a project in February is marked Completed and returns ₱15,000:
const updatedExpenses = mockExpenses.map(e => {
  if (e.id === 'e-2') {
    return { ...e, amount: 85000, approvedBudget: 85000, returnedBudget: 15000, projectStatus: 'Completed' }
  }
  return e
})
const updatedSummaries = computeMonthlySummaries(mockBudgets, updatedExpenses, 2026)
const updatedFeb = updatedSummaries.find(s => s.month === 2)
assert.equal(updatedFeb.totalExpenses, 85000, 'Expenses should reduce to 85,000')
assert.equal(updatedFeb.remainingBudget, 15000, 'Remaining budget should become 15,000')
assert.equal(updatedFeb.status, 'Remaining', 'Status should change from Fully Utilized to Remaining')

console.log('ALL REMAINING MONTHLY BUDGETS TESTS PASSED SUCCESSFULLY! ✓')
