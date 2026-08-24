import { X } from 'lucide-react'
import { useBudget } from '../context/BudgetContext'
import { calculateProjectEventFinancials } from '../utils/projectEventFinancials'

const currency = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  maximumFractionDigits: 2,
})

export default function ArchivedRequestModal({ request, onClose }) {
  const { expenses, verifiedReceiptTotals } = useBudget()

  const financials = calculateProjectEventFinancials(request, expenses, verifiedReceiptTotals)
  const additionalExpenses = financials.linkedExpenses
  const approvedBudget = financials.approvedBudget
  const totalAdditional = financials.recordedExpenseTotal
  
  const breakdown = request.type === 'Payroll' ? (request.payrollBreakdown || []) : (request.breakdown || [])
  
  const totalRequisition = request.type === 'Payroll'
    ? breakdown.reduce((sum, item) => sum + Number(item.honoraria || 0), 0)
    : breakdown.reduce((sum, item) => sum + (Number(item.quantity || 0) * Number(item.unitCost || 0)), 0)

  const totalExpenses = financials.totalExpenses
  const remainingBalance = financials.remainingBudget

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '800px', width: '90%', maxHeight: '90vh', overflowY: 'auto' }}>
        <button className="modal-close" onClick={onClose} aria-label="Close modal">
          <X size={20} />
        </button>

        <p className="eyebrow">Archived Request Details</p>
        <h2 style={{ marginBottom: '24px' }}>{request.event || request.project}</h2>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', marginBottom: '24px' }}>
            <div className="overview-card" style={{ padding: '16px' }}>
              <p className="eyebrow">Approved Budget</p>
              <h3 style={{ margin: 0 }}>{currency.format(approvedBudget)}</h3>
            </div>
            <div className="overview-card" style={{ padding: '16px' }}>
              <p className="eyebrow">Total Requisitions</p>
              <h3 style={{ margin: 0 }}>{currency.format(totalAdditional)}</h3>
            </div>
            <div className="overview-card" style={{ padding: '16px' }}>
              <p className="eyebrow">Total Expenses</p>
              <h3 style={{ margin: 0 }}>{currency.format(totalExpenses)}</h3>
            </div>
            <div className="overview-card" style={{ padding: '16px', border: remainingBalance < 0 ? '1px solid #fca5a5' : '1px solid var(--border)' }}>
              <p className="eyebrow">Remaining Balance</p>
              <h3 style={{ margin: 0, color: remainingBalance < 0 ? '#b91c1c' : 'inherit' }}>{currency.format(remainingBalance)}</h3>
            </div>
        </div>

        <div style={{ marginBottom: '24px', backgroundColor: 'var(--surface-2)', padding: '16px', borderRadius: 'var(--radius-control)', display: 'flex', gap: '32px' }}>
          <div>
            <span className="eyebrow">Archived Date</span>
            <div style={{ fontWeight: 500 }}>{new Date(request.archivedAt).toLocaleDateString()}</div>
          </div>
          <div>
            <span className="eyebrow">Archived By</span>
            <div style={{ fontWeight: 500 }}>{request.archivedBy || 'System'}</div>
          </div>
        </div>

        <h3 style={{ marginBottom: '16px' }}>Approved Allocation Breakdown</h3>
        {breakdown.length > 0 ? (
          <table className="data-table" style={{ marginBottom: '32px' }}>
            <thead>
              {request.type === 'Payroll' ? (
                <tr>
                  <th>Name</th>
                  <th>Position</th>
                  <th style={{ textAlign: 'right' }}>Honoraria</th>
                </tr>
              ) : (
                <tr>
                  <th>Item</th>
                  <th style={{ textAlign: 'center' }}>Qty</th>
                  <th style={{ textAlign: 'right' }}>Unit Cost</th>
                  <th style={{ textAlign: 'right' }}>Total</th>
                </tr>
              )}
            </thead>
            <tbody>
              {request.type === 'Payroll' ? (
                breakdown.map((item, idx) => (
                  <tr key={idx}>
                    <td>{item.name}</td>
                    <td>{item.position}</td>
                    <td style={{ textAlign: 'right' }}>{currency.format(Number(item.honoraria || 0))}</td>
                  </tr>
                ))
              ) : (
                breakdown.map((item, idx) => (
                  <tr key={idx}>
                    <td>{item.itemName}</td>
                    <td style={{ textAlign: 'center' }}>{item.quantity}</td>
                    <td style={{ textAlign: 'right' }}>{currency.format(Number(item.unitCost || 0))}</td>
                    <td style={{ textAlign: 'right', fontWeight: 500 }}>{currency.format(Number(item.quantity || 0) * Number(item.unitCost || 0))}</td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot>
              <tr>
                <th colSpan={request.type === 'Payroll' ? 2 : 3}>Total Requisition</th>
                <th style={{ textAlign: 'right' }}>{currency.format(totalRequisition)}</th>
              </tr>
            </tfoot>
          </table>
        ) : (
          <p className="empty-state" style={{ marginBottom: '32px' }}>No breakdown recorded.</p>
        )}

        <h3 style={{ marginBottom: '16px' }}>Requisition Breakdown</h3>
        {additionalExpenses.length > 0 ? (
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Category</th>
                <th>Note</th>
                <th>Receipt</th>
                <th style={{ textAlign: 'right' }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {additionalExpenses.map(exp => {
                const hasReceipt = exp.receiptUrl || exp.receipt_url || exp.receiptName || exp.receipt_name;
                return (
                  <tr key={exp.id}>
                    <td>{new Date(exp.date).toLocaleDateString()}</td>
                    <td><span className="category-tag">{exp.category}</span></td>
                    <td>{exp.note || '—'}</td>
                    <td>
                      {hasReceipt ? (
                        <span style={{ color: 'var(--primary)', fontWeight: 500, fontSize: '0.85rem' }}>Attached</span>
                      ) : (
                        <span style={{ color: 'var(--ink-soft)', fontSize: '0.85rem' }}>None</span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 500 }}>{currency.format(Number(exp.amount || 0))}</td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr>
                <th colSpan="4">Total Requisition</th>
                <th style={{ textAlign: 'right' }}>{currency.format(totalAdditional)}</th>
              </tr>
            </tfoot>
          </table>
        ) : (
          <p className="empty-state">No requisitions recorded.</p>
        )}
      </div>
    </div>
  )
}
