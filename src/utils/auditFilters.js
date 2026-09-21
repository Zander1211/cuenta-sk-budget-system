// One source of truth for the Activity Logs filter dropdowns.
//
// Every option here maps to the exact `action_type` strings the system writes.
// The list used to be hand-maintained next to the <select>, and had drifted:
// half its entries (Budget Updated, Request Created, the Document family, …)
// were never written by anything, so choosing them always returned nothing,
// while values that ARE written (Upload, User Account Disabled, Returned
// Unused Budget, …) had no option at all and could not be filtered to.
//
// `values` lists the current spelling first, followed by any legacy spelling
// still present in the trail. The audit trail is append-only — old rows keep
// the wording they were written with — so renaming a writer means keeping its
// previous label here, never rewriting history.

export const ACTION_TYPE_GROUPS = [
  {
    group: 'Authentication',
    options: [
      { label: 'User Login', values: ['User Login'] },
      { label: 'User Logout', values: ['User Logout'] },
      { label: 'Password Changed', values: ['Password Changed'] },
      { label: 'Password Updated via OTP', values: ['Password Updated via OTP'] },
      { label: 'Email Address Updated', values: ['Email Address Updated'] },
      { label: 'Profile Updated', values: ['Profile Updated'] },
    ],
  },
  {
    group: 'Budgets',
    options: [
      { label: 'Budget Created', values: ['Budget Created'] },
    ],
  },
  {
    group: 'Budget Requests',
    options: [
      { label: 'Request Submitted', values: ['Request Submitted'] },
      { label: 'Request Updated', values: ['Request Updated'] },
      { label: 'Request Approved', values: ['Request Approved'] },
      { label: 'Request Rejected', values: ['Request Rejected'] },
      { label: 'Rejection Undone', values: ['Rejection Undone'] },
      { label: 'Request Cancelled', values: ['Request Cancelled'] },
    ],
  },
  {
    group: 'Projects, Events & Payroll',
    options: [
      { label: 'Status Changed', values: ['Status Changed'] },
      { label: 'Project Archived', values: ['Project Archived'] },
      { label: 'Project Restored', values: ['Project Restored'] },
      { label: 'Event Archived', values: ['Event Archived'] },
      { label: 'Event Restored', values: ['Event Restored'] },
      { label: 'Payroll Archived', values: ['Payroll Archived'] },
      { label: 'Payroll Restored', values: ['Payroll Restored'] },
      // Written by the database function that runs on completion / re-opening.
      { label: 'Returned Unused Budget', values: ['Returned Unused Budget'] },
      { label: 'Returned Budget Reversed', values: ['Returned Budget Reversed'] },
    ],
  },
  {
    group: 'Expenses & Receipts',
    options: [
      { label: 'Expense Added', values: ['Expense Added'] },
      { label: 'Requisition Added', values: ['Requisition Added', 'Record Updated'] },
      // Receipt entries are written from Approved Records → Receipts.
      // Replacements used to be filed under "Receipt Uploaded" and edits under
      // "Receipt Updated"; those older rows keep their old type.
      { label: 'Receipt Uploaded', values: ['Receipt Uploaded', 'Upload'] },
      { label: 'Receipt Replaced', values: ['Receipt Replaced'] },
      { label: 'Receipt Information Updated', values: ['Receipt Information Updated', 'Receipt Updated'] },
      { label: 'Receipt Verified', values: ['Receipt Verified', 'Update'] },
    ],
  },
  {
    group: 'Documents & Reports',
    options: [
      // Project / Event / Payroll documents, made and edited from Approved Records.
      { label: 'Document Generated', values: ['Document Generated'] },
      { label: 'Document Updated', values: ['Document Updated'] },
      // The Annual Report is generated once and never edited — a change is a new version.
      { label: 'Annual Report Generated', values: ['Annual Report Generated'] },
    ],
  },
  {
    group: 'Backup & Restore',
    options: [
      { label: 'Backup Generated', values: ['Backup Generated'] },
      { label: 'Backup Deleted', values: ['Backup Deleted'] },
      { label: 'Restore Completed', values: ['Restore Completed'] },
      { label: 'Restore Deleted', values: ['Restore Deleted'] },
    ],
  },
  {
    group: 'User Management',
    options: [
      { label: 'User Created', values: ['User Created'] },
      { label: 'User Account Enabled', values: ['User Account Enabled'] },
      { label: 'User Account Disabled', values: ['User Account Disabled'] },
    ],
  },
]

const VALUES_BY_LABEL = new Map(
  ACTION_TYPE_GROUPS.flatMap((section) => section.options.map((option) => [option.label, option.values])),
)

// Returns the action_type strings a filter selection should match, or null
// when nothing should be filtered ("All", or a label we do not know).
export function resolveActionTypeValues(label) {
  if (!label || label === 'All') return null
  return VALUES_BY_LABEL.get(label) || [label]
}

