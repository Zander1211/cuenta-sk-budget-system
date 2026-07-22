import { useState, useEffect } from 'react'

export default function YearSpinner({ year, onYearChange }) {
  const [inputValue, setInputValue] = useState(year.toString())

  useEffect(() => {
    setInputValue(year.toString())
  }, [year])

  const commitYear = (val) => {
    const num = parseInt(val, 10)
    if (isNaN(num)) {
      setInputValue(year.toString())
      return
    }
    const clamped = Math.max(2000, Math.min(2100, num))
    setInputValue(clamped.toString())
    if (clamped !== year) {
      onYearChange(clamped)
    }
  }

  const handleDecrement = () => commitYear(year - 1)
  const handleIncrement = () => commitYear(year + 1)

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      commitYear(inputValue)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      handleIncrement()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      handleDecrement()
    }
  }

  return (
    <div style={{ 
      display: 'flex', 
      alignItems: 'center', 
      background: 'white', 
      border: '1.5px solid #e2e8f0', 
      borderRadius: '8px', 
      overflow: 'hidden',
      transition: 'border-color 0.15s',
    }}>
      <button
        type="button"
        onClick={handleDecrement}
        disabled={year <= 2000}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '6px 10px',
          background: '#f8fafc',
          borderRight: '1.5px solid #e2e8f0',
          color: year <= 2000 ? '#cbd5e1' : '#64748b',
          cursor: year <= 2000 ? 'not-allowed' : 'pointer',
          transition: 'all 0.15s',
          border: 'none',
        }}
        onMouseOver={(e) => { if (year > 2000) { e.currentTarget.style.background = '#f1f5f9'; e.currentTarget.style.color = '#334155' } }}
        onMouseOut={(e) => { if (year > 2000) { e.currentTarget.style.background = '#f8fafc'; e.currentTarget.style.color = '#64748b' } }}
        aria-label="Previous Year"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m15 18-6-6 6-6"/></svg>
      </button>
      <input
        type="text"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onBlur={() => commitYear(inputValue)}
        onKeyDown={handleKeyDown}
        style={{
          width: '60px',
          textAlign: 'center',
          fontSize: '13px',
          fontWeight: 600,
          color: '#0f172a',
          border: 'none',
          outline: 'none',
          padding: '6px 4px',
          background: 'transparent'
        }}
        aria-label="Enter Year"
      />
      <button
        type="button"
        onClick={handleIncrement}
        disabled={year >= 2100}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '6px 10px',
          background: '#f8fafc',
          borderLeft: '1.5px solid #e2e8f0',
          color: year >= 2100 ? '#cbd5e1' : '#64748b',
          cursor: year >= 2100 ? 'not-allowed' : 'pointer',
          transition: 'all 0.15s',
          border: 'none',
        }}
        onMouseOver={(e) => { if (year < 2100) { e.currentTarget.style.background = '#f1f5f9'; e.currentTarget.style.color = '#334155' } }}
        onMouseOut={(e) => { if (year < 2100) { e.currentTarget.style.background = '#f8fafc'; e.currentTarget.style.color = '#64748b' } }}
        aria-label="Next Year"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m9 18 6-6-6-6"/></svg>
      </button>
    </div>
  )
}
