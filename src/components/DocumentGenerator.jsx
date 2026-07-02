import { useMemo, useState } from 'react'
import { useBudget } from '../context/BudgetContext'
import { useAuth } from '../context/AuthContext'
import { useDocuments } from '../context/DocumentContext'
import { supabase } from '../supabase/supabaseClient'
import PurchaseRequestPreview from './PurchaseRequestPreview'
import PurchaseOrderPreview from './PurchaseOrderPreview'
import DisbursementVoucherForm from './documents/DisbursementVoucherForm'
import DisbursementVoucherPreview from './documents/DisbursementVoucherPreview'
import PayrollForm from './documents/PayrollForm'
import PayrollPreview from './documents/PayrollPreview'
import ProjectDesignForm from './documents/ProjectDesignForm'
import ProjectDesignPreview from './documents/ProjectDesignPreview'
import ItineraryOfTravelForm from './documents/ItineraryOfTravelForm'
import ItineraryOfTravelPreview from './documents/ItineraryOfTravelPreview'
import TransmittalLetterForm from './documents/TransmittalLetterForm'
import TransmittalLetterPreview from './documents/TransmittalLetterPreview'
import CurrencyInput from './CurrencyInput'
import './DocumentGenerator.css'

const currency = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  maximumFractionDigits: 2,
})

const DOC_TYPES = [
  { id: 'pr', label: 'Purchase Request' },
  { id: 'po', label: 'Purchase Order' },
  { id: 'dv', label: 'Disbursement Voucher' },
  { id: 'payroll', label: 'Payroll' },
  { id: 'project', label: 'Project Design' },
  { id: 'itinerary', label: 'Itinerary of Travel' },
  { id: 'transmittal', label: 'Transmittal Letter' },
]

// Document types that use the request auto-fill dropdown
const REQUEST_LINKED_DOCS = ['pr', 'po', 'project']

const DEFAULTS = {
  barangay: 'UPPER GLAD 2',
  municipality: 'MIDSAYAP',
  province: 'COTABATO',
  punongBarangay: 'ROBERT O. BURA-AY',
}

function formatDateLocal(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  if (Number.isNaN(d.getTime())) return dateStr
  return d.toLocaleDateString('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
  })
}

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

async function getNextPrNumber() {
  const currentYear = new Date().getFullYear()
  try {
    const { data, error } = await supabase
      .from('document_counters')
      .select('*')
      .eq('id', 'pr_counter')
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
        .eq('id', 'pr_counter')
    } else {
      await supabase
        .from('document_counters')
        .insert({ id: 'pr_counter', last_number: 1, year: currentYear })
    }

    return `${currentYear}-22-${String(nextNumber).padStart(3, '0')}`
  } catch (err) {
    console.warn('Could not fetch PR counter from Supabase:', err?.message)
    const fallback = Date.now() % 1000
    return `${currentYear}-22-${String(fallback).padStart(3, '0')}`
  }
}

