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
      display: 'inline-flex', 
      alignItems: 'center', 
      background: '#ffffff', 
      border: '1px solid #e2e8f0', 
      borderRadius: '16px', 
      padding: '4px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
      gap: '4px',
      userSelect: 'none',
    }}>
      <button
        type="button"
        onClick={handleDecrement}
        disabled={year <= 2000}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '32px',
          height: '32px',
          background: '#f1f5f9',
          borderRadius: '10px',
          color: year <= 2000 ? '#cbd5e1' : '#334155',
          cursor: year <= 2000 ? 'not-allowed' : 'pointer',
          transition: 'all 0.15s ease',
          border: 'none',
          outline: 'none',
        }}
        onMouseOver={(e) => { if (year > 2000) { e.currentTarget.style.background = '#e2e8f0'; e.currentTarget.style.color = '#0f172a' } }}
        onMouseOut={(e) => { if (year > 2000) { e.currentTarget.style.background = '#f1f5f9'; e.currentTarget.style.color = '#334155' } }}
        aria-label="Previous Year"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
      </button>

      <input
        type="text"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onBlur={() => commitYear(inputValue)}
        onKeyDown={handleKeyDown}
        style={{
          width: '56px',
          textAlign: 'center',
          fontSize: '15px',
          fontWeight: 700,
          color: '#0f172a',
          border: 'none',
          outline: 'none',
          padding: '0 4px',
          background: 'transparent',
          fontFamily: 'inherit',
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
          width: '32px',
          height: '32px',
          background: '#f1f5f9',
          borderRadius: '10px',
          color: year >= 2100 ? '#cbd5e1' : '#334155',
          cursor: year >= 2100 ? 'not-allowed' : 'pointer',
          transition: 'all 0.15s ease',
          border: 'none',
          outline: 'none',
        }}
        onMouseOver={(e) => { if (year < 2100) { e.currentTarget.style.background = '#e2e8f0'; e.currentTarget.style.color = '#0f172a' } }}
        onMouseOut={(e) => { if (year < 2100) { e.currentTarget.style.background = '#f1f5f9'; e.currentTarget.style.color = '#334155' } }}
        aria-label="Next Year"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
      </button>
    </div>
  )
}
