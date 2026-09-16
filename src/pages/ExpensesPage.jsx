import { useEffect, useMemo, useState, lazy, Suspense, useCallback } from 'react'
import { AlertCircle, FileText, CheckCircle, ChevronDown, Plus, PlusCircle, Trash2, CreditCard, ChevronRight, Calculator, Archive, ArchiveRestore, X } from 'lucide-react'
import { useBudget } from '../context/BudgetContext'
import { useAuditLog } from '../context/AuditLogContext'
import { useAuth } from '../context/AuthContext'
import { useNotifications } from '../context/NotificationContext'
import { supabase } from '../supabase/supabaseClient'
import { validateReceiptFile, getUploadErrorMessage, generateReceiptPath, logUploadDebugInfo, insertReceiptRecord } from '../utils/uploadUtils'
import ReceiptPrintPreview from '../components/ReceiptPrintPreview'
import CurrencyInput from '../components/CurrencyInput'
import YearSpinner from '../components/YearSpinner'
import { getRecordPeriod } from '../utils/budgetUtils'
import { summarizeApprovedBudgetFinancials, materializeActualExpenseRows } from '../utils/projectEventFinancials'
import '../components/documents/AdditionalDocuments.css'

const EMPTY_REQUISITION_ROW = { itemName: '', quantity: 1, unitCost: 0 }

const ReceiptScanModal = lazy(() => import('../components/receipts/ReceiptScanModal'))

const currency = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  maximumFractionDigits: 0,
})

const monthLabels = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const REPORT_TYPE_OPTIONS = [
  { value: 'monthly', label: 'Monthly Report' },
  { value: 'quarterly', label: 'Quarterly Report' },
  { value: 'yearly', label: 'Yearly Report' },
]

const EXPORT_QUARTER_OPTIONS = [
  { value: 1, label: '1st Quarter (January–March)', range: 'January–March', ordinal: '1st' },
  { value: 2, label: '2nd Quarter (April–June)', range: 'April–June', ordinal: '2nd' },
  { value: 3, label: '3rd Quarter (July–September)', range: 'July–September', ordinal: '3rd' },
  { value: 4, label: '4th Quarter (October–December)', range: 'October–December', ordinal: '4th' },
]

// The Export PDF year dropdown always starts at this floor and always
// reaches at least 10 years past whatever "today" is — so the list keeps
// extending into the future on its own as years pass, with no fixed end
// year to come back and bump later.
const EXPORT_YEAR_FLOOR = 2025
const EXPORT_YEAR_LOOKAHEAD = 10

function buildExportYearOptions(currentYear) {
  const startYear = Math.min(EXPORT_YEAR_FLOOR, currentYear)
  const endYear = currentYear + EXPORT_YEAR_LOOKAHEAD
  return Array.from({ length: endYear - startYear + 1 }, (_, i) => startYear + i)
}

function formatReportDate(value) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// Every record in this system belongs to the same single office — there is
// no per-record "office" field to read, so the report states the one that
// actually owns it, matching the letterhead.
const RESPONSIBLE_OFFICE = 'Office of the Sangguniang Kabataan'

// A materialized "actual expense" row (see materializeActualExpenseRows) is
// either the record's own direct verified receipts ('parent-receipts') or an
// itemized additional requisition linked to it — each needs a different
// description, since only the requisition kind carries its own item name.
function buildTransactionDescription(row, record) {
  if (row.actualExpenseKind === 'parent-receipts') {
    const description = (record.description || '').replace(/\s+/g, ' ').trim()
    return description || 'Recorded expense (verified receipt)'
  }
  const raw = row.itemName || row.description || row.remarks || ''
  return raw.replace(/\s+/g, ' ').trim() || 'Additional requisition'
}

// Every actual-expense row materialized for the whole system, narrowed down
// to the ones that belong to this one approved record — its direct verified
// receipts plus any additional requisitions linked to it.
function getRecordTransactions(record, allActualRows) {
  const recordId = String(record.id)
  const requestId = record.requestId ? String(record.requestId) : null

  return allActualRows
    .filter((row) => {
      if (Number(row.amount) <= 0) return false
      if (row.actualExpenseKind === 'parent-receipts') return String(row.id) === recordId
      const parentId = String(row.parentProjectId ?? '')
      return parentId === recordId || (requestId && parentId === requestId)
    })
    .map((row) => {
      const rawDate = row.date || row.eventDate || row.scheduledDate || record.eventDate || record.date || record.approvedAt
      return {
        rawDate,
        dateLabel: formatReportDate(rawDate),
        description: buildTransactionDescription(row, record),
        amount: Number(row.amount) || 0,
      }
    })
    .sort((a, b) => new Date(a.rawDate || 0) - new Date(b.rawDate || 0))
    .map(({ dateLabel, description, amount }) => ({ dateLabel, description, amount }))
}

