import { useState, useEffect } from 'react'
import CurrencyInput from '../CurrencyInput';
import { PlusCircle, Trash2 } from 'lucide-react'
import { supabase } from '../../supabase/supabaseClient'

const currency = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  maximumFractionDigits: 2,
})

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

function createEmptyTravelRow() {
  return {
    date: '',
    destination: '',
    departure: '',
    arrival: '',
    transportation: 'Vehicle',
    perDiem: '',
    others: '',
  }
}

async function getNextItineraryNumber() {
  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = String(now.getMonth() + 1).padStart(2, '0')
  try {
    const { data, error } = await supabase
      .from('document_counters')
      .select('*')
      .eq('id', 'itinerary_counter')
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
        .eq('id', 'itinerary_counter')
    } else {
      await supabase
        .from('document_counters')
        .insert({ id: 'itinerary_counter', last_number: 1, year: currentYear })
    }

    return `${currentYear}-${currentMonth}-${String(nextNumber).padStart(3, '0')}`
  } catch (err) {
    console.warn('Could not fetch itinerary counter:', err?.message)
    const fallback = Date.now() % 1000
    return `${currentYear}-${currentMonth}-${String(fallback).padStart(3, '0')}`
  }
}

function ItineraryOfTravelForm({ profileName, role, onPreview }) {
  const [itineraryNumber, setItineraryNumber] = useState('')
  const [travelerName, setTravelerName] = useState('')
  const [position, setPosition] = useState('')
  const [officialStation, setOfficialStation] = useState('Midsayap, Cotabato')
  const [travelStart, setTravelStart] = useState(todayISO())
  const [travelEnd, setTravelEnd] = useState(todayISO())
  const [purpose, setPurpose] = useState('')
  const [rows, setRows] = useState(() => Array.from({ length: 5 }, createEmptyTravelRow))
  const [approvedBy, setApprovedBy] = useState('')
  const [immediateSupervisor, setImmediateSupervisor] = useState('')
  const [generatingNumber, setGeneratingNumber] = useState(false)

  useEffect(() => {
    setTravelerName(profileName || '')
    setPosition(role || '')
  }, [profileName, role])

  function updateRow(index, field, value) {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, [field]: value } : row)))
  }

  function addRow() {
    setRows((prev) => [...prev, createEmptyTravelRow()])
  }

  function removeRow(index) {
    setRows((prev) => prev.filter((_, i) => i !== index))
  }

  function getRowTotal(row) {
    return (Number(row.perDiem) || 0) + (Number(row.others) || 0)
  }

  const grandTotal = rows.reduce((sum, row) => sum + getRowTotal(row), 0)

  async function handlePreview() {
    let number = itineraryNumber
    if (!number) {
      setGeneratingNumber(true)
      number = await getNextItineraryNumber()
      setItineraryNumber(number)
      setGeneratingNumber(false)
    }

    onPreview({
      type: 'itinerary',
      data: {
        itineraryNumber: number,
        travelerName,
        position,
        officialStation,
        travelStart,
        travelEnd,
        purpose,
        rows: rows.map((row) => ({
          ...row,
          total: getRowTotal(row),
        })),
        grandTotal,
        approvedBy,
        immediateSupervisor,
      },
    })
  }

  return (
    <div className="doc-gen-form">
      <div className="form-grid">
        <label className="field">
          <span>Itinerary No.</span>
          <input
            type="text"
            value={itineraryNumber}
            onChange={(e) => setItineraryNumber(e.target.value)}
            placeholder="Auto-generated on preview"
          />
          <p className="doc-counter-note">Leave blank to auto-generate</p>
        </label>
        <label className="field">
          <span>Traveler Name</span>
          <input
            type="text"
            value={travelerName}
            onChange={(e) => setTravelerName(e.target.value)}
          />
        </label>
        <label className="field">
          <span>Position</span>
          <input type="text" value={position} onChange={(e) => setPosition(e.target.value)} />
        </label>
        <label className="field">
          <span>Official Station</span>
          <input
            type="text"
            value={officialStation}
            onChange={(e) => setOfficialStation(e.target.value)}
          />
        </label>
      </div>

      <div className="form-grid">
        <label className="field">
          <span>Date of Travel (Start)</span>
          <input type="date" value={travelStart} onChange={(e) => setTravelStart(e.target.value)} />
        </label>
        <label className="field">
          <span>Date of Travel (End)</span>
          <input type="date" value={travelEnd} onChange={(e) => setTravelEnd(e.target.value)} />
        </label>
      </div>

      <label className="field">
        <span>Purpose of Travel</span>
        <textarea
          rows={3}
          value={purpose}
          onChange={(e) => setPurpose(e.target.value)}
          placeholder="Describe the purpose of travel..."
        />
      </label>

      {/* Travel rows */}
      <div className="doc-form-section">
        <h3>Travel Itinerary</h3>
        <div style={{ overflowX: 'auto' }}>
          <table className="add-row-table">
            <thead>
              <tr>
                <th style={{ width: '100px' }}>Date</th>
                <th>Destination</th>
                <th style={{ width: '80px' }}>Departure</th>
                <th style={{ width: '80px' }}>Arrival</th>
                <th style={{ width: '110px' }}>Transportation</th>
                <th style={{ width: '90px' }}>Per Diem</th>
                <th style={{ width: '80px' }}>Others</th>
                <th style={{ width: '100px' }}>Total</th>
                <th style={{ width: '40px' }}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={index}>
                  <td>
                    <input
                      type="date"
                      value={row.date}
                      onChange={(e) => updateRow(index, 'date', e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      value={row.destination}
                      onChange={(e) => updateRow(index, 'destination', e.target.value)}
                      placeholder="Place to visit"
                    />
                  </td>
                  <td>
                    <input
                      type="time"
                      value={row.departure}
                      onChange={(e) => updateRow(index, 'departure', e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      type="time"
                      value={row.arrival}
                      onChange={(e) => updateRow(index, 'arrival', e.target.value)}
                    />
                  </td>
                  <td>
                    <select
                      value={row.transportation}
                      onChange={(e) => updateRow(index, 'transportation', e.target.value)}
                    >
                      <option value="Vehicle">Vehicle</option>
                      <option value="Bus">Bus</option>
                      <option value="Jeepney">Jeepney</option>
                      <option value="Tricycle">Tricycle</option>
                    </select>
                  </td>
                  <td>
                    <CurrencyInput value={row.perDiem} onValueChange={(val) => updateRow(index, 'perDiem', Number(val))} placeholder="0.00" />
                  </td>
                  <td>
                    <CurrencyInput value={row.others} onValueChange={(val) => updateRow(index, 'others', Number(val))} placeholder="0.00" />
                  </td>
                  <td className="computed-cell">{currency.format(getRowTotal(row))}</td>
                  <td>
                    <button
                      type="button"
                      className="remove-row-btn"
                      onClick={() => removeRow(index)}
                      title="Remove row"
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
              <tr className="total-row">
                <td colSpan={7} style={{ textAlign: 'right', fontWeight: 700 }}>
                  TOTAL
                </td>
                <td className="computed-cell">{currency.format(grandTotal)}</td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="add-row-actions">
          <button type="button" className="add-row-btn" onClick={addRow}>
            <PlusCircle size={16} /> Add Row
          </button>
        </div>
      </div>

      {/* Signatories */}
      <div className="doc-form-section">
        <h3>Signatories</h3>
        <div className="form-grid">
          <label className="field">
            <span>Approved by (Punong Barangay)</span>
            <input
              type="text"
              value={approvedBy}
              onChange={(e) => setApprovedBy(e.target.value)}
              placeholder="Punong Barangay name"
            />
          </label>
          <label className="field">
            <span>Immediate Supervisor</span>
            <input
              type="text"
              value={immediateSupervisor}
              onChange={(e) => setImmediateSupervisor(e.target.value)}
              placeholder="Supervisor name"
            />
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
          {generatingNumber ? 'Generating...' : 'Preview Document'}
        </button>
      </div>
    </div>
  )
}

export default ItineraryOfTravelForm
