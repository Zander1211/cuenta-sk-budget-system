import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import RoleGate from '../components/RoleGate'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabase/supabaseClient'
import { getUploadErrorMessage } from '../utils/uploadUtils'
import ImageCropper from '../components/ImageCropper'
import { isBiodataComplete, formatBirthdate } from '../utils/biodata'

function ProfilePage() {
  const { user, role, profileName, profileSurname, refreshSession } = useAuth()
  const navigate = useNavigate()

  const [avatarOverride, setAvatarOverride] = useState('')
  const [avatarError, setAvatarError] = useState('')
  const [avatarStatus, setAvatarStatus] = useState('')
  const [isUploading, setIsUploading] = useState(false)
  // Cropper state
  const [cropImageSrc, setCropImageSrc] = useState(null)
  const [selectedSafeExt, setSelectedSafeExt] = useState('png')

  const [biodataComplete, setBiodataComplete] = useState(null) // null = loading
  const [biodata, setBiodata] = useState({ status: 'loading', data: null })

  const email = user?.email || ''
  const avatarUrl = avatarOverride || user?.user_metadata?.avatar_url || ''
  const firstName = user?.user_metadata?.first_name || ''
  const lastName = user?.user_metadata?.last_name || ''
  const nickname = user?.user_metadata?.nickname || ''
  const metadataFullName = user?.user_metadata?.full_name?.trim() || ''
  const trimmedNickname = nickname.trim()
  const resolvedFullName =
    profileName ||
    [firstName.trim(), user?.user_metadata?.middle_name?.trim(), lastName.trim()].filter(Boolean).join(' ') ||
    metadataFullName
  const displayName =
    trimmedNickname || resolvedFullName || email.split('@')[0] || 'User'
  const surname =
    profileSurname || lastName.trim() || resolvedFullName.split(' ').filter(Boolean).slice(-1)[0] || ''
  const formalTitle = [role, surname].filter(Boolean).join(', ')
  const initials = getInitials(displayName || email)

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

    setAvatarOverride(publicUrl)
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

      <section className="dashboard-content" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px', alignItems: 'start' }}>
        
        {/* Account Info Card */}
        <div className="overview-card profile-card" style={{ padding: '32px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', backgroundColor: 'var(--surface)', borderRadius: 'var(--radius-surface)', boxShadow: 'var(--shadow)', border: '1px solid var(--line)' }}>
          <div className="profile-avatar" style={{ marginBottom: '16px' }}>
            {avatarUrl ? (
              <img src={avatarUrl} alt={`${displayName} profile`} style={{ width: '120px', height: '120px', borderRadius: '50%', objectFit: 'cover', border: '4px solid #f3f4f6' }} />
            ) : (
              <span className="profile-avatar-fallback" style={{ width: '120px', height: '120px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2.5rem', backgroundColor: 'var(--surface-2)', borderRadius: '50%', color: 'var(--ink-3)' }}>{initials}</span>
            )}
          </div>
          <div style={{ marginBottom: '24px' }}>
            <h2 className="profile-name" style={{ margin: '0 0 8px', fontSize: '1.5rem', fontWeight: 700, color: 'var(--ink)' }}>{displayName}</h2>
            {formalTitle ? (
              <p className="profile-title" style={{ margin: '0 0 4px', fontSize: '1rem', fontWeight: 500, color: 'var(--ink-2)' }}>{formalTitle}</p>
            ) : null}
            {trimmedNickname && resolvedFullName ? (
              <p className="profile-meta" style={{ margin: '0 0 4px', fontSize: '0.9rem', color: 'var(--ink-3)' }}>{resolvedFullName}</p>
            ) : null}
            {email ? <p className="profile-meta" style={{ margin: 0, fontSize: '0.9rem', color: 'var(--ink-3)' }}>{email}</p> : null}
          </div>
          
          <div className="profile-actions" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
            <label
              className={`secondary-button profile-upload ${
                isUploading ? 'is-disabled' : ''
              }`}
              style={{ cursor: 'pointer', display: 'inline-block', padding: '8px 16px', borderRadius: 'var(--radius-bar)' }}
            >
              {isUploading ? 'Uploading...' : 'Change Photo'}
              <input
                type="file"
                accept="image/*"
                onChange={handleAvatarChange}
                disabled={isUploading}
                style={{ display: 'none' }}
              />
            </label>
            <p className="profile-hint" style={{ margin: 0, fontSize: '0.8rem', color: 'var(--ink-3)' }}>JPG, PNG or WebP max 5MB</p>
          </div>
          {avatarError ? <p className="form-error" style={{ marginTop: '12px' }}>{avatarError}</p> : null}
          {avatarStatus ? <p className="form-status" style={{ marginTop: '12px' }}>{avatarStatus}</p> : null}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Personal Records Card */}
          <div className="overview-card" style={{ padding: '24px', backgroundColor: 'var(--surface)', borderRadius: 'var(--radius-surface)', boxShadow: 'var(--shadow)', border: '1px solid var(--line)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', marginBottom: '16px' }}>
              <div>
                <p className="eyebrow" style={{ margin: '0 0 4px', fontSize: '0.85rem', fontWeight: 600, color: 'var(--ink-3)', textTransform: 'uppercase' }}>Personal Records</p>
                <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600, color: 'var(--ink)' }}>Personal Information</h2>
              </div>
              {biodataComplete !== null ? (
                <span className={`an-chip ${biodataComplete ? 'positive' : 'warning'}`} style={{ padding: '4px 12px', borderRadius: '999px', fontSize: '0.8rem', fontWeight: 600, backgroundColor: biodataComplete ? '#dcfce7' : '#fef3c7', color: biodataComplete ? '#15803d' : '#92400e' }}>
                  {biodataComplete ? 'Complete' : 'Incomplete'}
                </span>
              ) : null}
            </div>
            
            {biodata.status === 'loading' ? (
              <p className="profile-hint" style={{ color: 'var(--ink-3)' }}>Loading personal information…</p>
            ) : biodata.status === 'error' ? (
              <p className="profile-hint" style={{ color: 'var(--negative)' }}>Unable to load personal information right now.</p>
            ) : biodata.data ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '16px', marginBottom: '24px' }}>
                <div>
                  <p style={{ margin: '0 0 4px', fontSize: '0.85rem', fontWeight: 600, color: 'var(--ink-3)' }}>Birthdate</p>
                  <p style={{ margin: 0, fontSize: '0.95rem', color: 'var(--ink)' }}>{formatBirthdate(biodata.data.birthdate)}</p>
                </div>
                <div>
                  <p style={{ margin: '0 0 4px', fontSize: '0.85rem', fontWeight: 600, color: 'var(--ink-3)' }}>Sex</p>
                  <p style={{ margin: 0, fontSize: '0.95rem', color: 'var(--ink)' }}>{biodata.data.sex || '—'}</p>
                </div>
                <div>
                  <p style={{ margin: '0 0 4px', fontSize: '0.85rem', fontWeight: 600, color: 'var(--ink-3)' }}>Civil Status</p>
                  <p style={{ margin: 0, fontSize: '0.95rem', color: 'var(--ink)' }}>{biodata.data.civil_status || '—'}</p>
                </div>
                <div>
                  <p style={{ margin: '0 0 4px', fontSize: '0.85rem', fontWeight: 600, color: 'var(--ink-3)' }}>Citizenship</p>
                  <p style={{ margin: 0, fontSize: '0.95rem', color: 'var(--ink)' }}>{biodata.data.citizenship || '—'}</p>
                </div>
                <div>
                  <p style={{ margin: '0 0 4px', fontSize: '0.85rem', fontWeight: 600, color: 'var(--ink-3)' }}>Mobile Number</p>
                  <p style={{ margin: 0, fontSize: '0.95rem', color: 'var(--ink)' }}>{biodata.data.mobile_number || '—'}</p>
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <p style={{ margin: '0 0 4px', fontSize: '0.85rem', fontWeight: 600, color: 'var(--ink-3)' }}>Complete Address</p>
                  <p style={{ margin: 0, fontSize: '0.95rem', color: 'var(--ink)' }}>{biodata.data.complete_address || '—'}</p>
                </div>
              </div>
            ) : (
              <p className="profile-hint" style={{ color: 'var(--ink-3)', marginBottom: '24px' }}>
                You haven&apos;t filled out your personal information yet.
              </p>
            )}

            <button
              className={biodataComplete ? 'secondary-button' : 'primary-button'}
              onClick={() => navigate('/dashboard/profile/biodata')}
              style={{ width: '100%', justifyContent: 'center', padding: '10px' }}
            >
              {biodataComplete ? 'Edit Personal Information' : 'Complete Your Personal Information'}
            </button>
          </div>


          {/* Edit Profile / Account Settings Card */}
          <div className="overview-card" style={{ padding: '24px', backgroundColor: 'var(--surface)', borderRadius: 'var(--radius-surface)', boxShadow: 'var(--shadow)', border: '1px solid var(--line)' }}>
            <div style={{ marginBottom: '16px' }}>
              <p className="eyebrow" style={{ margin: '0 0 4px', fontSize: '0.85rem', fontWeight: 600, color: 'var(--ink-3)', textTransform: 'uppercase' }}>Edit Profile</p>
              <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600, color: 'var(--ink)' }}>Account Settings</h2>
            </div>
            <div className="profile-edit-options" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <button
                className="secondary-button"
                onClick={() => navigate('/dashboard/profile/update-details')}
                style={{ width: '100%', justifyContent: 'center', padding: '10px' }}
              >
                Update Personal Details
              </button>
              <button
                className="secondary-button"
                onClick={() => navigate('/dashboard/profile/change-password')}
                style={{ width: '100%', justifyContent: 'center', padding: '10px' }}
              >
                Change Password
              </button>
              <button
                className="secondary-button"
                onClick={() => navigate('/dashboard/profile/update-email')}
                style={{ width: '100%', justifyContent: 'center', padding: '10px' }}
              >
                Update Email Address
              </button>
            </div>
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
