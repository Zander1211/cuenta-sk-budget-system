import { useEffect, useState } from 'react'
import CurrencyInput from '../components/CurrencyInput';
import { useNavigate, useSearchParams } from 'react-router-dom'
import { PlusCircle, Trash2, ArrowLeft } from 'lucide-react'
import RoleGate from '../components/RoleGate'
import { useBudget, useBudgetCalculations } from '../context/BudgetContext'
import { supabase } from '../supabase/supabaseClient'

const currency = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  maximumFractionDigits: 2,
})

const parseNumberInput = (value) => {
  const numeric = String(value).replace(/,/g, '')
  return numeric ? Number(numeric) : 0
}

const categories = [
  'Sports',
  'Education',
  'Community Programs',
  'Environment',
  'Other',
]

function NewRequestPage() {
  const { requests, budgets, addRequest, resubmitRequest } = useBudget()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const typeParam = searchParams.get('type') || 'Project'
  const editId = searchParams.get('editId')

  const [requestType, setRequestType] = useState(typeParam)

  const [event, setEvent] = useState('')
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState('')
  const [eventDate, setEventDate] = useState('')
  const [venue, setVenue] = useState('')
  const [description, setDescription] = useState('')

  const [breakdownItems, setBreakdownItems] = useState([
    { itemName: '', quantity: 1, unitCost: 0 },
  ])

  const [payrollBreakdown, setPayrollBreakdown] = useState([
    { name: '', position: '', honoraria: '', serviceRendered: '', cbcLbf: '' }
  ])

  const [formError, setFormError] = useState('')
  const [rejectionReason, setRejectionReason] = useState('')

  useEffect(() => {
    if (editId) {
      const existing = requests.find(r => r.id === editId)
      if (existing) {
        setRequestType(existing.type || 'Project')
        setEvent(existing.event || '')
        setCategory(existing.category || '')
        setAmount(existing.amount ? existing.amount.toString() : '')
        setEventDate(existing.eventDate || '')
        setVenue(existing.venue || '')
        setDescription(existing.description || '')
        setRejectionReason(existing.rejectionReason || 'No reason provided')

        if ((existing.type || 'Project') === 'Payroll') {
          setPayrollBreakdown(existing.breakdown?.length ? existing.breakdown : [{ name: '', position: '', honoraria: '', serviceRendered: '', cbcLbf: '' }])
        } else {
          setBreakdownItems(existing.breakdown?.length ? existing.breakdown : [{ itemName: '', quantity: 1, unitCost: 0 }])
        }
      }
    } else {
      setRequestType(typeParam)
    }
  }, [editId, typeParam, requests])

  const totalFromBreakdown = breakdownItems.reduce((sum, item) => {
    const qty = parseNumberInput(item.quantity)
    const unit = parseNumberInput(item.unitCost)
    return sum + qty * unit
  }, 0)

  const totalFromPayroll = payrollBreakdown.reduce((sum, row) => {
    const hon = Number(row.honoraria) || 0
    const cbc = Number(row.cbcLbf) || 0
    return sum + (hon - cbc)
  }, 0)

  function updateBreakdownItem(index, field, value) {
    setBreakdownItems((prev) =>
      prev.map((item, itemIndex) => (itemIndex === index ? { ...item, [field]: value } : item))
    )
  }

  function addBreakdownRow() {
    setBreakdownItems((prev) => [...prev, { itemName: '', quantity: 1, unitCost: 0 }])
  }

  function removeBreakdownRow(index) {
    setBreakdownItems((prev) => prev.filter((_, itemIndex) => itemIndex !== index))
  }

  function updatePayrollRow(index, field, value) {
    setPayrollBreakdown((prev) =>
      prev.map((item, itemIndex) => (itemIndex === index ? { ...item, [field]: value } : item))
    )
  }
  let selectedYear = null
  let selectedMonth = null
  let isValidDate = false
  let monthName = ''

  if (eventDate) {
    const parts = eventDate.split('-')
    if (parts.length === 3) {
      selectedYear = parseInt(parts[0], 10)
      selectedMonth = parseInt(parts[1], 10)
      isValidDate = !isNaN(selectedYear) && !isNaN(selectedMonth)
      if (isValidDate) {
        const dateObj = new Date(selectedYear, selectedMonth - 1, parseInt(parts[2], 10))
        monthName = dateObj.toLocaleString('default', { month: 'long' })
      }
    }
  }

  const [remoteBudgetAmount, setRemoteBudgetAmount] = useState(0)
  const [isCheckingBudget, setIsCheckingBudget] = useState(false)

  useEffect(() => {
    async function checkRemoteBudget() {
      if (!isValidDate || !selectedMonth || !selectedYear) {
        setRemoteBudgetAmount(0)
        return
      }

      setIsCheckingBudget(true)
      try {
        const { data, error } = await supabase
          .from('budgets')
          .select('amount')
          .eq('month', selectedMonth)
          .eq('year', selectedYear)

        if (error) {
          throw error
        }

        const amt = data && data.length > 0 ? Math.max(...data.map(b => Number(b.amount) || 0)) : 0
        setRemoteBudgetAmount(amt)
      } catch (err) {
        console.warn('Failed to verify remote budget, falling back to local:', err)
        const localAmt = budgets.filter(b => b.month === selectedMonth && b.year === selectedYear).reduce((max, b) => Math.max(max, Number(b.amount) || 0), 0)
        setRemoteBudgetAmount(localAmt)
      } finally {
        setIsCheckingBudget(false)
      }
    }

    checkRemoteBudget()
  }, [selectedMonth, selectedYear, isValidDate, budgets])

  const { totalExpenses: totalApproved } = useBudgetCalculations(selectedMonth, selectedYear)
  const remainingBudget = remoteBudgetAmount - totalApproved;
  const currentRequestedAmount = requestType === 'Payroll'
    ? totalFromPayroll
    : (Number(amount) > 0 ? Number(amount) : totalFromBreakdown);

  const showNoBudgetWarning = isValidDate && remoteBudgetAmount <= 0 && !isCheckingBudget;
  const showInsufficientBudgetWarning = isValidDate && !showNoBudgetWarning && currentRequestedAmount > remainingBudget && !isCheckingBudget;

  // The rail only has real figures once a date has picked out a month and that
  // month has a budget to measure against; until then it shows the running
  // request total and says what is missing.
  const hasBudgetFigures = isValidDate && remoteBudgetAmount > 0 && !isCheckingBudget


  function addPayrollRow() {
    setPayrollBreakdown((prev) => [...prev, { name: '', position: '', honoraria: '', serviceRendered: '', cbcLbf: '' }])
  }

  function removePayrollRow(index) {
    setPayrollBreakdown((prev) => prev.filter((_, itemIndex) => itemIndex !== index))
  }

  async function handleSubmit(eventSubmit) {
    eventSubmit.preventDefault()
    setFormError('')

    if (!isValidDate || !selectedMonth || !selectedYear) {
      setFormError('Please select a valid request date.')
      return
    }

    setIsCheckingBudget(true)
    let latestRemoteBudgetAmount = 0
    try {
      const { data, error } = await supabase
        .from('budgets')
        .select('amount')
        .eq('month', selectedMonth)
        .eq('year', selectedYear)

      if (error) throw error

      latestRemoteBudgetAmount = data && data.length > 0 ? Math.max(...data.map(b => Number(b.amount) || 0)) : 0
      setRemoteBudgetAmount(latestRemoteBudgetAmount)
    } catch (err) {
      console.warn('Failed to verify remote budget during submit:', err)
      const localAmt = budgets.filter(b => b.month === selectedMonth && b.year === selectedYear).reduce((max, b) => Math.max(max, Number(b.amount) || 0), 0)
      latestRemoteBudgetAmount = localAmt
      setRemoteBudgetAmount(latestRemoteBudgetAmount)
    } finally {
      setIsCheckingBudget(false)
    }

    if (latestRemoteBudgetAmount <= 0) {
      setFormError('Unable to submit this budget request. No Monthly Budget has been allocated for the selected month. Please add the Monthly Budget first before submitting a budget request.')
      return
    }

    // Deducting valid totalExpenses from the latest fetched budget guarantees consistency
    const latestRemainingBudget = latestRemoteBudgetAmount - totalApproved;

    if (currentRequestedAmount > latestRemainingBudget) {
      setFormError('Unable to submit this budget request. The requested amount exceeds the remaining available budget for the selected month. Please reduce the requested amount or increase the Monthly Budget before submitting.')
      return
    }

    let finalAmount;
    let normalizedBreakdown;

    if (requestType === 'Payroll') {
      if (!event.trim() || !eventDate) {
        setFormError('Please complete payroll title and date.')
        return
      }
      finalAmount = totalFromPayroll
      if (finalAmount <= 0) {
        setFormError('Provide valid payroll entries.')
        return
      }
      normalizedBreakdown = payrollBreakdown.filter(r => r.name.trim() || Number(r.honoraria) > 0)
    } else {
      const cleanedAmount = Number(amount)
      const hasBreakdown = breakdownItems.some(
        (item) => item.itemName.trim() && parseNumberInput(item.quantity) > 0
      )
      finalAmount = cleanedAmount > 0 ? cleanedAmount : totalFromBreakdown

      if (!event.trim() || !category || !eventDate || !venue.trim()) {
        setFormError('Please complete title, date, venue, and category.')
        return
      }

      if (!hasBreakdown && !cleanedAmount) {
        setFormError('Provide a budget breakdown or total amount.')
        return
      }

      normalizedBreakdown = breakdownItems
        .map((item) => ({
          itemName: item.itemName.trim(),
          quantity: parseNumberInput(item.quantity),
          unitCost: parseNumberInput(item.unitCost),
        }))
        .filter((item) => item.itemName || item.quantity > 0 || item.unitCost > 0)
    }

    const payload = {
      type: requestType,
      event: event.trim(),
      category: requestType === 'Payroll' ? 'Payroll' : category,
      amount: finalAmount,
      eventDate,
      venue: venue.trim(),
      description: description.trim(),
      breakdown: normalizedBreakdown,
    }

    if (editId) {
      const { error } = await resubmitRequest(editId, payload)
      if (error) {
        setFormError(`The request could not be resubmitted: ${error.message || 'Unknown error'}`)
        return
      }
    } else {
      const { error } = await addRequest(payload)
      if (error) {
        setFormError(`The request could not be saved: ${error.message}`)
        return
      }
    }

    navigate('/dashboard/request')
  }

  return (
    <RoleGate allow={['SK Treasurer']}>
      <header className="dashboard-header">
        <div className="header-left">
          <button
            type="button"
            className="icon-button"
            onClick={() => navigate('/dashboard/request')}
            aria-label="Back to Requests"
            style={{ marginRight: '16px', background: 'var(--bone)', padding: '8px', borderRadius: 'var(--radius-control)', border: '1px solid var(--border)' }}
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <p className="eyebrow">Request Form</p>
            <h1>{editId ? `Revise ${requestType} Request` : `New ${requestType} Request`}</h1>
            <p>Create a budget request that will appear in SK Chairman approvals.</p>
          </div>
        </div>
      </header>

      {/* Two columns: the form fills the main column in a two-up field grid,
          and the budget check plus the submit buttons ride along in a sticky
          rail on the right. The old single column of full-width fields ran
          past the fold with the right half of the card empty. */}
      <section className="dashboard-content">
        <form className="req-form" onSubmit={handleSubmit}>
          <div className="req-main">
            {editId && rejectionReason && (
              <div className="req-notice">
                <strong style={{ display: 'block', marginBottom: '4px' }}>Editing rejected request</strong>
                <span>Reason for rejection: {rejectionReason}</span>
              </div>
            )}

            <div className="overview-card">
              <h2 className="req-section-title req-card-title">
                {requestType === 'Payroll' ? 'Payroll information' : 'Project information'}
              </h2>

              <div className="req-grid">
                <label className="field req-span">
                  <span>{requestType === 'Payroll' ? 'Payroll Title' : 'Title'}</span>
                  <input
                    type="text"
                    value={event}
                    onChange={(e) => setEvent(e.target.value)}
                    placeholder={requestType === 'Payroll' ? 'e.g. March 2026 Honorarium' : 'e.g. Youth Leadership Summit'}
                    required
                  />
                </label>

                <label className={`field ${requestType === 'Payroll' ? 'req-span' : ''}`}>
                  <span>Date</span>
                  <input
                    type="date"
                    value={eventDate}
                    onChange={(e) => setEventDate(e.target.value)}
                    required
                  />
                </label>

                {requestType !== 'Payroll' && (
                  <>
                    <label className="field">
                      <span>Venue</span>
                      <input
                        type="text"
                        value={venue}
                        onChange={(e) => setVenue(e.target.value)}
                        placeholder="Barangay Covered Court"
                        required
                      />
                    </label>
                    <label className="field">
                      <span>Category</span>
                      <select
                        value={category}
                        onChange={(e) => setCategory(e.target.value)}
                        required
                      >
                        <option value="">Select category</option>
                        {categories.map((item) => (
                          <option key={item} value={item}>{item}</option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      <span>Total amount (PHP)</span>
                      <CurrencyInput
                        value={amount}
                        onValueChange={(val) => setAmount(val)}
                        placeholder="30,000"
                      />
                    </label>
                  </>
                )}

                <label className="field req-span">
                  <span>Purpose / Description</span>
                  <textarea
                    rows="3"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Describe the goals and outcomes"
                  />
                </label>
              </div>
            </div>

            {requestType === 'Payroll' ? (
              <div className="overview-card">
                <div className="req-section-head">
                  <h2 className="req-section-title req-card-title">Payroll entries</h2>
                  <button type="button" className="secondary-button req-add-btn" onClick={addPayrollRow}>
                    <PlusCircle size={16} /> Add row
                  </button>
                </div>

                <div style={{ overflowX: 'auto' }}>
                  <table className="add-row-table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Position</th>
                        <th style={{ width: '110px' }}>Honoraria</th>
                        <th style={{ width: '120px' }}>Service</th>
                        <th style={{ width: '100px' }}>CBC/LBF</th>
                        <th style={{ width: '110px' }}>Net Amount</th>
                        <th style={{ width: '40px' }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {payrollBreakdown.map((row, index) => {
                        const hon = Number(row.honoraria) || 0;
                        const cbc = Number(row.cbcLbf) || 0;
                        const net = hon - cbc;
                        return (
                          <tr key={index}>
                            <td data-label="Name">
                              <input type="text" value={row.name} onChange={(e) => updatePayrollRow(index, 'name', e.target.value)} placeholder="Full name" />
                            </td>
                            <td data-label="Position">
                              <input type="text" value={row.position} onChange={(e) => updatePayrollRow(index, 'position', e.target.value)} placeholder="Position" />
                            </td>
                            <td data-label="Honoraria">
                              <CurrencyInput value={row.honoraria} onValueChange={(val) => updatePayrollRow(index, 'honoraria', Number(val))} />
                            </td>
                            <td data-label="Service">
                              <input type="text" value={row.serviceRendered} onChange={(e) => updatePayrollRow(index, 'serviceRendered', e.target.value)} />
                            </td>
                            <td data-label="CBC/LBF">
                              <CurrencyInput value={row.cbcLbf} onValueChange={(val) => updatePayrollRow(index, 'cbcLbf', Number(val))} />
                            </td>
                            <td className="computed-cell" data-label="Net amount">{currency.format(net)}</td>
                            <td>
                              <button type="button" className="remove-row-btn" onClick={() => removePayrollRow(index)} aria-label="Remove row"><Trash2 size={14} /></button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                <p className="req-total">
                  <span>Total payroll budget</span>
                  <strong>{currency.format(totalFromPayroll)}</strong>
                </p>
              </div>
            ) : (
              <div className="overview-card">
                <div className="req-section-head">
                  <h2 className="req-section-title req-card-title">Requisition</h2>
                  <button type="button" className="secondary-button req-add-btn" onClick={addBreakdownRow}>
                    <PlusCircle size={16} /> Add requisition
                  </button>
                </div>

                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Requisition</th>
                      <th style={{ width: '110px' }}>Quantity</th>
                      <th style={{ width: '150px' }}>Unit cost</th>
                      <th style={{ width: '130px' }}>Total cost</th>
                      <th style={{ width: '90px' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {breakdownItems.map((item, index) => (
                      <tr key={`row-${index}`}>
                        <td data-label="Requisition">
                          <input type="text" value={item.itemName} onChange={(e) => updateBreakdownItem(index, 'itemName', e.target.value)} placeholder="Requisition" />
                        </td>
                        <td data-label="Quantity">
                          <input type="number" min="0" value={item.quantity} onChange={(e) => updateBreakdownItem(index, 'quantity', e.target.value)} />
                        </td>
                        <td data-label="Unit cost">
                          <CurrencyInput value={item.unitCost} onValueChange={(val) => updateBreakdownItem(index, 'unitCost', val)} />
                        </td>
                        <td data-label="Total cost">{currency.format((item.quantity || 0) * (item.unitCost || 0))}</td>
                        <td>
                          <button type="button" className="text-button" onClick={() => removeBreakdownRow(index)} disabled={breakdownItems.length === 1}>Remove</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <p className="req-total">
                  <span>Total cost from breakdown</span>
                  <strong>{currency.format(totalFromBreakdown)}</strong>
                </p>
              </div>
            )}
          </div>

          <aside className="req-side">
            <div className="overview-card">
              <p className="eyebrow">Budget check</p>
              <h2 className="req-section-title">
                {isValidDate ? `${monthName} ${selectedYear}` : 'No date selected'}
              </h2>

              {hasBudgetFigures ? (
                <dl className="req-summary-rows">
                  <div>
                    <dt>Monthly budget</dt>
                    <dd>{currency.format(remoteBudgetAmount)}</dd>
                  </div>
                  <div>
                    <dt>Total approved</dt>
                    <dd>− {currency.format(totalApproved)}</dd>
                  </div>
                  <div className="is-total">
                    <dt>Remaining available</dt>
                    <dd className={remainingBudget < 0 ? 'is-negative' : ''}>
                      {currency.format(remainingBudget)}
                    </dd>
                  </div>
                  <div>
                    <dt>This request</dt>
                    <dd className={currentRequestedAmount > remainingBudget ? 'is-negative' : ''}>
                      {currency.format(currentRequestedAmount)}
                    </dd>
                  </div>
                </dl>
              ) : (
                <>
                  <dl className="req-summary-rows">
                    <div>
                      <dt>This request</dt>
                      <dd>{currency.format(currentRequestedAmount)}</dd>
                    </div>
                  </dl>
                  <p className="req-hint">
                    {isCheckingBudget
                      ? 'Checking the monthly budget…'
                      : 'Pick a request date to see how much of that month’s budget is still available.'}
                  </p>
                </>
              )}

              {showNoBudgetWarning && (
                <p className="req-notice">
                  No Monthly Budget has been allocated for {monthName}. Please add the Monthly Budget for this month before creating a budget request.
                </p>
              )}

              {showInsufficientBudgetWarning && (
                <p className="req-notice">
                  Insufficient Monthly Budget. The requested amount exceeds the remaining available budget for the selected month. Please reduce the requested amount or increase the Monthly Budget before submitting this request.
                </p>
              )}

              {formError && <p className="req-notice">{formError}</p>}

              <div className="req-actions">
                <button type="submit" className="primary-button" disabled={showNoBudgetWarning || showInsufficientBudgetWarning || isCheckingBudget}>
                  {editId ? 'Resubmit Request' : 'Submit Request'}
                </button>
                <button type="button" className="secondary-button" onClick={() => navigate('/dashboard/request')}>
                  Cancel
                </button>
              </div>
            </div>
          </aside>
        </form>
      </section>
    </RoleGate>
  )
}

export default NewRequestPage
