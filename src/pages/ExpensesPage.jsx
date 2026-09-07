import { useEffect, useMemo, useState, lazy, Suspense, useCallback } from 'react'
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
import { getRecordPeriod } from '../utils/budgetUtils'
import { summarizeApprovedBudgetFinancials } from '../utils/projectEventFinancials'
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

  async function handleExportMonthlyBreakdown() {
    setBreakdownExportState({ busy: true, error: '' })
    try {
      const months = Object.entries(breakdownData.byMonth).map(([mStr, mData]) => {
        const m = Number(mStr)
        const additionalAmount = mData.items
          .filter((e) => e.isAdditional)
          .reduce((sum, e) => sum + (Number(e.amount) || 0), 0)
        const receipts = mData.items.reduce((count, e) => count + (receiptLinks[e.id] || 0), 0)

        return {
          label: `${monthLabels[m]} ${breakdownYear}`,
          baseAmount: mData.total - additionalAmount,
          additionalAmount,
          total: mData.total,
          budget: mData.budget,
          utilization: mData.budget > 0 ? (mData.total / mData.budget) * 100 : 0,
          transactions: mData.items.length,
          receipts,
          categories: Object.entries(mData.categories)
            .sort(([, a], [, b]) => b - a)
            .map(([name, amount]) => ({
              name,
              amount,
              count: mData.items.filter((e) => (e.category || 'Uncategorized') === name).length,
              share: mData.total > 0 ? (amount / mData.total) * 100 : 0,
            })),
          items: [...mData.items]
            .sort((a, b) => new Date(b.approvedAt || b.date || 0) - new Date(a.approvedAt || a.date || 0))
            .map((e) => ({
              title: e.event || e.project || 'Untitled',
              date: e.isAdditional
                ? 'Requisition'
                : (e.date || e.approvedAt ? new Date(e.date || e.approvedAt).toLocaleDateString() : '—'),
              budget: Number(e.approvedBudget) || 0,
              expenses: Number(e.totalExpenses) || 0,
              remaining: Number(e.remainingBudget) || 0,
            })),
        }
      })

      const { exportMonthlyBreakdownPdf } = await import('../utils/exportPdf')
      exportMonthlyBreakdownPdf({
        months,
        quarter: breakdownQuarter,
        year: breakdownYear,
        totals: {
          budget: breakdownData.totalBudget,
          spending: breakdownData.totalSpent,
          remaining: breakdownData.remaining,
          utilization: breakdownData.utilization,
          transactions: months.reduce((sum, month) => sum + month.transactions, 0),
          receipts: months.reduce((sum, month) => sum + month.receipts, 0),
        },
        preparedBy: [profileName, role].filter(Boolean).join(' — '),
      })
      setBreakdownExportState({ busy: false, error: '' })
    } catch (err) {
      console.error('Monthly breakdown PDF export failed:', err)
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
                  onClick={handleExportMonthlyBreakdown}
                  disabled={breakdownExportState.busy || !breakdownData.expenses.length}
                  title={breakdownData.expenses.length
                    ? `Export the Quarter ${breakdownQuarter} ${breakdownYear} breakdown as PDF`
                    : 'No expenses to export for this quarter'}
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
    </>
  )
}

export default ExpensesPage
