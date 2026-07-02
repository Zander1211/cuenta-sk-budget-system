import { useState } from 'react'
import CurrencyInput from '../CurrencyInput';
import { PlusCircle, Trash2 } from 'lucide-react'

const currency = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  maximumFractionDigits: 2,
})

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

function getCurrentMonth() {
  const now = new Date()
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ]
  return `${monthNames[now.getMonth()]}, ${now.getFullYear()}`
}

function createEmptyDvRow() {
  return {
    dvDate: '',
    dvNo: '',
    checkDate: '',
    checkNo: '',
    payee: '',
    amount: '',
    skcDate: '',
    skcNo: '',
  }
}

function createEmptyRcdRow() {
  return { date: '', no: '', amount: '' }
}

function createEmptyOtherRow() {
  return { date: '', typeOfReport: '' }
}

function TransmittalLetterForm({ profileName, role, onPreview }) {
  const [docDate, setDocDate] = useState(todayISO())
  const [coaTeamNumber, setCoaTeamNumber] = useState('')
  const [month, setMonth] = useState(getCurrentMonth())
  const [accountNo, setAccountNo] = useState('1002-1118-84')
  const [dvRows, setDvRows] = useState(() => Array.from({ length: 3 }, createEmptyDvRow))
  const [rcdRows, setRcdRows] = useState(() => Array.from({ length: 2 }, createEmptyRcdRow))
  const [otherRows, setOtherRows] = useState(() => Array.from({ length: 2 }, createEmptyOtherRow))
  const [bodyText, setBodyText] = useState('')
  const [skTreasurer, setSkTreasurer] = useState('')
  const [skChairperson, setSkChairperson] = useState('')

  // Default body text
  useState(() => {
    setBodyText(
      `We submit the original copies of the disbursement vouchers issued for the month of ${getCurrentMonth()}, duly acknowledged by the payees together with the supporting documents, and copies of the corresponding checks and Sangguniang Kabataan Certification (SKC).`
    )
  })

  // DV rows
  function updateDvRow(index, field, value) {
    setDvRows((prev) => prev.map((row, i) => (i === index ? { ...row, [field]: value } : row)))
  }
  function addDvRow() {
    setDvRows((prev) => [...prev, createEmptyDvRow()])
  }
  function removeDvRow(index) {
    setDvRows((prev) => prev.filter((_, i) => i !== index))
  }

  // RCD rows
  function updateRcdRow(index, field, value) {
    setRcdRows((prev) => prev.map((row, i) => (i === index ? { ...row, [field]: value } : row)))
  }
  function addRcdRow() {
    setRcdRows((prev) => [...prev, createEmptyRcdRow()])
  }
  function removeRcdRow(index) {
    setRcdRows((prev) => prev.filter((_, i) => i !== index))
  }

  // Other rows
  function updateOtherRow(index, field, value) {
    setOtherRows((prev) => prev.map((row, i) => (i === index ? { ...row, [field]: value } : row)))
  }
  function addOtherRow() {
    setOtherRows((prev) => [...prev, createEmptyOtherRow()])
  }
  function removeOtherRow(index) {
    setOtherRows((prev) => prev.filter((_, i) => i !== index))
  }

  const dvTotal = dvRows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0)

  function handlePreview() {
    onPreview({
      type: 'transmittal',
      data: {
        date: docDate,
        coaTeamNumber,
        month,
        accountNo,
        bodyText,
        dvRows,
        dvTotal,
        rcdRows,
        otherRows,
        skTreasurer,
        skChairperson,
      },
    })
  }

  return (
    <div className="doc-gen-form">
      <div className="form-grid">
        <label className="field">
          <span>Date</span>
          <input type="date" value={docDate} onChange={(e) => setDocDate(e.target.value)} />
        </label>
        <label className="field">
          <span>COA Team Number</span>
          <input
            type="text"
            value={coaTeamNumber}
            onChange={(e) => setCoaTeamNumber(e.target.value)}
            placeholder="e.g. 5"
          />
        </label>
        <label className="field">
          <span>Month</span>
          <input
            type="text"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            placeholder="e.g. February, 2026"
          />
        </label>
        <label className="field">
          <span>Account No.</span>
          <input type="text" value={accountNo} onChange={(e) => setAccountNo(e.target.value)} />
        </label>
      </div>

      <label className="field">
        <span>Letter Body</span>
        <textarea
          rows={4}
          value={bodyText}
          onChange={(e) => setBodyText(e.target.value)}
        />
      </label>

      {/* DV Table */}
      <div className="doc-form-section">
        <h3>Disbursement Vouchers</h3>
        <div style={{ overflowX: 'auto' }}>
          <table className="add-row-table">
            <thead>
              <tr>
                <th>DV Date</th>
                <th>DV No.</th>
                <th>Check Date</th>
                <th>Check No.</th>
                <th>Payee</th>
                <th style={{ width: '100px' }}>Amount</th>
                <th>SKC Date</th>
                <th>SKC No.</th>
                <th style={{ width: '40px' }}></th>
              </tr>
            </thead>
            <tbody>
              {dvRows.map((row, idx) => (
                <tr key={idx}>
                  <td>
                    <input type="date" value={row.dvDate} onChange={(e) => updateDvRow(idx, 'dvDate', e.target.value)} />
                  </td>
                  <td>
                    <input type="text" value={row.dvNo} onChange={(e) => updateDvRow(idx, 'dvNo', e.target.value)} />
                  </td>
                  <td>
                    <input type="date" value={row.checkDate} onChange={(e) => updateDvRow(idx, 'checkDate', e.target.value)} />
                  </td>
                  <td>
                    <input type="text" value={row.checkNo} onChange={(e) => updateDvRow(idx, 'checkNo', e.target.value)} />
                  </td>
                  <td>
                    <input type="text" value={row.payee} onChange={(e) => updateDvRow(idx, 'payee', e.target.value)} placeholder="Payee name" />
                  </td>
                  <td>
                    <CurrencyInput value={row.amount} onValueChange={(val) => updateDvRow(idx, 'amount', Number(val))} placeholder="0.00" />
                  </td>
                  <td>
                    <input type="date" value={row.skcDate} onChange={(e) => updateDvRow(idx, 'skcDate', e.target.value)} />
                  </td>
                  <td>
                    <input type="text" value={row.skcNo} onChange={(e) => updateDvRow(idx, 'skcNo', e.target.value)} />
                  </td>
                  <td>
                    <button type="button" className="remove-row-btn" onClick={() => removeDvRow(idx)} title="Remove">
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
              <tr className="total-row">
                <td colSpan={5} style={{ textAlign: 'right', fontWeight: 700 }}>TOTAL</td>
                <td className="computed-cell">{currency.format(dvTotal)}</td>
                <td colSpan={3}></td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="add-row-actions">
          <button type="button" className="add-row-btn" onClick={addDvRow}>
            <PlusCircle size={16} /> Add DV Row
          </button>
        </div>
      </div>

      {/* RCDs */}
      <div className="doc-form-section">
        <h3>RCDs and Supporting Documents (RCRs, OR, VDS)</h3>
        <div style={{ overflowX: 'auto' }}>
          <table className="add-row-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>No.</th>
                <th style={{ width: '120px' }}>Amount</th>
                <th style={{ width: '40px' }}></th>
              </tr>
            </thead>
            <tbody>
              {rcdRows.map((row, idx) => (
                <tr key={idx}>
                  <td>
                    <input type="date" value={row.date} onChange={(e) => updateRcdRow(idx, 'date', e.target.value)} />
                  </td>
                  <td>
                    <input type="text" value={row.no} onChange={(e) => updateRcdRow(idx, 'no', e.target.value)} />
                  </td>
                  <td>
                    <CurrencyInput value={row.amount} onValueChange={(val) => updateRcdRow(idx, 'amount', Number(val))} placeholder="0.00" />
                  </td>
                  <td>
                    <button type="button" className="remove-row-btn" onClick={() => removeRcdRow(idx)} title="Remove">
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="add-row-actions">
          <button type="button" className="add-row-btn" onClick={addRcdRow}>
            <PlusCircle size={16} /> Add RCD Row
          </button>
        </div>
      </div>

      {/* Others */}
      <div className="doc-form-section">
        <h3>Others</h3>
        <div style={{ overflowX: 'auto' }}>
          <table className="add-row-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Type of Report</th>
                <th style={{ width: '40px' }}></th>
              </tr>
            </thead>
            <tbody>
              {otherRows.map((row, idx) => (
                <tr key={idx}>
                  <td>
                    <input type="date" value={row.date} onChange={(e) => updateOtherRow(idx, 'date', e.target.value)} />
                  </td>
                  <td>
                    <input type="text" value={row.typeOfReport} onChange={(e) => updateOtherRow(idx, 'typeOfReport', e.target.value)} placeholder="Type of report" />
                  </td>
                  <td>
                    <button type="button" className="remove-row-btn" onClick={() => removeOtherRow(idx)} title="Remove">
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="add-row-actions">
          <button type="button" className="add-row-btn" onClick={addOtherRow}>
            <PlusCircle size={16} /> Add Row
          </button>
        </div>
      </div>

      {/* Signatories */}
      <div className="doc-form-section">
        <h3>Signatories</h3>
        <div className="form-grid">
          <label className="field">
            <span>SK Treasurer</span>
            <input type="text" value={skTreasurer} onChange={(e) => setSkTreasurer(e.target.value)} placeholder="SK Treasurer name" />
          </label>
          <label className="field">
            <span>SK Chairperson</span>
            <input type="text" value={skChairperson} onChange={(e) => setSkChairperson(e.target.value)} placeholder="SK Chairperson name" />
          </label>
        </div>
      </div>

      <div className="doc-gen-actions">
        <button type="button" className="primary-button" onClick={handlePreview}>
          Preview & Print
        </button>
      </div>
    </div>
  )
}

export default TransmittalLetterForm
