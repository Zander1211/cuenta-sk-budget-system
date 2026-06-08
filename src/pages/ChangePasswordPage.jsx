import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import RoleGate from '../components/RoleGate'
import { useAuditLog } from '../context/AuditLogContext'
import { useAuth } from '../context/AuthContext'
import { loginUser, updatePassword } from '../services/authService'

const PASSWORD_MIN_LENGTH = 6
const PASSWORD_RULE_MESSAGE =
  'Password must be at least 6 characters and include a letter and a number.'

function isPasswordValid(value) {
  return /^(?=.*[A-Za-z])(?=.*\d).{6,}$/.test(value)
}

function ChangePasswordPage() {
  const { user } = useAuth()
  const { addLog } = useAuditLog()
  const navigate = useNavigate()

  const [oldPassword, setOldPassword] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showOld, setShowOld] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setStatus('')
    setError('')

    const email = user?.email
    if (!email) {
      setError('No user email found. Please log in again.')
      return
    }

    if (!oldPassword) {
      setError('Enter your current password.')
      return
    }

    if (!password || !isPasswordValid(password)) {
      setError(PASSWORD_RULE_MESSAGE)
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setIsSubmitting(true)
    const { error: authError } = await loginUser(email, oldPassword)
    if (authError) {
      setError('Current password is incorrect.')
      setIsSubmitting(false)
      return
    }

    const { error: updateError } = await updatePassword(password)
    if (updateError) {
      setError(updateError.message)
      setIsSubmitting(false)
      return
    }

    setStatus('Password updated successfully.')
    addLog({ action: 'Updated account password', actor: email })
    setOldPassword('')
    setPassword('')
    setConfirmPassword('')
    setIsSubmitting(false)
  }

  return (
    <RoleGate allow={['SK Chairman', 'SK Treasurer', 'SK Kagawad', 'Barangay Treasurer']}>
      <header className="dashboard-header">
        <div className="header-left">
          <div>
            <p className="eyebrow">Profile</p>
            <h1>Account security</h1>
            <p>Update your password to keep your account secure.</p>
          </div>
        </div>
      </header>

      <section className="dashboard-content">
        <div className="overview-card">
          <p className="eyebrow">Password</p>
          <h2>Change your password</h2>
          <form className="user-form" onSubmit={handleSubmit}>
            <label className="field">
              <span>Current password</span>
              <div className="field-row">
                <input
                  type={showOld ? 'text' : 'password'}
                  value={oldPassword}
                  onChange={(event) => setOldPassword(event.target.value)}
                  placeholder="Enter your current password"
                  required
                />
                <button
                  type="button"
                  className="text-button"
                  onClick={() => setShowOld((prev) => !prev)}
                >
                  {showOld ? 'Hide' : 'Show'}
                </button>
              </div>
            </label>
            <label className="field">
              <span>New password</span>
              <div className="field-row">
                <input
                  type={showNew ? 'text' : 'password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Enter a new password"
                  required
                />
                <button
                  type="button"
                  className="text-button"
                  onClick={() => setShowNew((prev) => !prev)}
                >
                  {showNew ? 'Hide' : 'Show'}
                </button>
              </div>
            </label>
            <p className="form-note">{PASSWORD_RULE_MESSAGE}</p>

            <label className="field">
              <span>Confirm password</span>
              <div className="field-row">
                <input
                  type={showConfirm ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder="Re-enter the new password"
                  required
                />
                <button
                  type="button"
                  className="text-button"
                  onClick={() => setShowConfirm((prev) => !prev)}
                >
                  {showConfirm ? 'Hide' : 'Show'}
                </button>
              </div>
            </label>

            {error ? <p className="form-error">{error}</p> : null}
            {status ? <p className="form-status">{status}</p> : null}

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
                disabled={isSubmitting}
              >
                Update Password
              </button>
            </div>
          </form>
        </div>
      </section>
    </RoleGate>
  )
}

export default ChangePasswordPage
