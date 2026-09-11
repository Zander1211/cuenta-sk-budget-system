import { useState, useEffect } from 'react'
import { supabase } from '../../supabase/supabaseClient'
import { useActiveSkChairmanName } from '../../hooks/useActiveSkChairmanName'

const currency = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  maximumFractionDigits: 2,
})

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

function getCurrentMonthRange() {
  const now = new Date()
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ]
  const month = monthNames[now.getMonth()]
  const year = now.getFullYear()
  const lastDay = new Date(year, now.getMonth() + 1, 0).getDate()
  return `${month} 1-${lastDay}, ${year}`
}

async function getNextPayrollNumber() {
  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = String(now.getMonth() + 1).padStart(2, '0')
  try {
    const { data, error } = await supabase
      .from('document_counters')
      .select('*')
      .eq('id', 'payroll_counter')
      .maybeSingle()

    if (error) throw error

    let nextNumber = 1
    if (data) {
      if (data.year === currentYear) {
        nextNumber = (data.last_number || 0) + 1
      }
      await supabase
        .from('document_counters')
        .update({ last_number: nextNumber, year: currentYear })
        .eq('id', 'payroll_counter')
    } else {
      await supabase
        .from('document_counters')
        .insert({ id: 'payroll_counter', last_number: 1, year: currentYear })
    }

    return `${currentYear}-${currentMonth}-${String(nextNumber).padStart(3, '0')}`
  } catch (err) {
    console.warn('Could not fetch payroll counter:', err?.message)
    const fallback = Date.now() % 1000
    return `${currentYear}-${currentMonth}-${String(fallback).padStart(3, '0')}`
  }
}