function DocumentGenerator({ initialDocType = 'pr', onCancel }) {
  const { requests } = useBudget()
  const { profileName, role } = useAuth()
  const { addDocument } = useDocuments()

  const [docType, setDocType] = useState(initialDocType)
  const [selectedRequestId, setSelectedRequestId] = useState('')
  const [preview, setPreview] = useState(null)
  const [generatingNumber, setGeneratingNumber] = useState(false)

  // PR fields
  const [barangay, setBarangay] = useState(DEFAULTS.barangay)
  const [municipality, setMunicipality] = useState(DEFAULTS.municipality)
  const [province, setProvince] = useState(DEFAULTS.province)
  const [prNumber, setPrNumber] = useState('')
  const [docDate, setDocDate] = useState(todayISO())
  const [requestedByName, setRequestedByName] = useState('')
  const [approvedByName, setApprovedByName] = useState('')
  const [items, setItems] = useState([])

  // PO-only fields
  const [supplierName, setSupplierName] = useState('')
  const [supplierAddress, setSupplierAddress] = useState('')
  const [supplierTin, setSupplierTin] = useState('')
  const [procurementMode, setProcurementMode] = useState('Over the Counter')
  const [placeOfDelivery, setPlaceOfDelivery] = useState(`Barangay ${DEFAULTS.barangay}`)
  const [dateOfDelivery, setDateOfDelivery] = useState('')
  const [deliveryTime, setDeliveryTime] = useState('')
  const [paymentTime, setPaymentTime] = useState('')

  const eligibleRequests = useMemo(
    () =>
      requests.filter(
        (r) =>
          (r.status === 'Approved' || r.status === 'Pending' || !r.status) &&
          !r.archivedAt
      ),
    [requests]
  )

  const selectedRequest = useMemo(
    () => (selectedRequestId ? requests.find((r) => r.id === selectedRequestId) : null),
    [selectedRequestId, requests]
  )

  const totalAmount = items.reduce((sum, item) => sum + (Number(item.total) || 0), 0)

  const showRequestSelector = REQUEST_LINKED_DOCS.includes(docType)

  function handleSelectRequest(e) {
    const requestId = e.target.value
    setSelectedRequestId(requestId)

    if (!requestId) {
      setItems([])
      return
    }

    const request = requests.find((r) => r.id === requestId)
    if (!request) return

    const breakdown = Array.isArray(request.breakdown) ? request.breakdown : []
    const mappedItems = breakdown
      .filter((item) => item.itemName || item.quantity > 0)
      .map((item) => ({
        itemName: item.itemName || '',
        quantity: Number(item.quantity) || 0,
        unitOfIssue: 'pc',
        unit: 'pc',
        unitCost: Number(item.unitCost) || 0,
        total: (Number(item.quantity) || 0) * (Number(item.unitCost) || 0),
      }))

    if (!mappedItems.length && request.amount > 0) {
      mappedItems.push({
        itemName: request.event || request.description || 'Budget allocation',
        quantity: 1,
        unitOfIssue: 'lot',
        unit: 'lot',
        unitCost: Number(request.amount) || 0,
        total: Number(request.amount) || 0,
      })
    }

    setItems(mappedItems)
    setDocDate(request.eventDate || todayISO())
    setDateOfDelivery(request.eventDate || todayISO())
    setRequestedByName(profileName || request.requestedBy || '')
  }

  function updateItem(index, field, value) {
    setItems((prev) =>
      prev.map((item, i) => {
        if (i !== index) return item
        const updated = { ...item, [field]: value }
        if (field === 'quantity' || field === 'unitCost') {
          updated.total = (Number(updated.quantity) || 0) * (Number(updated.unitCost) || 0)
        }
        return updated
      })
    )
  }

  function addItemRow() {
    setItems((prev) => [
      ...prev,
      { itemName: '', quantity: 1, unitOfIssue: 'pc', unit: 'pc', unitCost: 0, total: 0 },
    ])
  }

  function removeItemRow(index) {
    setItems((prev) => prev.filter((_, i) => i !== index))
  }

  async function handlePreview(e) {
    e.preventDefault()

    let number = prNumber
    if (!number) {
      setGeneratingNumber(true)
      number = await getNextPrNumber()
      setPrNumber(number)
      setGeneratingNumber(false)
    }

    const formattedDate = formatDateLocal(docDate)
    const formattedDeliveryDate = formatDateLocal(dateOfDelivery)

    if (docType === 'pr') {
      const prData = {
        type: 'pr',
        data: {
          barangay,
          municipality,
          province,
          prNumber: number,
          date: formattedDate,
          items: items.map((item) => ({
            ...item,
            unitOfIssue: item.unitOfIssue || 'pc',
          })),
          totalAmount,
          requestedByName: requestedByName || profileName || '',
          requestedByDate: formattedDate,
          approvedByName,
          approvedByDate: formattedDate,
        },
      }
      setPreview(prData)
      addDocument({
        name: `Purchase Request ${number}`,
        project: selectedRequest ? selectedRequest.event : '',
        generatedBy: profileName || role,
        type: 'Purchase Request',
        data: prData,
      })
    } else {
      const poData = {
        type: 'po',
        data: {
          barangay,
          municipality,
          province,
          poNumber: number,
          date: formattedDate,
          supplierName,
          supplierAddress,
          supplierTin,
          procurementMode,
          placeOfDelivery,
          dateOfDelivery: formattedDeliveryDate,
          deliveryTime,
          paymentTime,
          items: items.map((item) => ({
            ...item,
            unit: item.unit || item.unitOfIssue || 'pc',
          })),
          totalAmount,
        },
      }
      setPreview(poData)
      addDocument({
        name: `Purchase Order ${number}`,
        project: selectedRequest ? selectedRequest.event : '',
        generatedBy: profileName || role,
        type: 'Purchase Order',
        data: poData,
      })
    }
  }

  // Handler for new document type previews
  function handleNewDocPreview(previewData) {
    setPreview(previewData)
    // Extract a nice name based on the type
    let name = 'Document'
    const typeLabel = DOC_TYPES.find(d => d.id === docType)?.label || 'Document'
    
    // Attempt to extract specific numbers if present
    if (docType === 'dv' && previewData.data.dvNumber) name = `Disbursement Voucher ${previewData.data.dvNumber}`
    else if (docType === 'payroll' && previewData.data.payrollNo) name = `Payroll ${previewData.data.payrollNo}`
    else name = typeLabel

    addDocument({
      name,
      project: selectedRequest ? selectedRequest.event : '',
      generatedBy: profileName || role,
      type: typeLabel,
      data: previewData,
    })
  }

  // Render the form for the current doc type
  function renderForm() {
    switch (docType) {
      case 'dv':
        return (
          <DisbursementVoucherForm
            profileName={profileName}
            role={role}
            selectedRequest={selectedRequest}
            onPreview={handleNewDocPreview}
          />
        )
      case 'payroll':
        return (
          <PayrollForm
            profileName={profileName}
            role={role}
            onPreview={handleNewDocPreview}
          />
        )
      case 'project':
        return (
          <ProjectDesignForm
            profileName={profileName}
            role={role}
            selectedRequest={selectedRequest}
            onPreview={handleNewDocPreview}
          />
        )
      case 'itinerary':
        return (
          <ItineraryOfTravelForm
            profileName={profileName}
            role={role}
            onPreview={handleNewDocPreview}
          />
        )
      case 'transmittal':
        return (
          <TransmittalLetterForm
            profileName={profileName}
            role={role}
            onPreview={handleNewDocPreview}
          />
        )
      default:
        // PR / PO — render the existing inline form
        return null
    }
  }

  // Render the preview overlay for the current preview type
  function renderPreview() {
    if (!preview) return null

    switch (preview.type) {
      case 'pr':
        return <PurchaseRequestPreview data={preview.data} onClose={() => setPreview(null)} />
      case 'po':
        return <PurchaseOrderPreview data={preview.data} onClose={() => setPreview(null)} />
      case 'dv':
        return <DisbursementVoucherPreview data={preview.data} onClose={() => setPreview(null)} />
      case 'payroll':
        return <PayrollPreview data={preview.data} onClose={() => setPreview(null)} />
      case 'project':
        return <ProjectDesignPreview data={preview.data} onClose={() => setPreview(null)} />
      case 'itinerary':
        return <ItineraryOfTravelPreview data={preview.data} onClose={() => setPreview(null)} />
      case 'transmittal':
        return <TransmittalLetterPreview data={preview.data} onClose={() => setPreview(null)} />
      default:
        return null
    }
  }

  const isPrOrPo = docType === 'pr' || docType === 'po'

  return (
    <div className="doc-gen-section">
      {/* Document type toggle */}
      <div className="doc-type-toggle" style={{ marginBottom: '16px', display: 'block' }}>
        <label className="field">
          <span>Select Document Type</span>
          <select className="panel-select" style={{ width: '100%', maxWidth: '400px' }} value={docType} onChange={(e) => setDocType(e.target.value)}>
            {DOC_TYPES.map((dt) => (
              <option key={dt.id} value={dt.id}>
                {dt.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Select existing request — only for request-linked docs */}
      {showRequestSelector ? (
        <div className="doc-gen-form" style={{ marginBottom: isPrOrPo ? 0 : '16px' }}>
          <label className="field">
            <span>Select approved request to auto-fill</span>
            <select value={selectedRequestId} onChange={handleSelectRequest}>
              <option value="">— Choose a request —</option>
              {eligibleRequests.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.event} — {currency.format(r.amount)} ({r.status || 'Pending'})
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : null}

      {/* PR/PO inline form (original) */}
      {isPrOrPo ? (
        <div className="doc-gen-form">
          {/* Common fields */}
          <div className="form-grid">
            <label className="field">
              <span>Barangay</span>
              <input
                type="text"
                value={barangay}
                onChange={(e) => setBarangay(e.target.value)}
              />
            </label>
            <label className="field">
              <span>Municipality</span>
              <input
                type="text"
                value={municipality}
                onChange={(e) => setMunicipality(e.target.value)}
              />
            </label>
            <label className="field">
              <span>Province</span>
              <input
                type="text"
                value={province}
                onChange={(e) => setProvince(e.target.value)}
              />
            </label>
            <label className="field">
              <span>{docType === 'pr' ? 'P.R. Number' : 'P.O. Number'}</span>
              <input
                type="text"
                value={prNumber}
                onChange={(e) => setPrNumber(e.target.value)}
                placeholder="Auto-generated on preview"
              />
              <p className="doc-counter-note">Leave blank to auto-generate</p>
            </label>
            <label className="field">
              <span>Date</span>
              <input
                type="date"
                value={docDate}
                onChange={(e) => setDocDate(e.target.value)}
              />
            </label>
          </div>

          {/* PR-specific fields */}
          {docType === 'pr' ? (
            <div className="form-grid">
              <label className="field">
                <span>Requested By (Requisitioner)</span>
                <input
                  type="text"
                  value={requestedByName}
                  onChange={(e) => setRequestedByName(e.target.value)}
                  placeholder={profileName || 'Your name'}
                />
              </label>
              <label className="field">
                <span>Approved By (SK Chairman)</span>
                <input
                  type="text"
                  value={approvedByName}
                  onChange={(e) => setApprovedByName(e.target.value)}
                />
              </label>
            </div>
          ) : (
            <div className="form-grid">
              <label className="field">
                <span>Supplier Name</span>
                <input
                  type="text"
                  value={supplierName}
                  onChange={(e) => setSupplierName(e.target.value)}
                  placeholder="e.g. RANCOR CONSUMER GOODS TRADING"
                />
              </label>
              <label className="field">
                <span>Supplier Address</span>
                <input
                  type="text"
                  value={supplierAddress}
                  onChange={(e) => setSupplierAddress(e.target.value)}
                  placeholder="e.g. MIDSAYAP, COTABATO"
                />
              </label>
              <label className="field">
                <span>Supplier TIN</span>
                <input
                  type="text"
                  value={supplierTin}
                  onChange={(e) => setSupplierTin(e.target.value)}
                  placeholder="e.g. 912-941-039-000"
                />
              </label>
              <label className="field">
                <span>Mode of Procurement</span>
                <select
                  value={procurementMode}
                  onChange={(e) => setProcurementMode(e.target.value)}
                >
                  <option value="Over the Counter">Over the Counter</option>
                  <option value="Negotiable">Negotiable</option>
                  <option value="Bidding">Bidding</option>
                </select>
              </label>
              <label className="field">
                <span>Place of Delivery</span>
                <input
                  type="text"
                  value={placeOfDelivery}
                  onChange={(e) => setPlaceOfDelivery(e.target.value)}
                />
              </label>
              <label className="field">
                <span>Date of Delivery</span>
                <input
                  type="date"
                  value={dateOfDelivery}
                  onChange={(e) => setDateOfDelivery(e.target.value)}
                />
              </label>
              <label className="field">
                <span>Delivery Time</span>
                <input
                  type="text"
                  value={deliveryTime}
                  onChange={(e) => setDeliveryTime(e.target.value)}
                  placeholder="Optional"
                />
              </label>
              <label className="field">
                <span>Payment Time</span>
                <input
                  type="text"
                  value={paymentTime}
                  onChange={(e) => setPaymentTime(e.target.value)}
                  placeholder="Optional"
                />
              </label>
            </div>
          )}

          {/* Item breakdown editor */}
          <div className="overview-card doc-breakdown-editor">
            <p className="eyebrow">Item breakdown</p>
            <h2>{docType === 'pr' ? 'Requisition items' : 'Order items'}</h2>
            <table className="data-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>{docType === 'pr' ? 'Unit of Issue' : 'Unit'}</th>
                  <th>Item Description</th>
                  <th>Qty</th>
                  <th>Unit Cost</th>
                  <th>Total</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.length ? (
                  items.map((item, index) => (
                    <tr key={index}>
                      <td>{index + 1}</td>
                      <td>
                        <input
                          type="text"
                          value={item.unitOfIssue || item.unit || ''}
                          onChange={(e) =>
                            updateItem(index, docType === 'pr' ? 'unitOfIssue' : 'unit', e.target.value)
                          }
                          style={{ width: '60px' }}
                        />
                      </td>
                      <td>
                        <input
                          type="text"
                          value={item.itemName}
                          onChange={(e) => updateItem(index, 'itemName', e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min="0"
                          value={item.quantity}
                          onChange={(e) => updateItem(index, 'quantity', e.target.value)}
                          style={{ width: '70px' }}
                        />
                      </td>
                      <td>
                        <CurrencyInput
                          value={item.unitCost}
                          onValueChange={(val) => updateItem(index, 'unitCost', val)}
                          style={{ width: '90px' }}
                        />
                      </td>
                      <td>{currency.format(item.total || 0)}</td>
                      <td>
                        <button
                          type="button"
                          className="text-button"
                          onClick={() => removeItemRow(index)}
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="7" className="empty-state">
                      Select a request above or add items manually.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            <div className="content-actions" style={{ marginTop: '8px' }}>
              <button type="button" className="secondary-button" onClick={addItemRow}>
                Add item
              </button>
              <div className="form-note">
                Total: {currency.format(totalAmount)}
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="doc-gen-actions">
            <button
              type="button"
              className="primary-button"
              onClick={handlePreview}
              disabled={generatingNumber || !items.length}
            >
              {generatingNumber ? 'Generating...' : 'Preview & Print'}
            </button>
          </div>
        </div>
      ) : null}

      {/* New document type forms */}
      {!isPrOrPo ? renderForm() : null}

      {/* Preview overlay */}
      {renderPreview()}
    </div>
  )
}

export default DocumentGenerator
