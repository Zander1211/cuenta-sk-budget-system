import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { useAuditLog } from './AuditLogContext'
import { supabase } from '../supabase/supabaseClient'

const BudgetContext = createContext(null)
const STORAGE_KEY = 'cuenta.budgetData'

const defaultRequests = []
const sampleEntries = new Set([
  'Community Skills Workshop|Training|8500',
  'Youth Sports Festival|Events|12000',
])

function mapExpenseRow(row) {
  const approvedAt =
    row.approved_at ||
    row.approvedAt ||
    row.created_at ||
    row.createdAt ||
    new Date().toISOString()

  return {
    id: row.id || `${Date.now()}-${Math.random()}`,
    event: row.event || row.project || row.title || '',
    project: row.project || row.event || '',
    category: row.category || row.type || '',
    amount: Number(row.amount ?? row.total ?? 0),
    status: row.status || 'Approved',
    approvedAt,
    date: row.date || row.event_date || row.eventDate || null,
    eventDate: row.event_date || row.eventDate || null,
    venue: row.venue || '',
    description: row.description || '',
    notes: row.notes || '',
    breakdown: Array.isArray(row.breakdown) ? row.breakdown : [],
    receiptUrl: row.receipt_url || row.receiptUrl || null,
    receiptName: row.receipt_name || row.receiptName || '',
  }
}

function buildDemoExpenses() {
  const now = new Date()
  const iso = now.toISOString()
  const shortDate = iso.slice(0, 10)

  return [
    {
      id: `demo-${now.getTime()}-1`,
      event: 'Community Cleanup Drive',
      project: 'Community Cleanup Drive',
      category: 'Environment',
      amount: 4200,
      status: 'Approved',
      approvedAt: iso,
      eventDate: shortDate,
      venue: 'Barangay Hall',
      description: 'Cleanup supplies and hauling',
      breakdown: [
        { itemName: 'Trash bags', quantity: 20, unitCost: 25 },
        { itemName: 'Gloves', quantity: 15, unitCost: 60 },
      ],
      receiptName: 'Demo receipt',
      receiptUrl: '',
    },
    {
      id: `demo-${now.getTime()}-2`,
      event: 'Youth Sports Clinic',
      project: 'Youth Sports Clinic',
      category: 'Sports',
      amount: 7800,
      status: 'Approved',
      approvedAt: iso,
      eventDate: shortDate,
      venue: 'Covered Court',
      description: 'Sports equipment and snacks',
      breakdown: [
        { itemName: 'Training cones', quantity: 12, unitCost: 120 },
        { itemName: 'Snacks', quantity: 80, unitCost: 35 },
      ],
      receiptName: 'Demo receipt',
      receiptUrl: '',
    },
  ]
}

function isSample(entry) {
  const key = `${entry.event}|${entry.category}|${Number(entry.amount)}`
  return sampleEntries.has(key)
}

function getInitialState() {
  if (typeof window === 'undefined') {
    return {
      budgets: [],
      requests: defaultRequests,
      expenses: [],
    }
  }

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (!stored) {
      return {
        budgets: [],
        requests: defaultRequests,
        expenses: [],
      }
    }

    const parsed = JSON.parse(stored)
    const budgets = parsed.budgets ?? []
    const requests = (parsed.requests ?? defaultRequests)
      .filter((item) => !isSample(item))
      .map((item) => {
        const breakdown = Array.isArray(item.breakdown) ? item.breakdown : []
        return {
          ...item,
          amount: Number(item.amount) || 0,
          breakdown: breakdown.map((entry) => ({
            ...entry,
            quantity: Number(entry.quantity) || 0,
            unitCost: Number(entry.unitCost) || 0,
          })),
        }
      })
    const expenses = (parsed.expenses ?? []).filter((item) => !isSample(item))

    return {
      budgets,
      requests,
      expenses,
    }
  } catch {
    return {
      budgets: [],
      requests: defaultRequests,
      expenses: [],
    }
  }
}

