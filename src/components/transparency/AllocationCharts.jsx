import { useId, useMemo, useState, useSyncExternalStore } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

/* Colour is never the only channel in these charts: every segment is restated
   by name and exact value in the ranked list beside it, and again in the data
   table below. The ramp itself is defined in `useAllocationByCategory`. */

const peso = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 })
const pesoCompact = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', notation: 'compact', maximumFractionDigits: 1 })

const money = value => peso.format(Number(value) || 0)
const share = (part, whole) => (whole > 0 ? (Number(part) / whole) * 100 : 0)

/** One decimal below 10%, whole numbers above, so tiny slices stay honest. */
function formatPercent(value) {
  if (value > 0 && value < 0.1) return '<0.1%'
  return `${value < 10 ? value.toFixed(1) : Math.round(value)}%`
}

/**
 * Part-to-whole view of approved allocations.
 *
 * A pie or donut was the obvious reach here and is what this page used before,
 * but donuts carry the share only in arc angle and colour, which fails for
 * colour-blind readers and cannot be read precisely at any size. A 100% stacked
 * bar paired with a ranked value list and a real data table gives the same
 * "share of the whole" reading while staying legible and machine-readable.
 */
export function AllocationComposition({ rows, totals }) {
  const [active, setActive] = useState(null)
  const tableId = useId()

  return (
    <div className="alloc-panel">
      <div className="alloc-total">
        <strong className="num">{money(totals.approved)}</strong>
        <span>
          approved across {rows.length} categor{rows.length === 1 ? 'y' : 'ies'}
        </span>
      </div>

      <div
        className="alloc-bar"
        role="img"
        aria-label={`Approved allocation split across ${rows.length} categories, totalling ${money(totals.approved)}. The full breakdown follows as a list and a table.`}
        aria-describedby={tableId}
      >
        {rows.map(row => {
          const percent = share(row.approved, totals.approved)
          return (
            <div
              key={row.category}
              className="alloc-seg pub-reveal-seg"
              style={{ '--seg': row.color, flexGrow: Math.max(percent, 0.35) }}
              data-active={active === row.category}
              onMouseEnter={() => setActive(row.category)}
              onMouseLeave={() => setActive(null)}
              title={`${row.category}: ${money(row.approved)} (${formatPercent(percent)})`}
            />
          )
        })}
      </div>

      <ul className="alloc-list">
        {rows.map(row => {
          const percent = share(row.approved, totals.approved)
          return (
            <li
              key={row.category}
              className="alloc-row"
              data-active={active === row.category}
              onMouseEnter={() => setActive(row.category)}
              onMouseLeave={() => setActive(null)}
            >
              <span className="alloc-swatch" style={{ '--seg': row.color }} aria-hidden="true" />
              <span className="alloc-name">
                {row.category}
                <small>
                  {row.count} completed project{row.count === 1 ? '' : 's'}
                </small>
              </span>
              <span className="alloc-figures">
                <strong className="num">{money(row.approved)}</strong>
                <span className="num">{formatPercent(percent)} of total</span>
              </span>
            </li>
          )
        })}
      </ul>

      <details className="pub-disclosure">
        <summary>View the same figures as a table</summary>
        <div className="pub-table-wrap">
          <table className="pub-table" id={tableId}>
            <caption>Approved allocation and recorded expenditure by category.</caption>
            <thead>
              <tr>
                <th scope="col">Category</th>
                <th scope="col">Projects</th>
                <th scope="col">Approved</th>
                <th scope="col">Share</th>
                <th scope="col">Spent</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.category}>
                  <th scope="row">{row.category}</th>
                  <td className="num">{row.count}</td>
                  <td className="num">{money(row.approved)}</td>
                  <td className="num">{formatPercent(share(row.approved, totals.approved))}</td>
                  <td className={row.reportedCount ? 'num' : 'is-unreported'}>
                    {row.reportedCount ? money(row.spent) : 'Not yet reported'}
                    {row.reportedCount > 0 && !row.spendComplete && (
                      <small> ({row.reportedCount} of {row.count})</small>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">Total</th>
                <td className="num">{rows.reduce((sum, row) => sum + row.count, 0)}</td>
                <td className="num">{money(totals.approved)}</td>
                <td className="num">100%</td>
                <td className={totals.reportedCount ? 'num' : 'is-unreported'}>
                  {totals.reportedCount ? money(totals.spent) : 'Not yet reported'}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </details>
    </div>
  )
}

const NARROW_QUERY = '(max-width: 600px)'

function subscribeToNarrow(onChange) {
  const query = window.matchMedia(NARROW_QUERY)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

function useIsNarrow() {
  return useSyncExternalStore(
    subscribeToNarrow,
    () => window.matchMedia(NARROW_QUERY).matches,
    () => false,
  )
}

function SpendTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  const approved = payload.find(item => item.dataKey === 'approved')?.value ?? 0
  const spent = payload.find(item => item.dataKey === 'spent')?.value ?? 0
  const remaining = approved - spent
  return (
    <div className="pub-tooltip">
      <b>{label}</b>
      <dl>
        <dt>Approved</dt>
        <dd className="num">{money(approved)}</dd>
        <dt>Spent</dt>
        <dd className="num">{money(spent)}</dd>
        <dt>{remaining < 0 ? 'Over allocation' : 'Unspent'}</dt>
        <dd className="num">{money(Math.abs(remaining))}</dd>
      </dl>
    </div>
  )
}

/**
 * Allocated against actually spent, per category. This is the accountability
 * question the previous version of the page never answered: it published what
 * was approved but gave no way to see whether the money was drawn down.
 */
export function SpendComparison({ rows }) {
  // The category axis is a fixed pixel width in Recharts, so on a phone a
  // desktop-sized axis would leave almost no room for the bars themselves.
  const isNarrow = useIsNarrow()
  const axisWidth = isNarrow ? 96 : 168
  const maxLabel = isNarrow ? 14 : 26

  // Categories with no verified receipts are left out entirely rather than
  // drawn as a zero-length bar. An empty bar beside a full allocation reads as
  // "spent nothing", which is a claim this data cannot support.
  const data = useMemo(
    () =>
      rows
        .filter(row => row.reportedCount > 0)
        .map(row => ({
          ...row,
          name: row.category.length > maxLabel ? `${row.category.slice(0, maxLabel - 1)}…` : row.category,
        })),
    [rows, maxLabel],
  )

  const omitted = rows.length - data.length
  const partial = data.filter(row => !row.spendComplete)

  if (!data.length) return null

  const height = Math.max(220, data.length * 62 + 40)

  return (
    <div className="alloc-panel spend-panel">
      {(omitted > 0 || partial.length > 0) && (
        <p className="spend-coverage">
          Based on verified receipts only.
          {omitted > 0 && ` ${omitted} categor${omitted === 1 ? 'y has' : 'ies have'} no receipts published yet and ${omitted === 1 ? 'is' : 'are'} not shown.`}
          {partial.length > 0 && ` Spending shown for ${partial.map(row => row.category).join(', ')} covers only part of the projects in ${partial.length === 1 ? 'that category' : 'those categories'}.`}
        </p>
      )}

      <div className="spend-legend">
        <span>
          <i style={{ '--key': 'var(--pub-c1)' }} aria-hidden="true" />
          Approved allocation
        </span>
        <span>
          <i style={{ '--key': 'var(--pub-c4)' }} aria-hidden="true" />
          Recorded expenditure
        </span>
      </div>

      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 4 }} barGap={4}>
          <CartesianGrid horizontal={false} stroke="var(--pub-line)" />
          <XAxis
            type="number"
            tickFormatter={value => pesoCompact.format(value)}
            tick={{ fontSize: 12, fill: 'var(--pub-ink-3)' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="name"
            width={axisWidth}
            tick={{ fontSize: 12, fill: 'var(--pub-ink-2)' }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<SpendTooltip />} cursor={{ fill: 'var(--pub-surface-2)' }} />
          <Bar dataKey="approved" name="Approved allocation" fill="var(--pub-c1)" radius={[0, 4, 4, 0]} maxBarSize={16} />
          <Bar dataKey="spent" name="Recorded expenditure" radius={[0, 4, 4, 0]} maxBarSize={16}>
            {data.map(row => (
              /* Over-drawn categories change colour, but the tooltip and the
                 table both spell out "Over allocation" in words as well. */
              <Cell key={row.category} fill={row.spent > row.approved ? 'var(--pub-warn)' : 'var(--pub-c4)'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
