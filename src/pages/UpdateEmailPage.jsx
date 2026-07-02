import { useState } from 'react'
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
  const [isOtpSent, setIsOtpSent] = useState(false)

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
    addLog({ action: 'Successfully updated email address', actor: normalizedNewEmail })
    setNewEmail('')
    setOtp('')
    
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
                  }}
                  disabled={isUpdatingEmail}
                >
                  Back
                </button>
                <button
                  type="submit"
                  className="primary-button"
                  disabled={isUpdatingEmail}
                >
                  {isUpdatingEmail ? 'Verifying...' : 'Verify and Update'}
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
