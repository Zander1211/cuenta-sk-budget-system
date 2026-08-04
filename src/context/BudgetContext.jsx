import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { useAuditLog } from './AuditLogContext'
import { useNotifications } from './NotificationContext'
import { useAuth } from './AuthContext'
import { supabase } from '../supabase/supabaseClient'

const BudgetContext = createContext(null)
const STORAGE_KEY = 'cuenta.budgetData.v4'

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
    type: row.type || 'Project',
    amount: Number(row.amount ?? row.total ?? 0),
    requestedBudget: Number(row.requested_budget ?? row.amount ?? 0),
    approvedBudget: Number(row.approved_budget ?? row.amount ?? 0),
    status: row.status || 'Approved',
    approvedAt,
    archivedAt: row.archived_at || row.archivedAt || null,
    date: row.date || row.event_date || row.eventDate || null,
    eventDate: row.event_date || row.eventDate || null,
    venue: row.venue || '',
    description: row.description || '',
    notes: row.notes || '',
    breakdown: Array.isArray(row.breakdown) ? row.breakdown : [],
    expensesBreakdown: Array.isArray(row.expenses_breakdown) ? row.expenses_breakdown : [],
    requestedBy: row.requested_by || '',
    createdBy: row.created_by || null,
    requestId: row.request_id || row.requestId || null,
    month: Number(row.month) || null,
    year: Number(row.year) || null,
    projectStatus: row.project_status || row.projectStatus || 'Ongoing',
    isAdditional: Boolean(row.is_additional ?? row.isAdditional),
    parentProjectId: row.parent_project_id || row.parentProjectId || null,
    remarks: row.remarks || '',
    receiptUrl: row.receipt_url || row.receiptUrl || null,
    receiptName: row.receipt_name || row.receiptName || '',
  }
}

function mapRequestRow(row) {
  return {
    id: String(row.id),
    type: row.type || 'Project',
    event: row.event || '',
    category: row.category || '',
    amount: Number(row.amount || 0),
    approvedAmount: Number(row.approved_amount ?? row.amount ?? 0),
    eventDate: row.event_date || null,
    venue: row.venue || '',
    description: row.description || '',
    notes: row.notes || '',
    breakdown: Array.isArray(row.breakdown) ? row.breakdown : [],
    expensesBreakdown: Array.isArray(row.expenses_breakdown) ? row.expenses_breakdown : [],
    requestedBy: row.requested_by || '',
    status: row.status || 'Pending',
    projectStatus: row.project_status || 'Pending',
    submittedAt: row.submitted_at || row.created_at,
    approvedAt: row.approved_at || null,
    rejectedAt: row.rejected_at || null,
    rejectionReason: row.rejection_reason || null,
    resubmittedAt: row.resubmitted_at || null,
    revisionHistory: Array.isArray(row.revision_history) ? row.revision_history : [],
    archivedAt: row.archived_at || null,
    archivedBy: row.archived_by || null,
    cancelledAt: row.cancelled_at || null,
    cancellationReason: row.cancellation_reason || null,
  }
}

