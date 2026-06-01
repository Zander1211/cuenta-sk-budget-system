import { useEffect, useState } from 'react'
import RoleGate from '../components/RoleGate'
import { useAuditLog } from '../context/AuditLogContext'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabase/supabaseClient'
import {
  loginUser,
  sendEmailOtp,
  updatePassword,
  verifyEmailOtp,
} from '../services/authService'

const PASSWORD_MIN_LENGTH = 6
const PASSWORD_RULE_MESSAGE =
  'Password must be at least 6 characters and include a letter and a number.'

function isPasswordValid(value) {
  return /^(?=.*[A-Za-z])(?=.*\d).{6,}$/.test(value)
}

function normalizeEmail(value) {
  return value?.trim().toLowerCase()
}

function ProfilePage() {
  const { user, role, refreshSession } = useAuth()
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
  const [avatarUrl, setAvatarUrl] = useState(
    user?.user_metadata?.avatar_url || ''
  )
  const [avatarError, setAvatarError] = useState('')
  const [avatarStatus, setAvatarStatus] = useState('')
  const [isUploading, setIsUploading] = useState(false)
  const [firstName, setFirstName] = useState(
    user?.user_metadata?.first_name || ''
  )
  const [lastName, setLastName] = useState(user?.user_metadata?.last_name || '')
  const [nickname, setNickname] = useState(
    user?.user_metadata?.nickname || ''
  )
  const [nameStatus, setNameStatus] = useState('')
  const [nameError, setNameError] = useState('')
  const [isSavingName, setIsSavingName] = useState(false)

  const email = user?.email || ''
  const metadataFullName = user?.user_metadata?.full_name?.trim() || ''
  const trimmedNickname = nickname.trim()
  const resolvedFullName =
    [firstName.trim(), lastName.trim()].filter(Boolean).join(' ') ||
    metadataFullName
  const displayName =
    trimmedNickname || resolvedFullName || email.split('@')[0] || 'User'
  const surname =
    lastName.trim() || resolvedFullName.split(' ').filter(Boolean).slice(-1)[0] || ''
  const formalTitle = [role, surname].filter(Boolean).join(', ')
  const initials = getInitials(displayName || email)

  useEffect(() => {
    setAvatarUrl(user?.user_metadata?.avatar_url || '')
    setFirstName(user?.user_metadata?.first_name || '')
    setLastName(user?.user_metadata?.last_name || '')
    setNickname(user?.user_metadata?.nickname || '')
  }, [user])

  function getInitials(value) {
    const cleaned = value?.trim()
    if (!cleaned) return 'U'
    const parts = cleaned.split(/\s+/).filter(Boolean)
    if (parts.length === 1) {
      return parts[0].slice(0, 2).toUpperCase()
    }
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
  }

  async function handleAvatarChange(event) {
    const input = event.target
    const file = input.files?.[0]
    if (!file) {
      return
    }

    setAvatarError('')
    setAvatarStatus('')

    if (!user?.id) {
      setAvatarError('No user session found. Please log in again.')
      return
    }

    if (!file.type.startsWith('image/')) {
      setAvatarError('Choose an image file (PNG, JPG, or WebP).')
      return
    }

    const maxSize = 5 * 1024 * 1024
    if (file.size > maxSize) {
      setAvatarError('Image must be 5MB or smaller.')
      return
    }

    setIsUploading(true)

    const fileExt = file.name.split('.').pop()?.toLowerCase() || 'png'
    const safeExt = fileExt.replace(/[^a-z0-9]/g, '') || 'png'
    const filePath = `${user.id}/avatar-${Date.now()}.${safeExt}`

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(filePath, file, { upsert: true })

    if (uploadError) {
      setAvatarError(uploadError.message)
      setIsUploading(false)
      return
    }

    const { data: publicData } = supabase.storage
      .from('avatars')
      .getPublicUrl(filePath)
    const publicUrl = publicData?.publicUrl

    if (!publicUrl) {
      setAvatarError('Unable to retrieve the public URL for this image.')
      setIsUploading(false)
      return
    }

    const { error: updateError } = await supabase.auth.updateUser({
      data: { avatar_url: publicUrl },
    })

    if (updateError) {
      setAvatarError(updateError.message)
      setIsUploading(false)
      return
    }

    setAvatarUrl(publicUrl)
    setAvatarStatus('Profile photo updated successfully.')
    setIsUploading(false)
    input.value = ''
  }

  async function handleNameSave(event) {
    event.preventDefault()
    setNameStatus('')
    setNameError('')

    const trimmedFirst = firstName.trim()
    const trimmedLast = lastName.trim()
    const trimmedNick = nickname.trim()

    if (!trimmedFirst || !trimmedLast) {
      setNameError('Enter both first name and surname.')
      return
    }

    setIsSavingName(true)
    const updatedFullName = `${trimmedFirst} ${trimmedLast}`.trim()
    const { error: updateError } = await supabase.auth.updateUser({
      data: {
        first_name: trimmedFirst,
        last_name: trimmedLast,
        nickname: trimmedNick,
        full_name: updatedFullName,
      },
    })

    if (updateError) {
      setNameError(updateError.message)
      setIsSavingName(false)
      return
    }

    await refreshSession()
    addLog({ action: 'Updated profile name', actor: user?.email })
    setNameStatus('Name updated successfully.')
    setIsSavingName(false)
  }

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

    setResetStatus('Password updated successfully. You can sign in now.')
    addLog({ action: 'Updated password via OTP', actor: resetEmail })
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
        <div className="overview-card profile-card">
          <p className="eyebrow">Profile</p>
          <div className="profile-header">
            <div className="profile-avatar">
              {avatarUrl ? (
                <img src={avatarUrl} alt={`${displayName} profile`} />
              ) : (
                <span className="profile-avatar-fallback">{initials}</span>
              )}
            </div>
            <div>
              <h2 className="profile-name">{displayName}</h2>
              {formalTitle ? (
                <p className="profile-title">{formalTitle}</p>
              ) : null}
              {trimmedNickname && resolvedFullName ? (
                <p className="profile-meta">Full name: {resolvedFullName}</p>
              ) : null}
              {email ? <p className="profile-meta">{email}</p> : null}
            </div>
          </div>
          <div className="profile-actions">
            <label
              className={`secondary-button profile-upload ${
                isUploading ? 'is-disabled' : ''
              }`}
            >
              {isUploading ? 'Uploading...' : 'Upload photo'}
              <input
                type="file"
                accept="image/*"
                onChange={handleAvatarChange}
                disabled={isUploading}
              />
            </label>
            <p className="profile-hint">PNG, JPG, or WebP up to 5MB.</p>
          </div>
          {avatarError ? <p className="form-error">{avatarError}</p> : null}
          {avatarStatus ? <p className="form-status">{avatarStatus}</p> : null}
        </div>

        <div className="overview-card">
          <p className="eyebrow">Name</p>
          <h2>Update name details</h2>
          <form className="user-form" onSubmit={handleNameSave}>
            <div className="form-grid">
              <label className="field">
                <span>First name</span>
                <input
                  type="text"
                  value={firstName}
                  onChange={(event) => setFirstName(event.target.value)}
                  placeholder="Juan"
                  required
                />
              </label>
              <label className="field">
                <span>Surname</span>
                <input
                  type="text"
                  value={lastName}
                  onChange={(event) => setLastName(event.target.value)}
                  placeholder="Dela Cruz"
                  required
                />
              </label>
              <label className="field">
                <span>Nickname (optional)</span>
                <input
                  type="text"
                  value={nickname}
                  onChange={(event) => setNickname(event.target.value)}
                  placeholder="JDC"
                />
              </label>
            </div>
            {nameError ? <p className="form-error">{nameError}</p> : null}
            {nameStatus ? <p className="form-status">{nameStatus}</p> : null}
            <button
              type="submit"
              className="primary-button"
              disabled={isSavingName}
            >
              Save Name
            </button>
          </form>
        </div>
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
          <p className="eyebrow">Update password</p>
          <h2>Update via email OTP</h2>
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
            <button
              type="submit"
              className="primary-button"
              disabled={isResetting}
            >
              Update Password
            </button>
          </form>
        </div>
      </section>
    </RoleGate>
  )
}

export default ProfilePage
