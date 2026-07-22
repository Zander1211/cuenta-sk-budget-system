import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import RoleGate from '../components/RoleGate'
import { useAuditLog } from '../context/AuditLogContext'
import { useAuth } from '../context/AuthContext'
import { sendEmailOtp, updatePassword, verifyEmailOtp } from '../services/authService'

const PASSWORD_RULE_MESSAGE =
  'Password must be at least 6 characters and include a letter and a number.'

function isPasswordValid(value) {
  return /^(?=.*[A-Za-z])(?=.*\d).{6,}$/.test(value)
}

function normalizeEmail(value) {
  return value?.trim().toLowerCase()
}

function UpdateOtpPage() {
  const { user } = useAuth()
  const { addLog } = useAuditLog()
  const navigate = useNavigate()

  const [resetEmail, setResetEmail] = useState(user?.email || '')
  const [resetToken, setResetToken] = useState('')
  const [resetPassword, setResetPassword] = useState('')
  const [resetConfirm, setResetConfirm] = useState('')
  const [resetStatus, setResetStatus] = useState('')
  const [resetError, setResetError] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [isResetting, setIsResetting] = useState(false)
  const [showResetNew, setShowResetNew] = useState(false)
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [isOtpSent, setIsOtpSent] = useState(() => !!localStorage.getItem('cuenta_otp_password_sent'))
  const [countdown, setCountdown] = useState(() => {
    const sentAt = localStorage.getItem('cuenta_otp_password_sent')
    if (sentAt) {
      const elapsed = Math.floor((Date.now() - parseInt(sentAt)) / 1000)
      return elapsed < 60 ? 60 - elapsed : 0
    }
    return 0
  })

  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000)
      return () => clearTimeout(timer)
    } else if (countdown === 0 && isOtpSent) {
      localStorage.removeItem('cuenta_otp_password_sent')
    }
  }, [countdown, isOtpSent])

  async function sendOtp() {
    setResetStatus('')
    setResetError('')

    const signedInEmail = normalizeEmail(user?.email)
    const requestedEmail = normalizeEmail(resetEmail)

    if (!signedInEmail) {
      setResetError('No signed-in email found. Please log in again.')
      return
    }

    if (!requestedEmail) {
      setResetError('Enter the email address for the account.')
      return
    }

    if (requestedEmail !== signedInEmail) {
      setResetError('OTP can only be sent to your signed-in email address.')
      return
    }

    setIsSending(true)
    const { error: sendError } = await sendEmailOtp(signedInEmail)
    if (sendError) {
      setResetError(sendError.message)
      setIsSending(false)
      return
    }

    localStorage.setItem('cuenta_otp_password_sent', Date.now().toString())
    setCountdown(60)
    setIsOtpSent(true)
    setResetStatus('Check your email for the OTP code.')
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

    const signedInEmail = normalizeEmail(user?.email)
    const requestedEmail = normalizeEmail(resetEmail)

    // Frontend Expiration Check
    const sentAt = localStorage.getItem('cuenta_otp_password_sent')
    if (!sentAt || Date.now() - parseInt(sentAt) > 60000) {
      setResetError('OTP has expired. Please request a new one.')
      return
    }

    if (!signedInEmail) {
      setResetError('No signed-in email found. Please log in again.')
      return
    }

    if (!requestedEmail || !resetToken) {
      setResetError('Enter the email and OTP code from your email.')
      return
    }

    if (requestedEmail !== signedInEmail) {
      setResetError('OTP verification must use your signed-in email address.')
      return
    }

    if (!resetPassword || !isPasswordValid(resetPassword)) {
      setResetError(PASSWORD_RULE_MESSAGE)
      return
    }

    if (resetPassword !== resetConfirm) {
      setResetError('Passwords do not match.')
      return
    }

    setIsResetting(true)
    const { error: verifyError } = await verifyEmailOtp(
      signedInEmail,
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

    setResetStatus('Password updated successfully.')
    addLog({
      action: 'Password Updated via OTP',
      actionType: 'Password Updated via OTP',
      module: 'Authentication',
      recordType: 'User',
      description: `Password successfully reset via OTP for ${resetEmail}`,
      status: 'Success',
      actor: resetEmail,
    })
    setResetToken('')
    setResetPassword('')
    setResetConfirm('')
    setIsResetting(false)
    setIsOtpSent(false)
    setCountdown(0)
    localStorage.removeItem('cuenta_otp_password_sent')
  }

  return (
    <RoleGate allow={['SK Chairman', 'SK Treasurer', 'SK Kagawad', 'Barangay Treasurer']}>
      <header className="dashboard-header">
        <div className="header-left">
          <div>
            <p className="eyebrow">Profile</p>
            <h1>Update Password via OTP Verification</h1>
            <p>Reset your password using a one-time passcode sent to your email.</p>
          </div>
        </div>
      </header>

      <section className="dashboard-content">
        <div className="overview-card">
          <p className="eyebrow">Reset password</p>
          <h2>Email Verification</h2>
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
                disabled={isSending || countdown > 0}
              >
                Send OTP
              </button>
              <button
                type="button"
                className="text-button"
                onClick={sendOtp}
                disabled={isSending || countdown > 0}
              >
                {countdown > 0 ? `Resend OTP in ${countdown}s` : 'Resend OTP'}
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
            <p className="form-note">{PASSWORD_RULE_MESSAGE}</p>
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
                disabled={isResetting || (isOtpSent && countdown === 0)}
              >
                {isOtpSent && countdown === 0 ? 'OTP Expired' : 'Update Password'}
              </button>
            </div>
          </form>
        </div>
      </section>
    </RoleGate>
  )
}

export default UpdateOtpPage
