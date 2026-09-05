import { useState, useEffect } from 'react'
import CurrencyInput from '../CurrencyInput'
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

async function getNextDvNumber() {
  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = String(now.getMonth() + 1).padStart(2, '0')
  try {
    const { data, error } = await supabase
      .from('document_counters')
      .select('*')
      .eq('id', 'dv_counter')
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
        .eq('id', 'dv_counter')
    } else {
      await supabase
        .from('document_counters')
        .insert({ id: 'dv_counter', last_number: 1, year: currentYear })
    }

    return `${currentYear}-${currentMonth}-${String(nextNumber).padStart(3, '0')}`
  } catch (err) {
    console.warn('Could not fetch DV counter:', err?.message)
    const fallback = Date.now() % 1000
    return `${currentYear}-${currentMonth}-${String(fallback).padStart(3, '0')}`
  }
}

function DisbursementVoucherForm({ profileName, role, selectedRequest, onPreview }) {
  const activeChairmanName = useActiveSkChairmanName()
  const [dvNumber, setDvNumber] = useState('')
  const [docDate, setDocDate] = useState(todayISO())
  const [fund, setFund] = useState('10% SK')
  const [payeeName, setPayeeName] = useState('')
  const [payeeAddress, setPayeeAddress] = useState('')
  const [particulars, setParticulars] = useState('')
  const [amount, setAmount] = useState('')
  const [skKagawad, setSkKagawad] = useState('')
  const [skTreasurer, setSkTreasurer] = useState('')
  const [skChairman, setSkChairman] = useState('')
  useEffect(() => {
    if (activeChairmanName) setSkChairman((prev) => prev || activeChairmanName)
  }, [activeChairmanName])
  const [certDateA, setCertDateA] = useState(todayISO())
  const [certDateB, setCertDateB] = useState(todayISO())
  const [certDateC, setCertDateC] = useState(todayISO())
  const [bankName, setBankName] = useState('LBP Midsayap')
  const [generatingNumber, setGeneratingNumber] = useState(false)

  useEffect(() => {
    if (selectedRequest) {
      setPayeeName(selectedRequest.event || '')
      setParticulars(
        `To payment of ${selectedRequest.event || ''} in the amount of ${currency.format(selectedRequest.amount || 0)}`
      )
      setAmount(String(selectedRequest.amount || ''))
    }
  }, [selectedRequest])

  useEffect(() => {
    if (role === 'SK Kagawad') {
      setSkKagawad(profileName || '')
    }
  }, [profileName, role])

  async function handlePreview() {
    let number = dvNumber
    if (!number) {
      setGeneratingNumber(true)
      number = await getNextDvNumber()
      setDvNumber(number)
      setGeneratingNumber(false)
    }

    onPreview({
      type: 'dv',
      data: {
        dvNumber: number,
        date: docDate,
        fund,
        payeeName,
        payeeAddress,
        particulars,
        amount: Number(amount) || 0,
        skKagawad,
        skTreasurer,
        skChairman,
        certDateA,
        certDateB,
        certDateC,
        bankName,
      },
    })
  }

  return (
    <div className="doc-gen-form">
      <div className="form-grid">
        <label className="field">
          <span>DV No.</span>
          <input
            type="text"
            value={dvNumber}
            onChange={(e) => setDvNumber(e.target.value)}
            placeholder="Auto-generated on preview"
          />
          <p className="doc-counter-note">Leave blank to auto-generate</p>
        </label>
        <label className="field">
          <span>Date</span>
          <input type="date" value={docDate} onChange={(e) => setDocDate(e.target.value)} />
        </label>
        <label className="field">
          <span>Fund</span>
          <input type="text" value={fund} onChange={(e) => setFund(e.target.value)} />
        </label>
      </div>

      <div className="form-grid">
        <label className="field">
          <span>Office / Payee Name</span>
          <input
            type="text"
            value={payeeName}
            onChange={(e) => setPayeeName(e.target.value)}
            placeholder="e.g. SK Officials"
          />
        </label>
        <label className="field">
          <span>Address</span>
          <input
            type="text"
            value={payeeAddress}
            onChange={(e) => setPayeeAddress(e.target.value)}
            placeholder="Payee address"
          />
        </label>
        <label className="field">
          <span>Amount</span>
          <CurrencyInput
            value={amount}
            onValueChange={(val) => setAmount(Number(val))}
            placeholder="0.00"
          />
        </label>
      </div>

      <label className="field">
        <span>Particulars</span>
        <textarea
          rows={3}
          value={particulars}
          onChange={(e) => setParticulars(e.target.value)}
          placeholder={'e.g. "To payment of SK Officials\' Honorarium for months of January to March, 2026"'}
        />
      </label>

      <div className="doc-form-section">
        <h3>Certification Signatories</h3>
        <div className="form-grid">
          <label className="field">
            <span>A. Budget Monitoring Officer Name</span>
            <input
              type="text"
              value={skKagawad}
              onChange={(e) => setSkKagawad(e.target.value)}
              placeholder="Budget Monitoring Officer"
            />
          </label>
          <label className="field">
            <span>A. Date</span>
            <input type="date" value={certDateA} onChange={(e) => setCertDateA(e.target.value)} />
          </label>
          <label className="field">
            <span>B. SK Treasurer Name</span>
            <input
              type="text"
              value={skTreasurer}
              onChange={(e) => setSkTreasurer(e.target.value)}
              placeholder="SK Treasurer"
            />
          </label>
          <label className="field">
            <span>B. Date</span>
            <input type="date" value={certDateB} onChange={(e) => setCertDateB(e.target.value)} />
          </label>
          <label className="field">
            <span>C. SK Chairman Name</span>
            <input
              type="text"
              value={skChairman}
              onChange={(e) => setSkChairman(e.target.value)}
              placeholder="SK Chairman"
            />
          </label>
          <label className="field">
            <span>C. Date</span>
            <input type="date" value={certDateC} onChange={(e) => setCertDateC(e.target.value)} />
          </label>
        </div>
      </div>

      <div className="form-grid">
        <label className="field">
          <span>Bank Name</span>
          <input type="text" value={bankName} onChange={(e) => setBankName(e.target.value)} />
        </label>
      </div>

      <div className="doc-gen-actions">
        <button
          type="button"
          className="primary-button"
          onClick={handlePreview}
          disabled={generatingNumber}
        >
          {generatingNumber ? 'Generating...' : 'Preview Document'}
        </button>
      </div>
    </div>
  )
}

export default DisbursementVoucherForm
