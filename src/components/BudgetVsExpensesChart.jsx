import { useMemo } from 'react'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts'
import { useBudget } from '../context/BudgetContext'

const MONTHS_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

const MONTHS_FULL = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const peso = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  maximumFractionDigits: 0,
})

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null

  return (
    <div style={{
      background: 'white',
      border: '1px solid #e2e8f0',
      borderRadius: '12px',
      padding: '14px 18px',
      boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
      minWidth: '210px',
    }}>
      <p style={{ fontWeight: 700, fontSize: '14px', color: '#1A2E35', marginBottom: '10px' }}>
        {MONTHS_FULL[MONTHS_SHORT.indexOf(label)] || label}
      </p>
      {payload.map((entry) => (
        <div
          key={entry.name}
          style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', fontSize: '13px', marginBottom: '6px' }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#6B7280' }}>
            <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: entry.color }} />
            {entry.name}
          </span>
          <span style={{ fontWeight: 600, color: '#1A2E35' }}>{peso.format(entry.value)}</span>
        </div>
      ))}
    </div>
  )
}

export default function BudgetVsExpensesChart({ year }) {
  const { budgets, expenses } = useBudget()

  const chartData = useMemo(() => {
    return MONTHS_SHORT.map((label, idx) => {
      const monthNum = idx + 1

      const allocated = budgets
        .filter(b => b.month === monthNum && b.year === year)
        .reduce((sum, b) => sum + Number(b.amount || 0), 0)

      const actual = expenses
        .filter(e => {
          if (e.archivedAt || e.status === 'Cancelled') return false
          const d = new Date(e.eventDate || e.date || e.approvedAt || e.createdAt)
          if (isNaN(d.getTime())) return false
          return d.getMonth() + 1 === monthNum && d.getFullYear() === year
        })
        .reduce((sum, e) => sum + Number(e.amount || 0), 0)

      return { month: label, 'Allocated Budget': allocated, 'Actual Expenses': actual }
    })
  }, [budgets, expenses, year])

  return (
    <div style={{ width: '100%' }}>
      {/* Filter Row: Legend + Year Selector */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px',
        marginBottom: '20px',
      }}>
        <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#6B7280', fontWeight: 500 }}>
            <span style={{ display: 'inline-block', width: 28, height: 3, borderRadius: 2, background: '#0E6B4D' }} />
            Allocated Budget
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#6B7280', fontWeight: 500 }}>
            <span style={{ display: 'inline-block', width: 28, height: 3, borderRadius: 2, background: '#34D399' }} />
            Actual Expenses
          </span>
        </div>
      </div>

      {/* Chart */}
      <ResponsiveContainer width="100%" height={340}>
        <LineChart
          data={chartData}
          margin={{ top: 8, right: 24, left: 16, bottom: 8 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
          <XAxis
            dataKey="month"
            tick={{ fontSize: 12, fill: '#6B7280', fontWeight: 500 }}
            axisLine={false}
            tickLine={false}
            padding={{ left: 10, right: 10 }}
          />
          <YAxis
            tickFormatter={(v) => `₱${v.toLocaleString('en-PH')}`}
            tick={{ fontSize: 11, fill: '#6B7280' }}
            axisLine={false}
            tickLine={false}
            width={80}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend
            iconType="circle"
            iconSize={10}
            wrapperStyle={{ fontSize: '13px', paddingTop: '16px', color: '#6B7280', fontWeight: 500 }}
          />
          <Line
            type="monotone"
            dataKey="Allocated Budget"
            stroke="#0E6B4D"
            strokeWidth={2.5}
            dot={{ r: 4, fill: '#0E6B4D', strokeWidth: 0 }}
            activeDot={{ r: 6, fill: '#0E6B4D', stroke: 'white', strokeWidth: 2 }}
          />
          <Line
            type="monotone"
            dataKey="Actual Expenses"
            stroke="#34D399"
            strokeWidth={2.5}
            dot={{ r: 4, fill: '#34D399', strokeWidth: 0 }}
            activeDot={{ r: 6, fill: '#34D399', stroke: 'white', strokeWidth: 2 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
