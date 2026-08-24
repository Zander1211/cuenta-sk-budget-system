const APPROVED_RECORD_STATUSES = new Set(['approved', 'released'])

function normalize(value) {
  return String(value || '').trim().toLowerCase()
}

export function isApprovedProjectEventRecord(item) {
  if (!item || item.isAdditional || item.archivedAt) return false

  const approvalStatus = normalize(item.status || 'Approved')
  const type = normalize(item.type || 'Project')

  return APPROVED_RECORD_STATUSES.has(approvalStatus)
    && (type === 'project' || type === 'event')
}

export function getApprovedProjectEventRecords(expenses, type) {
  const requestedType = normalize(type)

  return expenses.filter((item) => (
    isApprovedProjectEventRecord(item)
    && normalize(item.type || 'Project') === requestedType
  ))
}

export function summarizeProjectEvents(expenses) {
  const summary = {
    projects: { total: 0, ongoing: 0, completed: 0 },
    events: { total: 0, ongoing: 0, completed: 0 },
  }

  expenses.forEach((item) => {
    if (!isApprovedProjectEventRecord(item)) return

    const bucket = normalize(item.type || 'Project') === 'event'
      ? summary.events
      : summary.projects
    const isCompleted = normalize(item.projectStatus || 'Ongoing') === 'completed'

    bucket.total += 1
    bucket[isCompleted ? 'completed' : 'ongoing'] += 1
  })

  return summary
}
