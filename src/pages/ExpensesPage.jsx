import { Fragment, useEffect, useMemo, useState } from 'react'
import { AlertCircle, FileText, CheckCircle, ChevronDown, Plus, CreditCard, ChevronRight, Calculator, Archive, ArchiveRestore } from 'lucide-react'
import { useBudget } from '../context/BudgetContext'
import { useAuditLog } from '../context/AuditLogContext'
import { useAuth } from '../context/AuthContext'
import { useNotifications } from '../context/NotificationContext'
import { supabase } from '../supabase/supabaseClient'
import { validateReceiptFile, getUploadErrorMessage, generateReceiptPath, logUploadDebugInfo, insertReceiptRecord } from '../utils/uploadUtils'
import ReceiptPrintPreview from '../components/ReceiptPrintPreview'
import CurrencyInput from '../components/CurrencyInput'
import YearSpinner from '../components/YearSpinner'
import { getBreakdownTotal } from '../utils/budgetUtils'
import BudgetBreakdownTable from '../components/BudgetBreakdownTable'

const currency = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  maximumFractionDigits: 0,
})

const monthLabels = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]



function ExpensesPage() {
  const {
    expenses,
    budgets,
    expensesSyncStatus,
    refreshExpensesFromSupabase,
    archiveExpense,
    restoreExpense,
    addExpense,
    updateExpenseReceipt,
  } = useBudget()
  const { addLog } = useAuditLog()
  const { user, role } = useAuth()
  const { addNotification } = useNotifications()
  const canUpload = ['SK Chairman', 'SK Treasurer'].includes(role)
  const isTreasurer = ['SK Chairman', 'SK Treasurer'].includes(role)

  const [activeTab, setActiveTab] = useState('active')
  const [projectFilter, setProjectFilter] = useState('')
  const [dateFilter, setDateFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('All')
  const [statusFilter, setStatusFilter] = useState('All')
  const [expanded, setExpanded] = useState({})

  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [addExpenseForm, setAddExpenseForm] = useState({
    parentProjectId: '',
    description: '',
    amount: '',
    date: '',
    remarks: '',
  })

  // Receipt upload state
  const [filesById, setFilesById] = useState({})
  const [errorsById, setErrorsById] = useState({})
  const [uploadingId, setUploadingId] = useState(null)
  const [receiptLinks, setReceiptLinks] = useState({})
  const RECEIPTS_BUCKET = 'receipts'

  // Receipt print preview state
  const [printPreview, setPrintPreview] = useState(null)

  // Budget breakdown quarter filter
  const now = new Date()
  const [breakdownQuarter, setBreakdownQuarter] = useState(Math.floor(now.getMonth() / 3) + 1)
  const [breakdownYear, setBreakdownYear] = useState(now.getFullYear())
  const [expandedMonths, setExpandedMonths] = useState({})

  function toggleMonthDetails(monthIdx) {
    setExpandedMonths(prev => ({ ...prev, [monthIdx]: !prev[monthIdx] }))
  }

  const quarterOptions = [
    { value: 1, label: 'Quarter 1 (Jan - Mar)' },
    { value: 2, label: 'Quarter 2 (Apr - Jun)' },
    { value: 3, label: 'Quarter 3 (Jul - Sep)' },
    { value: 4, label: 'Quarter 4 (Oct - Dec)' },
  ]

  const categories = [
    'Sports',
    'Education',
    'Community Programs',
    'Environment',
    'Other',
  ]

  function handleAddExpenseSubmit(e) {
    e.preventDefault()
    
    const parentExpense = expenses.find(ex => ex.id === addExpenseForm.parentProjectId)
    if (!parentExpense) return
    
    addExpense({
      isAdditional: true,
      parentProjectId: parentExpense.id,
      project: parentExpense.project || parentExpense.event,
      category: parentExpense.category || 'Other',
      description: addExpenseForm.description,
      amount: Number(addExpenseForm.amount) || 0,
      date: addExpenseForm.date,
      remarks: addExpenseForm.remarks,
    })
    
    setIsAddModalOpen(false)
    setAddExpenseForm({
      parentProjectId: '',
      description: '',
      amount: '',
      date: '',
      remarks: '',
    })
  }

  // Fetch receipt counts from receipt_records
  useEffect(() => {
    let mounted = true
    const expenseIds = expenses.map(e => String(e.id))
    if (!expenseIds.length) return

    ;(async () => {
      const { data, error } = await supabase
        .from('receipt_records')
        .select('record_id')
        .in('record_id', expenseIds)

      if (!error && data && mounted) {
        const counts = {}
        data.forEach(row => {
          const key = String(row.record_id)
          counts[key] = (counts[key] || 0) + 1
        })
        setReceiptLinks(counts)
      }
    })()

    return () => { mounted = false }
  }, [expenses])

  const activeExpenses = useMemo(() => {
    return expenses.filter((expense) => {
      if (expense.archivedAt) return false
      if (expense.isAdditional) return false
      const resolvedStatus = expense.status || 'Approved'
      const projectName = (expense.project || expense.event || '').toLowerCase()
      const descName = (expense.description || '').toLowerCase()
      const searchTerms = projectFilter.toLowerCase()
      const matchesProject = projectName.includes(searchTerms) || descName.includes(searchTerms)
      
      let matchesDate = true
      if (dateFilter) {
        const expenseDateStr = expense.date || expense.approvedAt
        if (expenseDateStr) {
          const d = new Date(expenseDateStr)
          if (!Number.isNaN(d.getTime())) {
            const localDateStr = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
            matchesDate = localDateStr === dateFilter
          } else {
            matchesDate = false
          }
        } else {
          matchesDate = false
        }
      }

      const matchesCategory =
        categoryFilter === 'All' || expense.category === categoryFilter
      const matchesStatus =
        statusFilter === 'All' || resolvedStatus === statusFilter
      return matchesProject && matchesDate && matchesCategory && matchesStatus
    })
  }, [expenses, projectFilter, dateFilter, categoryFilter, statusFilter])

  const archivedExpenses = useMemo(() => {
    return expenses.filter((expense) => {
      if (!expense.archivedAt) return false
      if (expense.isAdditional) return false
      const resolvedStatus = expense.status || 'Approved'
      const projectName = (expense.project || expense.event || '').toLowerCase()
      const descName = (expense.description || '').toLowerCase()
      const searchTerms = projectFilter.toLowerCase()
      const matchesProject = projectName.includes(searchTerms) || descName.includes(searchTerms)
      
      let matchesDate = true
      if (dateFilter) {
        const expenseDateStr = expense.date || expense.approvedAt
        if (expenseDateStr) {
          const d = new Date(expenseDateStr)
          if (!Number.isNaN(d.getTime())) {
            const localDateStr = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
            matchesDate = localDateStr === dateFilter
          } else {
            matchesDate = false
          }
        } else {
          matchesDate = false
        }
      }

      const matchesCategory =
        categoryFilter === 'All' || expense.category === categoryFilter
      const matchesStatus =
        statusFilter === 'All' || resolvedStatus === statusFilter
      return matchesProject && matchesDate && matchesCategory && matchesStatus
    })
  }, [expenses, projectFilter, dateFilter, categoryFilter, statusFilter])

  // Budget breakdown data for selected quarter
  const breakdownData = useMemo(() => {
    const quarterExpenses = expenses.filter((expense) => {
      if (expense.archivedAt) return false
      const dateStr = expense.eventDate || expense.date || expense.approvedAt
      if (!dateStr) return false
      const d = new Date(dateStr)
      const q = Math.floor(d.getMonth() / 3) + 1
      return d.getFullYear() === breakdownYear && q === breakdownQuarter
    })

    const totalSpent = quarterExpenses.reduce(
      (sum, e) => sum + (Number(e.amount) || 0), 0
    )

    // Group by category
    const byCategory = {}
    quarterExpenses.forEach((e) => {
      const cat = e.category || 'Uncategorized'
      if (!byCategory[cat]) byCategory[cat] = { total: 0, items: [] }
      byCategory[cat].total += Number(e.amount) || 0
      byCategory[cat].items.push(e)
    })

    // Group by month
    const byMonth = {}
    const startMonth = (breakdownQuarter - 1) * 3
    for (let i = 0; i < 3; i++) {
        byMonth[startMonth + i] = { total: 0, items: [], categories: {} }
    }
    quarterExpenses.forEach((e) => {
      const dateStr = e.eventDate || e.date || e.approvedAt
      if (!dateStr) return
      const d = new Date(dateStr)
      const m = d.getMonth()
      if (byMonth[m]) {
          byMonth[m].total += Number(e.amount) || 0
          byMonth[m].items.push(e)
          const cat = e.category || 'Uncategorized'
          if (!byMonth[m].categories[cat]) byMonth[m].categories[cat] = 0
          byMonth[m].categories[cat] += Number(e.amount) || 0
      }
    })

    // Get budget for this quarter
    const quarterBudgets = budgets.filter(
      (b) => b.quarter === breakdownQuarter && b.year === breakdownYear
    )
    const totalBudget = quarterBudgets.reduce(
      (sum, b) => sum + (Number(b.amount) || 0), 0
    )

    return {
      expenses: quarterExpenses,
      totalSpent,
      totalBudget,
      byCategory,
      byMonth,
      remaining: totalBudget - totalSpent,
      utilization: totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 100) : 0,
    }
  }, [expenses, budgets, breakdownQuarter, breakdownYear])

  function toggleDetails(expenseId) {
    setExpanded((prev) => ({
      ...prev,
      [expenseId]: !prev[expenseId],
    }))
  }

  function handleTabChange(nextTab) {
    setActiveTab(nextTab)
  }

  function handleArchive(expenseId) {
    archiveExpense(expenseId)
    setActiveTab('archive')
  }

  // Receipt upload handlers
  function handleFileChange(expenseId, file) {
    setFilesById((prev) => ({ ...prev, [expenseId]: file }))
    setErrorsById((prev) => ({ ...prev, [expenseId]: '' }))
  }

  async function handleUpload(expense) {
    const file = filesById[expense.id]
    
    const validationError = validateReceiptFile(file, role)
    if (validationError) {
      setErrorsById((prev) => ({
        ...prev,
        [expense.id]: validationError,
      }))
      return
    }

    setUploadingId(expense.id)
    setErrorsById((prev) => ({ ...prev, [expense.id]: '' }))
    
    const filePath = generateReceiptPath(expense, file)

    const { error: uploadError } = await supabase.storage
      .from(RECEIPTS_BUCKET)
      .upload(filePath, file, { upsert: true })

    if (uploadError) {
      logUploadDebugInfo(uploadError, { expenseId: expense.id, filePath })
      setErrorsById((prev) => ({ ...prev, [expense.id]: getUploadErrorMessage(uploadError) }))
      setUploadingId(null)
      return
    }

    // 2. Best-effort insert to receipt_records auxiliary table
    const { error: dbError } = await insertReceiptRecord(supabase, expense, file, filePath, user, role)
    if (dbError) {
      console.warn('Could not insert to receipt_records (table may not exist or RLS), continuing:', dbError)
    }

    // 3. Update local state immediately (this is the primary store)
    updateExpenseReceipt(expense.id, filePath, file.name)

    // 4. Best-effort sync to minimal expenses table (only valid columns)
    const { error: updateError } = await supabase
      .from('expenses')
      .update({ receipt_url: filePath, receipt_name: file.name })
      .eq('id', expense.id)

    if (updateError) {
      // Log but don't fail — local state is already updated
      logUploadDebugInfo(updateError, { expenseId: expense.id, step: 'supabase_sync', note: 'Local state already updated' })
    }

    const { data } = await supabase.storage
      .from(RECEIPTS_BUCKET)
      .createSignedUrl(filePath, 60 * 60)

    if (data?.signedUrl) {
      setReceiptLinks((prev) => ({ ...prev, [expense.id]: data.signedUrl }))
    }

    setFilesById((prev) => ({ ...prev, [expense.id]: null }))
    setUploadingId(null)
    addLog({
      action: `Receipt Uploaded \u2014 ${expense.event || expense.project || 'expense'}`,
      actionType: 'Receipt Uploaded',
      module: 'Expenses',
      recordType: 'Receipt',
      recordId: expense.id,
      description: `Uploaded receipt for ${expense.event || expense.project || 'expense'}`,
      newValue: { receiptPath: filePath },
      status: 'Success',
    })
    await refreshExpensesFromSupabase()
    addNotification({ type: 'system', title: 'Receipt Uploaded', message: 'Receipt uploaded and attached successfully.' })
  }

  function handlePrintReceipt(expense) {
    setPrintPreview({
      expense,
      receiptUrl: receiptLinks[expense.id] || null,
    })
  }

  function renderExpenseDetails(expense, columnCount) {
    if (!expanded[expense.id]) return null

    const breakdownItems = Array.isArray(expense.breakdown) ? expense.breakdown : []
    const breakdownTotal = getBreakdownTotal(breakdownItems, expense.type === 'Payroll')
    const requestedAmount = Number(expense.amount) || 0
    const totalAmount = requestedAmount > 0 ? requestedAmount : breakdownTotal
    const hasReceipt = receiptLinks[expense.id] && receiptLinks[expense.id] > 0
    const receiptCount = receiptLinks[expense.id] || 0

    const additionalExpenses = expenses.filter(e => e.parentProjectId === expense.id)
    const additionalTotal = additionalExpenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0)

    return (
      <tr className="details-row">
        <td colSpan={columnCount} style={{ padding: 0 }}>
          <div className="details-panel" style={{ padding: '24px', backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
            <div className="details-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
              <div>
                <p className="details-label" style={{ margin: '0 0 4px', fontSize: '0.85rem', fontWeight: 600, color: '#6b7280' }}>Project / Event</p>
                <p className="details-value" style={{ margin: 0, fontSize: '0.95rem' }}>{expense.event || expense.project || '—'}</p>
              </div>
              <div>
                <p className="details-label" style={{ margin: '0 0 4px', fontSize: '0.85rem', fontWeight: 600, color: '#6b7280' }}>Category</p>
                <p className="details-value" style={{ margin: 0, fontSize: '0.95rem' }}>{expense.category || '—'}</p>
              </div>
              <div>
                <p className="details-label" style={{ margin: '0 0 4px', fontSize: '0.85rem', fontWeight: 600, color: '#6b7280' }}>Total Amount</p>
                <p className="details-value" style={{ margin: 0, fontSize: '0.95rem', fontWeight: 500, color: '#059669' }}>{currency.format(totalAmount)}</p>
              </div>
              <div>
                <p className="details-label" style={{ margin: '0 0 4px', fontSize: '0.85rem', fontWeight: 600, color: '#6b7280' }}>Total Cost (Breakdown)</p>
                <p className="details-value" style={{ margin: 0, fontSize: '0.95rem' }}>
                  {breakdownItems.length ? currency.format(breakdownTotal) : '—'}
                </p>
              </div>
              <div>
                <p className="details-label" style={{ margin: '0 0 4px', fontSize: '0.85rem', fontWeight: 600, color: '#6b7280' }}>Event Date</p>
                <p className="details-value" style={{ margin: 0, fontSize: '0.95rem' }}>
                  {expense.eventDate
                    ? new Date(expense.eventDate).toLocaleDateString()
                    : '—'}
                </p>
              </div>
              <div>
                <p className="details-label" style={{ margin: '0 0 4px', fontSize: '0.85rem', fontWeight: 600, color: '#6b7280' }}>Venue</p>
                <p className="details-value" style={{ margin: 0, fontSize: '0.95rem' }}>{expense.venue || '—'}</p>
              </div>
              <div>
                <p className="details-label" style={{ margin: '0 0 4px', fontSize: '0.85rem', fontWeight: 600, color: '#6b7280' }}>Requested By</p>
                <p className="details-value" style={{ margin: 0, fontSize: '0.95rem' }}>{expense.requestedBy || '—'}</p>
              </div>
              <div>
                <p className="details-label" style={{ margin: '0 0 4px', fontSize: '0.85rem', fontWeight: 600, color: '#6b7280' }}>Approved Date</p>
                <p className="details-value" style={{ margin: 0, fontSize: '0.95rem' }}>
                  {expense.approvedAt
                    ? new Date(expense.approvedAt).toLocaleDateString()
                    : '—'}
                </p>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <p className="details-label" style={{ margin: '0 0 4px', fontSize: '0.85rem', fontWeight: 600, color: '#6b7280' }}>Project Description</p>
                <p className="details-value" style={{ margin: 0, fontSize: '0.95rem' }}>{expense.description || '—'}</p>
              </div>
            </div>

            <div className="details-breakdown">
              <BudgetBreakdownTable request={expense} breakdownItems={breakdownItems} currency={currency} title="BUDGET BREAKDOWN" />
            </div>

            <div className="details-breakdown" style={{ marginTop: '16px' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th colSpan="6" style={{ backgroundColor: '#111827', color: 'white', padding: '8px 12px', textAlign: 'center' }}>
                      <span style={{ fontWeight: 600, letterSpacing: '0.05em' }}>ADDITIONAL EXPENSES</span>
                    </th>
                  </tr>
                  <tr>
                    <th style={{ textTransform: 'uppercase' }}>DATE</th>
                    <th style={{ textTransform: 'uppercase' }}>CATEGORY</th>
                    <th style={{ textTransform: 'uppercase' }}>DESCRIPTION</th>
                    <th style={{ textTransform: 'uppercase' }}>REMARKS</th>
                    <th style={{ textTransform: 'uppercase' }}>AMOUNT</th>
                    <th style={{ textTransform: 'uppercase' }}>RECEIPT</th>
                  </tr>
                </thead>
                <tbody>
                  {additionalExpenses.length ? additionalExpenses.map((addEx, index) => {
                    const addReceiptCount = receiptLinks[addEx.id] || 0
                    const hasAddReceipt = addReceiptCount > 0
                    return (
                    <tr key={`${expense.id}-add-${index}`}>
                      <td data-label="Date">{addEx.date ? new Date(addEx.date).toLocaleDateString() : '—'}</td>
                      <td data-label="Category">{addEx.category || '—'}</td>
                      <td data-label="Description">{addEx.description || '—'}</td>
                      <td data-label="Remarks">{addEx.remarks || '—'}</td>
                      <td data-label="Amount">{currency.format(Number(addEx.amount) || 0)}</td>
                      <td data-label="Receipt">
                        {hasAddReceipt ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 10px', borderRadius: '999px', fontSize: '0.78rem', fontWeight: 600, backgroundColor: '#dcfce7', color: '#15803d' }}>
                            ✅ Uploaded ({addReceiptCount})
                          </span>
                        ) : canUpload ? (
                          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <input
                              type="file"
                              accept="image/*,application/pdf"
                              style={{ width: '150px' }}
                              onChange={(event) =>
                                handleFileChange(addEx.id, event.target.files?.[0] || null)
                              }
                            />
                            <button
                              type="button"
                              className="secondary-button"
                              onClick={() => handleUpload(addEx)}
                              disabled={uploadingId === addEx.id}
                              style={{ padding: '4px 8px', fontSize: '0.85rem' }}
                            >
                              {uploadingId === addEx.id ? 'Uploading...' : 'Upload'}
                            </button>
                            {errorsById[addEx.id] ? ( <span className="form-error" style={{ marginLeft: '4px', fontSize: '0.8rem' }}>{errorsById[addEx.id]}</span> ) : null}
                          </div>
                        ) : (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 10px', borderRadius: '999px', fontSize: '0.78rem', fontWeight: 600, backgroundColor: '#fee2e2', color: '#dc2626' }}>
                            ❌ Missing (0)
                          </span>
                        )}
                      </td>
                    </tr>
                    )
                  }) : (
                    <tr>
                      <td colSpan="6" style={{ textAlign: 'center', fontStyle: 'italic', color: '#6b7280' }}>
                        No additional expenses recorded.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="details-breakdown" style={{ marginTop: '24px', borderTop: '2px solid #e5e7eb', paddingTop: '16px' }}>
              <table className="data-table" style={{ width: '100%', maxWidth: '600px', marginLeft: 'auto' }}>
                <tbody>
                  <tr>
                    <td style={{ fontWeight: 600 }}>Approved Budget Amount</td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{currency.format(totalAmount)}</td>
                  </tr>
                  <tr>
                    <td>Original Requisition Total</td>
                    <td style={{ textAlign: 'right', color: '#4b5563' }}>- {currency.format(breakdownTotal)}</td>
                  </tr>
                  <tr>
                    <td>Additional Expenses Total</td>
                    <td style={{ textAlign: 'right', color: '#4b5563' }}>- {currency.format(additionalTotal)}</td>
                  </tr>
                  <tr style={{ backgroundColor: '#f9fafb' }}>
                    <td style={{ fontWeight: 700, fontSize: '1.1em' }}>Remaining Balance</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, fontSize: '1.1em', color: (totalAmount - breakdownTotal - additionalTotal) < 0 ? '#ef4444' : '#10b981' }}>
                      {currency.format(totalAmount - breakdownTotal - additionalTotal)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Receipt status + upload section */}
            <div className="details-receipt-section" style={{ marginTop: '24px' }}>
              <p className="details-label" style={{ margin: '0 0 12px', fontSize: '0.85rem', fontWeight: 600, color: '#6b7280' }}>Receipts</p>
              <div className="details-receipt-actions">
                {hasReceipt ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '6px 14px', borderRadius: '999px', fontSize: '0.85rem', fontWeight: 600, backgroundColor: '#dcfce7', color: '#15803d' }}>
                    ✅ Uploaded ({receiptCount})
                  </span>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'flex-start' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '6px 14px', borderRadius: '999px', fontSize: '0.85rem', fontWeight: 600, backgroundColor: '#fee2e2', color: '#dc2626' }}>
                      ❌ Missing (0)
                    </span>
                    {canUpload && (
                      <div className="field-row" style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                        <input
                          type="file"
                          accept="image/*,application/pdf"
                          capture="environment"
                          onChange={(event) =>
                            handleFileChange(expense.id, event.target.files?.[0] || null)
                          }
                          style={{ padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px', backgroundColor: '#fff' }}
                        />
                        <button
                          type="button"
                          className="secondary-button"
                          onClick={() => handleUpload(expense)}
                          disabled={uploadingId === expense.id}
                        >
                          {uploadingId === expense.id ? 'Uploading...' : 'Upload'}
                        </button>
                      </div>
                    )}
                  </div>
                )}
                {errorsById[expense.id] ? (
                  <p className="form-error" style={{ marginTop: '8px' }}>{errorsById[expense.id]}</p>
                ) : null}
              </div>
            </div>
          </div>
        </td>
      </tr>
    )
  }

  return (
    <>
      <header className="dashboard-header">
        <div className="header-left">
          <div>
            <p className="eyebrow">Tracking</p>
            <h1>Expenses</h1>
            <p>
              Complete log of all disbursements and receipts.
            </p>
          </div>
        </div>
        <div
          className="header-actions"
          aria-label="Expense views"
          style={{ display: 'flex', alignItems: 'center', gap: '16px' }}
        >
          <div className="page-tabs" role="tablist">
            <button
              className={`page-tab ${activeTab === 'active' ? 'is-active' : ''}`}
              type="button"
              role="tab"
              aria-selected={activeTab === 'active'}
              onClick={() => handleTabChange('active')}
            >
              Active
            </button>
            <button
              className={`page-tab ${activeTab === 'archive' ? 'is-active' : ''}`}
              type="button"
              role="tab"
              aria-selected={activeTab === 'archive'}
              onClick={() => handleTabChange('archive')}
            >
              Archive
            </button>
          </div>
          {canUpload && (
            <button 
              type="button" 
              className="primary-button" 
              onClick={() => setIsAddModalOpen(true)}
            >
              Record Additional Expense
            </button>
          )}
        </div>
      </header>

      <section className="dashboard-content">

      {isAddModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '500px' }}>
            <h2>Record Additional Expense</h2>
            <p>Log extra costs for an approved project.</p>
            <form onSubmit={handleAddExpenseSubmit} className="overview-form" style={{ marginTop: '20px' }}>
              <div className="field-row">
                <label className="field">
                  <span>Approved Project</span>
                  <select 
                    value={addExpenseForm.parentProjectId} 
                    onChange={e => setAddExpenseForm({...addExpenseForm, parentProjectId: e.target.value})}
                    required
                  >
                    <option value="">Select a project...</option>
                    {expenses
                      .filter(ex => !ex.isAdditional && !ex.archivedAt)
                      .map(ex => (
                        <option key={ex.id} value={ex.id}>{ex.project || ex.event || 'Untitled Project'}</option>
                      ))}
                  </select>
                </label>
              </div>
              <div className="field-row">
                <label className="field">
                  <span>Additional Expense Description</span>
                  <input 
                    type="text" 
                    value={addExpenseForm.description} 
                    onChange={e => setAddExpenseForm({...addExpenseForm, description: e.target.value})}
                    required 
                    placeholder="e.g. Extra transportation, fuel, emergency purchase"
                  />
                </label>
                <label className="field">
                  <span>Amount (₱)</span>
                  <CurrencyInput 
                    value={addExpenseForm.amount} 
                    onValueChange={(val) => setAddExpenseForm({...addExpenseForm, amount: Number(val)})}
                    required 
                  />
                </label>
              </div>
              <div className="field-row">
                <label className="field">
                  <span>Date Incurred</span>
                  <input 
                    type="date" 
                    value={addExpenseForm.date} 
                    onChange={e => setAddExpenseForm({...addExpenseForm, date: e.target.value})}
                    required 
                  />
                </label>
              </div>
              <div className="field-row">
                <label className="field">
                  <span>Remarks (Optional)</span>
                  <input 
                    type="text" 
                    value={addExpenseForm.remarks} 
                    onChange={e => setAddExpenseForm({...addExpenseForm, remarks: e.target.value})}
                  />
                </label>
              </div>
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '24px' }}>
                <button type="button" className="secondary-button" onClick={() => setIsAddModalOpen(false)}>Cancel</button>
                <button type="submit" className="primary-button">Add Expense</button>
              </div>
            </form>
          </div>
        </div>
      )}

        {/* Filters */}
        <div className="overview-card">
          <div className="form-grid">
            <label className="field">
              <span>Search by project</span>
              <input
                type="text"
                value={projectFilter}
                onChange={(event) => setProjectFilter(event.target.value)}
                placeholder="Search by project..."
              />
            </label>
            <label className="field">
              <span>Date</span>
              <input
                type="date"
                value={dateFilter}
                onChange={(event) => setDateFilter(event.target.value)}
              />
            </label>
            <label className="field">
              <span>Category</span>
              <select
                value={categoryFilter}
                onChange={(event) => setCategoryFilter(event.target.value)}
              >
                <option value="All">All categories</option>
                {categories.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Status</span>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
              >
                <option value="All">All statuses</option>
                <option value="Pending">Pending</option>
                <option value="Approved">Approved</option>
                <option value="Released">Released</option>
              </select>
            </label>
          </div>
        </div>

        {/* Transaction History */}
        {activeTab === 'active' ? (
          <div className="overview-card" style={{ padding: '24px' }}>
            <div className="card-header-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <p className="eyebrow" style={{ margin: '0 0 4px', fontSize: '0.85rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>Transaction History</p>
                <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700, color: '#111827' }}>Latest expenses</h2>
              </div>
              <span className="items-found-badge" style={{ padding: '4px 12px', backgroundColor: '#e5e7eb', borderRadius: '999px', fontSize: '0.85rem', fontWeight: 500, color: '#374151' }}>
                {activeExpenses.length} items found
              </span>
            </div>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Description</th>
                  <th>Category</th>
                  <th>Amount</th>
                  <th>Receipt</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {activeExpenses.length ? (
                  activeExpenses.map((expense) => {
                    const hasReceipt = expense.receiptUrl || expense.receipt_url || receiptLinks[expense.id]
                    return (
                      <Fragment key={expense.id}>
                        <tr>
                          <td data-label="Date">
                            {expense.date || expense.approvedAt
                              ? new Date(
                                  expense.date || expense.approvedAt
                                ).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                              : '—'}
                          </td>
                          <td data-label="Description" style={{ color: '#111827' }}>
                            {expense.description || expense.project || expense.event || '—'}
                          </td>
                          <td data-label="Category" style={{ color: '#4b5563' }}>{expense.category || '—'}</td>
                          <td data-label="Amount" style={{ fontWeight: 600, color: '#059669', whiteSpace: 'nowrap' }}>
                            {currency.format(Number(expense.amount) || 0)}
                          </td>
                          <td data-label="Receipt">
                            {hasReceipt ? (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 10px', borderRadius: '999px', fontSize: '0.75rem', fontWeight: 600, backgroundColor: '#dcfce7', color: '#15803d', whiteSpace: 'nowrap' }}>
                                ✅ Uploaded
                              </span>
                            ) : (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 10px', borderRadius: '999px', fontSize: '0.75rem', fontWeight: 600, backgroundColor: '#fee2e2', color: '#dc2626', whiteSpace: 'nowrap' }}>
                                ❌ Missing
                              </span>
                            )}
                          </td>
                          <td className="table-actions" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            <button
                              className="secondary-button"
                              type="button"
                              onClick={() => toggleDetails(expense.id)}
                              style={{ padding: '6px 12px', fontSize: '0.85rem' }}
                            >
                              {expanded[expense.id] ? 'Hide' : 'Details'}
                            </button>
                            {hasReceipt && (
                              <button
                                className="primary-button"
                                type="button"
                                onClick={() => handlePrintReceipt(expense)}
                                style={{ padding: '6px 12px', fontSize: '0.85rem' }}
                              >
                                Print
                              </button>
                            )}
                            {isTreasurer && (
                              <button
                                className="secondary-button"
                                type="button"
                                onClick={() => handleArchive(expense.id)}
                                style={{ padding: '6px 12px', fontSize: '0.85rem' }}
                              >
                                Archive
                              </button>
                            )}
                          </td>
                        </tr>
                        {renderExpenseDetails(expense, 6)}
                      </Fragment>
                    )
                  })
                ) : (
                  <tr>
                    <td colSpan="6" className="empty-state">
                      No expenses yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="overview-card" style={{ padding: '24px' }}>
            <p className="eyebrow" style={{ margin: '0 0 4px', fontSize: '0.85rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>Archive</p>
            <h2 style={{ margin: '0 0 24px', fontSize: '1.5rem', fontWeight: 700, color: '#111827' }}>Archived expenses</h2>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Description</th>
                  <th>Category</th>
                  <th>Amount</th>
                  <th>Archived</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {archivedExpenses.length ? (
                  archivedExpenses.map((expense) => (
                    <Fragment key={expense.id}>
                      <tr>
                        <td data-label="Date" style={{ whiteSpace: 'nowrap', color: '#4b5563' }}>
                          {expense.date || expense.approvedAt
                            ? new Date(
                                expense.date || expense.approvedAt
                              ).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                            : '—'}
                        </td>
                        <td data-label="Description" style={{ color: '#111827' }}>
                          {expense.description || expense.project || expense.event || 'Untitled'}
                        </td>
                        <td data-label="Category" style={{ color: '#4b5563' }}>
                          {expense.category || 'Uncategorized'}
                        </td>
                        <td data-label="Amount" style={{ fontWeight: 600, color: '#059669', whiteSpace: 'nowrap' }}>
                          {currency.format(Number(expense.amount) || 0)}
                        </td>
                        <td data-label="Archived" style={{ whiteSpace: 'nowrap', color: '#9ca3af' }}>
                          {expense.archivedAt
                            ? new Date(expense.archivedAt).toLocaleDateString()
                            : '—'}
                        </td>
                        <td data-label="Actions" className="table-actions" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                          <button
                            className="secondary-button"
                            type="button"
                            onClick={() => toggleDetails(expense.id)}
                            style={{ padding: '6px 12px', fontSize: '0.85rem' }}
                          >
                            {expanded[expense.id] ? 'Hide' : 'Details'}
                          </button>
                          {isTreasurer && (
                            <button
                              className="secondary-button"
                              type="button"
                              onClick={() => restoreExpense(expense.id)}
                              style={{ padding: '6px 12px', fontSize: '0.85rem' }}
                            >
                              Restore
                            </button>
                          )}
                        </td>
                      </tr>
                      {renderExpenseDetails(expense, 6)}
                    </Fragment>
                  ))
                ) : (
                  <tr>
                    <td colSpan="6" className="empty-state">
                      No archived expenses yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Budget Breakdown Section */}
        <div className="expenses-breakdown-grid">
          <div className="overview-card">
            <div className="card-header-row">
              <div>
                <p className="eyebrow">Budget Utilization</p>
                <h2 className="breakdown-utilization-value">
                  {breakdownData.utilization}%
                </h2>
              </div>
              <div className="breakdown-month-selector">
                <select
                  className="panel-select"
                  value={breakdownQuarter}
                  onChange={(e) => setBreakdownQuarter(Number(e.target.value))}
                >
                  {quarterOptions.map((q) => (
                    <option key={q.value} value={q.value}>{q.label}</option>
                  ))}
                </select>
                <YearSpinner year={breakdownYear} onYearChange={setBreakdownYear} />
              </div>
            </div>
            <p style={{ color: 'var(--ink-soft)', fontSize: '0.9rem', margin: '4px 0 16px' }}>
              You have utilized {currency.format(breakdownData.totalSpent)} out of the{' '}
              {currency.format(breakdownData.totalBudget)} allocated for{' '}
              Quarter {breakdownQuarter} {breakdownYear}.
            </p>
            <div className="allocation-bar">
              <div
                className="allocation-fill"
                style={{ width: `${Math.min(100, breakdownData.utilization)}%` }}
              />
            </div>
            <div className="breakdown-summary-row">
              <div>
                <span className="breakdown-summary-label">Total Budget</span>
                <span className="breakdown-summary-value">{currency.format(breakdownData.totalBudget)}</span>
              </div>
              <div>
                <span className="breakdown-summary-label">Total Spent</span>
                <span className="breakdown-summary-value">{currency.format(breakdownData.totalSpent)}</span>
              </div>
              <div>
                <span className="breakdown-summary-label">Remaining</span>
                <span className="breakdown-summary-value">{currency.format(breakdownData.remaining)}</span>
              </div>
            </div>
          </div>

          <div className="overview-card">
            <p className="eyebrow">Spending by Category</p>
            <h2>Where funds were spent</h2>
            {Object.keys(breakdownData.byCategory).length ? (
              <div className="breakdown-category-list">
                {Object.entries(breakdownData.byCategory)
                  .sort(([, a], [, b]) => b.total - a.total)
                  .map(([cat, data]) => (
                    <div key={cat} className="breakdown-category-row">
                      <div className="breakdown-category-info">
                        <span className="category-tag">{cat}</span>
                        <span className="breakdown-category-count">
                          {data.items.length} {data.items.length === 1 ? 'expense' : 'expenses'}
                        </span>
                      </div>
                      <span className="breakdown-category-amount">
                        {currency.format(data.total)}
                      </span>
                    </div>
                  ))}
              </div>
            ) : (
              <p className="empty-state" style={{ padding: '24px 0' }}>
                No expenses recorded for Quarter {breakdownQuarter} {breakdownYear}.
              </p>
            )}

            {/* Monthly breakdown hierarchical view */}
            <div style={{ marginTop: '32px' }}>
              <p className="eyebrow" style={{ marginBottom: '16px' }}>Monthly Breakdown</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {Object.entries(breakdownData.byMonth).map(([mStr, mData]) => {
                  const m = Number(mStr)
                  const isExpanded = expandedMonths[m]
                  const utilization = breakdownData.totalBudget > 0 ? Math.round((mData.total / breakdownData.totalBudget) * 100) : 0
                  
                  // Calculate month aggregates
                  const addItems = mData.items.filter(e => e.isAdditional)
                  const additionalAmount = addItems.reduce((sum, e) => sum + (Number(e.amount)||0), 0)
                  const baseAmount = mData.total - additionalAmount
                  
                  const receiptCount = mData.items.reduce((count, e) => count + (receiptLinks[e.id] || 0), 0)
                  const largestCategory = Object.entries(mData.categories).sort(([, a], [, b]) => b - a)[0]

                  return (
                    <div key={m} className="overview-card" style={{ padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', border: '1px solid var(--border-soft)' }}>
                      {/* Monthly Breakdown Card Header / Summary */}
                      <div className="flex flex-col md:flex-row gap-5 justify-between md:items-start">
                        <div className="flex-1 w-full">
                          <h3 style={{ margin: '0 0 16px', fontSize: '1.25rem', color: 'var(--ink-dark)' }}>{monthLabels[m]} {breakdownYear}</h3>
                          
                          <div className="flex flex-col sm:grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                            <div>
                              <div style={{ fontSize: '0.85rem', color: 'var(--ink-soft)', fontWeight: 500, marginBottom: '2px' }}>Total Expenses</div>
                              <div style={{ fontSize: '1.1rem', fontWeight: 600 }}>{currency.format(baseAmount)}</div>
                            </div>
                            {additionalAmount > 0 && (
                              <div>
                                <div style={{ fontSize: '0.85rem', color: 'var(--ink-soft)', fontWeight: 500, marginBottom: '2px' }}>Additional Expenses</div>
                                <div style={{ fontSize: '1.1rem', fontWeight: 600 }}>{currency.format(additionalAmount)}</div>
                              </div>
                            )}
                            <div>
                              <div style={{ fontSize: '0.85rem', color: 'var(--ink-soft)', fontWeight: 500, marginBottom: '2px' }}>Total Spending</div>
                              <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--ink-dark)' }}>{currency.format(mData.total)}</div>
                            </div>
                            <div>
                              <div style={{ fontSize: '0.85rem', color: 'var(--ink-soft)', fontWeight: 500, marginBottom: '2px' }}>Transactions</div>
                              <div style={{ fontSize: '1.1rem', fontWeight: 600 }}>{mData.items.length}</div>
                            </div>
                            <div>
                              <div style={{ fontSize: '0.85rem', color: 'var(--ink-soft)', fontWeight: 500, marginBottom: '2px' }}>Receipts Uploaded</div>
                              <div style={{ fontSize: '1.1rem', fontWeight: 600 }}>{receiptCount}</div>
                            </div>
                            {utilization > 0 && (
                              <div>
                                <div style={{ fontSize: '0.85rem', color: 'var(--ink-soft)', fontWeight: 500, marginBottom: '2px' }}>Budget Utilization</div>
                                <div style={{ fontSize: '1.1rem', fontWeight: 600 }}>{utilization}%</div>
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="w-full md:w-auto shrink-0 mt-2 md:mt-0">
                          <button className="primary-button w-full md:w-auto justify-center" type="button" onClick={() => toggleMonthDetails(m)}>
                            {isExpanded ? 'Hide Details' : 'View Details'}
                          </button>
                        </div>
                      </div>

                      {/* Expanded View Details */}
                      {isExpanded && mData.items.length > 0 && (
                        <div style={{ marginTop: '24px', paddingTop: '24px', borderTop: '2px solid var(--border-soft)' }}>
                          <div style={{ marginBottom: '28px' }}>
                             <h4 style={{ margin: '0 0 16px', fontSize: '1.1rem', color: 'var(--ink-dark)' }}>{monthLabels[m]} {breakdownYear} — Expense Details</h4>
                             <div className="flex flex-col sm:grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                                <div className="overview-card" style={{ padding: '16px', border: '1px solid var(--border-soft)', boxShadow: 'none' }}>
                                  <div style={{ fontSize: '0.85rem', color: 'var(--ink-soft)', fontWeight: 500 }}>Total Spending</div>
                                  <div style={{ fontSize: '1.5rem', fontWeight: 700, margin: '4px 0', color: 'var(--ink-dark)' }}>{currency.format(mData.total)}</div>
                                </div>
                                <div className="overview-card" style={{ padding: '16px', border: '1px solid var(--border-soft)', boxShadow: 'none' }}>
                                  <div style={{ fontSize: '0.85rem', color: 'var(--ink-soft)', fontWeight: 500 }}>Largest Category</div>
                                  <div style={{ fontSize: '1.15rem', fontWeight: 600, margin: '4px 0', color: 'var(--ink-dark)' }}>{largestCategory ? largestCategory[0] : '—'}</div>
                                  <div style={{ fontSize: '0.85rem', color: 'var(--ink-soft)' }}>{largestCategory ? currency.format(largestCategory[1]) : ''}</div>
                                </div>
                                <div className="overview-card" style={{ padding: '16px', border: '1px solid var(--border-soft)', boxShadow: 'none' }}>
                                  <div style={{ fontSize: '0.85rem', color: 'var(--ink-soft)', fontWeight: 500 }}>Transactions</div>
                                  <div style={{ fontSize: '1.5rem', fontWeight: 700, margin: '4px 0', color: 'var(--ink-dark)' }}>{mData.items.length}</div>
                                </div>
                                {utilization > 0 && (
                                  <div className="overview-card" style={{ padding: '16px', border: '1px solid var(--border-soft)', boxShadow: 'none' }}>
                                    <div style={{ fontSize: '0.85rem', color: 'var(--ink-soft)', fontWeight: 500 }}>Budget Utilization</div>
                                    <div style={{ fontSize: '1.5rem', fontWeight: 700, margin: '4px 0', color: 'var(--ink-dark)' }}>{utilization}%</div>
                                    <div style={{ fontSize: '0.85rem', color: 'var(--ink-soft)' }}>Of Q{breakdownQuarter} budget</div>
                                  </div>
                                )}
                             </div>
                          </div>

                          <div className="flex flex-col lg:grid lg:grid-cols-2 gap-8">
                            {/* Categories */}
                            <div>
                              <p className="eyebrow" style={{ marginBottom: '16px' }}>Expenses by Category</p>
                              <div className="flex flex-col gap-4">
                                {Object.entries(mData.categories)
                                  .sort(([, a], [, b]) => b - a)
                                  .map(([cat, amount]) => {
                                    const catItems = mData.items.filter(e => (e.category || 'Uncategorized') === cat)
                                    const pct = mData.total > 0 ? ((amount / mData.total) * 100).toFixed(2) : 0
                                    return (
                                      <div key={cat} className="overview-card" style={{ padding: '16px', border: '1px solid var(--border-soft)', boxShadow: 'none' }}>
                                        <div className="flex justify-between items-start mb-4">
                                          <div>
                                            <div style={{ fontWeight: 600, color: 'var(--ink-dark)', fontSize: '1.05rem' }}>{cat}</div>
                                            <div style={{ fontSize: '0.9rem', color: 'var(--ink-soft)', marginTop: '4px' }}>
                                              {catItems.length} {catItems.length === 1 ? 'transaction' : 'transactions'}
                                            </div>
                                          </div>
                                          <div className="text-right">
                                            <div style={{ fontWeight: 700, color: 'var(--ink-dark)', fontSize: '1.05rem' }}>{currency.format(amount)}</div>
                                            <div style={{ fontSize: '0.9rem', color: 'var(--ink-soft)', marginTop: '4px' }}>{pct}%</div>
                                          </div>
                                        </div>
                                        <div className="allocation-bar" style={{ height: '6px' }}>
                                          <div className="allocation-fill" style={{ width: `${pct}%`, backgroundColor: 'var(--brand)' }} />
                                        </div>
                                      </div>
                                    )
                                  })}
                              </div>
                            </div>
                            
                            {/* Table */}
                            <div>
                              <p className="eyebrow" style={{ marginBottom: '16px' }}>Transactions Breakdown</p>
                              
                              {/* Responsive Transaction Cards */}
                              <div className="flex flex-col gap-3">
                                {mData.items
                                  .sort((a, b) => new Date(b.approvedAt || b.date || 0) - new Date(a.approvedAt || a.date || 0))
                                  .map((e) => {
                                    const approvedBudget = Number(e.amount) || 0;
                                    const additionalExps = expenses.filter(ex => ex.parentProjectId === e.id);
                                    const addTotal = additionalExps.reduce((sum, ex) => sum + (Number(ex.amount) || 0), 0);
                                    const expensesTotal = getBreakdownTotal(e.breakdown) + addTotal;
                                    const remaining = approvedBudget - expensesTotal;
                                    return (
                                      <div key={e.id} className="p-4 border border-[var(--border-soft)] rounded-xl bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                        <div className="flex-1">
                                          <div className="font-semibold text-[var(--ink-dark)]">{e.event || e.project || 'Untitled'}</div>
                                          <div className="text-sm text-[var(--ink-soft)] mt-1">
                                            {e.isAdditional ? 'Additional Expense' : (e.date || e.approvedAt ? new Date(e.date || e.approvedAt).toLocaleDateString() : '')}
                                          </div>
                                        </div>
                                        
                                        <div className="grid grid-cols-2 sm:flex sm:gap-6 text-sm bg-gray-50 sm:bg-transparent p-3 sm:p-0 rounded-lg sm:rounded-none">
                                          <div>
                                            <div className="text-[var(--ink-soft)] text-xs uppercase tracking-wider mb-1 sm:hidden">Budget</div>
                                            <div className="font-semibold text-right sm:text-left">{currency.format(approvedBudget)}</div>
                                          </div>
                                          <div>
                                            <div className="text-[var(--ink-soft)] text-xs uppercase tracking-wider mb-1 sm:hidden">Expenses</div>
                                            <div className="text-right sm:text-left">{currency.format(expensesTotal)}</div>
                                          </div>
                                          <div className="col-span-2 mt-3 pt-3 border-t border-gray-200 sm:mt-0 sm:pt-0 sm:border-t-0 text-right sm:text-left flex justify-between sm:block">
                                            <div className="text-[var(--ink-soft)] text-xs uppercase tracking-wider mb-1 sm:hidden">Remaining</div>
                                            <div className={`font-semibold ${remaining < 0 ? 'text-[#e53e3e]' : 'text-[var(--brand)]'}`}>
                                              {currency.format(remaining)}
                                            </div>
                                          </div>
                                        </div>
                                      </div>
                                    )
                                  })}
                              </div>

                            </div>
                          </div>
                        </div>
                      )}
                      {isExpanded && mData.items.length === 0 && (
                        <div style={{ marginTop: '24px', paddingTop: '24px', borderTop: '2px solid var(--border-soft)' }}>
                           <p className="empty-state">No expenses recorded in {monthLabels[m]}.</p>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>


          </div>
        </div>
      </section>

      {/* Receipt print preview overlay */}
      {printPreview ? (
        <ReceiptPrintPreview
          expense={printPreview.expense}
          receiptUrl={printPreview.receiptUrl}
          onClose={() => setPrintPreview(null)}
        />
      ) : null}
    </>
  )
}

export default ExpensesPage