// One full financial "card" per approved record: general info, the
// Approved/Actual/Remaining/Utilization/Returned figures, a plain-language
// utilization status, and its own expense transactions — everything the
// exported PDF needs to render that record's section, already computed so
// exportPdf.js stays presentational.
function buildRecordCard(record, allActualRows) {
  const period = getRecordPeriod(record)
  const approvedBudget = Number(record.approvedBudget) || 0
  const totalExpenses = Number(record.totalExpenses) || 0
  const remainingBudget = Number.isFinite(record.remainingBudget)
    ? record.remainingBudget
    : approvedBudget - totalExpenses
  const utilization = approvedBudget > 0 ? (totalExpenses / approvedBudget) * 100 : 0
  const utilizationStatus = totalExpenses <= 0
    ? 'No Expenses Recorded'
    : utilization >= 99.5
      ? 'Fully Utilized'
      : 'Partially Utilized'

  return {
    id: record.id,
    name: record.event || record.project || 'Untitled',
    type: record.type || 'Project',
    category: record.category || 'Uncategorized',
    month: period?.month || null,
    year: period?.year || null,
    status: record.projectStatus || 'Ongoing',
    responsibleOffice: RESPONSIBLE_OFFICE,
    approvedBudget,
    totalExpenses,
    remainingBudget,
    utilization,
    utilizationStatus,
    returnedBudget: Number(record.returnedBudget) || 0,
    returnedAt: record.returnedAt || null,
    transactions: getRecordTransactions(record, allActualRows),
  }
}

// Builds the data behind an Export PDF request: every approved Project,
// Event, and Payroll record in the selected period — grouped by month, each
// with its own full financial card — plus the totals for the report-wide
// Overall Summary. Quarterly and Yearly always enumerate every month in
// range (even ones with no records) so the report's structure matches what
// was asked for the period, not just whichever months happened to have data.
function buildExpenseReportData({ expenses, verifiedReceiptTotals, reportType, year, month, quarter }) {
  const monthsInScope = reportType === 'monthly'
    ? [Number(month)]
    : reportType === 'quarterly'
      ? [1, 2, 3].map((offset) => (Number(quarter) - 1) * 3 + offset)
      : Array.from({ length: 12 }, (_, i) => i + 1)

  const yearly = summarizeApprovedBudgetFinancials(expenses, verifiedReceiptTotals, { view: 'yearly', year })
  const allActualRows = materializeActualExpenseRows(expenses, verifiedReceiptTotals)

  const months = monthsInScope.map((m) => {
    const monthRecords = yearly.records
      .filter((record) => getRecordPeriod(record)?.month === m)
      .sort((a, b) => String(a.event || a.project || '').localeCompare(String(b.event || b.project || '')))
      .map((record) => buildRecordCard(record, allActualRows))

    return {
      month: m,
      label: `${monthLabels[m - 1]} ${year}`,
      records: monthRecords,
    }
  })

  const allRecords = months.flatMap((m) => m.records)
  const totalBudget = allRecords.reduce((sum, r) => sum + r.approvedBudget, 0)
  const totalExpenses = allRecords.reduce((sum, r) => sum + r.totalExpenses, 0)
  const totalReturnedBudget = allRecords.reduce((sum, r) => sum + r.returnedBudget, 0)

  return {
    months,
    overall: {
      totalBudget,
      approvedAllocations: allRecords.length,
      totalExpenses,
      remainingBudget: totalBudget - totalExpenses,
      totalReturnedBudget,
      projectCount: allRecords.filter((r) => r.type === 'Project').length,
      eventCount: allRecords.filter((r) => r.type === 'Event').length,
      payrollCount: allRecords.filter((r) => r.type === 'Payroll').length,
    },
  }
}


