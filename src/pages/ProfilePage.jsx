import { useState } from 'react'
import RoleGate from '../components/RoleGate'
import { useAuditLog } from '../context/AuditLogContext'
import { useAuth } from '../context/AuthContext'
import {
  loginUser,
  sendPasswordReset,
  updatePassword,
  verifyRecoveryOtp,
} from '../services/authService'

function ProfilePage() {
  const { user } = useAuth()
  const { addLog } = useAuditLog()
  const [oldPassword, setOldPassword] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [resetEmail, setResetEmail] = useState(user?.email || '')
  const [resetToken, setResetToken] = useState('')
  const [resetPassword, setResetPassword] = useState('')
  const [resetConfirm, setResetConfirm] = useState('')
  const [resetStatus, setResetStatus] = useState('')
  const [resetError, setResetError] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [isResetting, setIsResetting] = useState(false)
  const [showOld, setShowOld] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [showResetNew, setShowResetNew] = useState(false)
  const [showResetConfirm, setShowResetConfirm] = useState(false)

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

    if (!password || password.length < 8) {
      setError('Password must be at least 8 characters.')
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

  async function sendOtp() {
    setResetStatus('')
    setResetError('')

    if (!resetEmail) {
      setResetError('Enter the email address for the account.')
      return
    }

    setIsSending(true)
    const { error: sendError } = await sendPasswordReset(resetEmail)
    if (sendError) {
      setResetError(sendError.message)
      setIsSending(false)
      return
    }

    setResetStatus('Check your email for the OTP or recovery link.')
    setIsSending(false)
  }

  async function handleSendOtp(event) {
    event.preventDefault()
    await sendOtp()
  }

  async function handleReset(event) {
    event.preventDefault()
    setResetStatus('')
    setResetError('')

    if (!resetEmail || !resetToken) {
      setResetError('Enter the email and OTP code from your email.')
      return
    }

    if (!resetPassword || resetPassword.length < 8) {
      setResetError('Password must be at least 8 characters.')
      return
    }

    if (resetPassword !== resetConfirm) {
      setResetError('Passwords do not match.')
      return
    }

    setIsResetting(true)
    const { error: verifyError } = await verifyRecoveryOtp(
      resetEmail,
      resetToken
    )
    if (verifyError) {
      setResetError(verifyError.message)
      setIsResetting(false)
      return
    }

    const { error: updateError } = await updatePassword(resetPassword)
    if (updateError) {
      setResetError(updateError.message)
      setIsResetting(false)
      return
    }

    setResetStatus('Password reset successfully. You can sign in now.')
    addLog({ action: 'Reset password via OTP', actor: resetEmail })
    setResetToken('')
    setResetPassword('')
    setResetConfirm('')
    setIsResetting(false)
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

            <button
              type="submit"
              className="primary-button"
              disabled={isSubmitting}
            >
              Update Password
            </button>
          </form>
        </div>

        <div className="overview-card">
          <p className="eyebrow">Forgot password</p>
          <h2>Reset via email OTP</h2>
          <form className="user-form" onSubmit={handleSendOtp}>
            <label className="field">
              <span>Email address</span>
              <input
                type="email"
                value={resetEmail}
                onChange={(event) => setResetEmail(event.target.value)}
                placeholder="you@barangay.gov"
                required
              />
            </label>
            {resetError ? <p className="form-error">{resetError}</p> : null}
            {resetStatus ? <p className="form-status">{resetStatus}</p> : null}
            <div className="field-row">
              <button
                type="submit"
                className="secondary-button"
                disabled={isSending}
              >
                Send OTP
              </button>
              <button
                type="button"
                className="text-button"
                onClick={sendOtp}
                disabled={isSending}
              >
                Resend OTP
              </button>
            </div>
          </form>

          <form className="user-form" onSubmit={handleReset}>
            <label className="field">
              <span>OTP code</span>
              <input
                type="text"
                value={resetToken}
                onChange={(event) => setResetToken(event.target.value)}
                placeholder="Enter OTP from email"
                required
              />
            </label>
            <label className="field">
              <span>New password</span>
              <div className="field-row">
                <input
                  type={showResetNew ? 'text' : 'password'}
                  value={resetPassword}
                  onChange={(event) => setResetPassword(event.target.value)}
                  placeholder="Create a new password"
                  required
                />
                <button
                  type="button"
                  className="text-button"
                  onClick={() => setShowResetNew((prev) => !prev)}
                >
                  {showResetNew ? 'Hide' : 'Show'}
                </button>
              </div>
            </label>
            <label className="field">
              <span>Confirm password</span>
              <div className="field-row">
                <input
                  type={showResetConfirm ? 'text' : 'password'}
                  value={resetConfirm}
                  onChange={(event) => setResetConfirm(event.target.value)}
                  placeholder="Re-enter the new password"
                  required
                />
                <button
                  type="button"
                  className="text-button"
                  onClick={() => setShowResetConfirm((prev) => !prev)}
                >
                  {showResetConfirm ? 'Hide' : 'Show'}
                </button>
              </div>
            </label>
            <button
              type="submit"
              className="primary-button"
              disabled={isResetting}
            >
              Reset Password
            </button>
          </form>
        </div>
      </section>
    </RoleGate>
  )
}

export default ProfilePage