// ── Modules ────────────────────────────────────────────────────────────────
//
// Same story as the action types: the status-change and request-archive paths
// wrote the singular "Project"/"Event" while everything else wrote the plural,
// so picking "Projects" quietly missed a fifth of the project rows. The
// writers are consistent now; the singular stays here to reach older entries.
// "Documents" is present now that document and annual-report generation are
// logged; older rows simply never have it.

export const MODULE_OPTIONS = [
  { label: 'Authentication', values: ['Authentication'] },
  { label: 'Monthly Budget', values: ['Monthly Budget'] },
  { label: 'Budget Requests', values: ['Budget Requests'] },
  { label: 'Projects', values: ['Projects', 'Project'] },
  { label: 'Events', values: ['Events', 'Event'] },
  { label: 'Payroll', values: ['Payroll'] },
  { label: 'Expenses', values: ['Expenses'] },
  { label: 'Approved Records', values: ['Approved Records', 'Receipts'] },
  { label: 'Documents', values: ['Documents'] },
  { label: 'Backup & Restore', values: ['Backup & Restore'] },
  { label: 'User Management', values: ['User Management'] },
]

// ── Record types ───────────────────────────────────────────────────────────
//
// "Receipt" is absent: no writer sets it — receipt entries record the
// project/event/expense they belong to. "Document" is written by the document
// and annual-report generators. "Restore History" was missing and is written
// by the restore flow, so its rows used to be unreachable.

export const RECORD_TYPE_OPTIONS = [
  { label: 'User', values: ['User'] },
  { label: 'Budget', values: ['Budget'] },
  { label: 'Budget Request', values: ['Budget Request'] },
  { label: 'Project', values: ['Project'] },
  { label: 'Event', values: ['Event'] },
  { label: 'Payroll', values: ['Payroll'] },
  { label: 'Expense', values: ['Expense'] },
  { label: 'Document', values: ['Document'] },
  { label: 'Backup', values: ['Backup'] },
  { label: 'Restore History', values: ['Restore History'] },
]

export const ROLE_OPTIONS = ['SK Chairman', 'SK Treasurer', 'SK Kagawad', 'Barangay Treasurer']

function lookup(options, label) {
  if (!label || label === 'All') return null
  return options.find((option) => option.label === label)?.values || [label]
}

export function resolveModuleValues(label) {
  return lookup(MODULE_OPTIONS, label)
}

export function resolveRecordTypeValues(label) {
  return lookup(RECORD_TYPE_OPTIONS, label)
}

// ── Dates ──────────────────────────────────────────────────────────────────

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

// The Year and Month dropdowns as a [start, end) window of local time, or null
// when neither is set. A month on its own means that month of the current year
// — the page sets the year itself when a month is picked, so this is only a
// safety net.
export function resolveMonthYearWindow({ year, month } = {}) {
  const hasYear = year && year !== 'All'
  const hasMonth = month && month !== 'All'
  if (!hasYear && !hasMonth) return null
  const y = hasYear ? Number(year) : new Date().getFullYear()
  if (hasMonth) {
    const m = Number(month) - 1
    return { start: new Date(y, m, 1), end: new Date(y, m + 1, 1) }
  }
  return { start: new Date(y, 0, 1), end: new Date(y + 1, 0, 1) }
}

function monthIndexFromName(token) {
  const t = token.toLowerCase()
  if (t.length < 3) return -1
  return MONTH_NAMES.findIndex((name) => name.toLowerCase().startsWith(t))
}

// Reads what a person types into the search box as a calendar date, so
// "Sept. 21, 2026", "September 21", "2026-09-21", "9/21/2026" or
// "September 2026" all find that day's (or month's) entries. Returns a
// [start, end) window of local time, or null when the text is not a date —
// which keeps ordinary searches ("budget", "Maria") untouched. A day without
// a year means the current year.
export function parseSearchDate(text) {
  const raw = String(text || '').trim().replace(/\s+/g, ' ')
  if (!raw) return null
  const thisYear = new Date().getFullYear()
  const day = (y, m, d) => {
    const start = new Date(y, m, d)
    // Reject overflow like "Feb 31", which Date would silently roll into March.
    if (start.getMonth() !== m || start.getDate() !== d) return null
    return { start, end: new Date(y, m, d + 1) }
  }

  let match = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (match) return day(Number(match[1]), Number(match[2]) - 1, Number(match[3]))

  match = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/)
  if (match) {
    const year = match[3].length === 2 ? 2000 + Number(match[3]) : Number(match[3])
    return day(year, Number(match[1]) - 1, Number(match[2]))
  }

  match = raw.match(/^([a-z]{3,9})\.? (\d{1,2})(?:st|nd|rd|th)?(?:,? (\d{4}))?$/i)
  if (match) {
    const m = monthIndexFromName(match[1])
    if (m >= 0) return day(match[3] ? Number(match[3]) : thisYear, m, Number(match[2]))
  }

  match = raw.match(/^([a-z]{3,9})\.?,? (\d{4})$/i)
  if (match) {
    const m = monthIndexFromName(match[1])
    if (m >= 0) return { start: new Date(Number(match[2]), m, 1), end: new Date(Number(match[2]), m + 1, 1) }
  }

  return null
}