function ExpensesPage() {
  const {
    expenses,
    expensesSyncStatus,
    verifiedReceiptTotals,
    refreshExpensesFromSupabase,
    addAdditionalRequisition,
    updateExpenseReceipt,
  } = useBudget()
  const { addLog } = useAuditLog()
  const { user, role, profileName } = useAuth()
  const { addNotification } = useNotifications()
  const canUpload = ['SK Chairman', 'SK Treasurer'].includes(role)

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

  // Only the Chairman exports the breakdown — it is the report that leaves the
  // system, so it stays with the approving role.
  const canExportBreakdown = role === 'SK Chairman'
  const [breakdownExportState, setBreakdownExportState] = useState({ busy: false, error: '' })

  // Export Options dialog — lets the user pick a Monthly, Quarterly, or
  // Yearly period before a PDF is generated, instead of always exporting
  // whatever quarter the on-page breakdown happens to be showing.
  const [exportDialogOpen, setExportDialogOpen] = useState(false)
  const [exportReportType, setExportReportType] = useState('')
  const [exportYear, setExportYear] = useState(now.getFullYear())
  const [exportMonth, setExportMonth] = useState(now.getMonth() + 1)
  const [exportQuarter, setExportQuarter] = useState(Math.floor(now.getMonth() / 3) + 1)
  const [exportValidationError, setExportValidationError] = useState('')

  // Cheap enough to rebuild on every render — no need to memoize a
  // dozen-element array, and doing so would only pin it to a stale `now`.
  const exportYearOptions = buildExportYearOptions(now.getFullYear())

  function openExportDialog() {
    setExportReportType('')
    setExportValidationError('')
    setBreakdownExportState({ busy: false, error: '' })
    setExportDialogOpen(true)
  }

  function closeExportDialog() {
    setExportDialogOpen(false)
    setExportValidationError('')
  }

  async function handleGenerateExportPdf() {
    if (!exportReportType) {
      setExportValidationError('Select a report type — Monthly, Quarterly, or Yearly — to continue.')
      return
    }
    if (!exportYear) {
      setExportValidationError('Select the year for this report.')
      return
    }
    if (exportReportType === 'monthly' && !exportMonth) {
      setExportValidationError('Select the month for this Monthly report.')
      return
    }
    if (exportReportType === 'quarterly' && !exportQuarter) {
      setExportValidationError('Select the quarter for this Quarterly report.')
      return
    }

    setExportValidationError('')
    setBreakdownExportState({ busy: true, error: '' })

    try {
      const { months, overall } = buildExpenseReportData({
        expenses,
        verifiedReceiptTotals,
        reportType: exportReportType,
        year: exportYear,
        month: exportMonth,
        quarter: exportQuarter,
      })

      const periodLabel = exportReportType === 'monthly'
        ? `${monthLabels[exportMonth - 1]} ${exportYear}`
        : exportReportType === 'quarterly'
          ? `Quarter ${exportQuarter} ${exportYear} (${EXPORT_QUARTER_OPTIONS.find((q) => q.value === exportQuarter)?.range})`
          : String(exportYear)

      const periodSlug = exportReportType === 'monthly'
        ? `${exportYear}-${String(exportMonth).padStart(2, '0')}`
        : exportReportType === 'quarterly'
          ? `${exportYear}-Q${exportQuarter}`
          : String(exportYear)

      // Quarterly names the exact quarter selected ("2nd Quarter Expense
      // Report") rather than a generic "Quarterly Expense Report" — the
      // title should always say which one this is.
      const reportTitle = exportReportType === 'monthly'
        ? 'Monthly Expense Report'
        : exportReportType === 'quarterly'
          ? `${EXPORT_QUARTER_OPTIONS.find((q) => q.value === exportQuarter)?.ordinal || `${exportQuarter}th`} Quarter Expense Report`
          : 'Yearly Expense Report'

      const { exportExpensesReportPdf } = await import('../utils/exportPdf')
      await exportExpensesReportPdf({
        reportType: exportReportType,
        reportTitle,
        periodLabel,
        periodSlug,
        months,
        overall,
        preparedBy: [profileName, role].filter(Boolean).join(' — '),
      })

      setBreakdownExportState({ busy: false, error: '' })
      closeExportDialog()
    } catch (err) {
      console.error('Expense report PDF export failed:', err)
      setBreakdownExportState({ busy: false, error: 'Could not generate the PDF. Please try again.' })
    }
  }

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
          style={{ display: 'flex', alignItems: 'center', gap: '16px' }}
        >
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
          </div>
        </div>

        {/* Monthly breakdown hierarchical view */}
        <div style={{ marginTop: '32px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
            <p className="eyebrow" style={{ margin: 0 }}>Monthly Breakdown</p>
            {canExportBreakdown && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                {breakdownExportState.error && (
                  <span className="form-note" style={{ margin: 0, color: 'var(--negative)' }} role="alert">
                    {breakdownExportState.error}
                  </span>
                )}
                <button
                  type="button"
                  className="secondary-button"
                  onClick={openExportDialog}
                  disabled={breakdownExportState.busy}
                  title="Choose a Monthly, Quarterly, or Yearly period to export as PDF"
                >
                  <FileText size={16} aria-hidden="true" />
                  {breakdownExportState.busy ? 'Preparing PDF…' : 'Export PDF'}
                </button>
              </div>
            )}
          </div>
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
                          
                      {/* Fixed-floor columns keep every label on one line, so
                          the figures below them share a common baseline. */}
                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                        gap: '20px 24px',
                      }}>
                        {[
                          { label: 'Total Expenses', value: currency.format(baseAmount) },
                          ...(additionalAmount > 0
                            ? [{ label: 'Requisitions', value: currency.format(additionalAmount) }]
                            : []),
                          { label: 'Total Spending', value: currency.format(mData.total), emphasis: true },
                          { label: 'Transactions', value: mData.items.length },
                          { label: 'Receipts Uploaded', value: receiptCount },
                          ...(utilization > 0
                            ? [{ label: 'Budget Utilization', value: `${utilization}%` }]
                            : []),
                        ].map((stat) => (
                          <div key={stat.label} style={{ minWidth: 0 }}>
                            <div style={{
                              fontSize: '0.72rem',
                              fontWeight: 600,
                              textTransform: 'uppercase',
                              letterSpacing: '0.5px',
                              color: 'var(--ink-3)',
                              whiteSpace: 'nowrap',
                              marginBottom: '6px',
                            }}>
                              {stat.label}
                            </div>
                            <div style={{
                              fontSize: '1.15rem',
                              fontWeight: stat.emphasis ? 700 : 600,
                              color: 'var(--ink)',
                              fontVariantNumeric: 'tabular-nums',
                              lineHeight: 1.2,
                            }}>
                              {stat.value}
                            </div>
                          </div>
                        ))}
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
                         <div style={{
                           display: 'grid',
                           gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                           gap: '16px',
                         }}>
                            {[
                              { label: 'Total Spending', value: currency.format(mData.total) },
                              {
                                label: 'Largest Category',
                                value: largestCategory ? largestCategory[0] : '—',
                                caption: largestCategory ? currency.format(largestCategory[1]) : null,
                                compact: true,
                              },
                              { label: 'Transactions', value: mData.items.length },
                              ...(utilization > 0
                                ? [{
                                    label: 'Budget Utilization',
                                    value: `${utilization}%`,
                                    caption: `Of Q${breakdownQuarter} budget`,
                                  }]
                                : []),
                            ].map((stat) => (
                              <div
                                key={stat.label}
                                className="overview-card"
                                style={{
                                  padding: '16px',
                                  border: '1px solid var(--border-soft)',
                                  boxShadow: 'none',
                                  display: 'flex',
                                  flexDirection: 'column',
                                  minWidth: 0,
                                }}
                              >
                                <div style={{
                                  fontSize: '0.72rem',
                                  fontWeight: 600,
                                  textTransform: 'uppercase',
                                  letterSpacing: '0.5px',
                                  color: 'var(--ink-3)',
                                  whiteSpace: 'nowrap',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                }}>
                                  {stat.label}
                                </div>
                                <div style={{
                                  fontSize: stat.compact ? '1.15rem' : '1.5rem',
                                  fontWeight: 700,
                                  margin: '8px 0 0',
                                  color: 'var(--ink)',
                                  fontVariantNumeric: 'tabular-nums',
                                  lineHeight: 1.2,
                                  overflowWrap: 'break-word',
                                }}>
                                  {stat.value}
                                </div>
                                {stat.caption ? (
                                  <div style={{
                                    fontSize: '0.85rem',
                                    color: 'var(--ink-soft)',
                                    marginTop: 'auto',
                                    paddingTop: '6px',
                                    fontVariantNumeric: 'tabular-nums',
                                  }}>
                                    {stat.caption}
                                  </div>
                                ) : null}
                              </div>
                            ))}
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

      {exportDialogOpen ? (
        <div className="modal-overlay" onClick={() => (breakdownExportState.busy ? null : closeExportDialog())}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '480px', width: '95%' }}>
            <div className="modal-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px' }}>
              <div>
                <p className="eyebrow" style={{ margin: '0 0 4px' }}>Export PDF</p>
                <h2 style={{ margin: 0 }}>Export Options</h2>
              </div>
              <button type="button" className="icon-button" onClick={closeExportDialog} aria-label="Close" disabled={breakdownExportState.busy}>
                <X size={20} />
              </button>
            </div>

            <div className="modal-body">
              <p style={{ margin: '0 0 16px', color: 'var(--ink-soft)', fontSize: '0.9rem' }}>
                Choose the reporting period for the expense records to include in the PDF.
              </p>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--ink-2)', marginBottom: '8px' }}>
                  Report Type
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                  {REPORT_TYPE_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className={exportReportType === option.value ? 'primary-button' : 'secondary-button'}
                      onClick={() => setExportReportType(option.value)}
                      style={{ padding: '10px 8px', fontSize: '0.85rem' }}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              {exportReportType ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: '1 1 140px' }}>
                    <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--ink-2)' }}>Select Year</span>
                    <select
                      className="receipts-select"
                      value={exportYear}
                      onChange={(e) => setExportYear(Number(e.target.value))}
                    >
                      {exportYearOptions.map((yr) => (
                        <option key={yr} value={yr}>{yr}</option>
                      ))}
                    </select>
                  </label>

                  {exportReportType === 'monthly' && (
                    <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: '1 1 160px' }}>
                      <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--ink-2)' }}>Select Month</span>
                      <select
                        className="receipts-select"
                        value={exportMonth}
                        onChange={(e) => setExportMonth(Number(e.target.value))}
                      >
                        {monthLabels.map((label, i) => (
                          <option key={label} value={i + 1}>{label}</option>
                        ))}
                      </select>
                    </label>
                  )}

                  {exportReportType === 'quarterly' && (
                    <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: '1 1 220px' }}>
                      <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--ink-2)' }}>Select Quarter</span>
                      <select
                        className="receipts-select"
                        value={exportQuarter}
                        onChange={(e) => setExportQuarter(Number(e.target.value))}
                      >
                        {EXPORT_QUARTER_OPTIONS.map((q) => (
                          <option key={q.value} value={q.value}>{q.label}</option>
                        ))}
                      </select>
                    </label>
                  )}
                </div>
              ) : null}

              {exportReportType ? (
                <div style={{ marginTop: '16px', padding: '10px 12px', background: 'var(--surface-2)', borderRadius: 'var(--radius-control)', border: '1px solid var(--line)' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--ink-2)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                    Selected period
                  </span>
                  <p style={{ margin: '4px 0 0', fontWeight: 600, color: 'var(--ink)' }}>
                    {exportReportType === 'monthly' && `${monthLabels[exportMonth - 1]} ${exportYear}`}
                    {exportReportType === 'quarterly' && `Quarter ${exportQuarter} ${exportYear} (${EXPORT_QUARTER_OPTIONS.find((q) => q.value === exportQuarter)?.range})`}
                    {exportReportType === 'yearly' && `${exportYear}`}
                  </p>
                </div>
              ) : null}

              {(exportValidationError || breakdownExportState.error) ? (
                <div className="form-error" role="alert" style={{ marginTop: '16px' }}>
                  {exportValidationError || breakdownExportState.error}
                </div>
              ) : null}
            </div>

            <div className="modal-footer" style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button type="button" className="secondary-button" onClick={closeExportDialog} disabled={breakdownExportState.busy}>
                Cancel
              </button>
              <button type="button" className="primary-button" onClick={handleGenerateExportPdf} disabled={breakdownExportState.busy}>
                <FileText size={16} aria-hidden="true" />
                {breakdownExportState.busy ? 'Generating…' : 'Generate PDF'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}

export default ExpensesPage
