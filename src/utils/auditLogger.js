import { supabase } from '../supabase/supabaseClient'
import { getDeviceInfo } from './deviceInfo'

/**
 * Log an audit event directly to Supabase.
 *
 * This utility can be used outside of React contexts (fire-and-forget).
 * It records the full set of fields required by the enhanced v2 schema.
 *
 * @param {Object} params
 * @param {string}  params.userId         — Supabase auth UID
 * @param {string}  params.userName       — Display name of the acting user
 * @param {string}  params.userRole       — Role of the acting user
 * @param {string}  params.action         — Human-readable description, e.g. "Monthly Budget Updated"
 * @param {string}  [params.actionType]   — Canonical type label, e.g. "Budget Updated"
 * @param {string}  [params.module]       — Page/module where the action occurred
 * @param {string}  [params.recordType]   — Entity type: "Budget", "Project", "User", etc.
 * @param {string}  [params.recordId]     — ID of the affected record
 * @param {string}  [params.description]  — Free-text summary
 * @param {Object}  [params.previousValue] — Snapshot BEFORE the change (plain object)
 * @param {Object}  [params.newValue]      — Snapshot AFTER the change (plain object)
 * @param {string}  [params.ipAddress]    — Client IP address (optional)
 * @param {string}  [params.deviceInfo]   — Browser/OS string (auto-detected if omitted)
 * @param {string}  [params.status]       — "Success" | "Failed" (default: "Success")
 * @param {string}  [params.remarks]      — Optional reason/notes
 */
export async function logAuditEvent({
  userId,
  userName,
  userRole,
  action,
  actionType = '',
  module = '',
  recordType = '',
  recordId = '',
  description = '',
  previousValue = null,
  newValue = null,
  ipAddress = '',
  deviceInfo,
  status = 'Success',
  remarks = '',
}) {
  if (!action) return

  const resolvedName = userName || userRole || 'System'
  const resolvedRole = userRole || ''
  const resolvedUserId = userId || null
  const resolvedDevice = deviceInfo !== undefined ? deviceInfo : getDeviceInfo()
  // Use action as actionType fallback if not provided
  const resolvedActionType = actionType || action

  try {
    const { error } = await supabase.from('audit_trail').insert({
      user_id:        resolvedUserId,
      user_name:      resolvedName,
      user_role:      resolvedRole,
      action,
      action_type:    resolvedActionType,
      module,
      record_type:    recordType,
      record_id:      String(recordId || ''),
      description,
      previous_value: previousValue || null,
      new_value:      newValue || null,
      ip_address:     ipAddress || '',
      device_info:    resolvedDevice || '',
      status,
      remarks,
    })

    if (error) {
      console.warn('[auditLogger] Insert failed:', error.message)
    }
  } catch (err) {
    console.warn('[auditLogger] Error:', err)
  }
}
