import { Fragment, useMemo, useState, useEffect, useRef, lazy, Suspense, useCallback } from 'react'
import { useBudget } from '../context/BudgetContext'
import RoleGate from '../components/RoleGate'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabase/supabaseClient'
import CurrencyInput from '../components/CurrencyInput'
import BudgetBreakdownTable from '../components/BudgetBreakdownTable'
import RecordFilterBar from '../components/RecordFilterBar'
import { useNotifications } from '../context/NotificationContext'
import { validateReceiptFile, getUploadErrorMessage, generateReceiptPath, logUploadDebugInfo, insertReceiptRecord } from '../utils/uploadUtils'
import { calculateProjectEventFinancials } from '../utils/projectEventFinancials'

const ReceiptScanModal = lazy(() => import('../components/receipts/ReceiptScanModal'))

const currency = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  maximumFractionDigits: 0,
})

function ProjectsEventsPage() {
  const { role, user } = useAuth()
  const { expenses, totals, updateProjectStatus, refreshExpensesFromSupabase, updateExpenseReceipt } = useBudget()
  const { addNotification } = useNotifications()

  const [activeTab, setActiveTab] = useState('projects') // 'projects' | 'events'
  const [expanded, setExpanded] = useState({})

  const currentYear = new Date().getFullYear()

  const [searchFilter, setSearchFilter] = useState('')
  const [dateFilter, setDateFilter] = useState('')
  const [monthFilter, setMonthFilter] = useState('')
  const [yearFilter, setYearFilter] = useState(currentYear)
  const [statusFilter, setStatusFilter] = useState('')

  const hasActiveFilters = searchFilter || dateFilter || monthFilter || (yearFilter !== currentYear) || statusFilter

  function resetFilters() {
    setSearchFilter('')
    setDateFilter('')
    setMonthFilter('')
    setYearFilter(currentYear)
    setStatusFilter('')
  }

  const [errorsById, setErrorsById] = useState({})
  const [uploadingId, setUploadingId] = useState(null)
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

  const baseItems = useMemo(() => {
    return expenses.filter((item) => {
      const isProject = !item.type || item.type === 'Project'
      const isEvent = item.type === 'Event'
      const status = item.status || 'Approved'
      const isApproved = !item.isAdditional && ['Approved', 'Released'].includes(status) && !item.archivedAt

      if (activeTab === 'projects') return isApproved && isProject
      if (activeTab === 'events') return isApproved && isEvent
      return false
    })
  }, [expenses, activeTab])

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
  }, [baseItems, searchFilter, statusFilter, dateFilter, monthFilter, yearFilter])

  function toggleDetails(id) {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  function handleTabChange(tab) {
    setActiveTab(tab)
    setExpanded({})
  }

  function renderItemDetails(item, columnCount) {
    if (!expanded[item.id]) return null

    const breakdownItems = Array.isArray(item.breakdown) ? item.breakdown : []
    const originalBreakdownItems = breakdownItems.filter(e => !e.isAdditional)

    const verifiedReceiptTotals = totals?.verifiedReceiptTotals || {}
    const financials = calculateProjectEventFinancials(item, expenses, verifiedReceiptTotals)
    const additionalExpenses = financials.linkedExpenses
    const additionalSum = financials.recordedExpenseTotal

    const approvedBudget = financials.approvedBudget
    const totalExpenses = financials.totalExpenses
    const remainingBalance = financials.remainingBudget

    return (
      <tr className="details-row">
        <td colSpan={columnCount}>
          <div className="details-panel" style={{ backgroundColor: 'var(--surface-color)', padding: '24px', borderTop: '1px solid var(--border-color)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--text-main)' }}>Summary</h3>
              </div>
            
            <div className="details-grid" style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', 
              gap: '16px', 
              marginBottom: '32px' 
            }}>
              {[
                { label: 'Approved Budget', value: currency.format(approvedBudget) },
                { label: 'Additional Requisitions', value: currency.format(additionalSum) },
                { label: 'Remaining Balance', value: currency.format(remainingBalance), highlight: remainingBalance < 0 },
                { label: 'Date Proposed', value: item.eventDate || item.date ? new Date(item.eventDate || item.date).toLocaleDateString() : '—' },
                { label: 'Date Approved', value: item.approvedAt ? new Date(item.approvedAt).toLocaleDateString() : '—' }
              ].map((stat, i) => (
                <div key={i} style={{ 
                  backgroundColor: 'var(--background-color, #ffffff)', 
                  padding: '20px', 
                  borderRadius: 'var(--radius-surface)', 
                  border: '1px solid var(--border-color)', 
                  boxShadow: 'var(--shadow)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px'
                }}>
                  <p className="details-label" style={{ 
                    fontSize: '0.75rem', 
                    textTransform: 'uppercase', 
                    color: 'var(--text-secondary)', 
                    margin: 0,
                    letterSpacing: '0.5px'
                  }}>{stat.label}</p>
                  <p className="details-value" style={{ 
                    fontSize: '1.25rem', 
                    fontWeight: '400', 
                    margin: 0,
                    color: stat.highlight ? 'var(--danger-color)' : 'var(--text-primary)'
                  }}>
                    {stat.value}
                  </p>
                </div>
              ))}
            </div>

            <div className="details-breakdown" style={{ marginBottom: '24px' }}>
              <p className="details-label" style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: '12px' }}>Requisition Breakdown</p>
              <BudgetBreakdownTable
                request={item}
                breakdownItems={originalBreakdownItems}
                currency={currency}
                totalAmount={approvedBudget}
              />
            </div>

            <div className="details-breakdown">
              <p className="details-label" style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: '12px' }}>Additional Requisition Breakdown</p>
              {additionalExpenses.length > 0 ? (
                <table className="data-table" style={{ marginTop: '0' }}>
                  <thead>
                    <tr>
                      <th style={{ textTransform: 'uppercase' }}>DESCRIPTION</th>
                      <th style={{ textTransform: 'uppercase' }}>CATEGORY</th>
                      <th style={{ textTransform: 'uppercase' }}>DATE</th>
                      <th style={{ textTransform: 'uppercase' }}>REMARKS</th>
                      <th style={{ textTransform: 'uppercase' }}>QUANTITY</th>
                      <th style={{ textTransform: 'uppercase' }}>UNIT COST</th>
                      <th style={{ textTransform: 'uppercase' }}>TOTAL COST</th>
                    </tr>
                  </thead>
                  <tbody>
                    {additionalExpenses.map((e, index) => (
                      <tr key={e.id || index}>
                        <td>{e.itemName || e.description || '—'}</td>
                        <td>{e.category || item.category || '—'}</td>
                        <td>{e.date || e.addedAt ? new Date(e.date || e.addedAt).toLocaleDateString() : '—'}</td>
                        <td>{e.remarks || '—'}</td>
                        <td>{e.quantity || '—'}</td>
                        <td>{e.unitCost ? currency.format(e.unitCost) : '—'}</td>
                        <td style={{ fontWeight: 600, color: 'var(--positive)' }}>{currency.format((Number(e.quantity)||0) * (Number(e.unitCost)||0))}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <th colSpan="6" style={{ textTransform: 'uppercase' }}>TOTAL ADDITIONAL REQUISITIONS</th>
                      <th>{currency.format(additionalSum)}</th>
                    </tr>
                  </tfoot>
                </table>
              ) : (
                <p className="details-value" style={{ color: 'var(--text-secondary)' }}>No additional requisitions linked to this {activeTab === 'projects' ? 'project' : 'event'}.</p>
              )}
            </div>
            
            {item.description && (
              <div style={{ marginTop: '24px' }}>
                <p className="details-label" style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: '4px' }}>Description</p>
                <p className="details-value">{item.description}</p>
              </div>
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
            <p className="eyebrow">Projects & Events Dashboard</p>
            <h1>Projects & Events</h1>
            <p>Monitor budgets, expenses, and completion status of all approved projects and events.</p>
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
        </div>

        <RecordFilterBar
          searchValue={searchFilter}
          onSearchChange={setSearchFilter}
          searchLabel={`${activeTab === 'projects' ? 'Project' : 'Event'} search`}
          searchPlaceholder="Search title, purpose, category, or creator"
          dateValue={dateFilter}
          onDateChange={setDateFilter}
          monthValue={monthFilter}
          onMonthChange={setMonthFilter}
          yearValue={yearFilter}
          onYearChange={setYearFilter}
          statusValue={statusFilter}
          onStatusChange={setStatusFilter}
          hasActiveFilters={Boolean(hasActiveFilters)}
          onReset={resetFilters}
          resultCount={filteredItems.length}
          totalCount={baseItems.length}
        />

        <div className="overview-card">
          <p className="eyebrow">Overview</p>
          <h2>{activeTab === 'projects' ? 'All Approved Projects' : 'All Approved Events'}</h2>
          <table className="data-table">
            <thead>
              <tr>
                <th>{activeTab === 'projects' ? 'Project Title' : 'Event Title'}</th>
                <th>Category</th>
                <th>Date Proposed</th>
                <th>Total Budget</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.length ? (
                filteredItems.map((item) => {
                  const additionalExpenses = expenses.filter(e => e.isAdditional && e.parentProjectId === item.id && !e.archivedAt)
                  const additionalSum = additionalExpenses.reduce((sum, e) => sum + Number(e.amount || 0), 0)
                  const approvedBudget = Number(item.amount || 0)
                  
                  return (
                    <Fragment key={item.id}>
                      <tr>
                        <td data-label={activeTab === 'projects' ? 'Project Title' : 'Event Title'}>{item.project || item.event || 'Untitled'}</td>
                        <td data-label="Category">{item.category || '—'}</td>
                        <td data-label="Date Proposed">{item.eventDate || item.date ? new Date(item.eventDate || item.date).toLocaleDateString() : '—'}</td>
                        <td data-label="Total Budget">{currency.format(approvedBudget)}</td>
                        <td data-label="Status">
                          {role === 'SK Chairman' ? (
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
                        <td data-label="Actions" className="table-actions">
                          <button
                            className="secondary-button"
                            type="button"
                            onClick={() => toggleDetails(item.id)}
                          >
                            {expanded[item.id] ? 'Hide Details' : 'View Details'}
                          </button>
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
                      ? `No ${activeTab === 'projects' ? 'projects' : 'events'} match the selected filters.`
                      : `No approved ${activeTab === 'projects' ? 'projects' : 'events'} yet.`}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
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
    </RoleGate>
  )
}

export default ProjectsEventsPage
