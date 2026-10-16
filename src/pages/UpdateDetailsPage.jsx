import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import RoleGate from '../components/RoleGate'
import { useAuditLog } from '../context/AuditLogContext'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabase/supabaseClient'
import { SEX_OPTIONS, CIVIL_STATUS_OPTIONS, isBiodataComplete } from '../utils/biodata'

function UpdateDetailsPage() {
  const { user, role, profileName, profileSurname, updateProfileDetails } = useAuth()
  const { addLog } = useAuditLog()
  const navigate = useNavigate()

  // Name Details State
  const [firstName, setFirstName] = useState(user?.user_metadata?.first_name || '')
  const [middleName, setMiddleName] = useState(user?.user_metadata?.middle_name || '')
  const [lastName, setLastName] = useState(user?.user_metadata?.last_name || '')
  const [nickname, setNickname] = useState(user?.user_metadata?.nickname || '')

  // Personal Information State (synchronized with member_biodata)
  const [birthdate, setBirthdate] = useState('')
  const [sex, setSex] = useState('')
  const [civilStatus, setCivilStatus] = useState('')
  const [citizenship, setCitizenship] = useState('Filipino')
  const [mobileNumber, setMobileNumber] = useState('')
  const [completeAddress, setCompleteAddress] = useState('')

  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [statusMessage, setStatusMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')

  const email = user?.email || ''
  const avatarUrl = user?.user_metadata?.avatar_url || ''
  const resolvedFullName =
    [firstName.trim(), middleName.trim(), lastName.trim()].filter(Boolean).join(' ') ||
    profileName ||
    user?.user_metadata?.full_name?.trim() ||
    ''
  const trimmedNickname = nickname.trim()
  const displayName =
    trimmedNickname || resolvedFullName || email.split('@')[0] || 'User'
  const formalTitle = [role, lastName.trim() || profileSurname].filter(Boolean).join(', ')

  function getInitials(value) {
    const cleaned = value?.trim()
    if (!cleaned) return 'U'
    const parts = cleaned.split(/\s+/).filter(Boolean)
    if (parts.length === 1) {
      return parts[0].slice(0, 2).toUpperCase()
    }
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
  }
  const initials = getInitials(displayName || email)

  // Live checklist items based on current inputs
  const requiredBioFields = [
    { key: 'birthdate', label: 'Birthdate', isDone: Boolean(birthdate) },
    { key: 'sex', label: 'Sex', isDone: Boolean(sex) },
    { key: 'civil_status', label: 'Civil Status', isDone: Boolean(civilStatus) },
    { key: 'citizenship', label: 'Citizenship', isDone: Boolean(citizenship.trim()) },
    { key: 'mobile_number', label: 'Mobile Number', isDone: Boolean(mobileNumber.trim()) },
    { key: 'complete_address', label: 'Complete Address', isDone: Boolean(completeAddress.trim()) },
  ]

  const completedBioCount = requiredBioFields.filter((f) => f.isDone).length
  const isNameDone = Boolean(firstName.trim() && lastName.trim())
  const isProfileComplete = completedBioCount === 6 && isNameDone
  const completionPercentage = Math.round((completedBioCount / 6) * 100)

  useEffect(() => {
    let isMounted = true

    async function loadPersonalDetails() {
      if (!user?.id) {
        setIsLoading(false)
        return
      }

      // Populate Name Details from user metadata if available
      const meta = user.user_metadata || {}
      if (meta.first_name) setFirstName(meta.first_name)
      if (meta.middle_name) setMiddleName(meta.middle_name)
      if (meta.last_name) setLastName(meta.last_name)
      if (meta.nickname) setNickname(meta.nickname)

      // Fallback if metadata split is missing but full_name exists
      if (!meta.first_name && !meta.last_name && meta.full_name) {
        const parts = meta.full_name.trim().split(/\s+/)
        if (parts.length > 1) {
          setFirstName(parts.slice(0, -1).join(' '))
          setLastName(parts[parts.length - 1])
        } else if (parts.length === 1) {
          setFirstName(parts[0])
        }
      }

      // Fetch Personal Information from member_biodata
      const { data: bioData, error: bioError } = await supabase
        .from('member_biodata')
        .select('*')
        .eq('id', user.id)
        .maybeSingle()

      if (!isMounted) return

      if (bioError) {
        console.warn('Could not load member biodata:', bioError.message)
      } else if (bioData) {
        setBirthdate(bioData.birthdate || '')
        setSex(bioData.sex || '')
        setCivilStatus(bioData.civil_status || '')
        setCitizenship(bioData.citizenship || 'Filipino')
        setMobileNumber(bioData.mobile_number || '')
        setCompleteAddress(bioData.complete_address || '')
      }

      setIsLoading(false)
    }

    loadPersonalDetails()
    return () => {
      isMounted = false
    }
  }, [user])

  async function handleSubmit(event) {
    event.preventDefault()
    setStatusMessage('')
    setErrorMessage('')

    const trimmedFirst = firstName.trim()
    const trimmedMiddle = middleName.trim()
    const trimmedLast = lastName.trim()
    const trimmedNick = nickname.trim()

    if (!trimmedFirst || !trimmedLast) {
      setErrorMessage('Enter both first name and surname.')
      return
    }

    if (!user?.id) {
      setErrorMessage('User session not found. Please log in again.')
      return
    }

    setIsSaving(true)
    const updatedFullName = [trimmedFirst, trimmedMiddle, trimmedLast].filter(Boolean).join(' ')
    const previousValue = {
      first_name: user?.user_metadata?.first_name || '',
      middle_name: user?.user_metadata?.middle_name || '',
      last_name: user?.user_metadata?.last_name || '',
      nickname: user?.user_metadata?.nickname || '',
      full_name: user?.user_metadata?.full_name || '',
    }

    // 1. Update Name Details in Auth & created_accounts
    const { error: updateError } = await updateProfileDetails({
      firstName: trimmedFirst,
      middleName: trimmedMiddle,
      lastName: trimmedLast,
      nickname: trimmedNick,
    })

    if (updateError) {
      setErrorMessage(`Failed to update name: ${updateError.message}`)
      setIsSaving(false)
      return
    }

    // 2. Synchronize and save Personal Information to member_biodata
    const biodataPayload = {
      id: user.id,
      birthdate: birthdate || null,
      sex: sex || null,
      civil_status: civilStatus || null,
      citizenship: citizenship.trim() || 'Filipino',
      complete_address: completeAddress.trim() || null,
      mobile_number: mobileNumber.trim() || null,
      updated_at: new Date().toISOString(),
    }

    const { error: bioError } = await supabase
      .from('member_biodata')
      .upsert(biodataPayload)

    if (bioError) {
      setErrorMessage(`Failed to save personal information: ${bioError.message}`)
      setIsSaving(false)
      return
    }

    // 3. If biodata is now complete, dismiss dashboard banner
    if (isBiodataComplete(biodataPayload)) {
      window.sessionStorage.setItem('cuenta.biodataBannerDismissed', 'true')
    }

    // 4. Audit Log
    const oldChairmanName = previousValue?.full_name || profileName || ''
    if (role === 'SK Chairman' && oldChairmanName && oldChairmanName !== updatedFullName) {
      addLog({
        action: 'SK Chairman Updated',
        actionType: 'SK Chairman Updated',
        module: 'User Management',
        recordType: 'User',
        recordId: user?.id,
        description: `Changed SK Chairman from ${oldChairmanName} to ${updatedFullName}`,
        previousValue: { full_name: oldChairmanName },
        newValue: { full_name: updatedFullName },
        status: 'Success',
      })
    } else {
      addLog({
        action: 'Profile Updated',
        actionType: 'Profile Updated',
        module: 'Authentication',
        recordType: 'User',
        recordId: user?.id,
        description: `Profile name and personal information updated for ${updatedFullName}`,
        previousValue,
        newValue: {
          first_name: trimmedFirst,
          middle_name: trimmedMiddle,
          last_name: trimmedLast,
          nickname: trimmedNick,
          full_name: updatedFullName,
          ...biodataPayload,
        },
        status: 'Success',
        actor: updatedFullName,
      })
    }

    // 5. Notify any mounted listeners for immediate UI reflection
    window.dispatchEvent(new CustomEvent('cuenta:profile-updated'))

    setStatusMessage('Personal details and information updated successfully.')
    setIsSaving(false)
  }

  return (
    <RoleGate allow={['SK Chairman', 'SK Treasurer', 'SK Kagawad', 'Barangay Treasurer']}>
      <header className="dashboard-header">
        <div className="header-left">
          <div>
            <p className="eyebrow">Profile</p>
            <h1>Update Personal Details</h1>
            <p>Modify your name and personal information records at any time.</p>
          </div>
        </div>
      </header>

      <section className="dashboard-content">
        <div className="update-details-layout">
          {/* Main Form Column (Left) */}
          <div className="overview-card" style={{ padding: '28px', backgroundColor: 'var(--surface)', borderRadius: 'var(--radius-surface)', border: '1px solid var(--line)', boxShadow: 'var(--shadow)' }}>
            {isLoading ? (
              <p className="form-note">Loading your current personal details…</p>
            ) : (
              <form className="user-form" onSubmit={handleSubmit}>
                {/* Section 1: Name Details */}
                <div style={{ marginBottom: '28px' }}>
                  <p className="eyebrow" style={{ margin: '0 0 4px', fontSize: '0.85rem', fontWeight: 600, color: 'var(--ink-3)', textTransform: 'uppercase' }}>
                    Name Information
                  </p>
                  <h2 style={{ margin: '0 0 16px', fontSize: '1.25rem', fontWeight: 600, color: 'var(--ink)' }}>
                    Name Details
                  </h2>
                  <div className="update-details-name-grid">
                    <label className="field">
                      <span>First name *</span>
                      <input
                        type="text"
                        value={firstName}
                        onChange={(event) => setFirstName(event.target.value)}
                        placeholder="Juan"
                        required
                      />
                    </label>
                    <label className="field">
                      <span>Middle name (optional)</span>
                      <input
                        type="text"
                        value={middleName}
                        onChange={(event) => setMiddleName(event.target.value)}
                        placeholder="Miguel"
                      />
                    </label>
                    <label className="field">
                      <span>Surname *</span>
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
                </div>

                {/* Section 2: Personal Information */}
                <div style={{ paddingTop: '24px', borderTop: '1px solid var(--line)', marginBottom: '24px' }}>
                  <div style={{ marginBottom: '16px' }}>
                    <p className="eyebrow" style={{ margin: '0 0 4px', fontSize: '0.85rem', fontWeight: 600, color: 'var(--ink-3)', textTransform: 'uppercase' }}>
                      Personal Records
                    </p>
                    <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600, color: 'var(--ink)' }}>
                      Personal Information
                    </h2>
                  </div>

                  <div className="update-details-records-grid">
                    <label className="field">
                      <span>Birthdate</span>
                      <input
                        type="date"
                        value={birthdate}
                        onChange={(event) => setBirthdate(event.target.value)}
                      />
                    </label>

                    <label className="field">
                      <span>Sex</span>
                      <select
                        value={sex}
                        onChange={(event) => setSex(event.target.value)}
                      >
                        <option value="">Select Sex</option>
                        {SEX_OPTIONS.map((option) => (
                          <option key={option} value={option}>{option}</option>
                        ))}
                      </select>
                    </label>

                    <label className="field">
                      <span>Civil Status</span>
                      <select
                        value={civilStatus}
                        onChange={(event) => setCivilStatus(event.target.value)}
                      >
                        <option value="">Select Civil Status</option>
                        {CIVIL_STATUS_OPTIONS.map((option) => (
                          <option key={option} value={option}>{option}</option>
                        ))}
                      </select>
                    </label>

                    <label className="field">
                      <span>Citizenship</span>
                      <input
                        type="text"
                        value={citizenship}
                        onChange={(event) => setCitizenship(event.target.value)}
                        placeholder="Filipino"
                      />
                    </label>

                    <label className="field" style={{ gridColumn: '1 / -1' }}>
                      <span>Mobile Number</span>
                      <input
                        type="tel"
                        value={mobileNumber}
                        onChange={(event) => setMobileNumber(event.target.value)}
                        placeholder="09XX XXX XXXX"
                      />
                    </label>

                    <label className="field" style={{ gridColumn: '1 / -1' }}>
                      <span>Complete Address</span>
                      <textarea
                        rows="3"
                        value={completeAddress}
                        onChange={(event) => setCompleteAddress(event.target.value)}
                        placeholder="House No., Street, Barangay Upper Glad II, Midsayap, Cotabato"
                      />
                    </label>
                  </div>
                </div>

                {errorMessage ? <p className="form-error">{errorMessage}</p> : null}
                {statusMessage ? <p className="form-status">{statusMessage}</p> : null}

                <div className="content-actions" style={{ marginTop: '24px' }}>
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
                    disabled={isSaving}
                  >
                    {isSaving ? 'Saving Changes...' : 'Save Changes'}
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* Right Sidebar Column */}
          <aside style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Card 1: Profile Preview & Live Status */}
            <div
              className="overview-card"
              style={{
                padding: '24px',
                backgroundColor: 'var(--surface)',
                borderRadius: 'var(--radius-surface)',
                border: '1px solid var(--line)',
                boxShadow: 'var(--shadow)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '16px' }}>
                <div style={{ position: 'relative', flexShrink: 0 }}>
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt={`${displayName} profile`}
                      style={{
                        width: '56px',
                        height: '56px',
                        borderRadius: '50%',
                        objectFit: 'cover',
                        border: '3px solid #f3f4f6',
                      }}
                    />
                  ) : (
                    <span
                      style={{
                        width: '56px',
                        height: '56px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '1.35rem',
                        fontWeight: 700,
                        backgroundColor: 'var(--surface-2)',
                        borderRadius: '50%',
                        color: 'var(--ink-3)',
                      }}
                    >
                      {initials}
                    </span>
                  )}
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <h3
                    style={{
                      margin: '0 0 2px',
                      fontSize: '1.05rem',
                      fontWeight: 700,
                      color: 'var(--ink)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {displayName}
                  </h3>
                  {formalTitle ? (
                    <p
                      style={{
                        margin: '0 0 2px',
                        fontSize: '0.85rem',
                        fontWeight: 600,
                        color: 'var(--ink-2)',
                      }}
                    >
                      {formalTitle}
                    </p>
                  ) : null}
                  {email ? (
                    <p
                      style={{
                        margin: 0,
                        fontSize: '0.78rem',
                        color: 'var(--ink-3)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {email}
                    </p>
                  ) : null}
                </div>
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 14px',
                  borderRadius: '8px',
                  backgroundColor: isProfileComplete ? '#f0fdf4' : '#fffbeb',
                  border: `1px solid ${isProfileComplete ? '#bbf7d0' : '#fef3c7'}`,
                  marginBottom: '16px',
                }}
              >
                <span
                  style={{
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    color: isProfileComplete ? '#166534' : '#92400e',
                  }}
                >
                  Profile Status
                </span>
                <span
                  className={`an-chip ${isProfileComplete ? 'positive' : 'warning'}`}
                  style={{
                    padding: '2px 10px',
                    borderRadius: '999px',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    backgroundColor: isProfileComplete ? '#dcfce7' : '#fef3c7',
                    color: isProfileComplete ? '#15803d' : '#92400e',
                  }}
                >
                  {isProfileComplete ? 'Complete' : 'Incomplete'}
                </span>
              </div>

              {/* Completion Progress Bar */}
              <div style={{ marginBottom: '16px' }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '6px',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    color: 'var(--ink-2)',
                  }}
                >
                  <span>Completion Progress</span>
                  <span>{completedBioCount} of 6 records ({completionPercentage}%)</span>
                </div>
                <div
                  style={{
                    width: '100%',
                    height: '8px',
                    backgroundColor: 'var(--surface-2, #e5e7eb)',
                    borderRadius: '999px',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      width: `${completionPercentage}%`,
                      height: '100%',
                      backgroundColor: isProfileComplete ? '#15803d' : 'var(--accent, #0B583F)',
                      borderRadius: '999px',
                      transition: 'width 0.3s ease',
                    }}
                  />
                </div>
              </div>

              {/* Checklist */}
              <p
                className="eyebrow"
                style={{
                  margin: '0 0 10px',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  color: 'var(--ink-3)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                }}
              >
                Required Records Checklist
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '0.85rem',
                    color: isNameDone ? 'var(--ink)' : 'var(--ink-3)',
                  }}
                >
                  <span
                    style={{
                      width: '18px',
                      height: '18px',
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      backgroundColor: isNameDone ? '#dcfce7' : 'var(--surface-2, #f3f4f6)',
                      color: isNameDone ? '#15803d' : 'var(--ink-3)',
                    }}
                  >
                    {isNameDone ? '✓' : '○'}
                  </span>
                  <span>First Name & Surname</span>
                </div>
                {requiredBioFields.map((field) => (
                  <div
                    key={field.key}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      fontSize: '0.85rem',
                      color: field.isDone ? 'var(--ink)' : 'var(--ink-3)',
                    }}
                  >
                    <span
                      style={{
                        width: '18px',
                        height: '18px',
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        backgroundColor: field.isDone ? '#dcfce7' : 'var(--surface-2, #f3f4f6)',
                        color: field.isDone ? '#15803d' : 'var(--ink-3)',
                      }}
                    >
                      {field.isDone ? '✓' : '○'}
                    </span>
                    <span>{field.label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Card 2: Security & Records Policy */}
            <div
              className="overview-card"
              style={{
                padding: '20px 24px',
                backgroundColor: 'var(--surface)',
                borderRadius: 'var(--radius-surface)',
                border: '1px solid var(--line)',
                boxShadow: 'var(--shadow)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                <span style={{ fontSize: '1.25rem' }}>🛡️</span>
                <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600, color: 'var(--ink)' }}>
                  Official Barangay Records
                </h4>
              </div>
              <p style={{ margin: 0, fontSize: '0.825rem', color: 'var(--ink-2)', lineHeight: 1.5 }}>
                All personal records are kept strictly confidential and preserved for official Sangguniang
                Kabataan administration files in accordance with the Data Privacy Act of 2012 (RA 10173).
              </p>
            </div>

            {/* Card 3: Account Shortcuts */}
            <div
              className="overview-card"
              style={{
                padding: '20px 24px',
                backgroundColor: 'var(--surface)',
                borderRadius: 'var(--radius-surface)',
                border: '1px solid var(--line)',
                boxShadow: 'var(--shadow)',
              }}
            >
              <p
                className="eyebrow"
                style={{
                  margin: '0 0 6px',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  color: 'var(--ink-3)',
                  textTransform: 'uppercase',
                }}
              >
                Account Shortcuts
              </p>
              <h4 style={{ margin: '0 0 12px', fontSize: '0.95rem', fontWeight: 600, color: 'var(--ink)' }}>
                Security Settings
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => navigate('/dashboard/profile/change-password')}
                  style={{ width: '100%', justifyContent: 'center', padding: '8px', fontSize: '0.85rem' }}
                >
                  Change Password
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => navigate('/dashboard/profile/update-email')}
                  style={{ width: '100%', justifyContent: 'center', padding: '8px', fontSize: '0.85rem' }}
                >
                  Update Email Address
                </button>
              </div>
            </div>
          </aside>
        </div>
      </section>
    </RoleGate>
  )
}

export default UpdateDetailsPage
