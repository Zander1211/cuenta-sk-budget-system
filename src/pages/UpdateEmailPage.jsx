import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import RoleGate from '../components/RoleGate'
import { useAuditLog } from '../context/AuditLogContext'
import { useAuth } from '../context/AuthContext'
import { loginUser, updateEmail } from '../services/authService'

function normalizeEmail(value) {
  return value?.trim().toLowerCase()
}

function UpdateEmailPage() {
  const { user } = useAuth()
  const { addLog } = useAuditLog()
  const navigate = useNavigate()

  const [newEmail, setNewEmail] = useState('')
  const [emailUpdatePassword, setEmailUpdatePassword] = useState('')
  const [emailStatus, setEmailStatus] = useState('')
  const [emailError, setEmailError] = useState('')
  const [isUpdatingEmail, setIsUpdatingEmail] = useState(false)
  const [showEmailPassword, setShowEmailPassword] = useState(false)

  async function handleEmailUpdateSubmit(event) {
    event.preventDefault()
    setEmailStatus('')
    setEmailError('')

    const currentEmail = user?.email
    if (!currentEmail) {
      setEmailError('No user email found. Please log in again.')
      return
    }

    if (!emailUpdatePassword) {
      setEmailError('Enter your current password.')
      return
    }

    const normalizedNewEmail = normalizeEmail(newEmail)
    if (!normalizedNewEmail || normalizedNewEmail === currentEmail) {
      setEmailError('Enter a valid, different email address.')
      return
    }

    setIsUpdatingEmail(true)

    // Verify identity using current password
    const { error: authError } = await loginUser(currentEmail, emailUpdatePassword)
    if (authError) {
      setEmailError('Current password is incorrect.')
      setIsUpdatingEmail(false)
      return
    }

    // Update email
    const { error: updateError } = await updateEmail(normalizedNewEmail)
    if (updateError) {
      setEmailError(updateError.message)
      setIsUpdatingEmail(false)
      return
    }

    setEmailStatus('Verification links sent! Please check both your old and new email addresses to confirm the change.')
    addLog({ action: 'Requested email update', actor: currentEmail })
    setNewEmail('')
    setEmailUpdatePassword('')
    setIsUpdatingEmail(false)
  }

  return (
    <RoleGate allow={['SK Chairman']}>
      <header className="dashboard-header">
        <div className="header-left">
          <div>
            <p className="eyebrow">Profile</p>
            <h1>Update email address</h1>
            <p>Change the email associated with this account (SK Chairman only).</p>
          </div>
        </div>
      </header>

      <section className="dashboard-content">
        <div className="overview-card">
          <p className="eyebrow">Email</p>
          <h2>Account Handover</h2>
          <form className="user-form" onSubmit={handleEmailUpdateSubmit}>
            <label className="field">
              <span>New email address</span>
              <input
                type="email"
                value={newEmail}
                onChange={(event) => setNewEmail(event.target.value)}
                placeholder="new@example.com"
                required
              />
            </label>
            <label className="field">
              <span>Current password</span>
              <div className="field-row">
                <input
                  type={showEmailPassword ? 'text' : 'password'}
                  value={emailUpdatePassword}
                  onChange={(event) => setEmailUpdatePassword(event.target.value)}
                  placeholder="Enter your current password to verify"
                  required
                />
                <button
                  type="button"
                  className="text-button"
                  onClick={() => setShowEmailPassword((prev) => !prev)}
                >
                  {showEmailPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            </label>

            {emailError ? <p className="form-error">{emailError}</p> : null}
            {emailStatus ? <p className="form-status">{emailStatus}</p> : null}

            <div className="content-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => navigate('/dashboard/profile')}
              >
                Back to Profile
              </button>
              <button
                type="submit"
                className="primary-button"
                disabled={isUpdatingEmail}
              >
                Update Email
              </button>
            </div>
          </form>
        </div>
      </section>
    </RoleGate>
  )
}

export default UpdateEmailPage
