import React from 'react';
import { getBreakdownTotal } from '../utils/budgetUtils';

export default function BudgetBreakdownTable({ request, breakdownItems, currency, totalAmount, title }) {
  const isPayroll = request?.type === 'Payroll';
  const breakdownTotal = getBreakdownTotal(breakdownItems, isPayroll);

  if (!breakdownItems || breakdownItems.length === 0) {
    return <p className="details-value">No {isPayroll ? 'payroll entries' : 'breakdown'} provided.</p>;
  }

  const renderTitle = (colSpan) => {
    if (!title) return null;
    return (
      <tr>
        <th colSpan={colSpan} style={{ backgroundColor: '#111827', color: 'white', padding: '8px 12px', textAlign: 'center' }}>
          <span style={{ fontWeight: 600, letterSpacing: '0.05em' }}>{title}</span>
        </th>
      </tr>
    );
  };

  if (isPayroll) {
    return (
      <table className="data-table">
        <thead>
          {renderTitle(6)}
          <tr>
            <th>Name</th>
            <th>Position</th>
            <th>Honoraria</th>
            <th>Service</th>
            <th>CBC/LBF</th>
            <th>Net Amount</th>
          </tr>
        </thead>
        <tbody>
          {breakdownItems.map((item, index) => {
            const hon = Number(item.honoraria) || 0;
            const cbc = Number(item.cbcLbf) || 0;
            const net = hon - cbc;
            return (
              <tr key={`${request.id || 'req'}-item-${index}`}>
                <td data-label="Name">{item.name || '—'}</td>
                <td data-label="Position">{item.position || '—'}</td>
                <td data-label="Honoraria">{currency.format(hon)}</td>
                <td data-label="Service">{item.serviceRendered || '—'}</td>
                <td data-label="CBC/LBF">{currency.format(cbc)}</td>
                <td data-label="Net Amount">{currency.format(net)}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <th colSpan="5">Total Payroll Net Amount</th>
            <th>{currency.format(breakdownTotal)}</th>
          </tr>
          {totalAmount !== undefined && (
            <tr>
              <th colSpan="5">Total amount</th>
              <th>{currency.format(totalAmount)}</th>
            </tr>
          )}
        </tfoot>
      </table>
    );
  }

  // Default Requisition Table
  return (
    <table className="data-table">
      <thead>
        {renderTitle(4)}
        <tr>
          <th>Requisition</th>
          <th>Quantity</th>
          <th>Unit cost</th>
          <th>Total cost</th>
        </tr>
      </thead>
      <tbody>
        {breakdownItems.map((item, index) => (
          <tr key={`${request.id || 'req'}-item-${index}`}>
            <td data-label="Requisition">{item.itemName || '—'}</td>
            <td data-label="Quantity">{item.quantity || 0}</td>
            <td data-label="Unit cost">{currency.format(item.unitCost || 0)}</td>
            <td data-label="Total cost">
              {currency.format((item.quantity || 0) * (item.unitCost || 0))}
            </td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr>
          <th colSpan="3">Total cost</th>
          <th>{currency.format(breakdownTotal)}</th>
        </tr>
        {totalAmount !== undefined && (
          <tr>
            <th colSpan="3">Total amount</th>
            <th>{currency.format(totalAmount)}</th>
          </tr>
        )}
      </tfoot>
    </table>
  );
}
