import { useEffect, useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { useAuditLog } from '../context/AuditLogContext'
import RoleGate from '../components/RoleGate'
import { supabase } from '../supabase/supabaseClient'
import { formatBirthdate } from '../utils/biodata'
import { useAuth } from '../context/AuthContext'

const roles = ['SK Treasurer', 'SK Kagawad', 'Barangay Treasurer']

// Maximum number of ACTIVE accounts allowed per role. Disabled accounts do not count.
const ROLE_LIMITS = {
  'SK Treasurer': 1,
  'Barangay Treasurer': 1,
  'SK Kagawad': 8,
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// Supabase Auth Admin errors sometimes stringify to a bare "{}" — never show that raw.
function safeErrorMessage(error, fallback) {
  const candidates = [
    typeof error === 'string' ? error : null,
    error?.message,
    error?.error_description,
    error?.error,
  ]
  const message = candidates.find((value) => (
    typeof value === 'string'
    && value.trim()
    && value.trim() !== '{}'
    && value.trim() !== '[object Object]'
  ))
  return message || fallback
}

// A server error (crash, timeout, missing deployment) can return an empty or
// non-JSON body — calling response.json() directly on that throws a raw
// browser TypeError ("Unexpected end of JSON input"). Parse defensively instead.
async function readJsonResponse(response) {
  const text = await response.text()
  if (!text) return {}
  try {
    return JSON.parse(text)
  } catch {
    return { error: response.ok ? '' : text }
  }
}

async function getActiveRoleCount(role) {
  const { count, error } = await supabase
    .from('created_accounts')
    .select('id', { count: 'exact', head: true })
    .eq('role', role)
    .eq('is_active', true)

  if (error) throw error
  return count ?? 0
}

function roleLimitMessage(role, limit) {
  if (limit === 1) {
    return `An active ${role} account already exists. Please disable the existing ${role} account before creating a new one.`
  }
  return `The maximum number of active ${role} accounts (${limit}) has already been reached. Please disable an existing ${role} account before creating a new one.`
}

// Returns a user-facing message if the role's active-account limit has been reached, else null.
async function checkRoleLimit(role) {
  const limit = ROLE_LIMITS[role]
  if (!limit) return null

  const count = await getActiveRoleCount(role)
  if (count >= limit) return roleLimitMessage(role, limit)
  return null
}

function StatusBadge({ isActive }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '4px 12px',
        borderRadius: '999px',
        fontSize: '0.8rem',
        fontWeight: '600',
        letterSpacing: '0.2px',
        backgroundColor: isActive ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.1)',
        color: isActive ? '#15803d' : '#b91c1c',
        border: `1px solid ${isActive ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.25)'}`,
      }}
    >
      <span style={{ fontSize: '0.6rem' }}>{isActive ? '🟢' : '🔴'}</span>
      {isActive ? 'Active' : 'Disabled'}
    </span>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

