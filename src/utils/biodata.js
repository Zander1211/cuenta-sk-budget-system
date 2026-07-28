// Shared constants + helpers for member biodata, used by BiodataPage,
// ProfilePage (completion badge), the dashboard reminder banner, and
// UserManagementPage's View Info modal (Chairman's read-only view).

export const SEX_OPTIONS = ['Male', 'Female']

export const CIVIL_STATUS_OPTIONS = ['Single', 'Married', 'Widowed', 'Separated', 'Divorced']

const REQUIRED_FIELDS = ['birthdate', 'sex', 'civil_status', 'citizenship', 'complete_address', 'mobile_number']

export function isBiodataComplete(row) {
  if (!row) return false
  return REQUIRED_FIELDS.every((field) => {
    const value = row[field]
    return typeof value === 'string' ? value.trim().length > 0 : Boolean(value)
  })
}

export function formatBirthdate(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })
}
