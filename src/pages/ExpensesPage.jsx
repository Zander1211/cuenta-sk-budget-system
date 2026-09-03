import { Fragment, useEffect, useMemo, useState, lazy, Suspense, useCallback } from 'react'
import { AlertCircle, FileText, CheckCircle, ChevronDown, Plus, PlusCircle, Trash2, CreditCard, ChevronRight, Calculator, Archive, ArchiveRestore } from 'lucide-react'
import { useBudget } from '../context/BudgetContext'
import { useAuditLog } from '../context/AuditLogContext'
import { useAuth } from '../context/AuthContext'
import { useNotifications } from '../context/NotificationContext'
import { supabase } from '../supabase/supabaseClient'
import { validateReceiptFile, getUploadErrorMessage, generateReceiptPath, logUploadDebugInfo, insertReceiptRecord } from '../utils/uploadUtils'
import ReceiptPrintPreview from '../components/ReceiptPrintPreview'
import CurrencyInput from '../components/CurrencyInput'
import YearSpinner from '../components/YearSpinner'
import { getBreakdownTotal, getRecordPeriod } from '../utils/budgetUtils'
import BudgetBreakdownTable from '../components/BudgetBreakdownTable'
import PaginationControls from '../components/PaginationControls'
import { calculateProjectEventFinancials, formatUtilization, summarizeApprovedBudgetFinancials } from '../utils/projectEventFinancials'
import '../components/documents/AdditionalDocuments.css'

const EMPTY_REQUISITION_ROW = { itemName: '', quantity: 1, unitCost: 0 }

const ReceiptScanModal = lazy(() => import('../components/receipts/ReceiptScanModal'))

const EXPENSES_PAGE_SIZE = 10

const currency = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  maximumFractionDigits: 0,
})

const monthLabels = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

// eventDate is the date picked on the original budget request; date falls
// back to it (or the approval timestamp) for older requests with no date.
function formatScheduledDate(expense) {
  const raw = expense.eventDate || expense.date
  if (!raw) return 'Not scheduled'
  const d = new Date(raw)
  if (isNaN(d.getTime())) return 'Not scheduled'
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}



