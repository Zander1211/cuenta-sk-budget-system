import { Fragment, useMemo, useState, useEffect, useRef, lazy, Suspense, useCallback } from 'react'
import { Archive, RotateCcw, FileText, Receipt as ReceiptIcon } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { useBudget } from '../context/BudgetContext'
import RoleGate from '../components/RoleGate'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabase/supabaseClient'
import CurrencyInput from '../components/CurrencyInput'
import BudgetBreakdownTable from '../components/BudgetBreakdownTable'
import RecordFilterBar from '../components/RecordFilterBar'
import GenerateDocumentsModal from '../components/documents/GenerateDocumentsModal'
import RecordReceiptsModal from '../components/receipts/RecordReceiptsModal'
import RowActionsMenu from '../components/RowActionsMenu'
import { useNotifications } from '../context/NotificationContext'
import { validateReceiptFile, getUploadErrorMessage, generateReceiptPath, logUploadDebugInfo, insertReceiptRecord } from '../utils/uploadUtils'
import { calculateProjectEventFinancials, formatUtilization } from '../utils/projectEventFinancials'

const ReceiptScanModal = lazy(() => import('../components/receipts/ReceiptScanModal'))
// Payroll is a tab here now, but it carries its own tables and scan modal, so it
// stays out of this bundle until someone opens the tab.
const PayrollPanel = lazy(() => import('./PayrollPage'))

const currency = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  maximumFractionDigits: 0,
})

// The header follows the active tab so the Payroll view keeps the wording it
// had back when it was its own page.
const TAB_HEADINGS = {
  projects: {
    eyebrow: 'Projects & Events Dashboard',
    title: 'Projects & Events',
    description: 'Monitor budgets, expenses, and completion status of all approved projects and events.',
  },
  events: {
    eyebrow: 'Projects & Events Dashboard',
    title: 'Projects & Events',
    description: 'Monitor budgets, expenses, and completion status of all approved projects and events.',
  },
  payroll: {
    eyebrow: 'Payroll Dashboard',
    title: 'Approved Payroll',
    description: 'Monitor budgets, expenses, and status of all approved payroll requests.',
  },
  archived: {
    eyebrow: 'Projects & Events Dashboard',
    title: 'Archived Projects & Events',
    description: 'Completed projects and events that were archived. Restore one to move it back to the active lists.',
  },
}

// The archive mixes projects and events, so its labels stay type-neutral.
const TITLE_NOUN = {
  projects: 'Project',
  events: 'Event',
  archived: 'Project / Event',
  payroll: 'Payroll',
}

const CARD_HEADINGS = {
  projects: 'All Approved Projects',
  events: 'All Approved Events',
  archived: 'Archived Projects & Events',
  payroll: 'Approved Payroll',
}