function getInitialState() {
  const year = new Date().getFullYear();
  const defaultBudgets = Array.from({ length: 12 }, (_, i) => ({
    id: `default-${year}-${i + 1}`,
    month: i + 1,
    quarter: Math.floor(i / 3) + 1,
    year: year,
    amount: 0,
    source: '',
    createdAt: new Date().toISOString()
  }));

  if (typeof window === 'undefined') {

    return {
      budgets: defaultBudgets,
      requests: defaultRequests,
      expenses: [],
    }
  }

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (!stored) {
      return {
        budgets: defaultBudgets,
        requests: defaultRequests,
        expenses: [],
      }
    }

    const parsed = JSON.parse(stored)
    let budgets = (parsed.budgets ?? [])
      .map((item) => {
        let quarter = Number(item.quarter)
        let month = Number(item.month)
        if (!Number.isFinite(quarter) && Number.isFinite(month)) {
          quarter = Math.floor((month - 1) / 3) + 1
        } else if (!Number.isFinite(month) && Number.isFinite(quarter)) {
          month = (quarter - 1) * 3 + 1 // Default to first month of quarter if missing
        }
        const year = Number(item.year)
        if (!Number.isFinite(quarter) || !Number.isFinite(year)) {
          return null
        }
        if (quarter < 1 || quarter > 4) {
          return null
        }

        return {
          id: item.id || `${Date.now()}-${Math.random()}`,
          month,
          quarter,
          year,
          amount: Number(item.amount) || 0,
          source: item.source || '',
          createdAt: item.createdAt || new Date().toISOString(),
        }
      })
      .filter(Boolean)
      
    if (budgets.length === 0) {
      const year = new Date().getFullYear();
      for (let i = 1; i <= 12; i++) {
        budgets.push({
          id: `default-${year}-${i}`,
          month: i,
          quarter: Math.floor((i - 1) / 3) + 1,
          year,
          amount: 0,
          source: '',
          createdAt: new Date().toISOString()
        });
      }
    }
    const requests = (parsed.requests ?? defaultRequests)
      .filter(r => !r.notes?.includes('Cuenta sample seed data') && !r.description?.includes('approved expenditure for'))
      .map((item) => {
        const breakdown = Array.isArray(item.breakdown) ? item.breakdown : []
        const expensesBreakdown = Array.isArray(item.expensesBreakdown) ? item.expensesBreakdown : []
        return {
          ...item,
          amount: Number(item.amount) || 0,
          breakdown: breakdown.map((entry) => ({
            ...entry,
            quantity: Number(entry.quantity) || 0,
            unitCost: Number(entry.unitCost) || 0,
          })),
          expensesBreakdown: expensesBreakdown.map((entry) => ({
            ...entry,
            quantity: Number(entry.quantity) || 0,
            unitCost: Number(entry.unitCost) || 0,
          })),
        }
      })
    const expenses = (parsed.expenses ?? []).filter(e =>
      !e.notes?.includes('Cuenta sample seed data') &&
      !e.description?.includes('approved expenditure for') &&
      !e.receiptUrl?.includes('example-receipts.local')
    )

    return {
      budgets,
      requests,
      expenses,
    }
  } catch {
    return {
      budgets: defaultBudgets,
      requests: defaultRequests,
      expenses: [],
    }
  }
}

