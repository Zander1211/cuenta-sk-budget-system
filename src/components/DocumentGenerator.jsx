import { useMemo, useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useBudget } from '../context/BudgetContext'
import { useAuth } from '../context/AuthContext'
import { useDocuments } from '../context/DocumentContext'
import { useActiveSkChairmanName } from '../hooks/useActiveSkChairmanName'
import { supabase } from '../supabase/supabaseClient'
import PurchaseRequestPreview from './PurchaseRequestPreview'
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
import './DocumentGenerator.css'

const currency = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  maximumFractionDigits: 2,
})

const DOC_TYPES = [
  { id: 'pr', label: 'Purchase Request' },
  { id: 'dv', label: 'Disbursement Voucher' },
  { id: 'payroll', label: 'Payroll' },
  { id: 'project', label: 'Project Design' },
  { id: 'itinerary', label: 'Itinerary of Travel' },
  { id: 'transmittal', label: 'Transmittal Letter' },
  // No inline form — see the docType === 'narrative' branch below, which
  // hands off to the full Narrative Report builder instead.
  { id: 'narrative', label: 'Narrative & Photo Documentation' },
]

// Document types that use the request auto-fill dropdown
const REQUEST_LINKED_DOCS = ['pr', 'project', 'payroll']

const RECORD_KIND_LABEL = { project: 'Project', event: 'Event', payroll: 'Payroll' }

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