function ExpensesPage() {
  const {
    expenses,
    expensesSyncStatus,
    verifiedReceiptTotals,
    refreshExpensesFromSupabase,
    archiveExpense,
    restoreExpense,
    addAdditionalRequisition,
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
  const [expensePage, setExpensePage] = useState(1)
  const [expanded, setExpanded] = useState({})

  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [isAddingExpense, setIsAddingExpense] = useState(false)
  const [addExpenseForm, setAddExpenseForm] = useState({
    parentProjectId: '',
    category: 'Other',
    date: '',
    remarks: '',
  })
  const [requisitionItems, setRequisitionItems] = useState([{ ...EMPTY_REQUISITION_ROW }])

  function updateRequisitionItem(index, field, value) {
    setRequisitionItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, [field]: value } : item))
    )
  }

  function addRequisitionItemRow() {
    setRequisitionItems((prev) => [...prev, { ...EMPTY_REQUISITION_ROW }])
  }

  function removeRequisitionItemRow(index) {
    setRequisitionItems((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== index)))
  }

  const totalRequisitionCost = requisitionItems.reduce(
    (sum, item) => sum + ((Number(item.quantity) || 0) * (Number(item.unitCost) || 0)),
    0,
  )

  const recordableProjectEvents = useMemo(() => (
    expenses
      .filter((expense) => {
        const type = String(expense.type || 'Project').toLowerCase()
        const status = String(expense.status || 'Approved').toLowerCase()
        return !expense.isAdditional
          && !expense.archivedAt
          && ['project', 'event', 'payroll'].includes(type)
          && ['approved', 'released'].includes(status)
      })
      .sort((a, b) => (
        String(a.event || a.project || '').localeCompare(String(b.event || b.project || ''))
      ))
  ), [expenses])

  // Receipt upload state
  const [scanModalExpense, setScanModalExpense] = useState(null)
  const handleScanSave = useCallback(async () => {
    setScanModalExpense(null)
    await refreshExpensesFromSupabase()
  }, [refreshExpensesFromSupabase])
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

  async function handleAddExpenseSubmit(e) {
    e.preventDefault()
    if (isAddingExpense) return

    const parentExpense = recordableProjectEvents.find(
      (expense) => String(expense.id) === String(addExpenseForm.parentProjectId),
    )
    const remarks = addExpenseForm.remarks.trim()

    if (!parentExpense) {
      addNotification({
        type: 'error',
        title: 'Select an approved record',
        message: 'Choose the approved Project, Event, or Payroll that owns this requisition.',
      })
      return
    }

    if (!addExpenseForm.date) {
      addNotification({
        type: 'error',
        title: 'Complete the Requisition Details',
        message: 'Enter the date incurred for this requisition.',
      })
      return
    }

    // A row left exactly at its blank default (no item name, no unit cost
    // typed in) is dropped silently rather than flagged — that's the normal
    // shape of a spare row the user never got to. Only a row that was
    // PARTIALLY filled in is treated as a mistake worth a validation message.
    const trimmedRows = requisitionItems.map((item) => ({
      itemName: (item.itemName || '').trim(),
      quantity: Number(item.quantity) || 0,
      unitCost: Number(item.unitCost) || 0,
    }))
    const touchedRows = trimmedRows.filter((item) => item.itemName || item.quantity > 0 || item.unitCost > 0)
    const validRows = touchedRows.filter((item) => item.itemName && item.quantity > 0 && item.unitCost > 0)

    if (touchedRows.length === 0) {
      addNotification({
        type: 'error',
        title: 'Add at least one requisition item',
        message: 'Enter a requisition item with a quantity and unit cost before saving.',
      })
      return
    }

    if (validRows.length !== touchedRows.length) {
      addNotification({
        type: 'error',
        title: 'Complete every requisition row',
        message: 'Each row needs a requisition item, a quantity greater than zero, and a unit cost greater than zero before it can be saved.',
      })
      return
    }

    setIsAddingExpense(true)

    try {
      const items = validRows.map((row) => ({
        itemName: row.itemName,
        quantity: row.quantity,
        unitCost: row.unitCost,
        category: addExpenseForm.category || 'Other',
        date: addExpenseForm.date,
        remarks,
        recordedBy: role || '',
      }))

      const result = await addAdditionalRequisition(parentExpense.id, items)

      if (result?.error) {
        addNotification({
          type: 'error',
          title: 'Requisition Not Recorded',
          message: result.error.message || 'The requisition could not be saved.',
        })
        return
      }

      await refreshExpensesFromSupabase()
      setIsAddModalOpen(false)
      setAddExpenseForm({
        parentProjectId: '',
        category: 'Other',
        date: '',
        remarks: '',
      })
      setRequisitionItems([{ ...EMPTY_REQUISITION_ROW }])
      addNotification({
        type: 'system',
        title: items.length > 1 ? 'Requisitions recorded' : 'Requisition recorded',
        message: `${items.length} requisition item${items.length > 1 ? 's were' : ' was'} added under ${parentExpense.event || parentExpense.project}; its receipts and utilization remain consolidated there.`,
      })
    } catch (error) {
      addNotification({
        type: 'error',
        title: 'Requisition Not Recorded',
        message: error?.message || 'The requisition could not be saved.',
      })
    } finally {
      setIsAddingExpense(false)
    }
  }

  // Fetch receipt counts from receipt_records
  useEffect(() => {
    let mounted = true
    const expenseIds = expenses.map(e => String(e.id))
    if (!expenseIds.length) return

    ;(async () => {
      let { data, error } = await supabase
        .from('receipt_records')
        .select('record_id, requisition_id')
        .in('record_id', expenseIds)

      if (error) {
        const legacy = await supabase
          .from('receipt_records')
          .select('record_id')
          .in('record_id', expenseIds)
        data = legacy.data
        error = legacy.error
      }

      if (!error && data && mounted) {
        const counts = {}
        data.forEach(row => {
          const key = String(row.record_id)
          counts[key] = (counts[key] || 0) + 1
          if (row.requisition_id) {
            const requisitionKey = String(row.requisition_id)
            counts[requisitionKey] = (counts[requisitionKey] || 0) + 1
          } else {
            const legacyRequisition = expenses.find(expense => (
              expense.isAdditional && String(expense.id) === key
            ))
            if (legacyRequisition?.parentProjectId) {
              const parentKey = String(legacyRequisition.parentProjectId)
              counts[parentKey] = (counts[parentKey] || 0) + 1
            }
          }
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
    }).sort((a, b) => {
      const newest = new Date(b.createdAt || b.approvedAt || b.date || 0).getTime()
      const oldest = new Date(a.createdAt || a.approvedAt || a.date || 0).getTime()
      return newest - oldest
    })
  }, [expenses, projectFilter, dateFilter, categoryFilter, statusFilter])

  const expenseTotalPages = Math.max(1, Math.ceil(activeExpenses.length / EXPENSES_PAGE_SIZE))
  const safeExpensePage = Math.min(expensePage, expenseTotalPages)
  const paginatedActiveExpenses = useMemo(() => {
    const start = (safeExpensePage - 1) * EXPENSES_PAGE_SIZE
    return activeExpenses.slice(start, start + EXPENSES_PAGE_SIZE)
  }, [activeExpenses, safeExpensePage])
  const hasExpenseFilters = Boolean(
    projectFilter || dateFilter || categoryFilter !== 'All' || statusFilter !== 'All'
  )

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
    const yearlyFinancials = summarizeApprovedBudgetFinancials(
      expenses,
      verifiedReceiptTotals,
      { view: 'yearly', year: breakdownYear },
    )
    const quarterRecords = yearlyFinancials.records
      .filter((expense) => {
        const period = getRecordPeriod(expense)
        return period && Math.floor((period.month - 1) / 3) + 1 === breakdownQuarter
      })
    const quarterExpenses = quarterRecords
      .map((record) => ({ ...record, amount: record.totalExpenses }))
      .filter((expense) => Number(expense.amount) > 0)

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
        byMonth[startMonth + i] = { total: 0, budget: 0, remaining: 0, items: [], categories: {} }
    }
    quarterExpenses.forEach((e) => {
      const period = getRecordPeriod(e)
      if (!period) return
      const m = period.month - 1
      if (byMonth[m]) {
          byMonth[m].total += Number(e.amount) || 0
          byMonth[m].budget += Number(e.approvedBudget) || 0
          byMonth[m].remaining += Number(e.remainingBudget) || 0
          byMonth[m].items.push(e)
          const cat = e.category || 'Uncategorized'
          if (!byMonth[m].categories[cat]) byMonth[m].categories[cat] = 0
          byMonth[m].categories[cat] += Number(e.amount) || 0
      }
    })

    // Get budget for this quarter
    const totalBudget = quarterRecords.reduce(
      (sum, record) => sum + Number(record.approvedBudget || 0),
      0,
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
  }, [expenses, verifiedReceiptTotals, breakdownQuarter, breakdownYear])

  function toggleDetails(expenseId) {
    setExpanded((prev) => ({
      ...prev,
      [expenseId]: !prev[expenseId],
    }))
  }

  function handleTabChange(nextTab) {
    setActiveTab(nextTab)
  }

  async function handleArchive(expenseId) {
    const result = await archiveExpense(expenseId)
    if (!result?.error) setActiveTab('archive')
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
      const ownerId = expense.isAdditional && expense.parentProjectId
        ? String(expense.parentProjectId)
        : String(expense.id)
      const requisitionId = String(expense.id)
      setReceiptLinks((prev) => ({
        ...prev,
        [ownerId]: (Number(prev[ownerId]) || 0) + 1,
        ...(ownerId !== requisitionId
          ? { [requisitionId]: (Number(prev[requisitionId]) || 0) + 1 }
          : {}),
      }))
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
    const financials = calculateProjectEventFinancials(expense, expenses, verifiedReceiptTotals)
    const additionalExpenses = financials.linkedExpenses
    const additionalTotal = financials.recordedExpenseTotal
    const totalExpense = financials.totalExpenses

    return (
      <tr className="details-row">
        <td colSpan={columnCount} style={{ padding: 0 }}>
          <div className="details-panel" style={{ padding: '32px 24px', background: 'var(--surface-2)', borderBottom: '1px solid var(--line)' }}>
            
            {/* Basic Information Section */}
            <div style={{ marginBottom: '32px' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--ink)', marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Basic Information</h3>
              <div className="details-grid" style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
                gap: '16px'
              }}>
                {[
                  { label: 'Title', value: expense.project || expense.event || 'Untitled' },
                  { label: 'Description', value: expense.description || 'No description provided.' },
                  { label: 'Category', value: expense.category || '—' },
                  { label: 'Related Project / Event / Payroll', value: expense.event || expense.project || expense.payrollNumber || '—' },
                  { label: 'Scheduled Date', value: expense.type === 'Payroll' ? 'Not applicable' : formatScheduledDate(expense) },
                  { label: 'Expense Date', value: expense.date || expense.approvedAt ? new Date(expense.date || expense.approvedAt).toLocaleDateString() : '—' },
                  { label: 'Status', value: expense.status || 'Approved' },
                  { label: 'Created By', value: expense.requestedBy || '—' },
                ].map((stat, i) => (
                  <div key={i} style={{ 
                    backgroundColor: 'var(--background-color, #ffffff)', 
                    padding: '20px 24px', 
                    borderRadius: 'var(--radius-surface)', 
                    border: '1px solid var(--line)', 
                    boxShadow: 'var(--shadow)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px'
                  }}>
                    <p className="details-label" style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', color: 'var(--ink-3)', margin: 0, letterSpacing: '0.5px' }}>{stat.label}</p>
                    <p className="details-value" style={{ fontSize: '1.05rem', margin: 0, color: 'var(--ink)', lineHeight: '1.4', overflowWrap: 'break-word', wordBreak: 'break-word' }}>{stat.value}</p>
                  </div>
                ))}
                
                {/* Receipt Status Card */}
                <div style={{ 
                  backgroundColor: 'var(--background-color, #ffffff)', 
                  padding: '20px 24px', 
                  borderRadius: 'var(--radius-surface)', 
                  border: '1px solid var(--line)', 
                  boxShadow: 'var(--shadow)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px'
                }}>
                  <p className="details-label" style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', color: 'var(--ink-3)', margin: 0, letterSpacing: '0.5px' }}>Receipt Status</p>
                  <div>
                    <span style={{ 
                      display: 'inline-flex', 
                      alignItems: 'center', 
                      padding: '4px 12px', 
                      borderRadius: '999px', 
                      fontSize: '0.85rem', 
                      fontWeight: 600, 
                      backgroundColor: hasReceipt ? '#dcfce7' : '#fee2e2', 
                      color: hasReceipt ? '#15803d' : '#dc2626' 
                    }}>
                      {hasReceipt ? (receiptCount > 1 ? `${receiptCount} Receipts Uploaded` : '1 Receipt Uploaded') : 'Missing'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Financial Information Section */}
            <div style={{ marginBottom: '32px' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--ink)', marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Financial Information</h3>
              <div className="details-grid" style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
                gap: '16px'
              }}>
                {[
                  { label: 'Approved Budget', value: currency.format(financials.approvedBudget || totalAmount), highlight: false },
                  { label: 'Total Requisitions', value: currency.format(additionalTotal), highlight: false },
                  ...(financials.verifiedReceiptTotal > 0
                    ? [{ label: 'Verified Receipt Total', value: currency.format(financials.verifiedReceiptTotal), highlight: false }]
                    : []),
                  { label: 'Total Recorded Expenses', value: currency.format(totalExpense), highlight: true },
                  { label: 'Remaining Budget', value: currency.format(financials.remainingBudget), highlight: financials.remainingBudget < 0 },
                  { label: 'Budget Utilization', value: `${formatUtilization(financials.utilization)}%`, highlight: financials.utilization > 100 },
                ].map((stat, i) => (
                  <div key={i} style={{ 
                    backgroundColor: 'var(--background-color, #ffffff)', 
                    padding: '20px 24px', 
                    borderRadius: 'var(--radius-surface)', 
                    border: '1px solid var(--line)', 
                    boxShadow: 'var(--shadow)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px'
                  }}>
                    <p className="details-label" style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', color: 'var(--ink-3)', margin: 0, letterSpacing: '0.5px' }}>{stat.label}</p>
                    <p className="details-value" style={{ fontSize: '1.25rem', fontWeight: stat.highlight ? 600 : 400, margin: 0, color: stat.highlight ? '#059669' : '#111827' }}>{stat.value}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="details-breakdown">
              <BudgetBreakdownTable request={expense} breakdownItems={breakdownItems} currency={currency} title="APPROVED ALLOCATION BREAKDOWN" />
            </div>

            <div className="details-breakdown" style={{ marginTop: '16px' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th className="table-band" colSpan="7">ADDITIONAL REQUISITION BREAKDOWN</th>
                  </tr>
                  <tr>
                    <th style={{ textTransform: 'uppercase' }}>REQUISITION ITEM</th>
                    <th style={{ textTransform: 'uppercase' }}>CATEGORY</th>
                    <th style={{ textTransform: 'uppercase' }}>DATE</th>
                    <th style={{ textTransform: 'uppercase' }}>REMARKS</th>
                    <th style={{ textTransform: 'uppercase' }}>QUANTITY</th>
                    <th style={{ textTransform: 'uppercase' }}>UNIT COST</th>
                    <th style={{ textTransform: 'uppercase' }}>TOTAL COST</th>
                  </tr>
                </thead>
                <tbody>
                  {additionalExpenses.length ? additionalExpenses.map((addEx, index) => (
                    <tr key={`${expense.id}-add-${index}`}>
                      <td data-label="Requisition Item">{addEx.itemName || addEx.description || addEx.category || '—'}</td>
                      <td data-label="Category">{addEx.category || '—'}</td>
                      <td data-label="Date">{(addEx.date || addEx.addedAt) ? new Date(addEx.date || addEx.addedAt).toLocaleDateString() : '—'}</td>
                      <td data-label="Remarks">{addEx.remarks || '—'}</td>
                      <td data-label="Quantity">{addEx.quantity || '—'}</td>
                      <td data-label="Unit Cost">{addEx.unitCost ? currency.format(addEx.unitCost) : '—'}</td>
                      <td data-label="Total Cost">{currency.format(Number(addEx.amount) || 0)}</td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan="7" style={{ textAlign: 'center', fontStyle: 'italic', color: 'var(--ink-3)' }}>
                        {financials.verifiedReceiptTotal > 0
                          ? `Actual spending is based on ${currency.format(financials.verifiedReceiptTotal)} in verified receipts.`
                          : 'No requisitions recorded under this approved budget.'}
                      </td>
                    </tr>
                  )}
                </tbody>
                {additionalExpenses.length ? (
                  <tfoot>
                    <tr>
                      <th colSpan="6">Total Additional Requisition Cost</th>
                      <th>{currency.format(additionalTotal)}</th>
                    </tr>
                  </tfoot>
                ) : null}
              </table>
            </div>

            <div className="details-breakdown" style={{ marginTop: '24px', borderTop: '2px solid #e5e7eb', paddingTop: '16px' }}>
              <table className="data-table" style={{ width: '100%', maxWidth: '600px', marginLeft: 'auto' }}>
                <tbody>
                  <tr>
                    <td style={{ fontWeight: 600 }}>Approved Budget Amount</td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{currency.format(financials.approvedBudget || totalAmount)}</td>
                  </tr>
                  <tr>
                    <td>Total Recorded Expenses</td>
                    <td style={{ textAlign: 'right', color: 'var(--ink-2)' }}>- {currency.format(totalExpense)}</td>
                  </tr>
                  <tr>
                    <td>Budget Utilization</td>
                    <td style={{ textAlign: 'right', color: 'var(--ink-2)' }}>{formatUtilization(financials.utilization)}%</td>
                  </tr>
                  <tr style={{ backgroundColor: 'var(--surface-2)' }}>
                    <td style={{ fontWeight: 700, fontSize: '1.1em' }}>Remaining Balance</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, fontSize: '1.1em', color: financials.remainingBudget < 0 ? '#ef4444' : '#10b981' }}>
                      {currency.format(financials.remainingBudget)}
                    </td>
                  </tr>
                </tbody>
              </table>
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
              Record Requisition
            </button>
          )}
        </div>
      </header>

      <section className="dashboard-content">

      {isAddModalOpen && (
        <div className="modal-overlay">
          <div
            className="modal-content additional-expense-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="additional-expense-title"
          >
            <div className="additional-expense-header">
              <h2 id="additional-expense-title">Record Requisition</h2>
              <p>Add one or more actual costs under one approved Project, Event, or Payroll. This does not create another budget record.</p>
            </div>
            <form onSubmit={handleAddExpenseSubmit} className="additional-expense-form">
              <div className="additional-expense-grid">
                <label className="field additional-expense-field">
                  <span>Approved Project, Event, or Payroll</span>
                  <select
                    value={addExpenseForm.parentProjectId}
                    onChange={e => setAddExpenseForm({...addExpenseForm, parentProjectId: e.target.value})}
                    disabled={isAddingExpense || recordableProjectEvents.length === 0}
                    required
                  >
                    <option value="">
                      {recordableProjectEvents.length === 0
                        ? 'No approved records available'
                        : 'Select the parent record...'}
                    </option>
                    {recordableProjectEvents
                      .map(ex => (
                        <option key={ex.id} value={ex.id}>
                          {ex.event || ex.project || 'Untitled Project'} ({ex.type || 'Project'})
                        </option>
                      ))}
                  </select>
                </label>

                <label className="field additional-expense-field">
                  <span>Requisition Category</span>
                  <select
                    value={addExpenseForm.category}
                    onChange={e => setAddExpenseForm({...addExpenseForm, category: e.target.value})}
                    disabled={isAddingExpense}
                    required
                  >
                    {categories.map(category => (
                      <option key={category} value={category}>{category}</option>
                    ))}
                  </select>
                </label>

                <label className="field additional-expense-field">
                  <span>Date Incurred</span>
                  <input
                    type="date"
                    value={addExpenseForm.date}
                    onChange={e => setAddExpenseForm({...addExpenseForm, date: e.target.value})}
                    disabled={isAddingExpense}
                    required
                  />
                </label>

                <label className="field additional-expense-field additional-expense-field--wide">
                  <span>Remarks (Optional)</span>
                  <textarea
                    value={addExpenseForm.remarks}
                    onChange={e => setAddExpenseForm({...addExpenseForm, remarks: e.target.value})}
                    disabled={isAddingExpense}
                    rows={3}
                    placeholder="Add context or notes about this expense"
                  />
                </label>
              </div>

              <div className="requisition-rows-section" style={{ marginTop: '20px' }}>
                <p className="eyebrow">Requisition items</p>
                <div style={{ overflowX: 'auto' }}>
                  <table className="add-row-table">
                    <thead>
                      <tr>
                        <th>Requisition Item</th>
                        <th style={{ width: '90px' }}>Quantity</th>
                        <th style={{ width: '140px' }}>Unit Cost</th>
                        <th style={{ width: '140px' }}>Total Cost</th>
                        <th style={{ width: '40px' }} />
                      </tr>
                    </thead>
                    <tbody>
                      {requisitionItems.map((item, index) => (
                        <tr key={`requisition-row-${index}`}>
                          <td>
                            <input
                              type="text"
                              value={item.itemName}
                              onChange={(e) => updateRequisitionItem(index, 'itemName', e.target.value)}
                              disabled={isAddingExpense}
                              placeholder="e.g. Extension Wire"
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              min="0"
                              value={item.quantity}
                              onChange={(e) => updateRequisitionItem(index, 'quantity', e.target.value)}
                              disabled={isAddingExpense}
                            />
                          </td>
                          <td>
                            <CurrencyInput
                              value={item.unitCost}
                              onValueChange={(val) => updateRequisitionItem(index, 'unitCost', val)}
                              disabled={isAddingExpense}
                            />
                          </td>
                          <td className="computed-cell">
                            {currency.format((Number(item.quantity) || 0) * (Number(item.unitCost) || 0))}
                          </td>
                          <td>
                            <button
                              type="button"
                              className="remove-row-btn"
                              onClick={() => removeRequisitionItemRow(index)}
                              disabled={isAddingExpense || requisitionItems.length === 1}
                              aria-label="Remove requisition row"
                            >
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="total-row">
                        <th colSpan="3" style={{ textAlign: 'right' }}>Total Additional Requisition Cost</th>
                        <th>{currency.format(totalRequisitionCost)}</th>
                        <th />
                      </tr>
                    </tfoot>
                  </table>
                </div>
                <div className="add-row-actions">
                  <button type="button" className="add-row-btn" onClick={addRequisitionItemRow} disabled={isAddingExpense}>
                    <PlusCircle size={16} /> Add Requisition Row
                  </button>
                </div>
              </div>

              <div className="additional-expense-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setIsAddModalOpen(false)}
                  disabled={isAddingExpense}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="primary-button"
                  disabled={isAddingExpense || recordableProjectEvents.length === 0}
                >
                  {isAddingExpense ? 'Saving requisition...' : 'Add to Requisition Breakdown'}
                </button>
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
                onChange={(event) => {
                  setProjectFilter(event.target.value)
                  setExpensePage(1)
                }}
                placeholder="Search by project..."
              />
            </label>
            <label className="field">
              <span>Date</span>
              <input
                type="date"
                value={dateFilter}
                onChange={(event) => {
                  setDateFilter(event.target.value)
                  setExpensePage(1)
                }}
              />
            </label>
            <label className="field">
              <span>Category</span>
              <select
                value={categoryFilter}
                onChange={(event) => {
                  setCategoryFilter(event.target.value)
                  setExpensePage(1)
                }}
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
                onChange={(event) => {
                  setStatusFilter(event.target.value)
                  setExpensePage(1)
                }}
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
                <p className="eyebrow" style={{ margin: '0 0 4px', fontSize: '0.85rem', fontWeight: 600, color: 'var(--ink-3)', textTransform: 'uppercase' }}>Transaction History</p>
                <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700, color: 'var(--ink)' }}>Latest expenses</h2>
              </div>
              <span className="items-found-badge" style={{ padding: '4px 12px', backgroundColor: 'var(--surface-2)', borderRadius: '999px', fontSize: '0.85rem', fontWeight: 500, color: 'var(--ink)' }}>
                Page {safeExpensePage} of {expenseTotalPages} &nbsp;·&nbsp; {paginatedActiveExpenses.length} entries shown
              </span>
            </div>
            <table className="data-table data-table--ledger">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Title</th>
                  <th>Category</th>
                  <th className="num">Amount</th>
                  <th>Receipt</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {activeExpenses.length ? (
                  paginatedActiveExpenses.map((expense) => {
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
                          <td data-label="Title" style={{ color: 'var(--ink)' }}>
                            {expense.event || expense.project || expense.payrollNumber || 'Untitled'}
                          </td>
                          <td data-label="Category" style={{ color: 'var(--ink-2)' }}>{expense.category || '—'}</td>
                          <td className="num" data-label="Amount" style={{ fontWeight: 600, color: 'var(--positive)' }}>
                            {currency.format(Number(expense.amount) || 0)}
                          </td>
                          <td data-label="Receipt">
                            {hasReceipt ? (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 10px', borderRadius: '999px', fontSize: '0.75rem', fontWeight: 600, backgroundColor: 'var(--positive-soft)', color: 'var(--positive)', whiteSpace: 'nowrap' }}>
                                ✅ Uploaded
                              </span>
                            ) : (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 10px', borderRadius: '999px', fontSize: '0.75rem', fontWeight: 600, backgroundColor: 'var(--negative-soft)', color: 'var(--negative)', whiteSpace: 'nowrap' }}>
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
            <PaginationControls
              currentPage={safeExpensePage}
              totalPages={expenseTotalPages}
              totalItems={activeExpenses.length}
              pageSize={EXPENSES_PAGE_SIZE}
              onPageChange={setExpensePage}
              isFiltered={hasExpenseFilters}
              idPrefix="expenses"
            />
          </div>
        ) : (
          <div className="overview-card" style={{ padding: '24px' }}>
            <p className="eyebrow" style={{ margin: '0 0 4px', fontSize: '0.85rem', fontWeight: 600, color: 'var(--ink-3)', textTransform: 'uppercase' }}>Archive</p>
            <h2 style={{ margin: '0 0 24px', fontSize: '1.5rem', fontWeight: 700, color: 'var(--ink)' }}>Archived expenses</h2>
            <table className="data-table data-table--ledger">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Title</th>
                  <th>Category</th>
                  <th className="num">Amount</th>
                  <th>Archived</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {archivedExpenses.length ? (
                  archivedExpenses.map((expense) => (
                    <Fragment key={expense.id}>
                      <tr>
                        <td data-label="Date" style={{ whiteSpace: 'nowrap', color: 'var(--ink-2)' }}>
                          {expense.date || expense.approvedAt
                            ? new Date(
                                expense.date || expense.approvedAt
                              ).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                            : '—'}
                        </td>
                        <td data-label="Title" style={{ color: 'var(--ink)' }}>
                          {expense.event || expense.project || expense.payrollNumber || 'Untitled'}
                        </td>
                        <td data-label="Category" style={{ color: 'var(--ink-2)' }}>
                          {expense.category || 'Uncategorized'}
                        </td>
                        <td className="num" data-label="Amount" style={{ fontWeight: 600, color: 'var(--positive)' }}>
                          {currency.format(Number(expense.amount) || 0)}
                        </td>
                        <td data-label="Archived" style={{ whiteSpace: 'nowrap', color: 'var(--ink-3)' }}>
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

        <div style={{ margin: '32px 0 16px' }}>
          <p className="eyebrow">Requisition Breakdown</p>
          <h2 style={{ margin: '4px 0 6px' }}>Consolidated actual spending</h2>
          <p style={{ margin: 0, color: 'var(--ink-3)' }}>
            Requisitions remain included in their approved parent record and its utilization totals.
          </p>
        </div>

        {/* Requisition and utilization overview */}
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
              {currency.format(breakdownData.totalBudget)} in approved working budgets for{' '}
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
                  const utilization = mData.budget > 0 ? Math.round((mData.total / mData.budget) * 100) : 0
                  
                  // Calculate month aggregates
                  const addItems = mData.items.filter(e => e.isAdditional)
                  const additionalAmount = addItems.reduce((sum, e) => sum + (Number(e.amount)||0), 0)
                  const baseAmount = mData.total - additionalAmount
                  
                  const receiptCount = mData.items.reduce((count, e) => count + (receiptLinks[e.id] || 0), 0)
                  const largestCategory = Object.entries(mData.categories).sort(([, a], [, b]) => b - a)[0]

                  return (
                    <div key={m} className="overview-card" style={{ padding: '20px', boxShadow: 'var(--shadow)', border: '1px solid var(--border-soft)' }}>
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
                                <div style={{ fontSize: '0.85rem', color: 'var(--ink-soft)', fontWeight: 500, marginBottom: '2px' }}>Requisitions</div>
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
                                        <div className="flex justify-between items-start gap-4 mb-4">
                                          <div className="min-w-0">
                                            <div style={{ fontWeight: 600, color: 'var(--ink-dark)', fontSize: '1.05rem' }}>{cat}</div>
                                            <div style={{ fontSize: '0.9rem', color: 'var(--ink-soft)', marginTop: '4px' }}>
                                              {catItems.length} {catItems.length === 1 ? 'transaction' : 'transactions'}
                                            </div>
                                          </div>
                                          <div className="text-right shrink-0">
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
                                    const approvedBudget = Number(e.approvedBudget) || 0;
                                    const expensesTotal = Number(e.totalExpenses) || 0;
                                    const remaining = Number(e.remainingBudget) || 0;
                                    return (
                                      <div key={e.id} className="p-4 border border-[var(--line)] rounded-xl bg-[var(--surface)] flex flex-col gap-3">
                                        <div className="min-w-0">
                                          <div className="font-semibold text-[var(--ink)] break-words">{e.event || e.project || 'Untitled'}</div>
                                          <div className="text-sm text-[var(--ink-2)] mt-1">
                                            {e.isAdditional ? 'Requisition' : (e.date || e.approvedAt ? new Date(e.date || e.approvedAt).toLocaleDateString() : '')}
                                          </div>
                                        </div>

                                        <div className="grid grid-cols-3 gap-3 pt-3 border-t border-[var(--line)] text-sm">
                                          <div className="min-w-0">
                                            <div className="text-[var(--ink-3)] text-xs uppercase tracking-wider mb-1">Budget</div>
                                            <div className="font-semibold tabular-nums">{currency.format(approvedBudget)}</div>
                                          </div>
                                          <div className="min-w-0">
                                            <div className="text-[var(--ink-3)] text-xs uppercase tracking-wider mb-1">Expenses</div>
                                            <div className="tabular-nums">{currency.format(expensesTotal)}</div>
                                          </div>
                                          <div className="min-w-0">
                                            <div className="text-[var(--ink-3)] text-xs uppercase tracking-wider mb-1">Remaining</div>
                                            <div className={`font-semibold tabular-nums ${remaining < 0 ? 'text-[var(--negative)]' : 'text-[var(--brand)]'}`}>
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

      <Suspense fallback={null}>
        {scanModalExpense && (
          <ReceiptScanModal
            expense={scanModalExpense}
            onClose={() => setScanModalExpense(null)}
            onSave={handleScanSave}
          />
        )}
      </Suspense>
    </>
  )
}

export default ExpensesPage