function BudgetProvider({ children }) {
  const { addLog } = useAuditLog()
  const { addNotification } = useNotifications()
  const { isAuthenticated, user, role } = useAuth()
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

      if (Array.isArray(data)) {
        setExpenses(data.map(mapExpenseRow))
        if (data.length === 0) {
          // An empty expenses table says nothing about budget requests.
          // Clearing requests here caused a race with loadRequestsFromSupabase.
          setExpensesSyncStatus('empty')
          return
        }
        setExpensesSyncStatus(data.length ? 'loaded' : 'empty')
      } else {
        setExpensesSyncStatus('empty')
      }
    } catch (error) {
      console.warn('Supabase expenses sync failed', error?.message || error)
      setExpensesSyncStatus('error')
    }
  }

  async function loadBudgetsFromSupabase() {
    if (typeof window === 'undefined') return

    try {
      const { data, error } = await supabase
        .from('budgets')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) {
        throw error
      }

      if (Array.isArray(data)) {
        const fetchedBudgets = data.map((item) => ({
          id: String(item.id),
          month: Number(item.month),
          quarter: Number(item.quarter),
          year: Number(item.year),
          amount: Number(item.amount),
          source: item.source || '',
          createdAt: item.created_at || new Date().toISOString(),
        }));
        
        setBudgets(() => {
          const currentYear = new Date().getFullYear();
          const mergedBudgets = [];
          
          for (let i = 1; i <= 12; i++) {
            const found = fetchedBudgets.find(b => b.month === i && b.year === currentYear);
            if (found) {
              mergedBudgets.push(found);
            } else {
              mergedBudgets.push({
                id: `default-${currentYear}-${i}`,
                month: i,
                quarter: Math.floor((i - 1) / 3) + 1,
                year: currentYear,
                amount: 0,
                source: '',
                createdAt: new Date().toISOString()
              });
            }
          }
          
          const otherYears = fetchedBudgets.filter(b => b.year !== currentYear);
          
          return [...otherYears, ...mergedBudgets].sort((a, b) => {
             if (a.year !== b.year) return b.year - a.year;
             return b.month - a.month;
          });
        });
      }
    } catch (error) {
      console.warn('Supabase budgets sync failed', error?.message || error)
    }
  }

  async function loadRequestsFromSupabase() {
    if (typeof window === 'undefined' || !isAuthenticated) return

    try {
      const { data, error } = await supabase
        .from('budget_requests')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) throw error
      if (Array.isArray(data)) setRequests(data.map(mapRequestRow))
    } catch (error) {
      console.warn('Supabase budget request sync failed', error?.message || error)
    }
  }

  function refreshExpensesFromSupabase() {
    return loadExpensesFromSupabase()
  }

  // Sync expenses and budgets from Supabase on mount and when auth state changes
  useEffect(() => {
    if (!isAuthenticated) return
    loadExpensesFromSupabase()
    loadBudgetsFromSupabase()
    loadRequestsFromSupabase()

    const refreshRequests = () => {
      if (document.visibilityState === 'visible') {
        loadRequestsFromSupabase()
      }
    }

    window.addEventListener('focus', refreshRequests)
    document.addEventListener('visibilitychange', refreshRequests)

    const channel = supabase
      .channel('budget-data-sync')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'budget_requests' },
        () => loadRequestsFromSupabase()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'expenses' },
        () => loadExpensesFromSupabase()
      )
      .subscribe()

    return () => {
      window.removeEventListener('focus', refreshRequests)
      document.removeEventListener('visibilitychange', refreshRequests)
      supabase.removeChannel(channel)
    }
  }, [isAuthenticated])

  async function addMonthlyBudget({ month, year, amount, source }) {
    const normalizedMonth = Number(month)
    const normalizedYear = Number(year)

    if (!Number.isFinite(normalizedMonth) || !Number.isFinite(normalizedYear)) {
      return
    }
    if (normalizedMonth < 1 || normalizedMonth > 12) {
      return
    }

    const quarter = Math.floor((normalizedMonth - 1) / 3) + 1;

    const id =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}`

    const newBudget = {
      month: normalizedMonth,
      quarter,
      year: normalizedYear,
      amount: Number(amount) || 0,
      source: source || '',
    }

    // Optimistically update UI
    setBudgets((prev) => {
      const existingIdx = prev.findIndex(b => b.month === normalizedMonth && b.year === normalizedYear);
      const newEntry = {
        id,
        ...newBudget,
        createdAt: new Date().toISOString(),
      };
      
      if (existingIdx !== -1) {
        const newArr = [...prev];
        newArr[existingIdx] = newEntry;
        return newArr;
      }
      return [newEntry, ...prev];
    });

    // Save to Supabase
    try {
      const { error } = await supabase.from('budgets').insert({
        month: newBudget.month,
        quarter: newBudget.quarter,
        year: newBudget.year,
        amount: newBudget.amount,
        source: newBudget.source,
      })

      if (error) {
        console.warn('Failed to save budget to Supabase:', error.message)
      } else {
        // Optionally reload to get the real DB ID
        loadBudgetsFromSupabase()
      }
    } catch (err) {
      console.warn('Failed to save budget to Supabase:', err)
    }

    addLog({
      action: `Monthly Budget Created — ${monthLabels[normalizedMonth - 1]} ${normalizedYear}`,
      actionType: 'Budget Created',
      module: 'Monthly Budget',
      recordType: 'Budget',
      recordId: id,
      description: `Set ${monthLabels[normalizedMonth - 1]} ${normalizedYear} budget to ₱${Number(amount).toLocaleString()}${source ? ` (Source: ${source})` : ''}`,
      newValue: { month: normalizedMonth, year: normalizedYear, amount: Number(amount), source: source || '' },
    })
  }

  async function approveRequest(requestId) {
    const request = requests.find((item) => item.id === requestId)
    if (!request) {
      return { error: new Error('Budget request was not found.') }
    }

    const { data, error } = await supabase.rpc('approve_budget_request', {
      p_request_id: requestId,
    })

    if (error) {
      console.error('Atomic budget approval failed:', error)
      return { error }
    }

    const approvedRequest = mapRequestRow(data.request)
    const approvedExpense = mapExpenseRow(data.expense)

    setRequests((prev) =>
      prev.map((item) => item.id === requestId ? approvedRequest : item)
    )
    setExpenses((prev) => [
      approvedExpense,
      ...prev.filter((item) => item.id !== approvedExpense.id),
    ])

    await Promise.all([
      loadRequestsFromSupabase(),
      loadExpensesFromSupabase(),
      loadBudgetsFromSupabase(),
    ])

    return { data, error: null }
  }

  function rejectRequest(requestId, reason) {
    setRequests((prev) =>
      prev.map((item) =>
        item.id === requestId
          ? {
              ...item,
              status: 'Rejected',
              projectStatus: 'Rejected',
              rejectedAt: new Date().toISOString(),
              rejectionReason: reason,
              resubmittedAt: null,
            }
          : item
      )
    )

    addLog({
      action: `Request Rejected — ${requests.find(r => r.id === requestId)?.event || requestId}`,
      actionType: 'Request Rejected',
      module: 'Budget Requests',
      recordType: 'Budget Request',
      recordId: requestId,
      description: `Rejected budget request. Reason: ${reason}`,
      previousValue: { status: requests.find(r => r.id === requestId)?.status || 'Pending' },
      newValue: { status: 'Rejected' },
      remarks: reason,
    })

    const request = requests.find((item) => item.id === requestId)
    addNotification({
      type: 'rejection',
      title: 'Budget Request Rejected',
      message: request ? `"${request.event}" was rejected. Reason: ${reason}` : `Request ${requestId} was rejected.`,
    })
  }

  function undoRejectRequest(requestId) {
    const request = requests.find((item) => item.id === requestId)
    if (!request) return

    setRequests((prev) =>
      prev.map((item) =>
        item.id === requestId
          ? {
              ...item,
              status: 'Pending',
              projectStatus: 'Pending',
              rejectedAt: null,
              rejectionReason: null,
            }
          : item
      )
    )

    addLog({
      action: `Request Restored to Pending — ${request.event}`,
      actionType: 'Request Updated',
      module: 'Budget Requests',
      recordType: 'Budget Request',
      recordId: requestId,
      description: `Restored rejected request back to Pending status`,
      previousValue: { status: 'Rejected' },
      newValue: { status: 'Pending' },
    })
  }

  function cancelApproval(requestId, reason) {
    const request = requests.find((item) => item.id === requestId)
    if (!request) return

    setRequests((prev) =>
      prev.map((item) =>
        item.id === requestId
          ? {
              ...item,
              status: 'Cancelled',
              projectStatus: 'Cancelled',
              cancelledAt: new Date().toISOString(),
              cancellationReason: reason,
            }
          : item
      )
    )

    // Archive the associated expense so it doesn't count towards the budget
    setExpenses((prev) =>
      prev.map((expense) =>
        expense.id === requestId
          ? { ...expense, status: 'Cancelled', archivedAt: new Date().toISOString() }
          : expense
      )
    )

    addLog({
      action: `Request Cancelled — ${request.event}`,
      actionType: 'Request Cancelled',
      module: 'Budget Requests',
      recordType: 'Budget Request',
      recordId: requestId,
      description: `Cancelled approval for ${request.event}. Reason: ${reason}`,
      previousValue: { status: 'Approved', projectStatus: request.projectStatus },
      newValue: { status: 'Cancelled', projectStatus: 'Cancelled' },
      remarks: reason,
    })
    addNotification({
      type: 'rejection',
      title: 'Approval Cancelled',
      message: `The approval for "${request.event}" was cancelled. Reason: ${reason}`,
    })
  }

  function archiveRequest(requestId, archivedBy = 'System') {
    const request = requests.find((item) => item.id === requestId)
    if (!request || request.archivedAt) {
      return
    }

    const now = new Date().toISOString()

    setRequests((prev) =>
      prev.map((item) =>
        item.id === requestId
          ? {
              ...item,
              archivedAt: now,
              archivedBy,
            }
          : item
      )
    )

    if (request.status === 'Approved') {
      setExpenses((prev) =>
        prev.map((expense) =>
          expense.id === requestId || expense.parentProjectId === requestId
            ? { ...expense, archivedAt: now, archivedBy }
            : expense
        )
      )
    }

    addLog({
      action: `Request Archived — ${request.event}`,
      actionType: 'Request Archived',
      module: 'Budget Requests',
      recordType: 'Budget Request',
      recordId: requestId,
      description: `Archived budget request for ${request.event}`,
      previousValue: { archivedAt: null },
      newValue: { archivedAt: now },
    })
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
              archivedBy: null,
            }
          : item
      )
    )

    if (request.status === 'Approved') {
      setExpenses((prev) =>
        prev.map((expense) =>
          expense.id === requestId || expense.parentProjectId === requestId
            ? { ...expense, archivedAt: null, archivedBy: null }
            : expense
        )
      )
    }

    addLog({
      action: `Request Restored — ${request.event}`,
      actionType: 'Request Restored',
      module: 'Budget Requests',
      recordType: 'Budget Request',
      recordId: requestId,
      description: `Restored archived budget request for ${request.event}`,
      previousValue: { archivedAt: request.archivedAt },
      newValue: { archivedAt: null },
    })
  }

  async function addRequest({
    type = 'Project',
    event,
    category,
    amount,
    eventDate,
    venue,
    description,
    notes,
    breakdown = [],
    expensesBreakdown = [],
  }) {
    const id =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}`

    const request = {
      id,
      type,
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
      expensesBreakdown: Array.isArray(expensesBreakdown)
          ? expensesBreakdown.map((entry) => ({
              ...entry,
              quantity: Number(entry.quantity) || 0,
              unitCost: Number(entry.unitCost) || 0,
            }))
          : [],
      requestedBy: role || 'SK Treasurer',
      status: 'Pending',
      projectStatus: 'Pending',
      submittedAt: new Date().toISOString(),
    }

    const { data, error } = await supabase
      .from('budget_requests')
      .insert({
        id: request.id,
        type: request.type,
        event: request.event,
        category: request.category,
        amount: request.amount,
        event_date: request.eventDate || null,
        venue: request.venue,
        description: request.description,
        notes: request.notes,
        breakdown: request.breakdown,
        expenses_breakdown: request.expensesBreakdown,
        requested_by: request.requestedBy,
        created_by: user?.id || null,
        status: request.status,
        project_status: request.projectStatus,
        submitted_at: request.submittedAt,
      })
      .select()
      .single()

    if (error) {
      console.error('Failed to save budget request to Supabase:', error)
      return { error }
    }

    const savedRequest = mapRequestRow(data)
    setRequests((prev) => [
      savedRequest,
      ...prev.filter((item) => item.id !== savedRequest.id),
    ])

    addLog({
      action: `Request Submitted — ${event}`,
      actionType: 'Request Submitted',
      module: 'Budget Requests',
      recordType: 'Budget Request',
      recordId: id,
      description: `New budget request submitted for ${event} (₱${Number(amount || 0).toLocaleString()})`,
      newValue: { event, amount: Number(amount || 0), category, status: 'Pending' },
    })
    addNotification({
      type: 'system',
      title: 'New Budget Request Pending',
      message: `Project: ${event}\nRequested: ₱${Number(amount || 0).toLocaleString()}\nDate Submitted: ${new Date().toLocaleDateString()}\nBy: SK Treasurer`,
    })

    return { data: savedRequest, error: null }
  }

  function resubmitRequest(requestId, updatedData) {
    const request = requests.find((item) => item.id === requestId)
    if (!request) return

    setRequests((prev) =>
      prev.map((item) => {
        if (item.id !== requestId) return item
        
        const revisionEntry = {
          rejectedAt: item.rejectedAt,
          rejectionReason: item.rejectionReason,
          resubmittedAt: new Date().toISOString(),
        }

        const breakdown = Array.isArray(updatedData.breakdown) ? updatedData.breakdown.map((entry) => ({
          ...entry,
          quantity: Number(entry.quantity) || 0,
          unitCost: Number(entry.unitCost) || 0,
        })) : []

        const expensesBreakdown = Array.isArray(updatedData.expensesBreakdown) ? updatedData.expensesBreakdown.map((entry) => ({
          ...entry,
          quantity: Number(entry.quantity) || 0,
          unitCost: Number(entry.unitCost) || 0,
        })) : []

        return {
          ...item,
          ...updatedData,
          amount: Number(updatedData.amount) || 0,
          breakdown,
          expensesBreakdown,
          status: 'Pending',
          projectStatus: 'Pending',
          rejectedAt: null,
          rejectionReason: null,
          resubmittedAt: revisionEntry.resubmittedAt,
          revisionHistory: [...(item.revisionHistory || []), revisionEntry]
        }
      })
    )

    addLog({
      action: `Request Resubmitted — ${updatedData.event || request.event}`,
      actionType: 'Request Updated',
      module: 'Budget Requests',
      recordType: 'Budget Request',
      recordId: requestId,
      description: `Resubmitted budget request for ${updatedData.event || request.event}`,
      previousValue: { status: 'Rejected', amount: request.amount },
      newValue: { status: 'Pending', amount: Number(updatedData.amount) || 0, event: updatedData.event || request.event },
    })
    addNotification({
      type: 'system',
      title: 'Budget Request Resubmitted',
      message: `Project: ${updatedData.event || request.event}\nResubmitted on: ${new Date().toLocaleDateString()}`,
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
        item.id === requestId || item.requestId === requestId
          ? { ...item, projectStatus: newStatus }
          : item
      )
    )

    addLog({
      action: `Status Changed — ${request.event}`,
      actionType: 'Status Changed',
      module: 'Budget Requests',
      recordType: 'Budget Request',
      recordId: requestId,
      description: `Project status updated for ${request.event}`,
      previousValue: { projectStatus: request.projectStatus },
      newValue: { projectStatus: newStatus },
    })
  }

  function updateRejectionReason(requestId, reason) {
    setRequests((prev) =>
      prev.map((item) =>
        item.id === requestId
          ? { ...item, rejectionReason: reason }
          : item
      )
    )
    addLog({
      action: `Request Updated — Rejection Reason`,
      actionType: 'Request Updated',
      module: 'Budget Requests',
      recordType: 'Budget Request',
      recordId: requestId,
      description: `Updated rejection reason for request ${requestId}`,
      newValue: { rejectionReason: reason },
    })
  }

  function updateCancellationReason(requestId, reason) {
    setRequests((prev) =>
      prev.map((item) =>
        item.id === requestId
          ? { ...item, cancellationReason: reason }
          : item
      )
    )
    addLog({
      action: `Request Updated — Cancellation Reason`,
      actionType: 'Request Updated',
      module: 'Budget Requests',
      recordType: 'Budget Request',
      recordId: requestId,
      description: `Updated cancellation reason for request ${requestId}`,
      newValue: { cancellationReason: reason },
    })
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

    addLog({
      action: `Expense Added — ${entry.event || entry.project}`,
      actionType: 'Expense Added',
      module: 'Expenses',
      recordType: 'Expense',
      recordId: id,
      description: `Added expense: ${entry.event || entry.project} (₱${Number(entry.amount || 0).toLocaleString()})`,
      newValue: { event: entry.event || entry.project, amount: Number(entry.amount || 0), category: entry.category },
    })
  }

  /**
   * Updates the receipt fields of an expense in local state.
   * This is the primary way to link a receipt after uploading,
   * since expenses are stored locally in localStorage.
   */
  function updateExpenseReceipt(expenseId, receiptUrl, receiptName) {
    setExpenses((prev) =>
      prev.map((item) =>
        item.id === expenseId
          ? { ...item, receiptUrl, receiptName, receipt_url: receiptUrl, receipt_name: receiptName }
          : item
      )
    )
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

    addLog({
      action: `Expense Archived — ${expense.event || expense.project}`,
      actionType: 'Expense Deleted',
      module: 'Expenses',
      recordType: 'Expense',
      recordId: expenseId,
      description: `Archived expense for ${expense.event || expense.project}`,
      previousValue: { archivedAt: null, status: expense.status },
      newValue: { archivedAt: new Date().toISOString() },
    })
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

    addLog({
      action: `Expense Restored — ${expense.event || expense.project}`,
      actionType: 'Expense Updated',
      module: 'Expenses',
      recordType: 'Expense',
      recordId: expenseId,
      description: `Restored archived expense for ${expense.event || expense.project}`,
      previousValue: { archivedAt: expense.archivedAt },
      newValue: { archivedAt: null },
    })
  }

  const totals = useMemo(() => {
    const totalBudget = budgets.reduce(
      (sum, item) => sum + Number(item.amount || 0),
      0
    )
    const totalExpenses = expenses.reduce(
      (sum, item) => {
        if (item.archivedAt || item.status === 'Cancelled') return sum;
        return sum + Number(item.amount || 0);
      },
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
      undoRejectRequest,
      cancelApproval,
      archiveRequest,
      restoreRequest,
      addExpense,
      archiveExpense,
      restoreExpense,
      addRequest,
      resubmitRequest,
      updateProjectStatus,
      updateRejectionReason,
      updateCancellationReason,
      updateExpenseReceipt,
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

export function useBudgetCalculations(month, year) {
  const { budgets, expenses } = useBudget()

  return useMemo(() => {
    // 1. Calculate Budget
    const filteredBudgets = budgets.filter(b => {
      if (month !== null && month !== undefined) {
        return b.month === month && b.year === year
      }
      return b.year === year
    })
    const totalBudgetAmount = filteredBudgets.reduce((sum, b) => sum + Number(b.amount || 0), 0)

    // 2. Calculate Total Deductions (Approved Requests + Additional Expenses)
    const validExpenses = expenses.filter(e => {
       if (e.archivedAt || e.status === 'Cancelled') return false
       const eDate = new Date(e.approvedAt || e.createdAt || e.eventDate || e.date)
       if (isNaN(eDate.getTime())) return false
       
       if (month !== null && month !== undefined) {
         return eDate.getMonth() + 1 === month && eDate.getFullYear() === year
       }
       return eDate.getFullYear() === year
    })

    const totalExpensesAmount = validExpenses.reduce((sum, e) => sum + Number(e.amount || 0), 0)
    const remainingBalanceAmount = totalBudgetAmount - totalExpensesAmount

    return {
      monthlyBudget: totalBudgetAmount, // backwards compat name
      totalBudget: totalBudgetAmount,
      totalExpenses: totalExpensesAmount,
      remainingBalance: remainingBalanceAmount,
      hasBudgetData: totalBudgetAmount > 0
    }
  }, [budgets, expenses, month, year])
}

export { BudgetProvider, useBudget }