function BudgetProvider({ children }) {
  const { addLog } = useAuditLog()
  const [budgets, setBudgets] = useState(() => getInitialState().budgets)
  const [requests, setRequests] = useState(() => getInitialState().requests)
  const [expenses, setExpenses] = useState(() => getInitialState().expenses)
  const [expensesSyncStatus, setExpensesSyncStatus] = useState('idle')

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ budgets, requests, expenses })
      )
    }
  }, [budgets, requests, expenses])

  async function loadExpensesFromSupabase() {
    if (typeof window === 'undefined') return
    setExpensesSyncStatus('loading')

    try {
      const { data, error } = await supabase
        .from('expenses')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200)

      if (error) {
        throw error
      }

      if (Array.isArray(data) && data.length) {
        setExpenses(data.map(mapExpenseRow))
        setExpensesSyncStatus('loaded')
      } else {
        setExpensesSyncStatus('empty')
      }
    } catch (error) {
      console.warn('Supabase expenses sync failed', error?.message || error)
      setExpensesSyncStatus('error')
    }
  }

  function refreshExpensesFromSupabase() {
    return loadExpensesFromSupabase()
  }

  function seedDemoExpenses() {
    setExpenses(buildDemoExpenses())
    setExpensesSyncStatus('loaded')
    addLog({ action: 'Seeded demo expenses' })
  }

  // Attempt to sync expenses from Supabase (read-only) on mount
  useEffect(() => {
    loadExpensesFromSupabase()
  }, [])

  function addQuarterBudget({ quarter, amount }) {
    const id =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}`

    setBudgets((prev) => [
      {
        id,
        quarter,
        amount,
        createdAt: new Date().toISOString(),
      },
      ...prev,
    ])

    addLog({ action: `Added quarterly budget: ${quarter} (${amount})` })
  }

  function approveRequest(requestId) {
    const request = requests.find((item) => item.id === requestId)
    if (!request) {
      return
    }

    setRequests((prev) =>
      prev.map((item) =>
        item.id === requestId
          ? {
              ...item,
              status: 'Approved',
              approvedAt: new Date().toISOString(),
            }
          : item
      )
    )
    setExpenses((prev) => [
      {
        id: request.id,
        event: request.event,
        project: request.event,
        category: request.category,
        amount: request.amount,
        requestedBy: request.requestedBy,
        eventDate: request.eventDate,
        venue: request.venue,
        description: request.description,
        notes: request.notes,
        breakdown: request.breakdown,
        status: 'Approved',
        approvedAt: new Date().toISOString(),
      },
      ...prev,
    ])

    addLog({ action: `Approved budget request for ${request.event}` })
  }

  function rejectRequest(requestId, reason) {
    setRequests((prev) =>
      prev.map((item) =>
        item.id === requestId
          ? {
              ...item,
              status: 'Rejected',
              rejectedAt: new Date().toISOString(),
              rejectionReason: reason,
            }
          : item
      )
    )

    addLog({ action: `Rejected budget request ${requestId}` })
  }

  function archiveRequest(requestId) {
    const request = requests.find((item) => item.id === requestId)
    if (!request || request.archivedAt) {
      return
    }

    setRequests((prev) =>
      prev.map((item) =>
        item.id === requestId
          ? {
              ...item,
              archivedAt: new Date().toISOString(),
            }
          : item
      )
    )

    addLog({ action: `Archived budget request for ${request.event}` })
  }

  function restoreRequest(requestId) {
    const request = requests.find((item) => item.id === requestId)
    if (!request || !request.archivedAt) {
      return
    }

    setRequests((prev) =>
      prev.map((item) =>
        item.id === requestId
          ? {
              ...item,
              archivedAt: null,
            }
          : item
      )
    )

    addLog({ action: `Restored budget request for ${request.event}` })
  }

  function addRequest({
    event,
    category,
    amount,
    eventDate,
    venue,
    description,
    notes,
    breakdown = [],
  }) {
    const id =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}`

    setRequests((prev) => [
      {
        id,
        event,
        category,
        amount: Number(amount) || 0,
        eventDate,
        venue,
        description,
        notes,
        archivedAt: null,
        breakdown: Array.isArray(breakdown)
          ? breakdown.map((entry) => ({
              ...entry,
              quantity: Number(entry.quantity) || 0,
              unitCost: Number(entry.unitCost) || 0,
            }))
          : [],
        requestedBy: 'SK Treasurer',
        status: 'Pending',
        submittedAt: new Date().toISOString(),
      },
      ...prev,
    ])

    addLog({ action: `Submitted budget request for ${event}` })
  }

  function addExpense(entry) {
    const id =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}`

    setExpenses((prev) => [
      {
        id,
        status: 'Pending',
        approvedAt: new Date().toISOString(),
        ...entry,
      },
      ...prev,
    ])

    addLog({ action: `Added expense: ${entry.event || entry.project}` })
  }

  const totals = useMemo(() => {
    const totalBudget = budgets.reduce(
      (sum, item) => sum + Number(item.amount || 0),
      0
    )
    const totalExpenses = expenses.reduce(
      (sum, item) => sum + Number(item.amount || 0),
      0
    )
    return {
      totalBudget,
      totalExpenses,
      remaining: totalBudget - totalExpenses,
    }
  }, [budgets, expenses])

  const value = useMemo(
    () => ({
      budgets,
      requests,
      expenses,
      expensesSyncStatus,
      totals,
      addQuarterBudget,
      approveRequest,
      rejectRequest,
      archiveRequest,
      restoreRequest,
      addExpense,
      addRequest,
      refreshExpensesFromSupabase,
      seedDemoExpenses,
    }),
    [
      budgets,
      requests,
      expenses,
      expensesSyncStatus,
      totals,
    ]
  )

  return (
    <BudgetContext.Provider value={value}>{children}</BudgetContext.Provider>
  )
}

function useBudget() {
  const context = useContext(BudgetContext)
  if (!context) {
    throw new Error('useBudget must be used within BudgetProvider')
  }
  return context
}

export { BudgetProvider, useBudget }