// `presetRecord` launches the generator already linked to one Project, Event,
// or Payroll (an approved `expenses` row from Projects & Events / Payroll) —
// the "Generate Documents" button on those pages. `recordKind` says which
// kind it is ('project' | 'event' | 'payroll'), which decides both the
// allowed document list (Project Design is Project-only; Payroll pages only
// offer the Payroll document) and how the saved document gets linked.
// `allowedDocTypes` restricts the type selector; omit it to show everything,
// as the standalone Documents → Create Document flow still does.
function DocumentGenerator({
  initialDocType = 'pr',
  onCancel,
  presetRecord = null,
  recordKind = null,
  allowedDocTypes = null,
  onSaved,
}) {
  const { requests } = useBudget()
  const { profileName, role } = useAuth()
  const { addDocument } = useDocuments()
  const activeChairmanName = useActiveSkChairmanName()
  const navigate = useNavigate()

  const visibleDocTypes = useMemo(
    () => (allowedDocTypes ? DOC_TYPES.filter((dt) => allowedDocTypes.includes(dt.id)) : DOC_TYPES),
    [allowedDocTypes]
  )

  const [docType, setDocType] = useState(() =>
    visibleDocTypes.some((dt) => dt.id === initialDocType) ? initialDocType : (visibleDocTypes[0]?.id || 'pr')
  )
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
  // Which preset record's fields the PR item-breakdown state currently
  // reflects — lets the derivation below run exactly once per record,
  // adjusted during render rather than in an effect (presetRecord is a prop
  // available from the first render, so there is nothing to wait on).
  const [appliedPresetId, setAppliedPresetId] = useState(null)

  // Default "Approved By" to the active SK Chairman's name, editable.
  useEffect(() => {
    if (activeChairmanName) setApprovedByName((prev) => prev || activeChairmanName)
  }, [activeChairmanName])



  const eligibleRequests = useMemo(
    () =>
      requests.filter((r) => {
        if (r.archivedAt) return false;
        
        const isPayrollRequest = r.type === 'Payroll' || r.category === 'Payroll';
        
        if (docType === 'payroll') {
           // For payroll document, strictly require Approved payroll requests
           return isPayrollRequest && r.status === 'Approved';
        } else {
           // For other docs, exclude payroll requests, and allow Approved/Pending
           if (isPayrollRequest) return false;
           return r.status === 'Approved' || r.status === 'Pending' || !r.status;
        }
      }),
    [requests, docType]
  )

  useEffect(() => {
    if (presetRecord) return
    if (docType === 'payroll' && eligibleRequests.length === 1 && !selectedRequestId) {
      setSelectedRequestId(eligibleRequests[0].id)
    }
  }, [presetRecord, docType, eligibleRequests, selectedRequestId])

  // A preset record IS the selected request — it comes from the Project/Event
  // or Payroll row that opened this generator, so there is nothing to pick.
  const selectedRequest = useMemo(() => {
    if (presetRecord) return presetRecord
    return selectedRequestId ? requests.find((r) => r.id === selectedRequestId) : null
  }, [presetRecord, selectedRequestId, requests])

  const totalAmount = items.reduce((sum, item) => sum + (Number(item.total) || 0), 0)

  const showRequestSelector = !presetRecord && REQUEST_LINKED_DOCS.includes(docType)

  // Same item/date mapping the "Select existing request" dropdown applies on
  // pick, run once for the preset record so the Purchase Request form (the
  // only doc type with its own item-breakdown state) starts pre-filled.
  if (presetRecord && presetRecord.id !== appliedPresetId) {
    setAppliedPresetId(presetRecord.id)

    const breakdown = Array.isArray(presetRecord.breakdown) ? presetRecord.breakdown : []
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

    if (!mappedItems.length && presetRecord.amount > 0) {
      mappedItems.push({
        itemName: presetRecord.event || presetRecord.description || 'Budget allocation',
        quantity: 1,
        unitOfIssue: 'lot',
        unit: 'lot',
        unitCost: Number(presetRecord.amount) || 0,
        total: Number(presetRecord.amount) || 0,
      })
    }

    setItems(mappedItems)
    setDocDate(presetRecord.eventDate || todayISO())
    setRequestedByName((prev) => prev || profileName || presetRecord.requestedBy || '')
  }

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
    setRequestedByName(profileName || request.requestedBy || '')
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
    }
  }

  // Handler for new document type previews
  function handleNewDocPreview(previewData) {
    setPreview(previewData)
  }

  async function handleSaveDocument(previewData) {
    if (!previewData) return

    let name = 'Document'
    const typeLabel = DOC_TYPES.find(d => d.id === docType)?.label || 'Document'

    if (docType === 'dv' && previewData.data.dvNumber) name = `Disbursement Voucher ${previewData.data.dvNumber}`
    else if (docType === 'payroll' && previewData.data.payrollNumber) name = `Payroll ${previewData.data.payrollNumber}`
    else if (docType === 'pr' && previewData.data.prNumber) name = `Purchase Request ${previewData.data.prNumber}`
    else name = typeLabel

    // A document generated from a specific Project/Event/Payroll links to
    // that record's own id and kind, not to the underlying budget request —
    // that is what lets the Documents page (and, eventually, that record's
    // own history) look the reference up directly instead of by title text.
    const saved = await addDocument({
      name,
      project: selectedRequest ? selectedRequest.event : '',
      generatedBy: profileName || role,
      type: typeLabel,
      data: previewData,
      relatedEntityType: presetRecord ? recordKind : (selectedRequest ? (docType === 'payroll' ? 'payroll' : 'request') : null),
      relatedEntityId: presetRecord ? presetRecord.id : (selectedRequest?.id || null),
    })

    if (onSaved) onSaved(saved)
  }

  // Narrative & Photo Documentation has its own multi-section builder with
  // photo uploads (NarrativeReportPage) rather than an inline form here.
  // Hand off to it, carrying the underlying request id so it can auto-select
  // and pre-fill the same record instead of asking the user to pick again.
  function handleOpenNarrativeReport() {
    const requestId = presetRecord ? (presetRecord.requestId || presetRecord.id) : selectedRequest?.id
    navigate(`/dashboard/narrative-report${requestId ? `?requestId=${encodeURIComponent(requestId)}` : ''}`)
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
        // The "no eligible request" guard only applies to the standalone
        // dropdown flow — a preset record IS already an approved payroll row.
        if (!presetRecord && eligibleRequests.length === 0) return null;
        return (
          <PayrollForm
            profileName={profileName}
            role={role}
            selectedRequest={selectedRequest}
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
      case 'narrative':
        // Rendered as a call-to-action card in the main return instead —
        // see handleOpenNarrativeReport.
        return null
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
        return <PurchaseRequestPreview data={preview.data} onClose={() => setPreview(null)} onSave={() => handleSaveDocument(preview)} />
      case 'dv':
        return <DisbursementVoucherPreview data={preview.data} onClose={() => setPreview(null)} onSave={() => handleSaveDocument(preview)} />
      case 'payroll':
        return <PayrollPreview data={preview.data} onClose={() => setPreview(null)} onSave={() => handleSaveDocument(preview)} />
      case 'project':
        return <ProjectDesignPreview data={preview.data} onClose={() => setPreview(null)} onSave={() => handleSaveDocument(preview)} />
      case 'itinerary':
        return <ItineraryOfTravelPreview data={preview.data} onClose={() => setPreview(null)} onSave={() => handleSaveDocument(preview)} />
      case 'transmittal':
        return <TransmittalLetterPreview data={preview.data} onClose={() => setPreview(null)} onSave={() => handleSaveDocument(preview)} />
      default:
        return null
    }
  }

  const isPrOrPo = docType === 'pr'
  const recordTitle = presetRecord ? (presetRecord.event || presetRecord.project || 'this record') : ''

  return (
    <div className="doc-gen-section">
      {/* Document type toggle — a single-option list (Payroll pages) shows a
          static label instead of a one-item dropdown. */}
      <div className="doc-type-toggle" style={{ marginBottom: '16px', display: 'block' }}>
        {visibleDocTypes.length > 1 ? (
          <label className="field">
            <span>Select Document Type</span>
            <select className="panel-select" style={{ width: '100%', maxWidth: '400px' }} value={docType} onChange={(e) => setDocType(e.target.value)}>
              {visibleDocTypes.map((dt) => (
                <option key={dt.id} value={dt.id}>
                  {dt.label}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <div className="field">
            <span>Document Type</span>
            <p style={{ margin: '4px 0 0', fontWeight: 600, color: 'var(--text-primary)' }}>
              {visibleDocTypes[0]?.label || 'Document'}
            </p>
          </div>
        )}
      </div>

      {/* Launched from a specific Project/Event/Payroll: say so instead of
          asking the user to pick the request again — that's the whole point
          of generating from the record directly. */}
      {presetRecord ? (
        <div
          className="doc-gen-linked-banner"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '12px 16px',
            marginBottom: '16px',
            borderRadius: 'var(--radius-control)',
            background: 'var(--accent-soft, var(--surface-2))',
            border: '1px solid var(--line)',
            flexWrap: 'wrap',
          }}
        >
          <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Linked to</span>
          <strong style={{ color: 'var(--text-primary)' }}>{recordTitle}</strong>
          <span className="status-pill status-completed" style={{ marginLeft: 'auto' }}>
            {RECORD_KIND_LABEL[recordKind] || 'Record'}
          </span>
        </div>
      ) : null}

      {/* Select existing request — only for request-linked docs, and only
          when this generator was not opened from a specific record. */}
      {showRequestSelector ? (
        <div className="doc-gen-form" style={{ marginBottom: isPrOrPo ? 0 : '16px' }}>
          {docType === 'payroll' && eligibleRequests.length === 0 ? (
            <div className="form-error" style={{ padding: '12px', backgroundColor: 'var(--negative-soft)', color: 'var(--negative)', borderRadius: 'var(--radius-bar)', border: '1px solid var(--negative)' }}>
              No approved payroll record found for this document.
            </div>
          ) : (
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
          )}
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
              <span>P.R. Number</span>
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

          {/* Approved requisition items — read-only. Once a budget request is
              approved this breakdown is final: nothing here may add, remove,
              or edit a row, so what prints on the Purchase Request always
              matches what the SK Chairman actually approved. Expenses
              incurred afterward belong in the record's own Additional
              Requisition Breakdown, not here. */}
          <div className="overview-card doc-breakdown-editor">
            <p className="eyebrow">Item breakdown</p>
            <h2>Approved requisition items</h2>
            <p className="form-note" style={{ marginTop: 0 }}>
              These items come from the approved budget request and cannot be edited here.
            </p>
            <table className="data-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Unit of Issue</th>
                  <th>Item Description</th>
                  <th>Qty</th>
                  <th>Unit Cost</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {items.length ? (
                  items.map((item, index) => (
                    <tr key={index}>
                      <td>{index + 1}</td>
                      <td>{item.unitOfIssue || item.unit || '—'}</td>
                      <td>{item.itemName || '—'}</td>
                      <td>{item.quantity}</td>
                      <td>{currency.format(item.unitCost || 0)}</td>
                      <td>{currency.format(item.total || 0)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="6" className="empty-state">
                      Select an approved request above to load its requisition items.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            <div className="content-actions" style={{ marginTop: '8px', justifyContent: 'flex-end' }}>
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
              {generatingNumber ? 'Generating...' : 'Preview Document'}
            </button>
          </div>
        </div>
      ) : null}

      {/* New document type forms */}
      {!isPrOrPo && docType !== 'narrative' ? renderForm() : null}

      {/* Narrative & Photo Documentation hands off to its own multi-section
          builder rather than rendering inline here. */}
      {docType === 'narrative' ? (
        <div className="overview-card" style={{ boxShadow: 'none', border: '1px solid var(--border)', background: 'var(--bone)' }}>
          <p className="eyebrow">Narrative & Photo Documentation</p>
          <h2>Continue in the Narrative Report builder</h2>
          <p className="form-note">
            This document has its own multi-section builder with photo uploads.
            {presetRecord ? ` It will open pre-linked to "${recordTitle}".` : ''}
          </p>
          <div className="doc-gen-actions">
            <button type="button" className="primary-button" onClick={handleOpenNarrativeReport}>
              Open Narrative & Photo Documentation
            </button>
          </div>
        </div>
      ) : null}

      {/* Preview overlay */}
      {renderPreview()}
    </div>
  )
}

export default DocumentGenerator
