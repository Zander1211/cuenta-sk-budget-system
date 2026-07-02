import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import RoleGate from '../components/RoleGate'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabase/supabaseClient'

function ProfilePage() {
  const { user, role } = useAuth()
  const navigate = useNavigate()

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

  return (
    <RoleGate allow={['SK Chairman', 'SK Treasurer', 'SK Kagawad', 'Barangay Treasurer']}>
      <header className="dashboard-header">
        <div className="header-left">
          <div>
            <p className="eyebrow">Profile</p>
            <h1>My Profile</h1>
            <p>View and manage your personal account details.</p>
          </div>
        </div>
      </header>

      <section className="dashboard-content">
        <div className="overview-card profile-card">
          <p className="eyebrow">Account</p>
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
          <p className="eyebrow">Edit Profile</p>
          <h2>Account Settings</h2>
          <div className="profile-edit-options">
            <button
              className="secondary-button"
              onClick={() => navigate('/dashboard/profile/update-details')}
            >
              Update Personal Details
            </button>
            <button
              className="secondary-button"
              onClick={() => navigate('/dashboard/profile/change-password')}
            >
              Change Password
            </button>
            <button
              className="secondary-button"
              onClick={() => navigate('/dashboard/profile/update-email')}
            >
              Update Email Address
            </button>
          </div>

        </div>
      </section>
    </RoleGate>
  )
}

export default ProfilePage
