import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useAuditLog } from '../context/AuditLogContext'
import RoleGate from '../components/RoleGate'
import { supabase, supabaseAnonKey, supabaseUrl } from '../supabase/supabaseClient'

const roles = ['SK Treasurer', 'SK Kagawad', 'Barangay Treasurer']
const adminClient = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
})

function UserManagementPage() {
  const [formState, setFormState] = useState({
    name: '',
    email: '',
    password: '',
    role: roles[0],
  })
  const [accounts, setAccounts] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formError, setFormError] = useState('')
  const [formStatus, setFormStatus] = useState('')
  const { addLog } = useAuditLog()

  // Edit state
  const [editingRoleId, setEditingRoleId] = useState(null)
  const [editRoleValue, setEditRoleValue] = useState('')
  const [updatingId, setUpdatingId] = useState(null)

  // Deactivate confirmation modal
  const [deactivateModal, setDeactivateModal] = useState({ open: false, account: null, action: '' })

  // View User Info Modal
  const [viewModal, setViewModal] = useState({ open: false, user: null })

  useEffect(() => {
    loadAccounts()
  }, [])

  async function loadAccounts() {
    const { data, error } = await supabase
      .from('created_accounts')
      .select('id, full_name, email, role, created_at')
      .order('created_at', { ascending: false })

    if (error) {
      setFormError('Create the created_accounts table to load users.')
      setIsLoading(false)
      return
    }

    // Normalize is_active — default to true if column doesn't exist yet
    const normalized = (data ?? []).map((account) => ({
      ...account,
      is_active: account.is_active !== false,
    }))

    setAccounts(normalized)
    setIsLoading(false)
  }

  function handleChange(event) {
    const { name, value } = event.target
    setFormState((prev) => ({
      ...prev,
      [name]: value,
    }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setFormError('')
    setFormStatus('')

    const name = formState.name.trim()
    const email = formState.email.trim()
    const password = formState.password.trim()

    if (!name || !email || !password) {
      return
    }

    setIsSubmitting(true)

    const { data, error } = await adminClient.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: name,
          role: formState.role,
        },
      },
    })

    if (error) {
      setFormError(error.message)
      setIsSubmitting(false)
      return
    }

    if (!data.user?.id) {
      setFormError('Unable to create the account. Try again.')
      setIsSubmitting(false)
      return
    }

    const { error: insertError } = await supabase.from('created_accounts').insert({
      id: data.user.id,
      full_name: name,
      email,
      role: formState.role,
    })

    if (insertError) {
      setFormError(insertError.message)
      setIsSubmitting(false)
      return
    }

    addLog({
      action: `User Created — ${name}`,
      actionType: 'User Created',
      module: 'User Management',
      recordType: 'User',
      recordId: data.user.id,
      description: `Created account for ${name} (${formState.role})`,
      newValue: { name, email, role: formState.role },
    })
    setFormStatus('Account created. The user can log in after email verification.')

    setFormState({
      name: '',
      email: '',
      password: '',
      role: roles[0],
    })

    await loadAccounts()
    setIsSubmitting(false)
  }

  // ── Edit Role ─────────────────────────────────────────────────
  function startEditRole(account) {
    setEditingRoleId(account.id)
    setEditRoleValue(account.role)
  }

  function cancelEditRole() {
    setEditingRoleId(null)
    setEditRoleValue('')
  }

  async function saveRole(account) {
    if (editRoleValue === account.role) {
      cancelEditRole()
      return
    }

    setUpdatingId(account.id)

    const { error } = await supabase
      .from('created_accounts')
      .update({ role: editRoleValue })
      .eq('id', account.id)

    if (error) {
      console.warn('Failed to update role:', error.message)
      setUpdatingId(null)
      return
    }

    addLog({
      action: `User Updated — Role Changed for ${account.full_name}`,
      actionType: 'User Updated',
      module: 'User Management',
      recordType: 'User',
      recordId: account.id,
      description: `Role changed for ${account.full_name} (${account.email})`,
      previousValue: { role: account.role },
      newValue: { role: editRoleValue },
    })

    setEditingRoleId(null)
    setEditRoleValue('')
    setUpdatingId(null)
    await loadAccounts()
  }

  // ── Deactivate / Reactivate ──────────────────────────────────
  function openDeactivateModal(account) {
    const action = account.is_active ? 'deactivate' : 'reactivate'
    setDeactivateModal({ open: true, account, action })
  }

  function closeDeactivateModal() {
    setDeactivateModal({ open: false, account: null, action: '' })
  }

  async function confirmToggleActive() {
    const { account, action } = deactivateModal
    if (!account) return

    setUpdatingId(account.id)
    closeDeactivateModal()

    const newStatus = action === 'deactivate' ? false : true

    const { error } = await supabase
      .from('created_accounts')
      .update({ is_active: newStatus })
      .eq('id', account.id)

    if (error) {
      console.warn(`Failed to ${action} account:`, error.message)
      setUpdatingId(null)
      return
    }

    const actionLabel = action === 'deactivate' ? 'Deactivated' : 'Reactivated'
    const actionType  = action === 'deactivate' ? 'User Deactivated' : 'User Activated'
    addLog({
      action: `${actionLabel} Account — ${account.full_name}`,
      actionType,
      module: 'User Management',
      recordType: 'User',
      recordId: account.id,
      description: `${actionLabel} account for ${account.full_name} (${account.email}), Role: ${account.role}`,
      previousValue: { is_active: action === 'deactivate' ? true : false },
      newValue: { is_active: action === 'deactivate' ? false : true },
    })

    setUpdatingId(null)
    await loadAccounts()
  }

  return (
    <RoleGate allow={['SK Chairman']}>
      <header className="dashboard-header">
        <div className="header-left">
          <div>
            <p className="eyebrow">User Management</p>
            <h1>Create and assign user accounts</h1>
            <p>
              The SK Chairman can create accounts, assign roles, edit roles, and
              deactivate or reactivate user accounts.
            </p>
          </div>
        </div>
      </header>

      <section className="dashboard-content">
        <div className="user-management-grid">
          <div className="overview-card">
            <p className="eyebrow">New account</p>
            <h2>Create a user</h2>
            <form className="user-form" onSubmit={handleSubmit}>
              <label className="field">
                <span>Full name</span>
                <input
                  type="text"
                  name="name"
                  value={formState.name}
                  onChange={handleChange}
                  placeholder="Juan Dela Cruz"
                  required
                />
              </label>

              <label className="field">
                <span>Email address</span>
                <input
                  type="email"
                  name="email"
                  value={formState.email}
                  onChange={handleChange}
                  placeholder="user@barangay.gov"
                  required
                />
              </label>

              <label className="field">
                <span>Password</span>
                <input
                  type="password"
                  name="password"
                  value={formState.password}
                  onChange={handleChange}
                  placeholder="Create a temporary password"
                  required
                />
              </label>

              <label className="field">
                <span>Role</span>
                <select
                  name="role"
                  value={formState.role}
                  onChange={handleChange}
                >
                  {roles.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>
              </label>

              <p className="form-note">
                Accounts created here are assigned directly by the SK Chairman.
              </p>

              {formError ? <p className="form-error">{formError}</p> : null}
              {formStatus ? <p className="form-status">{formStatus}</p> : null}

              <button
                type="submit"
                className="primary-button"
                disabled={isSubmitting}
              >
                Create Account
              </button>
            </form>
          </div>

          <div className="overview-card">
            <p className="eyebrow">Directory</p>
            <h2>Created accounts</h2>
            <table className="user-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan="5" className="empty-state">
                      Loading accounts...
                    </td>
                  </tr>
                ) : accounts.length ? (
                  accounts.map((user) => (
                    <tr key={user.id} style={{ opacity: user.is_active ? 1 : 0.55 }}>
                      <td>{user.full_name}</td>
                      <td>{user.email}</td>
                      <td>
                        {editingRoleId === user.id ? (
                          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                            <select
                              className="panel-select"
                              value={editRoleValue}
                              onChange={(e) => setEditRoleValue(e.target.value)}
                              style={{ minWidth: '140px', fontSize: '0.85rem' }}
                            >
                              {roles.map((r) => (
                                <option key={r} value={r}>{r}</option>
                              ))}
                            </select>
                            <button
                              type="button"
                              className="text-button"
                              style={{ color: 'var(--accent)', fontWeight: 600, fontSize: '0.8rem' }}
                              onClick={() => saveRole(user)}
                              disabled={updatingId === user.id}
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              className="text-button"
                              style={{ fontSize: '0.8rem' }}
                              onClick={cancelEditRole}
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <span className="role-pill">{user.role}</span>
                        )}
                      </td>

                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            className="text-button"
                            style={{ fontSize: '0.8rem' }}
                            onClick={() => setViewModal({ open: true, user })}
                          >
                            View Info
                          </button>
                          {editingRoleId !== user.id && (
                            <button
                              type="button"
                              className="text-button"
                              style={{ fontSize: '0.8rem' }}
                              onClick={() => startEditRole(user)}
                              disabled={updatingId === user.id}
                            >
                              Edit Role
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="4" className="empty-state">
                      No accounts yet. Create the first user.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Deactivate / Reactivate Confirmation Modal */}
      {deactivateModal.open && deactivateModal.account && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '440px' }}>
            <div className="modal-header">
              <h2>
                {deactivateModal.action === 'deactivate'
                  ? 'Deactivate Account'
                  : 'Reactivate Account'}
              </h2>
            </div>
            <div className="modal-body" style={{ margin: '16px 0' }}>
              <p>
                {deactivateModal.action === 'deactivate' ? (
                  <>
                    Are you sure you want to deactivate the account for{' '}
                    <strong>{deactivateModal.account.full_name}</strong>? The
                    user will no longer be able to access the system.
                  </>
                ) : (
                  <>
                    Reactivate the account for{' '}
                    <strong>{deactivateModal.account.full_name}</strong>? The
                    user will regain access to the system.
                  </>
                )}
              </p>
            </div>
            <div
              className="modal-footer"
              style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}
            >
              <button
                type="button"
                className="secondary-button"
                onClick={closeDeactivateModal}
              >
                Cancel
              </button>
              <button
                type="button"
                className="primary-button"
                style={
                  deactivateModal.action === 'deactivate'
                    ? { backgroundColor: '#ef4444', color: 'white', borderColor: '#ef4444' }
                    : {}
                }
                onClick={confirmToggleActive}
              >
                {deactivateModal.action === 'deactivate' ? 'Deactivate' : 'Reactivate'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View User Information Modal */}
      {viewModal.open && viewModal.user && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '500px' }}>
            <div className="modal-header">
              <h2>User Information</h2>
            </div>
            <div className="modal-body" style={{ margin: '16px 0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' }}>
                <div style={{ 
                  width: '64px', height: '64px', borderRadius: '50%', 
                  backgroundColor: 'var(--accent)', color: 'white',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '24px', fontWeight: 'bold'
                }}>
                  {viewModal.user.full_name?.charAt(0)?.toUpperCase() || '?'}
                </div>
                <div>
                  <h3 style={{ margin: '0 0 4px', fontSize: '1.25rem' }}>{viewModal.user.full_name}</h3>
                  <p style={{ margin: 0, color: 'var(--ink-soft)' }}>{viewModal.user.email}</p>
                </div>
              </div>

              <div className="details-grid" style={{ gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <p className="details-label" style={{ fontSize: '0.8rem', color: 'var(--ink-soft)' }}>Role</p>
                  <p className="details-value" style={{ fontWeight: 500 }}>{viewModal.user.role}</p>
                </div>
                <div>
                  <p className="details-label" style={{ fontSize: '0.8rem', color: 'var(--ink-soft)' }}>Account Status</p>
                  <p className="details-value" style={{ fontWeight: 500, color: viewModal.user.is_active ? '#15803d' : '#ef4444' }}>
                    {viewModal.user.is_active ? 'Active' : 'Deactivated'}
                  </p>
                </div>
                <div>
                  <p className="details-label" style={{ fontSize: '0.8rem', color: 'var(--ink-soft)' }}>Date Created</p>
                  <p className="details-value" style={{ fontWeight: 500 }}>
                    {viewModal.user.created_at ? new Date(viewModal.user.created_at).toLocaleDateString() : '—'}
                  </p>
                </div>
                <div>
                  <p className="details-label" style={{ fontSize: '0.8rem', color: 'var(--ink-soft)' }}>Last Login</p>
                  <p className="details-value" style={{ fontWeight: 500 }}>
                    {viewModal.user.last_sign_in_at ? new Date(viewModal.user.last_sign_in_at).toLocaleDateString() : 'Not available'}
                  </p>
                </div>
              </div>
            </div>
            <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="secondary-button"
                onClick={() => setViewModal({ open: false, user: null })}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </RoleGate>
  )
}

export default UserManagementPage
