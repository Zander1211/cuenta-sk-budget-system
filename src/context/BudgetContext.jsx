import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { useAuditLog } from './AuditLogContext'
import { useNotifications } from './NotificationContext'
import { supabase } from '../supabase/supabaseClient'

const BudgetContext = createContext(null)
const STORAGE_KEY = 'cuenta.budgetData.v2'

const defaultRequests = []
const monthLabels = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

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
    archivedAt: row.archived_at || row.archivedAt || null,
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
    const budgets = (parsed.budgets ?? [])
      .map((item) => {
        const month = Number(item.month)
        const year = Number(item.year)
        if (!Number.isFinite(month) || !Number.isFinite(year)) {
          return null
        }
        if (month < 0 || month > 11) {
          return null
        }

        return {
          id: item.id || `${Date.now()}-${Math.random()}`,
          month,
          year,
          amount: Number(item.amount) || 0,
          createdAt: item.createdAt || new Date().toISOString(),
        }
      })
      .filter(Boolean)
    const requests = (parsed.requests ?? defaultRequests).map((item) => {
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
    const expenses = parsed.expenses ?? []

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
  const { addNotification } = useNotifications()
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


  // Attempt to sync expenses from Supabase (read-only) on mount
  useEffect(() => {
    loadExpensesFromSupabase()
  }, [])

  function addMonthlyBudget({ month, year, amount }) {
    const normalizedMonth = Number(month)
    const normalizedYear = Number(year)

    if (!Number.isFinite(normalizedMonth) || !Number.isFinite(normalizedYear)) {
      return
    }
    if (normalizedMonth < 0 || normalizedMonth > 11) {
      return
    }

    const id =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}`

    setBudgets((prev) => [
      {
        id,
        month: normalizedMonth,
        year: normalizedYear,
        amount: Number(amount) || 0,
        createdAt: new Date().toISOString(),
      },
      ...prev,
    ])

    const monthLabel = monthLabels[normalizedMonth] || `Month ${normalizedMonth + 1}`
    addLog({
      action: `Added monthly budget: ${monthLabel} ${normalizedYear} (${amount})`,
    })
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
              projectStatus: 'Ongoing',
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
        projectStatus: 'Ongoing',
        approvedAt: new Date().toISOString(),
      },
      ...prev,
    ])

    addLog({ action: `Approved budget request for ${request.event}` })
    addNotification({
      type: 'approval',
      title: 'Budget Request Approved',
      message: `Project: ${request.event}\nApproved: ₱${Number(request.amount).toLocaleString()}\nDate Approved: ${new Date().toLocaleDateString()}\nStatus: Approved`,
    })
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

    const request = requests.find((item) => item.id === requestId)
    addNotification({
      type: 'rejection',
      title: 'Budget Request Rejected',
      message: request ? `"${request.event}" was rejected. Reason: ${reason}` : `Request ${requestId} was rejected.`,
    })
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
        projectStatus: 'Pending',
        submittedAt: new Date().toISOString(),
      },
      ...prev,
    ])

    addLog({ action: `Submitted budget request for ${event}` })
    addNotification({
      type: 'system',
      title: 'New Budget Request Pending',
      message: `Project: ${event}\nRequested: ₱${Number(amount || 0).toLocaleString()}\nDate Submitted: ${new Date().toLocaleDateString()}\nBy: SK Treasurer`,
    })
  }

  function updateProjectStatus(requestId, newStatus) {
    const validStatuses = ['Pending', 'Ongoing', 'Completed']
    if (!validStatuses.includes(newStatus)) return

    const request = requests.find((item) => item.id === requestId)
    if (!request) return

    setRequests((prev) =>
      prev.map((item) =>
        item.id === requestId
          ? { ...item, projectStatus: newStatus }
          : item
      )
    )

    setExpenses((prev) =>
      prev.map((item) =>
        item.id === requestId
          ? { ...item, projectStatus: newStatus }
          : item
      )
    )

    addLog({ action: `Updated project status for ${request.event} to ${newStatus}` })
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
        archivedAt: null,
        ...entry,
      },
      ...prev,
    ])

    addLog({ action: `Added expense: ${entry.event || entry.project}` })
  }

  function archiveExpense(expenseId) {
    const expense = expenses.find((item) => item.id === expenseId)
    if (!expense || expense.archivedAt) {
      return
    }

    setExpenses((prev) =>
      prev.map((item) =>
        item.id === expenseId
          ? {
              ...item,
              archivedAt: new Date().toISOString(),
            }
          : item
      )
    )

    addLog({ action: `Archived expense for ${expense.event || expense.project}` })
  }

  function restoreExpense(expenseId) {
    const expense = expenses.find((item) => item.id === expenseId)
    if (!expense || !expense.archivedAt) {
      return
    }

    setExpenses((prev) =>
      prev.map((item) =>
        item.id === expenseId
          ? {
              ...item,
              archivedAt: null,
            }
          : item
      )
    )

    addLog({ action: `Restored expense for ${expense.event || expense.project}` })
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
      addMonthlyBudget,
      approveRequest,
      rejectRequest,
      archiveRequest,
      restoreRequest,
      addExpense,
      archiveExpense,
      restoreExpense,
      addRequest,
      updateProjectStatus,
      refreshExpensesFromSupabase,
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