function UserManagementPage() {
  const { user: currentUser } = useAuth()

  const [formState, setFormState] = useState({
    name: '',
    email: '',
    password: '',
    role: roles[0],
  })
  const [showPassword, setShowPassword] = useState(false)
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

  const [updatingId, setUpdatingId] = useState(null)

  // Disable / Enable confirmation modal
  const [disableModal, setDisableModal] = useState({ open: false, account: null, action: '' })

  // View User Info Modal
  const [viewModal, setViewModal] = useState({ open: false, user: null })
  const [viewBiodata, setViewBiodata] = useState({ status: 'idle', data: null })

  // Tab & search/filter
  const [activeTab, setActiveTab] = useState('active')
  const [searchQuery, setSearchQuery] = useState('')
  const [filterRole, setFilterRole] = useState('all')

  // ── Load accounts ────────────────────────────────────────────────────────

  useEffect(() => {
    loadAccounts()

    const channel = supabase
      .channel('created-accounts-profile-sync')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'created_accounts' },
        () => loadAccounts()
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  async function loadAccounts() {
    const { data, error } = await supabase
      .from('created_accounts')
      .select('id, full_name, email, role, is_active, created_at, disabled_at, disabled_by')
      .order('created_at', { ascending: false })

    if (error) {
      setFormError('Create the created_accounts table to load users.')
      setIsLoading(false)
      return
    }

    const normalized = (data ?? []).map((account) => ({
      ...account,
      is_active: account.is_active !== false,
    }))

    setAccounts(normalized)
    setViewModal((current) => {
      if (!current.open || !current.user?.id) return current
      const refreshedUser = normalized.find((account) => account.id === current.user.id)
      return refreshedUser ? { ...current, user: { ...current.user, ...refreshedUser } } : current
    })
    setIsLoading(false)
  }

  // ── View modal ───────────────────────────────────────────────────────────

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

  // ── Create account ───────────────────────────────────────────────────────

  function handleChange(event) {
    const { name, value } = event.target
    setFormState((prev) => ({ ...prev, [name]: value }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setFormError('')
    setFormStatus('')

    const name = formState.name.trim()
    const email = formState.email.trim()
    const password = formState.password.trim()

    if (!name || !email || !password) return

    const isValidGmail = /^[a-zA-Z0-9._%+-]+@gmail\.com$/i.test(email)
    if (!isValidGmail) {
      setFormError('The email address is invalid or does not exist. Please enter a valid Gmail account.')
      return
    }

    setIsSubmitting(true)

    try {
      // Check role limits BEFORE sending an OTP so we never send an unnecessary email.
      const limitError = await checkRoleLimit(formState.role)
      if (limitError) {
        setFormError(limitError)
        setIsSubmitting(false)
        return
      }
    } catch (err) {
      setFormError(safeErrorMessage(err, 'Unable to verify role availability right now. Please try again.'))
      setIsSubmitting(false)
      return
    }

    try {
      const res = await fetch('/api/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })

      const result = await readJsonResponse(res)

      if (!res.ok) {
        setFormError(safeErrorMessage(result, 'Failed to send verification code.'))
        setIsSubmitting(false)
        return
      }

      setPendingUser({ name, email, password, role: formState.role })
      setVerificationStep(true)
      setFormStatus('Verification code sent! Please check the inbox of ' + email)
      setIsSubmitting(false)
    } catch (err) {
      setFormError(safeErrorMessage(err, 'Failed to send verification code. Please check your connection and try again.'))
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
      const verifyRes = await fetch('/api/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: pendingUser.email, code: otpCode.trim() }),
      })

      const verifyResult = await readJsonResponse(verifyRes)

      if (!verifyRes.ok) {
        setFormError(safeErrorMessage(verifyResult, 'Invalid verification code.'))
        setIsSubmitting(false)
        return
      }

      const { data: sessionData } = await supabase.auth.getSession()
      const accessToken = sessionData?.session?.access_token
      if (!accessToken) {
        setFormError('Your session has expired. Please log in again.')
        setIsSubmitting(false)
        return
      }

      const createRes = await fetch('/api/create-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          fullName: pendingUser.name,
          email: pendingUser.email,
          password: pendingUser.password,
          role: pendingUser.role,
          code: otpCode.trim(),
        }),
      })

      const createResult = await readJsonResponse(createRes)

      if (!createRes.ok) {
        const fallback = createRes.status === 404
          ? 'The account creation service is unavailable. Please make sure the latest version of the app is deployed, then try again.'
          : 'Unable to create the account. Please try again.'
        setFormError(safeErrorMessage(createResult, fallback))
        setIsSubmitting(false)
        return
      }

      addLog({
        action: `User Created — ${pendingUser.name}`,
        actionType: 'User Created',
        module: 'User Management',
        recordType: 'User',
        recordId: createResult.user?.id,
        description: `Created account for ${pendingUser.name} (${pendingUser.role})`,
        newValue: { name: pendingUser.name, email: pendingUser.email, role: pendingUser.role },
      })

      setFormStatus('Account created successfully.')
      setFormState({ name: '', email: '', password: '', role: roles[0] })
      setVerificationStep(false)
      setOtpCode('')
      setPendingUser(null)
      await loadAccounts()
      setIsSubmitting(false)
    } catch (err) {
      setFormError(safeErrorMessage(err, 'Verification failed. Please try again.'))
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
      const result = await readJsonResponse(res)
      if (!res.ok) {
        setFormError(safeErrorMessage(result, 'Failed to resend code.'))
      } else {
        setFormStatus('Verification code resent successfully to ' + pendingUser.email)
      }
    } catch (err) {
      setFormError(safeErrorMessage(err, 'Failed to resend code. Please try again.'))
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

  // ── Disable / Enable account ─────────────────────────────────────────────

  function openDisableModal(account) {
    const action = account.is_active ? 'disable' : 'enable'
    setDisableModal({ open: true, account, action })
  }

  function closeDisableModal() {
    setDisableModal({ open: false, account: null, action: '' })
  }

  async function confirmToggleActive() {
    const { account, action } = disableModal
    if (!account) return

    const isDisabling = action === 'disable'

    if (!isDisabling) {
      try {
        const limitError = await checkRoleLimit(account.role)
        if (limitError) {
          closeDisableModal()
          alert(limitError)
          return
        }
      } catch (err) {
        closeDisableModal()
        alert(safeErrorMessage(err, 'Unable to verify role availability right now. Please try again.'))
        return
      }
    }

    setUpdatingId(account.id)
    closeDisableModal()

    // ── Step 1: Update is_active (critical — always attempt this) ──────────
    const { error: primaryError } = await supabase
      .from('created_accounts')
      .update({ is_active: !isDisabling })
      .eq('id', account.id)

    if (primaryError) {
      console.error(`Failed to ${action} account:`, primaryError.message)
      alert(`Failed to ${action} the account: ${primaryError.message}`)
      setUpdatingId(null)
      return
    }

    // ── Step 2: Write disable metadata (best-effort — columns may not exist) ─
    // These columns are added by migration 20260824200000_account_disable_metadata.sql.
    // If that migration has not been applied yet, this silently no-ops so the
    // primary is_active toggle still takes effect.
    const metaPayload = isDisabling
      ? { disabled_at: new Date().toISOString(), disabled_by: currentUser?.id ?? null }
      : { disabled_at: null, disabled_by: null }

    await supabase
      .from('created_accounts')
      .update(metaPayload)
      .eq('id', account.id)

    // (meta error intentionally ignored — is_active is already updated above)

    const actionLabel = isDisabling ? 'Disabled' : 'Enabled'
    const actionType  = isDisabling ? 'User Account Disabled' : 'User Account Enabled'

    addLog({
      action: `${actionLabel} Account — ${account.full_name}`,
      actionType,
      module: 'User Management',
      recordType: 'User',
      recordId: account.id,
      description: `${actionLabel} account for ${account.full_name} (${account.email}), Role: ${account.role}`,
      previousValue: { is_active: isDisabling },
      newValue: { is_active: !isDisabling },
    })

    setUpdatingId(null)
    await loadAccounts()
  }

  // ── Filtered lists ───────────────────────────────────────────────────────

  const filteredAccounts = accounts.filter((u) => {
    const matchesTab = activeTab === 'active' ? u.is_active : !u.is_active
    const matchesRole = filterRole === 'all' || u.role === filterRole
    const q = searchQuery.toLowerCase().trim()
    const matchesSearch =
      !q ||
      u.full_name?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q)
    return matchesTab && matchesRole && matchesSearch
  })

  const activeCount   = accounts.filter((u) => u.is_active).length
  const disabledCount = accounts.filter((u) => !u.is_active).length

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <RoleGate allow={['SK Chairman']}>
      <header className="dashboard-header">
        <div className="header-left">
          <div>
            <p className="eyebrow">User Management</p>
            <h1>Create and manage user accounts</h1>
            <p>
              The SK Chairman can create accounts, assign roles, edit roles, and
              disable or re-enable user accounts. All historical records are preserved.
            </p>
          </div>
        </div>
      </header>

      <section className="dashboard-content">
        <div className="user-management-grid">

          {/* ── Create Account Panel ──────────────────────────────────── */}
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
                  <div className="password-field">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      name="password"
                      autoComplete="new-password"
                      value={formState.password}
                      onChange={handleChange}
                      placeholder=""
                      required
                    />
                    <button
                      type="button"
                      className="password-toggle"
                      onClick={() => setShowPassword((prev) => !prev)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      aria-pressed={showPassword}
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </label>

                <label className="field">
                  <span>Role</span>
                  <select name="role" value={formState.role} onChange={handleChange}>
                    {roles.map((role) => (
                      <option key={role} value={role}>{role}</option>
                    ))}
                  </select>
                </label>

                <p className="form-note">
                  Accounts created here are assigned directly by the SK Chairman.
                </p>

                {formError ? <p className="form-error">{formError}</p> : null}
                {formStatus ? <p className="form-status">{formStatus}</p> : null}

                <button type="submit" className="primary-button" disabled={isSubmitting}>
                  Send Verification Code
                </button>
              </form>
            ) : (
              <form className="user-form" onSubmit={handleVerifyOtp}>
                <div style={{ backgroundColor: 'rgba(21,101,192,0.05)', padding: '16px', borderRadius: 'var(--radius-control)', marginBottom: '16px' }}>
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
                  <button type="submit" className="primary-button" disabled={isSubmitting}>
                    Verify &amp; Complete
                  </button>
                  <button type="button" className="secondary-button" onClick={handleResendOtp} disabled={isSubmitting}>
                    Resend Code
                  </button>
                  <button
                    type="button"
                    onClick={handleCancelVerification}
                    disabled={isSubmitting}
                    style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: '0.85rem', cursor: 'pointer', textDecoration: 'underline', marginTop: '8px' }}
                  >
                    Cancel Account Creation
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* ── Accounts Directory ────────────────────────────────────── */}
          <div className="overview-card">

            {/* Tab switcher */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '20px' }}>
              <div>
                <p className="eyebrow" style={{ marginBottom: '4px' }}>Directory</p>
                <h2 style={{ margin: 0 }}>User accounts</h2>
              </div>

              <div style={{ display: 'flex', gap: '8px', background: 'var(--background-secondary, #f4f4f5)', borderRadius: 'var(--radius-control)', padding: '4px' }}>
                <button
                  type="button"
                  onClick={() => setActiveTab('active')}
                  style={{
                    padding: '7px 18px',
                    borderRadius: 'calc(var(--radius-control) - 2px)',
                    border: 'none',
                    fontSize: '0.85rem',
                    fontWeight: '600',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    backgroundColor: activeTab === 'active' ? 'var(--background-color, #fff)' : 'transparent',
                    color: activeTab === 'active' ? 'var(--text-primary)' : 'var(--text-secondary)',
                    boxShadow: activeTab === 'active' ? 'var(--shadow)' : 'none',
                  }}
                >
                  Active
                  <span style={{ marginLeft: '6px', background: activeTab === 'active' ? 'rgba(34,197,94,0.15)' : 'var(--border-color)', color: activeTab === 'active' ? '#15803d' : 'var(--text-secondary)', borderRadius: '999px', padding: '1px 7px', fontSize: '0.75rem', fontWeight: '700' }}>
                    {activeCount}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('disabled')}
                  style={{
                    padding: '7px 18px',
                    borderRadius: 'calc(var(--radius-control) - 2px)',
                    border: 'none',
                    fontSize: '0.85rem',
                    fontWeight: '600',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    backgroundColor: activeTab === 'disabled' ? 'var(--background-color, #fff)' : 'transparent',
                    color: activeTab === 'disabled' ? 'var(--text-primary)' : 'var(--text-secondary)',
                    boxShadow: activeTab === 'disabled' ? 'var(--shadow)' : 'none',
                  }}
                >
                  Disabled
                  <span style={{ marginLeft: '6px', background: activeTab === 'disabled' ? 'rgba(239,68,68,0.12)' : 'var(--border-color)', color: activeTab === 'disabled' ? '#b91c1c' : 'var(--text-secondary)', borderRadius: '999px', padding: '1px 7px', fontSize: '0.75rem', fontWeight: '700' }}>
                    {disabledCount}
                  </span>
                </button>
              </div>
            </div>

            {/* Search & filter bar */}
            <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
              <input
                type="text"
                placeholder="Search by name or email…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  flex: '1 1 200px',
                  padding: '9px 14px',
                  borderRadius: 'var(--radius-control)',
                  border: '1px solid var(--border-color)',
                  fontSize: '0.875rem',
                  background: 'var(--background-color, #fff)',
                  color: 'var(--text-primary)',
                  outline: 'none',
                }}
              />
              <select
                value={filterRole}
                onChange={(e) => setFilterRole(e.target.value)}
                className="panel-select"
                style={{ flex: '0 0 auto', padding: '9px 14px', fontSize: '0.875rem' }}
              >
                <option value="all">All roles</option>
                {roles.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>

            {/* Content */}
            {isLoading ? (
              <p className="empty-state">Loading accounts…</p>
            ) : filteredAccounts.length === 0 ? (
              <p className="empty-state">
                {searchQuery || filterRole !== 'all'
                  ? 'No accounts match your search.'
                  : activeTab === 'active'
                    ? 'No active accounts. Create the first user.'
                    : 'No disabled accounts.'}
              </p>
            ) : activeTab === 'active' ? (
              /* ── Active Accounts — Card grid ── */
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '24px' }}>
                {filteredAccounts.map((user) => (
                  <div
                    key={user.id}
                    style={{
                      backgroundColor: 'var(--background-color, #ffffff)',
                      padding: '24px',
                      borderRadius: 'var(--radius-surface)',
                      border: '1px solid var(--border-color)',
                      boxShadow: 'var(--shadow)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '20px',
                    }}
                  >
                    {/* Header */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                      <div style={{ width: '56px', height: '56px', borderRadius: '50%', backgroundColor: 'var(--accent)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', fontWeight: 'bold', flexShrink: 0, boxShadow: 'var(--shadow-lift)' }}>
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

                    {/* Info grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <p style={{ margin: 0, fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: '0.5px' }}>Role</p>
                        <p style={{ margin: 0, fontSize: '0.95rem', color: 'var(--text-primary)', fontWeight: '400' }}>{user.role}</p>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <p style={{ margin: 0, fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: '0.5px' }}>Status</p>
                        <StatusBadge isActive={user.is_active} />
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', gridColumn: '1 / -1' }}>
                        <p style={{ margin: 0, fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: '0.5px' }}>Date Created</p>
                        <p style={{ margin: 0, fontSize: '0.95rem', color: 'var(--text-primary)', fontWeight: '400' }}>
                          {user.created_at ? new Date(user.created_at).toLocaleDateString() : '—'}
                        </p>
                      </div>
                    </div>

                    {/* Actions */}
                    <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '16px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        className="secondary-button"
                        style={{ flex: '1 1 auto', fontSize: '0.85rem', padding: '8px 12px' }}
                        onClick={() => openViewModal(user)}
                      >
                        View Details
                      </button>
                      <button
                        type="button"
                        style={{
                          flex: '1 1 auto',
                          fontSize: '0.85rem',
                          padding: '8px 12px',
                          border: '1px solid rgba(234,88,12,0.4)',
                          backgroundColor: 'rgba(234,88,12,0.08)',
                          color: '#c2410c',
                          borderRadius: 'var(--radius-control)',
                          cursor: 'pointer',
                          fontWeight: '500',
                          transition: 'all 0.15s',
                        }}
                        onClick={() => openDisableModal(user)}
                        disabled={updatingId === user.id}
                        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(234,88,12,0.15)' }}
                        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'rgba(234,88,12,0.08)' }}
                      >
                        Disable Account
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              /* ── Disabled Accounts — Table ── */
              <div style={{ overflowX: 'auto' }}>
                {filteredAccounts.length === 0 ? (
                  <p className="empty-state">No disabled accounts.</p>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid var(--border-color)' }}>
                        {['User', 'Email', 'Role', 'Date Disabled', 'Status', 'Actions'].map((h) => (
                          <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-secondary)', fontWeight: '600', whiteSpace: 'nowrap' }}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredAccounts.map((user, idx) => (
                        <tr
                          key={user.id}
                          style={{ borderBottom: '1px solid var(--border-color)', backgroundColor: idx % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.015)', transition: 'background 0.15s' }}
                          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.03)' }}
                          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = idx % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.015)' }}
                        >
                          {/* User */}
                          <td style={{ padding: '14px', whiteSpace: 'nowrap' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                              <div style={{ width: '36px', height: '36px', borderRadius: '50%', backgroundColor: 'rgba(239,68,68,0.15)', color: '#b91c1c', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: 'bold', flexShrink: 0 }}>
                                {user.full_name?.charAt(0)?.toUpperCase() || '?'}
                              </div>
                              <span style={{ fontWeight: '500', color: 'var(--text-primary)' }}>{user.full_name}</span>
                            </div>
                          </td>
                          {/* Email */}
                          <td style={{ padding: '14px', color: 'var(--text-secondary)', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {user.email}
                          </td>
                          {/* Role */}
                          <td style={{ padding: '14px', whiteSpace: 'nowrap', color: 'var(--text-primary)' }}>
                            {user.role}
                          </td>
                          {/* Date Disabled */}
                          <td style={{ padding: '14px', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>
                            {user.disabled_at
                              ? new Date(user.disabled_at).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })
                              : '—'}
                          </td>
                          {/* Status */}
                          <td style={{ padding: '14px', whiteSpace: 'nowrap' }}>
                            <StatusBadge isActive={false} />
                          </td>
                          {/* Actions */}
                          <td style={{ padding: '14px', whiteSpace: 'nowrap' }}>
                            <button
                              type="button"
                              style={{
                                padding: '7px 16px',
                                border: '1px solid rgba(34,197,94,0.35)',
                                backgroundColor: 'rgba(34,197,94,0.1)',
                                color: '#15803d',
                                borderRadius: 'var(--radius-control)',
                                cursor: updatingId === user.id ? 'not-allowed' : 'pointer',
                                fontWeight: '600',
                                fontSize: '0.8rem',
                                transition: 'all 0.15s',
                                opacity: updatingId === user.id ? 0.6 : 1,
                              }}
                              onClick={() => openDisableModal(user)}
                              disabled={updatingId === user.id}
                              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(34,197,94,0.2)' }}
                              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'rgba(34,197,94,0.1)' }}
                            >
                              Enable Account
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ── Disable / Enable Confirmation Modal ───────────────────── */}
      {disableModal.open && disableModal.account && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '440px' }}>
            <div className="modal-header">
              <h2 style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                {disableModal.action === 'disable' ? (
                  <>
                    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '32px', height: '32px', borderRadius: '50%', backgroundColor: 'rgba(234,88,12,0.12)', color: '#c2410c', fontSize: '16px', flexShrink: 0 }}>⚠</span>
                    Disable Account
                  </>
                ) : (
                  <>
                    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '32px', height: '32px', borderRadius: '50%', backgroundColor: 'rgba(34,197,94,0.12)', color: '#15803d', fontSize: '16px', flexShrink: 0 }}>✓</span>
                    Enable Account
                  </>
                )}
              </h2>
            </div>

            <div className="modal-body" style={{ margin: '16px 0' }}>
              {disableModal.action === 'disable' ? (
                <>
                  <p style={{ marginTop: 0 }}>
                    Are you sure you want to disable the account for{' '}
                    <strong>{disableModal.account.full_name}</strong>?
                  </p>
                  <div style={{ backgroundColor: 'rgba(234,88,12,0.06)', border: '1px solid rgba(234,88,12,0.2)', borderRadius: 'var(--radius-control)', padding: '14px 16px' }}>
                    <p style={{ margin: 0, fontSize: '0.875rem', color: '#9a3412', lineHeight: '1.6' }}>
                      The user will no longer be able to log in until the account is re-enabled. All their records, projects, events, payroll, expenses, and documents will remain intact.
                    </p>
                  </div>
                </>
              ) : (
                <p style={{ marginTop: 0 }}>
                  Re-enable the account for{' '}
                  <strong>{disableModal.account.full_name}</strong>? The user will regain access to the system immediately.
                </p>
              )}
            </div>

            <div className="modal-footer" style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button type="button" className="secondary-button" onClick={closeDisableModal}>
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmToggleActive}
                style={
                  disableModal.action === 'disable'
                    ? { backgroundColor: '#c2410c', color: 'white', border: '1px solid #c2410c', borderRadius: 'var(--radius-control)', padding: '10px 20px', fontWeight: '600', cursor: 'pointer', fontSize: '0.875rem' }
                    : { backgroundColor: '#15803d', color: 'white', border: '1px solid #15803d', borderRadius: 'var(--radius-control)', padding: '10px 20px', fontWeight: '600', cursor: 'pointer', fontSize: '0.875rem' }
                }
              >
                {disableModal.action === 'disable' ? 'Disable Account' : 'Enable Account'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── View User Information Modal ────────────────────────────── */}
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
                  backgroundColor: viewModal.user.is_active ? 'var(--accent)' : 'rgba(239,68,68,0.2)',
                  color: viewModal.user.is_active ? 'white' : '#b91c1c',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '28px', fontWeight: 'bold', marginBottom: '16px',
                  boxShadow: 'var(--shadow-lift)',
                }}>
                  {viewModal.user.full_name?.charAt(0)?.toUpperCase() || '?'}
                </div>
                <h3 style={{ margin: '0 0 4px', fontSize: '1.25rem', fontWeight: '600', color: 'var(--text-primary)' }}>{viewModal.user.full_name}</h3>
                <p style={{ margin: '0 0 12px', color: 'var(--text-secondary)', fontSize: '0.9rem', wordBreak: 'break-all' }}>{viewModal.user.email}</p>
                <StatusBadge isActive={viewModal.user.is_active} />
              </div>

              <div style={{ backgroundColor: 'var(--background-color, #ffffff)', padding: '24px', borderRadius: 'var(--radius-surface)', border: '1px solid var(--border-color)', boxShadow: 'var(--shadow)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '20px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <p style={{ margin: 0, fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: '0.5px' }}>User Role</p>
                    <p style={{ margin: 0, fontSize: '1rem', color: 'var(--text-primary)', fontWeight: '400' }}>{viewModal.user.role}</p>
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
                  {!viewModal.user.is_active && viewModal.user.disabled_at && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <p style={{ margin: 0, fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: '0.5px' }}>Disabled On</p>
                      <p style={{ margin: 0, fontSize: '1rem', color: '#b91c1c', fontWeight: '400' }}>
                        {new Date(viewModal.user.disabled_at).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })}
                      </p>
                    </div>
                  )}
                </div>

                <div style={{ borderTop: '1px solid var(--border-color)', marginTop: '24px', paddingTop: '24px' }}>
                  <h4 style={{ margin: '0 0 20px', fontSize: '0.9rem', color: 'var(--text-primary)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Biodata</h4>
                  {viewBiodata.status === 'loading' ? (
                    <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', margin: 0 }}>Loading biodata…</p>
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
