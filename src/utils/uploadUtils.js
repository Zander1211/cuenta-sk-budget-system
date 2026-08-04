export const ALLOWED_FILE_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'application/pdf'
]

export const MAX_FILE_SIZE_MB = 20
export const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024

/**
 * Validates a receipt file and user role before upload.
 * Returns an error string if invalid, or null if valid.
 * @param {File} file 
 * @param {string} userRole
 * @returns {string | null}
 */
export function validateReceiptFile(file, userRole) {
  if (!file) return 'Select a receipt file first.'

  if (userRole && !['SK Chairman', 'SK Treasurer'].includes(userRole)) {
    return 'You do not have permission to upload receipts.'
  }

  if (!ALLOWED_FILE_TYPES.includes(file.type)) {
    return 'Invalid file type. Only JPG, PNG, and PDF are supported.'
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return `File is too large. Maximum size is ${MAX_FILE_SIZE_MB}MB.`
  }

  return null
}

/**
 * Translates a Supabase storage error into a specific, user-friendly message.
 * @param {Error} error 
 * @returns {string}
 */
export function getUploadErrorMessage(error) {
  if (!error) return 'The receipt could not be uploaded. Please try again.'
  
  const msg = error.message?.toLowerCase() || ''
  const status = error.statusCode || error.status

  if (status === '404' || msg.includes('bucket not found')) {
    return 'Storage bucket does not exist OR you are missing the required Row-Level Security (RLS) policies. Please run the SQL migration in Supabase.'
  }

  if (status === '403' || msg.includes('permission denied') || msg.includes('new row violates row-level security policy') || msg.includes('row-level security policy')) {
    return 'Permission denied. Only authorized roles can upload receipts.'
  }

  if (status === '413' || msg.includes('payload too large') || msg.includes('entity too large')) {
    return `File size exceeded. Maximum upload size is ${MAX_FILE_SIZE_MB}MB per receipt.`
  }
  
  if (msg.includes('fetch') || msg.includes('network')) {
    return 'Network error. Please check your internet connection.'
  }
  
  if (msg.includes('timeout')) {
    return 'Upload timeout. The file took too long to upload.'
  }

  return 'The receipt could not be uploaded. Please try again.'
}

/**
 * Logs detailed technical information for debugging without alerting the user.
 * @param {Error} error 
 * @param {Object} context 
 */
export function logUploadDebugInfo(error, context) {
  console.group('🚨 Receipt Upload Failed')
  console.error('Error Object:', error)
  console.error('Error Message:', error?.message)
  console.error('Status Code:', error?.statusCode || error?.status)
  console.error('Upload Context:', context)
  console.groupEnd()
}

/**
 * Generates an organized storage path for a receipt based on its category.
 * Target format: receipts/projects/{projectId}/{timestamp}-{filename}
 * @param {Object} record - The expense/project/event record
 * @param {File} file - The file being uploaded
 * @returns {string}
 */
export function generateReceiptPath(record, file) {
  const safeName = file.name.replace(/\s+/g, '-')
  
  let folder = 'other'
  
  if (record.type === 'Project') {
    folder = 'projects'
  } else if (record.type === 'Event') {
    folder = 'events'
  } else if (record.type === 'Payroll' || record.payroll_id || record.category?.toLowerCase() === 'payroll') {
    folder = 'payroll'
  } else if (record.project) {
    folder = 'projects'
  } else if (record.event) {
    folder = 'events'
  } else if (record.category) {
    folder = record.category.toLowerCase().replace(/\s+/g, '-')
  }

  return `receipts/${folder}/${record.id}/${Date.now()}-${safeName}`
}

/**
 * Inserts a receipt record into the database, providing robust linking and metadata.
 * Requires the file path and user session data.
 */
export async function insertReceiptRecord(supabase, record, file, filePath, user, userRole) {
  let recordType = 'Expense'
  if (['Project', 'Event', 'Payroll'].includes(record.type)) recordType = record.type
  else if (record.project) recordType = 'Project'
  else if (record.event) recordType = 'Event'
  else if (record.category?.toLowerCase() === 'payroll') recordType = 'Payroll'

  const { data, error } = await supabase
    .from('receipt_records')
    .insert({
      record_type: recordType,
      record_id: String(record.id),
      file_path: filePath,
      file_name: file.name,
      file_type: file.type,
      uploaded_by_id: user?.id || null,
      uploaded_by_name: user?.user_metadata?.full_name || user?.email || 'Unknown',
      uploaded_by_role: userRole || 'Unknown',
    })
    .select()

  return { data, error }
}
