import { supabase } from '../supabase/supabaseClient'

/**
 * Log an audit event directly to Supabase.
 * This utility can be used outside of React contexts.
 * 
 * @param {Object} params
 * @param {string} params.userId
 * @param {string} params.userName
 * @param {string} params.userRole
 * @param {string} params.action
 * @param {string} [params.module='']
 * @param {string} [params.description='']
 */
export async function logAuditEvent({
  userId,
  userName,
  userRole,
  action,
  module = '',
  description = ''
}) {
  if (!action) return

  const resolvedName = userName || userRole || 'System'
  const resolvedRole = userRole || ''
  const resolvedUserId = userId || null

  try {
    const { error } = await supabase.from('audit_trail').insert({
      user_id: resolvedUserId,
      user_name: resolvedName,
      user_role: resolvedRole,
      action,
      module,
      description,
    })

    if (error) {
      console.warn('[auditLogger] Insert failed:', error.message)
    }
  } catch (err) {
    console.warn('[auditLogger] Error:', err)
  }
}
