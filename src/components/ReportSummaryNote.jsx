import React from 'react'
import { Info } from 'lucide-react'

/**
 * ReportSummaryNote
 * Displays a clean, professional informational note for visitors and view-only users,
 * informing them that they are viewing a summary and instructing them to coordinate
 * directly with the SK Chairman for the complete detailed financial report.
 */
export default function ReportSummaryNote({ variant = 'default', message, style = {} }) {
  const isPublic = variant === 'public'

  return (
    <aside
      className={`report-summary-note ${isPublic ? 'report-summary-note--public' : 'report-summary-note--dashboard'}`}
      role="note"
      aria-label="Financial report summary notice"
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '12px',
        padding: isPublic ? '16px 20px' : '14px 18px',
        borderRadius: 'var(--radius-control, 10px)',
        fontSize: '0.85rem',
        lineHeight: 1.55,
        boxSizing: 'border-box',
        ...style,
      }}
    >
      <div
        className="report-summary-note__icon"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          marginTop: '2px',
          color: isPublic ? '#34d399' : 'var(--accent, #0e6b4d)',
        }}
      >
        <Info size={18} aria-hidden="true" />
      </div>
      <div className="report-summary-note__content" style={{ flex: 1 }}>
        <p
          style={{
            margin: 0,
            fontSize: 'inherit',
            lineHeight: 'inherit',
            color: isPublic ? '#d1e7e2' : 'var(--ink-2, #40605f)',
          }}
        >
          <strong
            style={{
              fontWeight: 700,
              color: isPublic ? '#ffffff' : 'var(--ink, #0c2225)',
              marginRight: '4px',
            }}
          >
            Note:
          </strong>
          {message || (
            <>
              You are currently viewing a summary of this financial report. If you would like to see the complete and detailed financial report for this Project or Event, please personally coordinate with the{' '}
              <strong
                className="report-summary-note__chairman"
                style={{
                  fontWeight: 700,
                  color: isPublic ? '#6ee7b7' : 'var(--accent, #0e6b4d)',
                }}
              >
                SK Chairman
              </strong>{' '}
              for further assistance and verification.
            </>
          )}
        </p>
      </div>
    </aside>
  )
}

