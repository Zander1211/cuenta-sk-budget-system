import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import RoleGate from '../components/RoleGate'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabase/supabaseClient'
import { getUploadErrorMessage } from '../utils/uploadUtils'
import ImageCropper from '../components/ImageCropper'
import { isBiodataComplete, formatBirthdate } from '../utils/biodata'

function ProfilePage() {
  const { user, role, refreshSession } = useAuth()
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
  
  // Cropper state
  const [cropImageSrc, setCropImageSrc] = useState(null)
  const [selectedSafeExt, setSelectedSafeExt] = useState('png')

  const [biodataComplete, setBiodataComplete] = useState(null) // null = loading
  const [biodata, setBiodata] = useState({ status: 'loading', data: null })

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

  useEffect(() => {
    let isMounted = true
    async function loadBiodataStatus() {
      if (!user?.id) return
      const { data, error } = await supabase
        .from('member_biodata')
        .select('birthdate, sex, civil_status, citizenship, complete_address, mobile_number')
        .eq('id', user.id)
        .maybeSingle()
      if (!isMounted) return
      setBiodataComplete(isBiodataComplete(data))
      setBiodata({ status: error ? 'error' : 'ready', data: error ? null : data })
    }
    loadBiodataStatus()
    return () => {
      isMounted = false
    }
  }, [user?.id])

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
    setSelectedSafeExt(safeExt)

    // Instead of uploading directly, read the file as a data URL and open the cropper
    const reader = new FileReader()
    reader.addEventListener('load', () => setCropImageSrc(reader.result?.toString() || ''))
    reader.readAsDataURL(file)

    // Reset the input so the same file can be selected again if cancelled
    input.value = ''
  }

  async function handleCropComplete(croppedBlob) {
    setCropImageSrc(null) // Close the cropper
    setIsUploading(true)
    setAvatarError('')
    setAvatarStatus('')

    const filePath = `${user.id}/profile.${selectedSafeExt}`

    // Upload the cropped blob
    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(filePath, croppedBlob, { upsert: true, contentType: `image/${selectedSafeExt}` })

    if (uploadError) {
      setAvatarError(getUploadErrorMessage(uploadError))
      setIsUploading(false)
      return
    }

    const { data: publicData } = supabase.storage
      .from('avatars')
      .getPublicUrl(filePath)
    
    // Append a timestamp parameter to bust the browser cache so the new image displays immediately
    const publicUrl = publicData?.publicUrl ? `${publicData.publicUrl}?t=${Date.now()}` : null

    if (!publicUrl) {
      setAvatarError('Unable to retrieve the public URL for this image.')
      setIsUploading(false)
      return
    }

    const { error: updateError } = await supabase.auth.updateUser({
      data: { avatar_url: publicUrl },
    })

    if (updateError) {
      setAvatarError(`Profile update failed: ${updateError.message}`)
      setIsUploading(false)
      return
    }

    setAvatarUrl(publicUrl)
    setAvatarStatus('Profile picture updated successfully.')
    await refreshSession()
    setIsUploading(false)
  }

  const handleCancelCrop = () => {
    setCropImageSrc(null)
    setIsUploading(false)
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

          {/* Personal records, shown inline under the account name */}
          <div className="profile-biodata">
            <p className="profile-biodata-title">Personal Information</p>
            {biodata.status === 'loading' ? (
              <p className="profile-hint">Loading biodata…</p>
            ) : biodata.status === 'error' ? (
              <p className="profile-hint">Unable to load biodata right now.</p>
            ) : biodata.data ? (
              <dl className="profile-biodata-grid">
                <div className="profile-biodata-item">
                  <dt>Birthdate</dt>
                  <dd>{formatBirthdate(biodata.data.birthdate)}</dd>
                </div>
                <div className="profile-biodata-item">
                  <dt>Sex</dt>
                  <dd>{biodata.data.sex || '—'}</dd>
                </div>
                <div className="profile-biodata-item">
                  <dt>Civil Status</dt>
                  <dd>{biodata.data.civil_status || '—'}</dd>
                </div>
                <div className="profile-biodata-item">
                  <dt>Citizenship</dt>
                  <dd>{biodata.data.citizenship || '—'}</dd>
                </div>
                <div className="profile-biodata-item">
                  <dt>Mobile Number</dt>
                  <dd>{biodata.data.mobile_number || '—'}</dd>
                </div>
                <div className="profile-biodata-item profile-biodata-item--wide">
                  <dt>Complete Address</dt>
                  <dd>{biodata.data.complete_address || '—'}</dd>
                </div>
              </dl>
            ) : (
              <p className="profile-hint">
                You haven&apos;t filled out your biodata yet. Use{' '}
                <strong>Complete Your Biodata</strong> below to add it.
              </p>
            )}
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
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
            <div>
              <p className="eyebrow">Personal Records</p>
              <h2>Biodata</h2>
            </div>
            {biodataComplete !== null ? (
              <span className={`an-chip ${biodataComplete ? 'positive' : 'warning'}`}>
                {biodataComplete ? 'Complete' : 'Incomplete'}
              </span>
            ) : null}
          </div>
          <p className="profile-hint">
            Personal information kept on file for SK records, visible to the SK Chairman.
          </p>
          <div className="profile-edit-options">
            <button
              className={biodataComplete ? 'secondary-button' : 'primary-button'}
              onClick={() => navigate('/dashboard/profile/biodata')}
            >
              {biodataComplete ? 'Edit Biodata' : 'Complete Your Biodata'}
            </button>
          </div>
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

      {cropImageSrc && (
        <ImageCropper
          imageSrc={cropImageSrc}
          onCropComplete={handleCropComplete}
          onCancel={handleCancelCrop}
        />
      )}
    </RoleGate>
  )
}

export default ProfilePage
