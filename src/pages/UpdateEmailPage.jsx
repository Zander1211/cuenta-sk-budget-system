import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuditLog } from '../context/AuditLogContext'
import { useAuth } from '../context/AuthContext'
import { updateEmail, verifyEmailUpdateOtp } from '../services/authService'
import { supabase } from '../supabase/supabaseClient'

function normalizeEmail(value) {
  return value?.trim().toLowerCase()
}

function UpdateEmailPage() {
  const { user } = useAuth()
  const { addLog } = useAuditLog()
  const navigate = useNavigate()

  const [newEmail, setNewEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [emailStatus, setEmailStatus] = useState('')
  const [emailError, setEmailError] = useState('')
  const [isUpdatingEmail, setIsUpdatingEmail] = useState(false)
  const [isOtpSent, setIsOtpSent] = useState(() => !!localStorage.getItem('cuenta_otp_email_sent'))
  const [countdown, setCountdown] = useState(() => {
    const sentAt = localStorage.getItem('cuenta_otp_email_sent')
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
      localStorage.removeItem('cuenta_otp_email_sent')
    }
  }, [countdown, isOtpSent])

  async function handleSendOtp(event) {
    event.preventDefault()
    setEmailStatus('')
    setEmailError('')

    const currentEmail = user?.email
    if (!currentEmail) {
      setEmailError('No user email found. Please log in again.')
      return
    }

    const normalizedNewEmail = normalizeEmail(newEmail)
    if (!normalizedNewEmail || normalizedNewEmail === currentEmail) {
      setEmailError('Enter a valid, different email address.')
      return
    }

    setIsUpdatingEmail(true)

    // Send OTP to new email
    const { error: updateError } = await updateEmail(normalizedNewEmail)
    if (updateError) {
      setEmailError(updateError.message)
      setIsUpdatingEmail(false)
      return
    }

    setIsOtpSent(true)
    localStorage.setItem('cuenta_otp_email_sent', Date.now().toString())
    setCountdown(60)
    setEmailStatus(`An OTP has been sent to ${normalizedNewEmail}. Please check your inbox.`)
    setIsUpdatingEmail(false)
  }

  async function handleVerifyOtp(event) {
    event.preventDefault()
    setEmailStatus('')
    setEmailError('')

    if (!otp) {
      setEmailError('Please enter the OTP sent to your new email.')
      return
    }

    // Frontend Expiration Check
    const sentAt = localStorage.getItem('cuenta_otp_email_sent')
    if (!sentAt || Date.now() - parseInt(sentAt) > 60000) {
      setEmailError('OTP has expired. Please request a new one.')
      return
    }

    setIsUpdatingEmail(true)

    const normalizedNewEmail = normalizeEmail(newEmail)
    
    // Verify OTP
    const { data, error } = await verifyEmailUpdateOtp(normalizedNewEmail, otp.trim())
    
    if (error) {
      setEmailError(error.message || 'Invalid or expired OTP.')
      setIsUpdatingEmail(false)
      return
    }

    // Refresh session to apply email change
    await supabase.auth.refreshSession()
    
    setEmailStatus('Email updated successfully! Returning to profile...')
    addLog({
      action: 'Email Address Updated',
      actionType: 'Email Address Updated',
      module: 'Authentication',
      recordType: 'User',
      description: `Email address updated to ${normalizedNewEmail}`,
      status: 'Success',
      actor: normalizedNewEmail,
    })
    setNewEmail('')
    setOtp('')
    localStorage.removeItem('cuenta_otp_email_sent')
    setCountdown(0)
    
    setTimeout(() => {
      navigate('/dashboard/profile')
    }, 2000)
  }

  return (
    <>
      <header className="dashboard-header">
        <div className="header-left">
          <div>
            <p className="eyebrow">Profile</p>
            <h1>Update email address</h1>
            <p>Change the email associated with this account.</p>
          </div>
        </div>
      </header>

      <section className="dashboard-content">
        <div className="overview-card">
          <p className="eyebrow">Email</p>
          <h2>Account Handover & Updates</h2>
          {!isOtpSent ? (
            <form className="user-form" onSubmit={handleSendOtp}>
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

              {emailError ? <p className="form-error">{emailError}</p> : null}
              {emailStatus ? <p className="form-status">{emailStatus}</p> : null}

              <div className="content-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => navigate('/dashboard/profile')}
                  disabled={isUpdatingEmail}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="primary-button"
                  disabled={isUpdatingEmail}
                >
                  {isUpdatingEmail ? 'Sending...' : 'Send OTP'}
                </button>
              </div>
            </form>
          ) : (
            <form className="user-form" onSubmit={handleVerifyOtp}>
              <label className="field">
                <span>Enter OTP</span>
                <input
                  type="text"
                  value={otp}
                  onChange={(event) => setOtp(event.target.value)}
                  placeholder="Enter 6-digit OTP"
                  required
                  maxLength={6}
                />
                <p className="field-hint">Check {normalizeEmail(newEmail)} for the verification code.</p>
              </label>

              {emailError ? <p className="form-error">{emailError}</p> : null}
              {emailStatus ? <p className="form-status" style={{ color: '#10b981' }}>{emailStatus}</p> : null}

              <div className="content-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => {
                    setIsOtpSent(false)
                    setOtp('')
                    setEmailError('')
                    setEmailStatus('')
                    setCountdown(0)
                    localStorage.removeItem('cuenta_otp_email_sent')
                  }}
                  disabled={isUpdatingEmail}
                >
                  Back
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={handleSendOtp}
                  disabled={isUpdatingEmail || countdown > 0}
                >
                  {countdown > 0 ? `Resend OTP in ${countdown}s` : 'Resend OTP'}
                </button>
                <button
                  type="submit"
                  className="primary-button"
                  disabled={isUpdatingEmail || countdown === 0}
                >
                  {countdown === 0 ? 'OTP Expired' : (isUpdatingEmail ? 'Verifying...' : 'Verify and Update')}
                </button>
              </div>
            </form>
          )}
        </div>
      </section>
    </>
  )
}

export default UpdateEmailPage
