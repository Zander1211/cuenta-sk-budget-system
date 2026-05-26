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

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ budgets, requests, expenses })
      )
    }
  }, [budgets, requests, expenses])

  // Attempt to sync expenses from Supabase (read-only) on mount
  useEffect(() => {
    let mounted = true
    ;(async () => {
      if (typeof window === 'undefined') return
      try {
        const { data, error } = await supabase.from('expenses').select('*').order('created_at', { ascending: false }).limit(200)
        if (!mounted) return
        if (!error && Array.isArray(data) && data.length) {
          // map server rows into local expense shape
          const mapped = data.map((r) => ({
            id: r.id || `${Date.now()}-${Math.random()}`,
            event: r.event || r.project || r.title || '',
            project: r.project || r.event || '',
            category: r.category || r.type || '',
            amount: Number(r.amount) || 0,
            status: r.status || 'Approved',
            created_at: r.created_at || r.createdAt || new Date().toISOString(),
            receipt: r.receipt_url || r.file_path || null,
          }))
          setExpenses(mapped)
        }
      } catch (e) {
        // ignore network errors — keep local state
        console.warn('Supabase expenses sync failed', e.message || e)
      }
    })()
    return () => { mounted = false }
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
      totals,
      addQuarterBudget,
      approveRequest,
      rejectRequest,
      archiveRequest,
      restoreRequest,
      addExpense,
      addRequest,
    }),
    [
      budgets,
      requests,
      expenses,
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
