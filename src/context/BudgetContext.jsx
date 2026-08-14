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
  const { isAuthenticated, user, role, profileName } = useAuth()
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

  async function refreshAllBudgetData() {
    // Reload from localStorage first (rollback writes here before calling this)
    try {
      const stored = getInitialState()
      if (stored) {
        setBudgets(stored.budgets || [])
        setRequests(stored.requests || [])
        setExpenses(stored.expenses || [])
      }
    } catch (e) {
      console.warn('Could not reload from localStorage:', e)
    }

    // Then reload authoritative data from Supabase
    if (isAuthenticated) {
      await Promise.allSettled([
        loadExpensesFromSupabase(),
        loadBudgetsFromSupabase(),
        loadRequestsFromSupabase(),
      ])
    }
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

    const handleRollbackSync = () => {
      refreshAllBudgetData()
    }

    window.addEventListener('focus', refreshRequests)
    document.addEventListener('visibilitychange', refreshRequests)
    window.addEventListener('cuenta:rollback-complete', handleRollbackSync)

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
      window.removeEventListener('cuenta:rollback-complete', handleRollbackSync)
      supabase.removeChannel(channel)
    }
  }, [isAuthenticated])

  async function addMonthlyBudget({ month, year, amount, source }) {
    const normalizedMonth = Number(month)
    const normalizedYear = Number(year)
    const normalizedAmount = Number(amount) || 0

    if (!Number.isFinite(normalizedMonth) || !Number.isFinite(normalizedYear)) {
      return
    }
    if (normalizedMonth < 1 || normalizedMonth > 12) {
      return
    }

    const quarter = Math.floor((normalizedMonth - 1) / 3) + 1

    const id =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}`

    const newBudget = {
      id,
      month: normalizedMonth,
      quarter,
      year: normalizedYear,
      amount: normalizedAmount,
      source: source || '',
      createdAt: new Date().toISOString(),
    }

    // Optimistically update UI
    setBudgets((prev) => {
      const existingIdx = prev.findIndex(
        (b) => Number(b.month) === normalizedMonth && Number(b.year) === normalizedYear
      )
      if (existingIdx !== -1) {
        const newArr = [...prev]
        newArr[existingIdx] = { ...newArr[existingIdx], ...newBudget }
        return newArr
      }
      return [newBudget, ...prev]
    })

    try {
      const { data: existingBudgets, error: fetchError } = await supabase
        .from('budgets')
        .select('id')
        .eq('month', normalizedMonth)
        .eq('year', normalizedYear)

      if (fetchError) throw fetchError

      if (existingBudgets && existingBudgets.length > 0) {
        // Update the first matching budget
        const { error: updateError } = await supabase
          .from('budgets')
          .update({
            amount: normalizedAmount,
            source: source || '',
          })
          .eq('id', existingBudgets[0].id)
          
        if (updateError) throw updateError
      } else {
        // Insert new budget
        const { error: insertError } = await supabase
          .from('budgets')
          .insert({
            month: normalizedMonth,
            quarter,
            year: normalizedYear,
            amount: normalizedAmount,
            source: source || '',
          })
          
        if (insertError) throw insertError
      }
    } catch (err) {
      console.warn('Failed to save monthly budget to Supabase:', err)
    }

    addLog({
      action: `Monthly Budget Created — ${monthLabels[normalizedMonth - 1]} ${normalizedYear}`,
      actionType: 'Budget Created',
      module: 'Monthly Budget',
      recordType: 'Budget',
      recordId: `${normalizedYear}-${normalizedMonth}`,
      description: `Set ${monthLabels[normalizedMonth - 1]} ${normalizedYear} budget to ₱${normalizedAmount.toLocaleString()}${source ? ` (Source: ${source})` : ''}`,
      newValue: { month: normalizedMonth, year: normalizedYear, amount: normalizedAmount, source: source || '' },
    })
  }

  async function approveRequest(requestId) {
    try {
      const request = requests.find((item) => String(item.id) === String(requestId))
      if (!request) {
        return { error: new Error('Budget request was not found.') }
      }

      const approvedAt = new Date().toISOString()
      const approvedAmount = Number(request.approvedAmount || request.amount || 0)
      const effectiveDate = request.eventDate || approvedAt.split('T')[0]
      const effectiveMonth = new Date(effectiveDate).getMonth() + 1
      const effectiveYear = new Date(effectiveDate).getFullYear()
      const requestType = request.type || 'Project'
      const actorName = profileName || user?.user_metadata?.full_name || 'SK Chairman'
      const actorRole = role || 'SK Chairman'

      let approvedRequest = null
      let approvedExpense = null

      // Attempt 1: Call atomic stored procedure
      let rpcSucceeded = false
      try {
        const { data, error } = await supabase.rpc('approve_budget_request', {
          p_request_id: requestId,
        })

        if (!error && data?.request && data?.expense) {
          approvedRequest = mapRequestRow(data.request)
          approvedExpense = mapExpenseRow(data.expense)
          rpcSucceeded = true
        } else if (error) {
          console.warn('Atomic budget approval RPC error (falling back to direct mutation):', error)
        }
      } catch (rpcErr) {
        console.warn('Atomic budget approval RPC exception (falling back to direct mutation):', rpcErr)
      }

      // Attempt 2: Direct Supabase update fallback if RPC failed or returned error
      if (!rpcSucceeded) {
        console.log('Executing direct database approval fallback for request:', requestId)

        // 1. Update budget_requests table
        const { data: updatedReq, error: reqErr } = await supabase
          .from('budget_requests')
          .update({
            status: 'Approved',
            project_status: 'Ongoing',
            approved_amount: approvedAmount,
            approved_at: approvedAt,
            rejected_at: null,
            rejection_reason: null,
            updated_at: approvedAt,
          })
          .eq('id', requestId)
          .select('*')
          .single()

        if (reqErr) {
          console.error('Failed to update budget_requests:', reqErr)
          return { error: reqErr }
        }

        // 2. Insert into expenses destination table
        const newExpensePayload = {
          request_id: requestId,
          event: request.event || 'Approved Budget',
          project: request.event || 'Approved Budget',
          category: request.category || '',
          type: requestType,
          amount: approvedAmount,
          requested_budget: Number(request.amount || 0),
          approved_budget: approvedAmount,
          status: 'Approved',
          approved_at: approvedAt,
          date: effectiveDate,
          event_date: request.eventDate || null,
          month: effectiveMonth,
          year: effectiveYear,
          venue: request.venue || '',
          description: request.description || '',
          notes: request.notes || '',
          breakdown: Array.isArray(request.breakdown) ? request.breakdown : [],
          expenses_breakdown: Array.isArray(request.expensesBreakdown) ? request.expensesBreakdown : [],
          requested_by: request.requestedBy || '',
          project_status: 'Ongoing',
          is_additional: false,
          created_at: approvedAt,
          updated_at: approvedAt,
        }

        const { data: insertedExp, error: expErr } = await supabase
          .from('expenses')
          .upsert(newExpensePayload, { onConflict: 'request_id' })
          .select('*')
          .single()

        if (expErr) {
          console.warn('Upsert expense failed, trying direct insert:', expErr)
          const { data: insertedExpDirect, error: expInsertErr } = await supabase
            .from('expenses')
            .insert(newExpensePayload)
            .select('*')
            .single()

          if (expInsertErr) {
            console.error('Failed to insert expense destination record:', expInsertErr)
          } else {
            approvedExpense = mapExpenseRow(insertedExpDirect)
          }
        } else {
          approvedExpense = mapExpenseRow(insertedExp)
        }

        approvedRequest = mapRequestRow(
          updatedReq || {
            ...request,
            status: 'Approved',
            projectStatus: 'Ongoing',
            approvedAmount,
            approvedAt,
          }
        )

        // 3. Insert into audit_trail
        try {
          await supabase.from('audit_trail').insert({
            user_id: user?.id || null,
            user_name: actorName,
            user_role: actorRole,
            action: `Request Approved — ${request.event}`,
            action_type: 'Request Approved',
            module: 'Budget Requests',
            record_type: 'Budget Request',
            record_id: String(requestId),
            description: `Approved ${requestType.toLowerCase()} budget request for "${request.event}" (₱${approvedAmount.toLocaleString()})`,
            previous_value: { status: 'Pending', projectStatus: 'Pending' },
            new_value: {
              status: 'Approved',
              projectStatus: 'Ongoing',
              type: requestType,
              approvedBudget: approvedAmount,
            },
            status: 'Success',
          })
        } catch (auditErr) {
          console.warn('Failed to insert audit trail to database:', auditErr)
        }

        // 4. Insert into notifications
        try {
          await supabase.from('notifications').insert({
            type: 'approval',
            title: 'Budget Request Approved',
            message: `${requestType}: ${request.event}\nApproved: ₱${approvedAmount.toLocaleString()}`,
            actor_id: user?.id || null,
            actor_role: actorRole,
            recipient_role: 'SK Treasurer',
            request_id: requestId,
          })
        } catch (notifErr) {
          console.warn('Failed to insert notification to database:', notifErr)
        }
      }

      // Fallback if expense object mapping is somehow still null
      if (!approvedExpense) {
        approvedExpense = mapExpenseRow({
          id: `${Date.now()}`,
          request_id: requestId,
          event: request.event,
          project: request.event,
          category: request.category,
          type: requestType,
          amount: approvedAmount,
          status: 'Approved',
          approved_at: approvedAt,
          date: effectiveDate,
          month: effectiveMonth,
          year: effectiveYear,
        })
      }

      if (!approvedRequest) {
        approvedRequest = {
          ...request,
          status: 'Approved',
          projectStatus: 'Ongoing',
          approvedAmount,
          approvedAt,
        }
      }

      // Update in-memory state immediately so UI refreshes instantaneously
      setRequests((prev) =>
        prev.map((item) => String(item.id) === String(requestId) ? approvedRequest : item)
      )
      setExpenses((prev) => [
        approvedExpense,
        ...prev.filter(
          (item) => String(item.requestId) !== String(requestId) && String(item.id) !== String(approvedExpense.id)
        ),
      ])

      // Add local audit log
      addLog({
        action: `Request Approved — ${request.event}`,
        actionType: 'Request Approved',
        module: 'Budget Requests',
        recordType: 'Budget Request',
        recordId: requestId,
        description: `Approved ${requestType.toLowerCase()} budget request for "${request.event}" (₱${approvedAmount.toLocaleString()})`,
        previousValue: { status: 'Pending' },
        newValue: { status: 'Approved' },
      })

      // Add local toast notification
      addNotification({
        type: 'system',
        title: 'Budget Request Approved',
        message: `"${request.event}" has been approved successfully.`,
      })

      // Background reload from Supabase to guarantee state freshness
      Promise.all([
        loadRequestsFromSupabase(),
        loadExpensesFromSupabase(),
        loadBudgetsFromSupabase(),
      ]).catch((err) => console.warn('Background Supabase refresh warning:', err))

      return { data: { request: approvedRequest, expense: approvedExpense }, error: null }
    } catch (err) {
      console.error('Exception in approveRequest:', err)
      return { error: err }
    }
  }

  async function rejectRequest(requestId, reason) {
    const rejectedAt = new Date().toISOString()
    const request = requests.find((item) => String(item.id) === String(requestId))
    const actorName = profileName || user?.user_metadata?.full_name || 'SK Chairman'
    const actorRole = role || 'SK Chairman'

    setRequests((prev) =>
      prev.map((item) =>
        String(item.id) === String(requestId)
          ? {
              ...item,
              status: 'Rejected',
              projectStatus: 'Rejected',
              rejectedAt: rejectedAt,
              rejectionReason: reason,
              resubmittedAt: null,
            }
          : item
      )
    )

    try {
      await supabase
        .from('budget_requests')
        .update({
          status: 'Rejected',
          project_status: 'Rejected',
          rejected_at: rejectedAt,
          rejection_reason: reason,
          resubmitted_at: null,
          updated_at: rejectedAt,
        })
        .eq('id', requestId)
    } catch (err) {
      console.warn('Failed to update rejection in Supabase:', err)
    }

    try {
      await supabase.from('audit_trail').insert({
        user_id: user?.id || null,
        user_name: actorName,
        user_role: actorRole,
        action: `Request Rejected — ${request?.event || requestId}`,
        action_type: 'Request Rejected',
        module: 'Budget Requests',
        record_type: 'Budget Request',
        record_id: String(requestId),
        description: `Rejected budget request for "${request?.event || requestId}". Reason: ${reason}`,
        previous_value: { status: request?.status || 'Pending' },
        new_value: { status: 'Rejected' },
        remarks: reason,
        status: 'Success',
      })
    } catch (auditErr) {
      console.warn('Failed to insert audit log for rejection:', auditErr)
    }

    try {
      await supabase.from('notifications').insert({
        type: 'rejection',
        title: 'Budget Request Rejected',
        message: request ? `"${request.event}" was rejected. Reason: ${reason}` : `Request was rejected.`,
        actor_id: user?.id || null,
        actor_role: actorRole,
        recipient_role: 'SK Treasurer',
        request_id: requestId,
      })
    } catch (notifErr) {
      console.warn('Failed to insert notification for rejection:', notifErr)
    }

    addLog({
      action: `Request Rejected — ${request?.event || requestId}`,
      actionType: 'Request Rejected',
      module: 'Budget Requests',
      recordType: 'Budget Request',
      recordId: requestId,
      description: `Rejected budget request. Reason: ${reason}`,
      previousValue: { status: request?.status || 'Pending' },
      newValue: { status: 'Rejected' },
      remarks: reason,
    })

    addNotification({
      type: 'rejection',
      title: 'Budget Request Rejected',
      message: request ? `"${request.event}" was rejected. Reason: ${reason}` : `Request ${requestId} was rejected.`,
    })
  }

  function undoRejectRequest(requestId) {
    const request = requests.find((item) => String(item.id) === String(requestId))
    if (!request) return

    setRequests((prev) =>
      prev.map((item) =>
        String(item.id) === String(requestId)
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
    const request = requests.find((item) => String(item.id) === String(requestId))
    if (!request) return

    setRequests((prev) =>
      prev.map((item) =>
        String(item.id) === String(requestId)
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
    const request = requests.find((item) => String(item.id) === String(requestId))
    if (!request || request.archivedAt) {
      return
    }

    const now = new Date().toISOString()

    setRequests((prev) =>
      prev.map((item) =>
        String(item.id) === String(requestId)
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
    const request = requests.find((item) => String(item.id) === String(requestId))
    if (!request || !request.archivedAt) {
      return
    }

    setRequests((prev) =>
      prev.map((item) =>
        String(item.id) === String(requestId)
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

  async function updateProjectStatus(requestId, newStatus) {
    const validStatuses = ['Pending', 'Ongoing', 'Completed']
    if (!validStatuses.includes(newStatus)) return

    let requestRecord = requests.find((item) => String(item.id) === String(requestId))
    let expenseRecord = expenses.find((item) => String(item.id) === String(requestId) || String(item.requestId) === String(requestId))
    
    if (!requestRecord && !expenseRecord) return

    const record = requestRecord || expenseRecord
    const moduleName = record.type === 'Payroll' ? 'Payroll' : record.type === 'Event' ? 'Event' : 'Project'

    let success = false;
    
    if (requestRecord) {
      try {
        const { error: reqErr } = await supabase
          .from('budget_requests')
          .update({ project_status: newStatus })
          .eq('id', requestRecord.id)
          
        if (reqErr) throw reqErr
        
        const { error: expErr } = await supabase
          .from('expenses')
          .update({ project_status: newStatus })
          .eq('request_id', requestRecord.id)
          
        if (expErr) throw expErr
        
        success = true
      } catch (err) {
        console.error('Failed to update project status in DB (request flow):', err)
      }
    } else if (expenseRecord) {
      try {
        const { error: expErr } = await supabase
          .from('expenses')
          .update({ project_status: newStatus })
          .eq('id', expenseRecord.id)
          
        if (expErr) throw expErr
        
        success = true
      } catch (err) {
        console.error('Failed to update project status in DB (expense flow):', err)
      }
    }

    if (success) {
      setRequests((prev) =>
        prev.map((item) =>
          String(item.id) === String(requestId)
            ? { ...item, projectStatus: newStatus }
            : item
        )
      )

      setExpenses((prev) =>
        prev.map((item) =>
          String(item.id) === String(requestId) || String(item.requestId) === String(requestId)
            ? { ...item, projectStatus: newStatus }
            : item
        )
      )

      addNotification({
        type: 'success',
        title: 'Success',
        message: 'Status updated successfully.',
      })

      addLog({
        action: `Status Changed — ${record.event || record.project}`,
        actionType: 'Status Changed',
        module: moduleName,
        recordType: moduleName,
        recordId: String(requestId),
        description: `SK Chairman changed the ${moduleName} status from "${record.projectStatus || 'Ongoing'}" to "${newStatus}" for "${record.event || record.project}".`,
        previousValue: { projectStatus: record.projectStatus || 'Ongoing' },
        newValue: { projectStatus: newStatus },
      })
    } else {
      addNotification({
        type: 'error',
        title: 'Update Failed',
        message: 'Could not save the new status to the database.',
      })
    }
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
    if (!expense || expense.archivedAt) return

    setExpenses((prev) =>
      prev.map((item) =>
        item.id === expenseId
          ? { ...item, archivedAt: new Date().toISOString() }
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
    if (!expense || !expense.archivedAt) return

    setExpenses((prev) =>
      prev.map((item) =>
        item.id === expenseId
          ? { ...item, archivedAt: null }
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
    const totalBudget = budgets.reduce((sum, item) => sum + Number(item.amount || 0), 0)
    const totalExpenses = expenses.reduce((sum, item) => {
      if (item.archivedAt || item.status === 'Cancelled') return sum
      return sum + Number(item.amount || 0)
    }, 0)
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
      refreshAllBudgetData,
    }),
    [budgets, requests, expenses, expensesSyncStatus, totals]
  )

  return <BudgetContext.Provider value={value}>{children}</BudgetContext.Provider>
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
    const filteredBudgets = budgets.filter(b => {
      if (month !== null && month !== undefined) {
        return b.month === month && b.year === year
      }
      return b.year === year
    })
    const totalBudgetAmount = filteredBudgets.reduce((sum, b) => sum + Number(b.amount || 0), 0)

    const validExpenses = expenses.filter(e => {
       if (e.archivedAt || e.status === 'Cancelled') return false
       const eDate = new Date(e.eventDate || e.date || e.approvedAt || e.createdAt)
       if (isNaN(eDate.getTime())) return false
       
       if (month !== null && month !== undefined) {
         return eDate.getMonth() + 1 === month && eDate.getFullYear() === year
       }
       return eDate.getFullYear() === year
    })

    const totalExpensesAmount = validExpenses.reduce((sum, e) => sum + Number(e.amount || 0), 0)
    const remainingBalanceAmount = totalBudgetAmount - totalExpensesAmount

    return {
      monthlyBudget: totalBudgetAmount,
      totalBudget: totalBudgetAmount,
      totalExpenses: totalExpensesAmount,
      remainingBalance: remainingBalanceAmount,
      hasBudgetData: totalBudgetAmount > 0
    }
  }, [budgets, expenses, month, year])
}

export { BudgetProvider, useBudget }
