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
      { label: 'Request Cancelled', values: ['Request Cancelled'] },
      { label: 'Request Archived', values: ['Request Archived'] },
      { label: 'Request Restored', values: ['Request Restored'] },
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
      { label: 'Expense Archived', values: ['Expense Archived'] },
      { label: 'Expense Restored', values: ['Expense Restored'] },
      { label: 'Requisition Added', values: ['Requisition Added', 'Record Updated'] },
      { label: 'Receipt Uploaded', values: ['Receipt Uploaded', 'Upload'] },
      { label: 'Receipt Verified', values: ['Receipt Verified', 'Update'] },
      // Written by RecordReceiptsModal's delete flow — was missing here
      // entirely, so a deleted-receipt entry could never be filtered to.
      { label: 'Receipt Deleted', values: ['Receipt Deleted'] },
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
// "Documents" is absent on purpose — the Documents module logs nothing.

export const MODULE_OPTIONS = [
  { label: 'Authentication', values: ['Authentication'] },
  { label: 'Monthly Budget', values: ['Monthly Budget'] },
  { label: 'Budget Requests', values: ['Budget Requests'] },
  { label: 'Projects', values: ['Projects', 'Project'] },
  { label: 'Events', values: ['Events', 'Event'] },
  { label: 'Payroll', values: ['Payroll'] },
  { label: 'Expenses', values: ['Expenses'] },
  { label: 'Receipts', values: ['Receipts'] },
  { label: 'Backup & Restore', values: ['Backup & Restore'] },
  { label: 'User Management', values: ['User Management'] },
]

// ── Record types ───────────────────────────────────────────────────────────
//
// "Document" and "Receipt" are absent: no writer sets them. Receipt entries
// record the project/event/expense they belong to, and documents are not
// logged at all. "Restore History" was missing and is written by the restore
// flow, so its rows used to be unreachable.

export const RECORD_TYPE_OPTIONS = [
  { label: 'User', values: ['User'] },
  { label: 'Budget', values: ['Budget'] },
  { label: 'Budget Request', values: ['Budget Request'] },
  { label: 'Project', values: ['Project'] },
  { label: 'Event', values: ['Event'] },
  { label: 'Payroll', values: ['Payroll'] },
  { label: 'Expense', values: ['Expense'] },
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