function PayrollForm({ profileName, role, selectedRequest, onPreview, initialData = null }) {
  const activeChairmanName = useActiveSkChairmanName()
  const [payrollNumber, setPayrollNumber] = useState(() => initialData?.payrollNumber ?? '')
  const [periodCovered, setPeriodCovered] = useState(() => initialData?.periodCovered ?? getCurrentMonthRange())
  const [rows, setRows] = useState([])
  const [skKagawad, setSkKagawad] = useState(() => initialData?.skKagawad ?? '')
  const [skTreasurer, setSkTreasurer] = useState(() => initialData?.skTreasurer ?? '')
  const [skChairman, setSkChairman] = useState(() => initialData?.skChairman ?? '')
  const [certDateA, setCertDateA] = useState(todayISO())
  const [certDateB, setCertDateB] = useState(todayISO())
  const [certDateC, setCertDateC] = useState(todayISO())
  const [certDateD, setCertDateD] = useState(todayISO())
  const [generatingNumber, setGeneratingNumber] = useState(false)

  useEffect(() => {
    if (role === 'SK Kagawad') setSkKagawad(profileName || '')
  }, [profileName, role])

  useEffect(() => {
    if (activeChairmanName) setSkChairman((prev) => prev || activeChairmanName)
  }, [activeChairmanName])

  useEffect(() => {
    if (selectedRequest) {
      // Editing an already-generated document: periodCovered is already
      // seeded from what was saved — don't overwrite it with the record's
      // current live value.
      if (selectedRequest.event && !initialData) {
        setPeriodCovered(selectedRequest.event)
      }

      const breakdown = Array.isArray(selectedRequest.breakdown) ? selectedRequest.breakdown : []
      if (breakdown.length > 0) {
        const mapped = breakdown.map(item => ({
          name: item.name || '',
          position: item.position || '',
          honoraria: item.honoraria !== undefined ? Number(item.honoraria) : '',
          serviceRendered: item.serviceRendered || '',
          cbcLbf: item.cbcLbf !== undefined ? Number(item.cbcLbf) : ''
        }))
        setRows(mapped)
      } else {
        // No approved breakdown to show — an empty read-only table, not
        // blank editable rows; there is nothing here to fill in by hand.
        setRows([])
      }
    }
  }, [selectedRequest, initialData])

  function getNetAmount(row) {
    const hon = Number(row.honoraria) || 0
    const cbc = Number(row.cbcLbf) || 0
    return hon - cbc
  }

  const totals = rows.reduce(
    (acc, row) => {
      const hon = Number(row.honoraria) || 0
      const cbc = Number(row.cbcLbf) || 0
      acc.honoraria += hon
      acc.total += hon
      acc.cbcLbf += cbc
      acc.netAmount += hon - cbc
      return acc
    },
    { honoraria: 0, total: 0, cbcLbf: 0, netAmount: 0 }
  )

  async function handlePreview() {
    let number = payrollNumber
    if (!number) {
      setGeneratingNumber(true)
      number = await getNextPayrollNumber()
      setPayrollNumber(number)
      setGeneratingNumber(false)
    }

    onPreview({
      type: 'payroll',
      data: {
        payrollNumber: number,
        periodCovered,
        rows: rows.map((row) => ({
          ...row,
          netAmount: getNetAmount(row),
        })),
        totals,
        skKagawad,
        skTreasurer,
        skChairman,
        certDateA,
        certDateB,
        certDateC,
        certDateD,
      },
    })
  }

  return (
    <div className="doc-gen-form">
      <div className="form-grid">
        <label className="field">
          <span>Payroll No.</span>
          <input
            type="text"
            value={payrollNumber}
            onChange={(e) => setPayrollNumber(e.target.value)}
            placeholder="Auto-generated on preview"
          />
          <p className="doc-counter-note">Leave blank to auto-generate</p>
        </label>
        <label className="field">
          <span>Period Covered</span>
          <input
            type="text"
            value={periodCovered}
            onChange={(e) => setPeriodCovered(e.target.value)}
            placeholder="e.g. March 1-31, 2026"
          />
        </label>
      </div>

      {/* Payroll rows — read-only. This is the approved payroll breakdown;
          once approved it's final, so nothing here can add, remove, or edit
          an entry. Expenses incurred later belong in the record's own
          Additional Requisition Breakdown instead. */}
      <div className="doc-form-section">
        <h3>Payroll Entries</h3>
        <p className="form-note" style={{ marginTop: 0 }}>
          These entries come from the approved budget request and cannot be edited here.
        </p>
        <div style={{ overflowX: 'auto' }}>
          <table className="add-row-table">
            <thead>
              <tr>
                <th style={{ width: '40px' }}>No.</th>
                <th>Name</th>
                <th>Position</th>
                <th style={{ width: '110px' }}>Honoraria</th>
                <th style={{ width: '120px' }}>Service Rendered</th>
                <th style={{ width: '100px' }}>CBC/LBF</th>
                <th style={{ width: '110px' }}>Net Amount</th>
              </tr>
            </thead>
            <tbody>
              {rows.length ? (
                <>
                  {rows.map((row, index) => (
                    <tr key={index}>
                      <td style={{ textAlign: 'center', fontWeight: 600 }}>{index + 1}</td>
                      <td>{row.name || '—'}</td>
                      <td>{row.position || '—'}</td>
                      <td>{currency.format(Number(row.honoraria) || 0)}</td>
                      <td>{row.serviceRendered || '—'}</td>
                      <td>{currency.format(Number(row.cbcLbf) || 0)}</td>
                      <td className="computed-cell">{currency.format(getNetAmount(row))}</td>
                    </tr>
                  ))}
                  <tr className="total-row">
                    <td colSpan={3} style={{ textAlign: 'right', fontWeight: 700 }}>
                      TOTAL
                    </td>
                    <td className="computed-cell">{currency.format(totals.honoraria)}</td>
                    <td></td>
                    <td className="computed-cell">{currency.format(totals.cbcLbf)}</td>
                    <td className="computed-cell">{currency.format(totals.netAmount)}</td>
                  </tr>
                </>
              ) : (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', color: 'var(--ink-soft)' }}>
                    Select an approved request above to load its payroll entries.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Certification signatories */}
      <div className="doc-form-section">
        <h3>Certification Signatories</h3>
        <div className="form-grid">
          <label className="field">
            <span>A. SK Kagawad Name</span>
            <input type="text" value={skKagawad} onChange={(e) => setSkKagawad(e.target.value)} />
          </label>
          <label className="field">
            <span>A. Date</span>
            <input type="date" value={certDateA} onChange={(e) => setCertDateA(e.target.value)} />
          </label>
          <label className="field">
            <span>B. SK Treasurer Name</span>
            <input type="text" value={skTreasurer} onChange={(e) => setSkTreasurer(e.target.value)} />
          </label>
          <label className="field">
            <span>B. Date</span>
            <input type="date" value={certDateB} onChange={(e) => setCertDateB(e.target.value)} />
          </label>
          <label className="field">
            <span>C. SK Chairman Name</span>
            <input type="text" value={skChairman} onChange={(e) => setSkChairman(e.target.value)} />
          </label>
          <label className="field">
            <span>C. Date</span>
            <input type="date" value={certDateC} onChange={(e) => setCertDateC(e.target.value)} />
          </label>
          <label className="field">
            <span>D. Paid by (SK Treasurer)</span>
            <input
              type="text"
              value={skTreasurer}
              disabled
              style={{ opacity: 0.6 }}
            />
            <p className="doc-counter-note">Same as SK Treasurer above</p>
          </label>
          <label className="field">
            <span>D. Date</span>
            <input type="date" value={certDateD} onChange={(e) => setCertDateD(e.target.value)} />
          </label>
        </div>
      </div>

      <div className="doc-gen-actions">
        <button
          type="button"
          className="primary-button"
          onClick={handlePreview}
          disabled={generatingNumber}
        >
          {generatingNumber ? 'Generating...' : (initialData ? 'Save' : 'Preview Document')}
        </button>
      </div>
    </div>
  )
}

export default PayrollForm
