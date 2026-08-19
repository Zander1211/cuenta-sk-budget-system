import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useAuditLog } from '../context/AuditLogContext'
import RoleGate from '../components/RoleGate'
import { supabase, supabaseAnonKey, supabaseUrl } from '../supabase/supabaseClient'
import { formatBirthdate } from '../utils/biodata'

const roles = ['SK Treasurer', 'SK Kagawad', 'Barangay Treasurer']
const adminClient = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storageKey: 'cuenta-admin-auth-storage',
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

  // OTP Verification state
  const [verificationStep, setVerificationStep] = useState(false)
  const [otpCode, setOtpCode] = useState('')
  const [pendingUser, setPendingUser] = useState(null)

  // Edit state
  const [editingRoleId, setEditingRoleId] = useState(null)
  const [editRoleValue, setEditRoleValue] = useState('')
  const [updatingId, setUpdatingId] = useState(null)

  // Deactivate confirmation modal
  const [deactivateModal, setDeactivateModal] = useState({ open: false, account: null, action: '' })

  // View User Info Modal
  const [viewModal, setViewModal] = useState({ open: false, user: null })
  const [viewBiodata, setViewBiodata] = useState({ status: 'idle', data: null })

  async function openViewModal(account) {
    setViewModal({ open: true, user: account })
    setViewBiodata({ status: 'loading', data: null })

    const biodataPromise = supabase
      .from('member_biodata')
      .select('*')
      .eq('id', account.id)
      .maybeSingle()

    const loginPromise = fetch(`/api/user-login?id=${account.id}`)
      .then(res => res.json())
      .catch(() => ({}))

    const [biodataRes, loginRes] = await Promise.all([biodataPromise, loginPromise])

    if (loginRes && loginRes.last_sign_in_at) {
      setViewModal(prev => ({
        ...prev,
        user: { ...prev.user, last_sign_in_at: loginRes.last_sign_in_at }
      }))
    }

    setViewBiodata({ status: biodataRes.error ? 'error' : 'ready', data: biodataRes.error ? null : biodataRes.data })
  }

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

    const isValidGmail = /^[a-zA-Z0-9._%+-]+@gmail\.com$/i.test(email)
    if (!isValidGmail) {
      setFormError('The email address is invalid or does not exist. Please enter a valid Gmail account.')
      return
    }

    setIsSubmitting(true)

    try {
      // Send custom OTP via our Gmail SMTP backend
      const res = await fetch('/api/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })

      const result = await res.json()

      if (!res.ok) {
        setFormError(result.error || 'Failed to send verification code.')
        setIsSubmitting(false)
        return
      }

      // Move to verification step
      setPendingUser({
        name,
        email,
        password,
        role: formState.role,
      })
      setVerificationStep(true)
      setFormStatus('Verification code sent! Please check the inbox of ' + email)
      setIsSubmitting(false)
    } catch (err) {
      setFormError('Failed to send verification code: ' + err.message)
      setIsSubmitting(false)
    }
  }

  async function handleVerifyOtp(event) {
    event.preventDefault()
    setFormError('')
    setFormStatus('')

    if (!otpCode.trim()) {
      setFormError('Please enter the verification code.')
      return
    }

    setIsSubmitting(true)

    try {
      // Verify the custom OTP
      const verifyRes = await fetch('/api/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: pendingUser.email, code: otpCode.trim() }),
      })

      const verifyResult = await verifyRes.json()

      if (!verifyRes.ok) {
        setFormError(verifyResult.error || 'Invalid verification code.')
        setIsSubmitting(false)
        return
      }

      // Code verified! Now create the actual auth user
      const { data, error } = await adminClient.auth.signUp({
        email: pendingUser.email,
        password: pendingUser.password,
        options: {
          data: {
            full_name: pendingUser.name,
            role: pendingUser.role,
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

      // Insert into created_accounts
      const { error: insertError } = await supabase.from('created_accounts').insert({
        id: data.user.id,
        full_name: pendingUser.name,
        email: pendingUser.email,
        role: pendingUser.role,
      })

      if (insertError) {
        setFormError(insertError.message)
        setIsSubmitting(false)
        return
      }

      addLog({
        action: `User Created — ${pendingUser.name}`,
        actionType: 'User Created',
        module: 'User Management',
        recordType: 'User',
        recordId: data.user.id,
        description: `Created account for ${pendingUser.name} (${pendingUser.role})`,
        newValue: { name: pendingUser.name, email: pendingUser.email, role: pendingUser.role },
      })

      setFormStatus('Account successfully created and verified!')
      setFormState({
        name: '',
        email: '',
        password: '',
        role: roles[0],
      })
      setVerificationStep(false)
      setOtpCode('')
      setPendingUser(null)

      await loadAccounts()
      setIsSubmitting(false)
    } catch (err) {
      setFormError('Verification failed: ' + err.message)
      setIsSubmitting(false)
    }
  }

  async function handleResendOtp() {
    setFormError('')
    setFormStatus('')
    setIsSubmitting(true)

    try {
      const res = await fetch('/api/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: pendingUser.email }),
      })

      const result = await res.json()

      if (!res.ok) {
        setFormError(result.error || 'Failed to resend code.')
      } else {
        setFormStatus('Verification code resent successfully to ' + pendingUser.email)
      }
    } catch (err) {
      setFormError('Failed to resend code: ' + err.message)
    }
    setIsSubmitting(false)
  }

  async function handleCancelVerification() {
    setVerificationStep(false)
    setOtpCode('')
    setPendingUser(null)
    setFormError('')
    setFormStatus('')
  }

  async function handleDeleteAccount(user) {
    try {
      setUpdatingId(user.id)
      
      const res = await fetch('/api/delete-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id })
      })

      const result = await res.json()

      if (!res.ok) {
        alert(result.error || 'Failed to delete user.')
        setUpdatingId(null)
        return
      }

      addLog({
        action: `User Deleted — ${user.full_name}`,
        actionType: 'User Deleted',
        module: 'User Management',
        recordType: 'User',
        recordId: user.id,
        description: `Deleted account for ${user.full_name} (${user.role})`,
        oldValue: { name: user.full_name, email: user.email, role: user.role },
      })

      await loadAccounts()
      setUpdatingId(null)
    } catch (err) {
      alert('Failed to delete user: ' + err.message)
      setUpdatingId(null)
    }
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
            
            {!verificationStep ? (
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
                    placeholder="user@gmail.com"
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
                  Send Verification Code
                </button>
              </form>
            ) : (
              <form className="user-form" onSubmit={handleVerifyOtp}>
                <div style={{ backgroundColor: 'rgba(21, 101, 192, 0.05)', padding: '16px', borderRadius: '8px', marginBottom: '16px' }}>
                  <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-primary)', textAlign: 'center', lineHeight: '1.5' }}>
                    A verification code has been sent to<br />
                    <strong>{pendingUser?.email}</strong>
                  </p>
                </div>

                <label className="field">
                  <span>Enter Verification Code</span>
                  <input
                    type="text"
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value)}
                    placeholder="123456"
                    required
                    style={{ textAlign: 'center', letterSpacing: '4px', fontSize: '1.2rem', fontWeight: 'bold' }}
                    maxLength={6}
                  />
                </label>

                {formError ? <p className="form-error">{formError}</p> : null}
                {formStatus ? <p className="form-status">{formStatus}</p> : null}

                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '8px' }}>
                  <button
                    type="submit"
                    className="primary-button"
                    disabled={isSubmitting}
                  >
                    Verify & Complete
                  </button>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={handleResendOtp}
                    disabled={isSubmitting}
                  >
                    Resend Code
                  </button>
                  <button
                    type="button"
                    onClick={handleCancelVerification}
                    disabled={isSubmitting}
                    style={{ 
                      background: 'none', border: 'none', color: 'var(--text-secondary)', 
                      fontSize: '0.85rem', cursor: 'pointer', textDecoration: 'underline', marginTop: '8px' 
                    }}
                  >
                    Cancel Account Creation
                  </button>
                </div>
              </form>
            )}
          </div>

          <div className="overview-card">
            <p className="eyebrow">Directory</p>
            <h2>Created accounts</h2>
            {isLoading ? (
              <p className="empty-state">Loading accounts...</p>
            ) : accounts.length ? (
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', 
                gap: '24px',
                marginTop: '16px'
              }}>
                {accounts.map((user) => (
                  <div key={user.id} style={{ 
                    backgroundColor: 'var(--background-color, #ffffff)', 
                    padding: '24px', 
                    borderRadius: '12px', 
                    border: '1px solid var(--border-color)',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.02)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '20px',
                    opacity: user.is_active ? 1 : 0.65
                  }}>
                    {/* Header: Avatar, Name, Email */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                      <div style={{ 
                        width: '56px', height: '56px', borderRadius: '50%', 
                        backgroundColor: 'var(--accent)', color: 'white',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '24px', fontWeight: 'bold', flexShrink: 0,
                        boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                      }}>
                        {user.full_name?.charAt(0)?.toUpperCase() || '?'}
                      </div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <h3 style={{ margin: '0 0 4px', fontSize: '1.1rem', fontWeight: '600', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {user.full_name}
                        </h3>
                        <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.85rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {user.email}
                        </p>
                      </div>
                    </div>

                    {/* Info Grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <p style={{ margin: 0, fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: '0.5px' }}>Role</p>
                        {editingRoleId === user.id ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <select
                              className="panel-select"
                              value={editRoleValue}
                              onChange={(e) => setEditRoleValue(e.target.value)}
                              style={{ width: '100%', fontSize: '0.85rem', padding: '6px 10px' }}
                            >
                              {roles.map((r) => (
                                <option key={r} value={r}>{r}</option>
                              ))}
                            </select>
                            <div style={{ display: 'flex', gap: '8px' }}>
                              <button
                                type="button"
                                className="primary-button"
                                style={{ padding: '6px 12px', fontSize: '0.8rem', flex: 1 }}
                                onClick={() => saveRole(user)}
                                disabled={updatingId === user.id}
                              >
                                Save
                              </button>
                              <button
                                type="button"
                                className="secondary-button"
                                style={{ padding: '6px 12px', fontSize: '0.8rem', flex: 1 }}
                                onClick={cancelEditRole}
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <p style={{ margin: 0, fontSize: '0.95rem', color: 'var(--text-primary)', fontWeight: '400' }}>{user.role}</p>
                        )}
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <p style={{ margin: 0, fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: '0.5px' }}>Status</p>
                        <div>
                          <span className={`status-pill ${user.is_active ? 'status-completed' : 'status-rejected'}`} style={{ display: 'inline-block', margin: 0 }}>
                            {user.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </div>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', gridColumn: '1 / -1' }}>
                        <p style={{ margin: 0, fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: '0.5px' }}>Date Created</p>
                        <p style={{ margin: 0, fontSize: '0.95rem', color: 'var(--text-primary)', fontWeight: '400' }}>
                          {user.created_at ? new Date(user.created_at).toLocaleDateString() : '—'}
                        </p>
                      </div>
                    </div>

                      {/* Actions */}
                    <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '16px', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        className="secondary-button"
                        style={{ flex: '1 1 auto', fontSize: '0.85rem', padding: '8px 12px', textAlign: 'center' }}
                        onClick={() => openViewModal(user)}
                      >
                        View Info
                      </button>
                      {editingRoleId !== user.id && (
                        <button
                          type="button"
                          className="secondary-button"
                          style={{ flex: '1 1 auto', fontSize: '0.85rem', padding: '8px 12px', textAlign: 'center' }}
                          onClick={() => startEditRole(user)}
                          disabled={updatingId === user.id}
                        >
                          Edit Role
                        </button>
                      )}
                      <button
                        type="button"
                        className="secondary-button"
                        style={{ flex: '1 1 auto', fontSize: '0.85rem', padding: '8px 12px', textAlign: 'center', color: '#dc2626', borderColor: '#fee2e2', backgroundColor: '#fef2f2' }}
                        onClick={() => {
                          if (window.confirm(`Are you sure you want to permanently delete the account for ${user.full_name}?`)) {
                            handleDeleteAccount(user)
                          }
                        }}
                        disabled={updatingId === user.id}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="empty-state">No accounts yet. Create the first user.</p>
            )}
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
            <div className="modal-body" style={{ margin: '0', padding: '24px 20px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', marginBottom: '24px' }}>
                <div style={{ 
                  width: '72px', height: '72px', borderRadius: '50%', 
                  backgroundColor: 'var(--accent)', color: 'white',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '28px', fontWeight: 'bold', marginBottom: '16px',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                }}>
                  {viewModal.user.full_name?.charAt(0)?.toUpperCase() || '?'}
                </div>
                <h3 style={{ margin: '0 0 4px', fontSize: '1.25rem', fontWeight: '600', color: 'var(--text-primary)' }}>{viewModal.user.full_name}</h3>
                <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem', wordBreak: 'break-all' }}>{viewModal.user.email}</p>
              </div>

              <div style={{ backgroundColor: 'var(--background-color, #ffffff)', padding: '24px', borderRadius: '12px', border: '1px solid var(--border-color)', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '20px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <p style={{ margin: 0, fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: '0.5px' }}>User Role</p>
                    <p style={{ margin: 0, fontSize: '1rem', color: 'var(--text-primary)', fontWeight: '400' }}>{viewModal.user.role}</p>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <p style={{ margin: 0, fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: '0.5px' }}>Account Status</p>
                    <div>
                      <span className={`status-pill ${viewModal.user.is_active ? 'status-completed' : 'status-rejected'}`} style={{ display: 'inline-block', margin: 0 }}>
                        {viewModal.user.is_active ? 'Active' : 'Deactivated'}
                      </span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <p style={{ margin: 0, fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: '0.5px' }}>Date Created</p>
                    <p style={{ margin: 0, fontSize: '1rem', color: 'var(--text-primary)', fontWeight: '400' }}>
                      {viewModal.user.created_at ? new Date(viewModal.user.created_at).toLocaleDateString() : '—'}
                    </p>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <p style={{ margin: 0, fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: '0.5px' }}>Last Login</p>
                    <p style={{ margin: 0, fontSize: '1rem', color: 'var(--text-primary)', fontWeight: '400' }}>
                      {viewModal.user.last_sign_in_at ? new Date(viewModal.user.last_sign_in_at).toLocaleString() : 'Not available'}
                    </p>
                  </div>
                </div>

                <div style={{ borderTop: '1px solid var(--border-color)', marginTop: '24px', paddingTop: '24px' }}>
                  <h4 style={{ margin: '0 0 20px', fontSize: '0.9rem', color: 'var(--text-primary)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Biodata</h4>
                  {viewBiodata.status === 'loading' ? (
                    <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', margin: 0 }}>Loading biodata...</p>
                  ) : viewBiodata.status === 'error' ? (
                    <p style={{ fontSize: '0.9rem', color: 'var(--danger-color)', margin: 0 }}>Unable to load biodata.</p>
                  ) : viewBiodata.data ? (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '20px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <p style={{ margin: 0, fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: '0.5px' }}>Birthdate</p>
                        <p style={{ margin: 0, fontSize: '1rem', color: 'var(--text-primary)', fontWeight: '400' }}>{formatBirthdate(viewBiodata.data.birthdate)}</p>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <p style={{ margin: 0, fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: '0.5px' }}>Sex</p>
                        <p style={{ margin: 0, fontSize: '1rem', color: 'var(--text-primary)', fontWeight: '400' }}>{viewBiodata.data.sex || '—'}</p>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <p style={{ margin: 0, fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: '0.5px' }}>Civil Status</p>
                        <p style={{ margin: 0, fontSize: '1rem', color: 'var(--text-primary)', fontWeight: '400' }}>{viewBiodata.data.civil_status || '—'}</p>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <p style={{ margin: 0, fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: '0.5px' }}>Citizenship</p>
                        <p style={{ margin: 0, fontSize: '1rem', color: 'var(--text-primary)', fontWeight: '400' }}>{viewBiodata.data.citizenship || '—'}</p>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <p style={{ margin: 0, fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: '0.5px' }}>Mobile Number</p>
                        <p style={{ margin: 0, fontSize: '1rem', color: 'var(--text-primary)', fontWeight: '400' }}>{viewBiodata.data.mobile_number || '—'}</p>
                      </div>
                      <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <p style={{ margin: 0, fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: '0.5px' }}>Complete Address</p>
                        <p style={{ margin: 0, fontSize: '1rem', color: 'var(--text-primary)', fontWeight: '400' }}>{viewBiodata.data.complete_address || '—'}</p>
                      </div>
                    </div>
                  ) : (
                    <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', margin: 0 }}>This member hasn&apos;t filled out their biodata yet.</p>
                  )}
                </div>
              </div>
            </div>
            <div className="modal-footer" style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: '12px' }}>
              <button
                type="button"
                className="secondary-button"
                style={{ flex: '1 1 auto', maxWidth: '200px' }}
                onClick={() => { setViewModal({ open: false, user: null }); setViewBiodata({ status: 'idle', data: null }) }}
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