function ProjectsEventsPage() {
  const { role, user } = useAuth()
  const { expenses, verifiedReceiptTotals, updateProjectStatus, refreshExpensesFromSupabase, updateExpenseReceipt, archiveExpense, restoreExpense } = useBudget()
  const { addNotification } = useNotifications()

  const [searchParams, setSearchParams] = useSearchParams()
  const highlightId = searchParams.get('highlight')
  const openDocsId = searchParams.get('openDocs')

  const [activeTab, setActiveTab] = useState(() => {
    const tab = searchParams.get('tab')
    return ['events', 'payroll', 'archived'].includes(tab) ? tab : 'projects'
  }) // 'projects' | 'events' | 'payroll' | 'archived'
  const [expanded, setExpanded] = useState({})
  const [highlightedId, setHighlightedId] = useState(null)

  // Full document-generation access is Chairman/Treasurer only, matching the
  // Documents page's own "Create Document" gate; Kagawad and Barangay
  // Treasurer keep view-only access through the main Documents page.
  const canGenerateDocs = ['SK Chairman', 'SK Treasurer'].includes(role)
  const [docGenTarget, setDocGenTarget] = useState(null) // { record, kind } | null

  // Receipts is open to every role on this page — Kagawad and Barangay
  // Treasurer get the same view-only access the main Receipts page already
  // gives them; RecordReceiptsModal itself gates Scan & Upload and Delete.
  const [receiptsTarget, setReceiptsTarget] = useState(null) // the record, or null

  const currentYear = new Date().getFullYear()

  const [searchFilter, setSearchFilter] = useState('')
  const [dateFilter, setDateFilter] = useState('')
  const [monthFilter, setMonthFilter] = useState('')
  const [yearFilter, setYearFilter] = useState(currentYear)
  const [categoryFilter, setCategoryFilter] = useState('All')
  const [statusFilter, setStatusFilter] = useState('')

  // Arrived here via the dashboard search — jump straight to the matching
  // record: pick the right tab, clear any filters that could hide it, expand
  // its details, and clear the query params so this only runs once.
  useEffect(() => {
    if (!highlightId) return
    const target = expenses.find((item) => String(item.id) === String(highlightId))
    if (!target) return

    // Payroll wasn't handled here before — a highlight link to a Payroll
    // record landed on the Projects tab, where that record never appears.
    setActiveTab(target.type === 'Event' ? 'events' : target.type === 'Payroll' ? 'payroll' : 'projects')
    setSearchFilter('')
    setDateFilter('')
    setMonthFilter('')
    setStatusFilter('')
    setCategoryFilter('All')
    setYearFilter('')
    setExpanded((prev) => ({ ...prev, [target.id]: 'view' }))
    setHighlightedId(target.id)

    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.delete('highlight')
      next.delete('tab')
      return next
    }, { replace: true })
  }, [highlightId, expenses, setSearchParams])

  // Arrived here via "Back"/"Cancel" from the Narrative & Photo
  // Documentation builder (a separate page — see DocumentGenerator's
  // handleOpenNarrativeReport) — reopen that same record's Documents modal
  // instead of leaving the user stranded on the plain Projects & Events
  // list, same idea as the `highlight` deep link above.
  useEffect(() => {
    if (!openDocsId) return
    const target = expenses.find((item) => String(item.id) === String(openDocsId))
    if (!target) return

    setActiveTab(target.type === 'Event' ? 'events' : 'projects')
    // Land on the Generated Documents tab, not the generator — coming back
    // from the narrative builder, seeing the new entry land in the list is
    // the useful confirmation, not an empty "generate new" form.
    setDocGenTarget({ record: target, kind: target.type === 'Event' ? 'event' : 'project', initialTab: 'history' })

    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.delete('openDocs')
      return next
    }, { replace: true })
  }, [openDocsId, expenses, setSearchParams])

  // Scroll the highlighted row into view once it's rendered.
  useEffect(() => {
    if (!highlightedId) return
    const el = document.getElementById(`project-row-${highlightedId}`)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [highlightedId, activeTab])

  // Fade the highlight out after a few seconds.
  useEffect(() => {
    if (!highlightedId) return
    const timeout = setTimeout(() => setHighlightedId(null), 4000)
    return () => clearTimeout(timeout)
  }, [highlightedId])

  const hasActiveFilters = searchFilter || dateFilter || monthFilter || (yearFilter !== currentYear) || (categoryFilter !== 'All') || statusFilter

  function resetFilters() {
    setSearchFilter('')
    setDateFilter('')
    setMonthFilter('')
    setYearFilter(currentYear)
    setCategoryFilter('All')
    setStatusFilter('')
  }

  const [errorsById, setErrorsById] = useState({})
  const [uploadingId, setUploadingId] = useState(null)
  const [receiptLinks, setReceiptLinks] = useState({})
  const [scanModalOpen, setScanModalOpen] = useState(false)
  const [scanFile, setScanFile] = useState(null)
  const [scanStatus, setScanStatus] = useState('idle')
  const [activeExpense, setActiveExpense] = useState(null)
  const [ocrData, setOcrData] = useState({ vendor: '', receiptNumber: '', date: '', amount: '', items: '' })

  const uploadInputRef = useRef(null)
  const pendingUploadExpenseRef = useRef(null)
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const RECEIPTS_BUCKET = 'receipts'

  function stopCamera() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }
  }

  useEffect(() => {
    if (scanStatus === 'camera') {
      navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
        .then(stream => {
          streamRef.current = stream
          if (videoRef.current) {
            videoRef.current.srcObject = stream
          }
        })
        .catch(err => {
          console.error('Camera error:', err)
          setScanStatus('camera_error')
        })
    } else {
      stopCamera()
    }
    return () => stopCamera()
  }, [scanStatus])

  async function uploadReceipt(expense, file, { appendedNotes = '' } = {}) {
    const validationError = validateReceiptFile(file, role)
    if (validationError) {
      setErrorsById(prev => ({ ...prev, [expense.id]: validationError }))
      return { error: new Error(validationError) }
    }

    setUploadingId(expense.id)
    setErrorsById(prev => ({ ...prev, [expense.id]: '' }))

    const filePath = generateReceiptPath(expense, file)
    try {
      const { error: uploadError } = await supabase.storage
        .from(RECEIPTS_BUCKET)
        .upload(filePath, file, { upsert: false })

      if (uploadError) throw Object.assign(uploadError, { uploadStep: 'storage' })

      const { error: dbError } = await insertReceiptRecord(
        supabase, expense, file, filePath, user, role
      )
      if (dbError) {
        await supabase.storage.from(RECEIPTS_BUCKET).remove([filePath])
        throw Object.assign(dbError, { uploadStep: 'receipt_record' })
      }

      const updatePayload = { receipt_url: filePath, receipt_name: file.name }
      if (appendedNotes) {
        updatePayload.remarks = expense.remarks ? `${expense.remarks}\n\n${appendedNotes}` : appendedNotes
      }

      const { error: linkError } = await supabase
        .from('expenses')
        .update(updatePayload)
        .eq('id', expense.id)

      if (linkError) {
        console.warn('Could not update expenses table in Supabase:', linkError)
      }

      updateExpenseReceipt(expense.id, filePath, file.name)

      await refreshExpensesFromSupabase()
      addNotification({ type: 'system', title: 'Receipt Uploaded', message: 'Receipt attached successfully.' })
      return { error: null }
    } catch (error) {
      logUploadDebugInfo(error, { expenseId: expense.id, filePath, step: error.uploadStep || 'unknown' })
      setErrorsById(prev => ({ ...prev, [expense.id]: getUploadErrorMessage(error) }))
      return { error }
    } finally {
      setUploadingId(null)
    }
  }

  const [scanModalExpense, setScanModalExpense] = useState(null)

  function triggerScanner(expense) {
    if (uploadingId !== null) return
    setScanModalExpense(expense)
  }

  const handleScanSave = useCallback(async () => {
    setScanModalExpense(null)
    await refreshExpensesFromSupabase()
  }, [refreshExpensesFromSupabase])

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

  const baseItems = useMemo(() => {
    return expenses.filter((item) => {
      const isProject = !item.type || item.type === 'Project'
      const isEvent = item.type === 'Event'
      const status = item.status || 'Approved'
      const isApproved = !item.isAdditional && ['Approved', 'Released'].includes(status)

      // The archive holds both kinds together; the active tabs exclude anything
      // that has been archived.
      if (activeTab === 'archived') return isApproved && (isProject || isEvent) && Boolean(item.archivedAt)
      if (activeTab === 'projects') return isApproved && isProject && !item.archivedAt
      if (activeTab === 'events') return isApproved && isEvent && !item.archivedAt
      return false
    })
  }, [expenses, activeTab])

  const categoryOptions = useMemo(() => {
    const categories = new Set(baseItems.map((item) => item.category).filter(Boolean))
    return Array.from(categories).sort()
  }, [baseItems])

  const filteredItems = useMemo(() => {
    return baseItems.filter((item) => {
      if (searchFilter) {
        const title = (item.project || item.event || '').toLowerCase()
        const purpose = (item.description || '').toLowerCase()
        const category = (item.category || '').toLowerCase()
        const creator = (item.requestedBy || '').toLowerCase()
        const q = searchFilter.toLowerCase()
        if (!title.includes(q) && !purpose.includes(q) && !category.includes(q) && !creator.includes(q)) {
          return false
        }
      }

      if (categoryFilter && categoryFilter !== 'All' && (item.category || '') !== categoryFilter) return false

      if (statusFilter && statusFilter !== 'All' && (item.projectStatus || 'Ongoing') !== statusFilter) return false

      // Always use the actual event/project date for filtering
      const rawDate = item.eventDate || item.date
      const itemDate = rawDate ? new Date(rawDate) : null

      if (dateFilter) {
        if (!itemDate) return false
        const selected = new Date(dateFilter)
        if (itemDate.toDateString() !== selected.toDateString()) return false
      }
      // monthFilter is a numeric value (1–12) from monthOptions
      if (monthFilter && monthFilter !== 'All') {
        if (!itemDate) return false
        if (itemDate.getMonth() + 1 !== Number(monthFilter)) return false
      }
      // yearFilter is a number (current year by default)
      if (yearFilter) {
        if (!itemDate) return false
        if (itemDate.getFullYear() !== Number(yearFilter)) return false
      }

      return true
    })
  }, [baseItems, searchFilter, categoryFilter, statusFilter, dateFilter, monthFilter, yearFilter])

  function toggleDetails(id, mode) {
    setExpanded((prev) => ({ ...prev, [id]: prev[id] === mode ? null : mode }))
  }

  const canArchive = role === 'SK Chairman'
  const [archiveBusyId, setArchiveBusyId] = useState(null)

  // A record is only archivable once its work is done — an ongoing project or
  // event still accrues expenses and receipts, so it stays in the active list.
  function isArchivable(item) {
    return (item.projectStatus || 'Ongoing') === 'Completed'
  }

  async function handleArchive(item) {
    const label = item.project || item.event || 'this record'
    const kind = (item.type || 'Project') === 'Event' ? 'event' : 'project'
    if (!isArchivable(item)) {
      addNotification({
        type: 'system',
        title: 'Cannot archive yet',
        message: `"${label}" is still ongoing. Mark the ${kind} as Completed before archiving it.`,
      })
      return
    }
    if (!window.confirm(`Archive "${label}"? It will move to the Archived tab and can be restored later.`)) return

    setArchiveBusyId(item.id)
    const { error } = await archiveExpense(item.id)
    setArchiveBusyId(null)

    addNotification(error
      ? { type: 'system', title: 'Archive failed', message: `Could not archive "${label}". Please try again.` }
      : { type: 'system', title: 'Archived', message: `"${label}" was moved to the archive.` })
  }

  async function handleRestore(item) {
    const label = item.project || item.event || 'this record'
    setArchiveBusyId(item.id)
    const { error } = await restoreExpense(item.id)
    setArchiveBusyId(null)

    addNotification(error
      ? { type: 'system', title: 'Restore failed', message: `Could not restore "${label}". Please try again.` }
      : { type: 'system', title: 'Restored', message: `"${label}" was restored to the active list.` })
  }

  function handleTabChange(tab) {
    setActiveTab(tab)
    setExpanded({})
    // Keep the tab in the URL so a reload, and the /dashboard/payroll redirect,
    // land back on the same view.
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (tab === 'projects') next.delete('tab')
      else next.set('tab', tab)
      return next
    }, { replace: true })
  }

  function renderItemDetails(item, columnCount) {
    const mode = expanded[item.id]
    if (!mode) return null

    const breakdownItems = Array.isArray(item.breakdown) ? item.breakdown : []
    const originalBreakdownItems = breakdownItems.filter(e => !e.isAdditional)

    const financials = calculateProjectEventFinancials(item, expenses, verifiedReceiptTotals)
    const additionalExpenses = financials.linkedExpenses
    const additionalSum = financials.recordedExpenseTotal
    const totalExpense = financials.totalExpenses

    const approvedBudget = financials.approvedBudget
    const hasReceipt = receiptLinks[item.id] && receiptLinks[item.id] > 0
    const receiptCount = receiptLinks[item.id] || 0
    const isReceiptVerified = financials.verifiedReceiptTotal > 0

    return (
      <tr className="details-row">
        <td colSpan={columnCount} style={{ padding: 0 }}>
          <div className="details-panel" style={{ padding: '32px 24px', background: 'var(--surface-2)', borderBottom: '1px solid var(--line)' }}>
            {mode === 'view' && (
              <>
                {/* Basic Information Section */}
                <div style={{ marginBottom: '32px' }}>
                  <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--ink)', marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Basic Information</h3>
                  <div className="details-grid" style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                    gap: '16px'
                  }}>
                    {[
                      { label: 'Title', value: item.project || item.event || 'Untitled' },
                      { label: 'Description', value: item.description || 'No description provided.' },
                      { label: 'Category', value: item.category || '—' },
                      { label: 'Related Project / Event / Payroll', value: item.event || item.project || item.payrollNumber || '—' },
                      { label: 'Scheduled Date', value: item.eventDate || item.date ? new Date(item.eventDate || item.date).toLocaleDateString() : '—' },
                      { label: 'Expense Date', value: item.date || item.approvedAt ? new Date(item.date || item.approvedAt).toLocaleDateString() : '—' },
                      { label: 'Status', value: item.status || 'Approved' },
                      { label: 'Created By', value: item.requestedBy || '—' },
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
                          backgroundColor: !hasReceipt ? '#fee2e2' : isReceiptVerified ? '#dcfce7' : '#fef3c7',
                          color: !hasReceipt ? '#dc2626' : isReceiptVerified ? '#15803d' : '#b45309'
                        }}>
                          {!hasReceipt
                            ? 'Missing'
                            : `${receiptCount > 1 ? `${receiptCount} Receipts` : '1 Receipt'} ${isReceiptVerified ? 'Verified' : 'Uploaded (Unverified)'}`}
                        </span>
                        {hasReceipt && !isReceiptVerified ? (
                          <p style={{ margin: '6px 0 0', fontSize: '0.78rem', color: 'var(--ink-3)' }}>
                            Not yet counted toward Total Recorded Expenses. Verify it in Documents → Receipts.
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="details-breakdown">
                  <BudgetBreakdownTable request={item} breakdownItems={originalBreakdownItems} currency={currency} title="APPROVED ALLOCATION BREAKDOWN" />
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
                        <tr key={`${item.id}-add-${index}`}>
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
                          <th>{currency.format(additionalSum)}</th>
                        </tr>
                      </tfoot>
                    ) : null}
                  </table>
                </div>
              </>
            )}

            {mode === 'expenses' && (
              <>
                {/* Financial Information Section */}
                <div style={{ marginBottom: '32px' }}>
                  <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--ink)', marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Financial Information</h3>
                  <div className="details-grid" style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                    gap: '16px'
                  }}>
                    {[
                      { label: 'Approved Budget', value: currency.format(approvedBudget), highlight: false },
                      { label: 'Total Requisitions', value: currency.format(additionalSum), highlight: false },
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

                <div className="details-breakdown" style={{ borderTop: '2px solid #e5e7eb', paddingTop: '16px' }}>
                  <table className="data-table" style={{ width: '100%', maxWidth: '600px', marginLeft: 'auto' }}>
                    <tbody>
                      <tr>
                        <td style={{ fontWeight: 600 }}>Approved Budget Amount</td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}>{currency.format(approvedBudget)}</td>
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
              </>
            )}
          </div>
        </td>
      </tr>
    )
  }

  return (
    <RoleGate allow={['SK Chairman', 'SK Treasurer', 'SK Kagawad', 'Barangay Treasurer']}>
      <header className="dashboard-header">
        <div className="header-left">
          <div>
            <p className="eyebrow">{TAB_HEADINGS[activeTab].eyebrow}</p>
            <h1>{TAB_HEADINGS[activeTab].title}</h1>
            <p>{TAB_HEADINGS[activeTab].description}</p>
          </div>
        </div>
      </header>

      <section className="dashboard-content">
        <div style={{ display: 'flex', gap: '12px', marginBottom: '24px', flexWrap: 'wrap' }}>
          <button
            className={activeTab === 'projects' ? 'primary-button' : 'secondary-button'}
            onClick={() => handleTabChange('projects')}
            style={{ minWidth: '150px' }}
          >
            Projects
          </button>
          <button
            className={activeTab === 'events' ? 'primary-button' : 'secondary-button'}
            onClick={() => handleTabChange('events')}
            style={{ minWidth: '150px' }}
          >
            Events
          </button>
          <button
            className={activeTab === 'payroll' ? 'primary-button' : 'secondary-button'}
            onClick={() => handleTabChange('payroll')}
            style={{ minWidth: '150px' }}
          >
            Payroll
          </button>
          <button
            className={activeTab === 'archived' ? 'primary-button' : 'secondary-button'}
            onClick={() => handleTabChange('archived')}
            style={{ minWidth: '150px' }}
          >
            Archived
          </button>
        </div>

        {activeTab === 'payroll' ? (
          <Suspense fallback={<p className="form-note">Loading payroll…</p>}>
            <PayrollPanel embedded />
          </Suspense>
        ) : (
          <>
          <RecordFilterBar
            searchValue={searchFilter}
            onSearchChange={setSearchFilter}
            searchLabel={`${TITLE_NOUN[activeTab]} search`}
            searchPlaceholder="Search title, purpose, category, or creator"
            dateValue={dateFilter}
            onDateChange={setDateFilter}
            monthValue={monthFilter}
            onMonthChange={setMonthFilter}
            yearValue={yearFilter}
            onYearChange={setYearFilter}
            categoryValue={categoryFilter}
            onCategoryChange={setCategoryFilter}
            categoryOptions={categoryOptions}
            statusValue={statusFilter}
            onStatusChange={setStatusFilter}
            hasActiveFilters={Boolean(hasActiveFilters)}
            onReset={resetFilters}
            resultCount={filteredItems.length}
            totalCount={baseItems.length}
          />

          <div className="overview-card">
            <p className="eyebrow">Overview</p>
            <h2>{CARD_HEADINGS[activeTab]}</h2>
            <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{TITLE_NOUN[activeTab]} Title</th>
                  <th>Category</th>
                  <th>Date Proposed</th>
                  <th>Total Budget</th>
                  <th>Status</th>
                  <th>Receipt</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.length ? (
                  filteredItems.map((item) => {
                    const additionalExpenses = expenses.filter(e => e.isAdditional && e.parentProjectId === item.id && !e.archivedAt)
                    const additionalSum = additionalExpenses.reduce((sum, e) => sum + Number(e.amount || 0), 0)
                    const approvedBudget = Number(item.amount || 0)
                    const hasReceipt = item.receiptUrl || item.receipt_url || receiptLinks[item.id]
                    const isReceiptVerified = calculateProjectEventFinancials(
                      item, expenses, verifiedReceiptTotals
                    ).verifiedReceiptTotal > 0

                    return (
                      <Fragment key={item.id}>
                        <tr
                          id={`project-row-${item.id}`}
                          className={item.id === highlightedId ? 'row-highlighted' : undefined}
                        >
                          <td data-label={`${TITLE_NOUN[activeTab]} Title`}>{item.project || item.event || 'Untitled'}</td>
                          <td data-label="Category">{item.category || '—'}</td>
                          <td data-label="Date Proposed">{item.eventDate || item.date ? new Date(item.eventDate || item.date).toLocaleDateString() : '—'}</td>
                          <td data-label="Total Budget">{currency.format(approvedBudget)}</td>
                          <td data-label="Status">
                            {item.archivedAt ? (
                              <span className="status-pill status-cancelled">Archived</span>
                            ) : role === 'SK Chairman' ? (
                              <select
                                className="project-status-select"
                                value={item.projectStatus || 'Ongoing'}
                                onChange={(e) => updateProjectStatus(item.requestId || item.id, e.target.value)}
                                aria-label={`Update ${activeTab === 'projects' ? 'Project' : 'Event'} Status`}
                              >
                                <option value="Ongoing">Ongoing</option>
                                <option value="Completed">Completed</option>
                              </select>
                            ) : (
                              <span className={`status-pill status-${(item.projectStatus || 'Ongoing').toLowerCase()}`}>
                                {item.projectStatus || 'Ongoing'}
                              </span>
                            )}
                          </td>
                          <td data-label="Receipt">
                            {hasReceipt && isReceiptVerified ? (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 10px', borderRadius: '999px', fontSize: '0.75rem', fontWeight: 600, backgroundColor: 'var(--positive-soft)', color: 'var(--positive)', whiteSpace: 'nowrap' }}>
                                ✅ Verified
                              </span>
                            ) : hasReceipt ? (
                              <span
                                style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 10px', borderRadius: '999px', fontSize: '0.75rem', fontWeight: 600, backgroundColor: '#fef3c7', color: '#b45309', whiteSpace: 'nowrap' }}
                                title="Uploaded but not yet verified — does not count toward Total Recorded Expenses"
                              >
                                ⏳ Unverified
                              </span>
                            ) : (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 10px', borderRadius: '999px', fontSize: '0.75rem', fontWeight: 600, backgroundColor: 'var(--negative-soft)', color: 'var(--negative)', whiteSpace: 'nowrap' }}>
                                ❌ Missing
                              </span>
                            )}
                          </td>
                          <td data-label="Actions" className="table-actions">
                            <button
                              className="secondary-button"
                              type="button"
                              onClick={() => toggleDetails(item.id, 'view')}
                            >
                              {expanded[item.id] === 'view' ? 'Hide' : 'View'}
                            </button>
                            <button
                              className="secondary-button"
                              type="button"
                              onClick={() => toggleDetails(item.id, 'expenses')}
                            >
                              {expanded[item.id] === 'expenses' ? 'Hide' : 'Expenses'}
                            </button>
                            {/* Documents, Receipts, and Archive/Restore collapse
                                behind one "⋮" trigger — View and Expenses are the
                                two actions people reach for on every row, so
                                those stay one click away; the rest no longer force
                                the row into a horizontal scroll to get to them. */}
                            <RowActionsMenu label={`More actions for ${item.project || item.event || 'this record'}`}>
                              {/* Visible to every role — SK Kagawad and
                                  Barangay Treasurer can View/Download from the
                                  Generated Documents list even though only SK
                                  Chairman/Treasurer can generate new ones
                                  (canGenerateDocs gates that section inside
                                  the modal itself). */}
                              <button
                                type="button"
                                className="row-menu-item"
                                onClick={() => setDocGenTarget({ record: item, kind: item.type === 'Event' ? 'event' : 'project' })}
                              >
                                <FileText size={14} aria-hidden="true" /> Documents
                              </button>
                              <button
                                type="button"
                                className="row-menu-item"
                                onClick={() => setReceiptsTarget(item)}
                              >
                                <ReceiptIcon size={14} aria-hidden="true" /> Receipts
                              </button>
                              {canArchive && (item.archivedAt ? (
                                <button
                                  type="button"
                                  className="row-menu-item"
                                  disabled={archiveBusyId === item.id}
                                  onClick={() => handleRestore(item)}
                                >
                                  <RotateCcw size={14} aria-hidden="true" /> Restore
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  className="row-menu-item"
                                  disabled={!isArchivable(item) || archiveBusyId === item.id}
                                  onClick={() => handleArchive(item)}
                                  title={isArchivable(item)
                                    ? undefined
                                    : 'Only completed projects and events can be archived'}
                                >
                                  <Archive size={14} aria-hidden="true" /> Archive
                                </button>
                              ))}
                            </RowActionsMenu>
                          </td>
                        </tr>
                        {renderItemDetails(item, 7)}
                      </Fragment>
                    )
                  })
                ) : (
                  <tr>
                    <td colSpan="7" className="empty-state">
                      {hasActiveFilters
                        ? `No ${activeTab === 'archived' ? 'archived records' : activeTab} match the selected filters.`
                        : activeTab === 'archived'
                          ? 'No archived projects or events yet. Completed records you archive will appear here.'
                          : `No approved ${activeTab} yet.`}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            </div>
          </div>
          </>
        )}
      </section>

      <Suspense fallback={null}>
        {scanModalExpense && (
          <ReceiptScanModal
            expense={scanModalExpense}
            onClose={() => setScanModalExpense(null)}
            onSave={handleScanSave}
          />
        )}
      </Suspense>

      {docGenTarget && (
        <GenerateDocumentsModal
          record={docGenTarget.record}
          kind={docGenTarget.kind}
          canGenerateDocs={canGenerateDocs}
          initialTab={docGenTarget.initialTab}
          onClose={() => setDocGenTarget(null)}
        />
      )}

      {receiptsTarget && (
        <RecordReceiptsModal
          record={receiptsTarget}
          onClose={() => setReceiptsTarget(null)}
        />
      )}
    </RoleGate>
  )
}

export default ProjectsEventsPage
