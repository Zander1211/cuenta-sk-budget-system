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
 * Paths for a scanned receipt.
 *
 * The processed scan keeps the exact shape `generateReceiptPath` already
 * produces, so it lands where every existing reader already looks and the
 * display code needs no change to show the scan by default. The original
 * photograph goes into an `originals/` subfolder of the same record, which
 * keeps the two together for retention and cleanup without a second bucket.
 *
 * @param {Object} record
 * @param {File} scanFile the processed scan
 * @param {File} originalFile the untouched camera photograph
 * @returns {{scanPath: string, originalPath: string}}
 */
export function generateReceiptScanPaths(record, scanFile, originalFile) {
  const scanPath = generateReceiptPath(record, scanFile)
  const directory = scanPath.slice(0, scanPath.lastIndexOf('/'))
  const safeOriginal = originalFile.name.replace(/\s+/g, '-')
  return {
    scanPath,
    originalPath: `${directory}/originals/${Date.now()}-${safeOriginal}`,
  }
}

/**
 * Inserts the receipt row for a scanned receipt.
 *
 * `file_path` is the processed scan, because that is the image Cuenta shows.
 * The photograph is recorded separately at `original_path` so it stays
 * available as the underlying evidence.
 *
 * `ocrMetadata` holds values a person confirmed in the review step. Fields
 * that were blank or unreadable arrive here as null and are stored as null.
 */
export async function insertScannedReceiptRecord(supabase, {
  record,
  scanFile,
  scanPath,
  originalPath,
  ocrMetadata,
  scanSettings,
  user,
  userRole,
}) {
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
      file_path: scanPath,
      original_path: originalPath || null,
      file_name: scanFile.name,
      file_type: scanFile.type,
      is_scanned: true,
      ocr_metadata: ocrMetadata || null,
      scan_settings: scanSettings || null,
      ocr_verified_at: new Date().toISOString(),
      ocr_verified_by: user?.user_metadata?.full_name || user?.email || 'Unknown',
      uploaded_by_id: user?.id || null,
      uploaded_by_name: user?.user_metadata?.full_name || user?.email || 'Unknown',
      uploaded_by_role: userRole || 'Unknown',
    })
    .select()

  return { data, error }
}

/**
 * Renders verified OCR metadata as readable lines for the expense remarks.
 *
 * Only fields the reviewer actually confirmed appear. A null stays out of the
 * text entirely rather than being written as "unknown", so remarks never imply
 * a reading that was not made.
 */
export function formatOcrMetadataNote(metadata) {
  if (!metadata) return ''

  const peso = value =>
    new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(value)

  const lines = [
    metadata.receiptNumber ? `Receipt no: ${metadata.receiptNumber}` : '',
    metadata.receivedFrom ? `Received from: ${metadata.receivedFrom}` : '',
    metadata.organization ? `Organization: ${metadata.organization}` : '',
    metadata.date ? `Receipt date: ${metadata.date}` : '',
    metadata.totalAmount !== null && metadata.totalAmount !== undefined
      ? `Receipt total: ${peso(metadata.totalAmount)}`
      : '',
    metadata.cashAmount !== null && metadata.cashAmount !== undefined
      ? `Cash: ${peso(metadata.cashAmount)}`
      : '',
    metadata.chequeAmount !== null && metadata.chequeAmount !== undefined
      ? `Cheque: ${peso(metadata.chequeAmount)}`
      : '',
    metadata.bank ? `Bank: ${metadata.bank}` : '',
    metadata.chequeNumber ? `Cheque no: ${metadata.chequeNumber}` : '',
    metadata.receiver ? `Receiver: ${metadata.receiver}` : '',
  ].filter(Boolean)

  if (!lines.length) return ''
  return `Verified from receipt scan:\n${lines.join('\n')}`
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
