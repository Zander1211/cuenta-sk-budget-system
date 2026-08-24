import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import RoleGate from '../components/RoleGate'
import { useAuditLog } from '../context/AuditLogContext'
import { useAuth } from '../context/AuthContext'

function UpdateDetailsPage() {
  const { user, updateProfileDetails } = useAuth()
  const { addLog } = useAuditLog()
  const navigate = useNavigate()

  const [firstName, setFirstName] = useState(
    user?.user_metadata?.first_name || ''
  )
  const [middleName, setMiddleName] = useState(user?.user_metadata?.middle_name || '')
  const [lastName, setLastName] = useState(user?.user_metadata?.last_name || '')
  const [nickname, setNickname] = useState(
    user?.user_metadata?.nickname || ''
  )
  const [nameStatus, setNameStatus] = useState('')
  const [nameError, setNameError] = useState('')
  const [isSavingName, setIsSavingName] = useState(false)

  async function handleNameSave(event) {
    event.preventDefault()
    setNameStatus('')
    setNameError('')

    const trimmedFirst = firstName.trim()
    const trimmedMiddle = middleName.trim()
    const trimmedLast = lastName.trim()
    const trimmedNick = nickname.trim()

    if (!trimmedFirst || !trimmedLast) {
      setNameError('Enter both first name and surname.')
      return
    }

    setIsSavingName(true)
    const updatedFullName = [trimmedFirst, trimmedMiddle, trimmedLast].filter(Boolean).join(' ')
    const previousValue = {
      first_name: user?.user_metadata?.first_name || '',
      middle_name: user?.user_metadata?.middle_name || '',
      last_name: user?.user_metadata?.last_name || '',
      nickname: user?.user_metadata?.nickname || '',
      full_name: user?.user_metadata?.full_name || '',
    }
    const { error: updateError } = await updateProfileDetails({
      firstName: trimmedFirst,
      middleName: trimmedMiddle,
      lastName: trimmedLast,
      nickname: trimmedNick,
    })

    if (updateError) {
      setNameError(updateError.message)
      setIsSavingName(false)
      return
    }

    addLog({
      action: 'Profile Updated',
      actionType: 'Profile Updated',
      module: 'Authentication',
      recordType: 'User',
      recordId: user?.id,
      description: `Profile name updated to ${updatedFullName}`,
      previousValue,
      newValue: {
        first_name: trimmedFirst,
        middle_name: trimmedMiddle,
        last_name: trimmedLast,
        nickname: trimmedNick,
        full_name: updatedFullName,
      },
      status: 'Success',
      actor: updatedFullName,
    })
    setNameStatus('Name updated successfully.')
    setIsSavingName(false)
  }

  return (
    <RoleGate allow={['SK Chairman', 'SK Treasurer', 'SK Kagawad', 'Barangay Treasurer']}>
      <header className="dashboard-header">
        <div className="header-left">
          <div>
            <p className="eyebrow">Profile</p>
            <h1>Update name details</h1>
            <p>Update your personal information.</p>
          </div>
        </div>
      </header>

      <section className="dashboard-content">
        <div className="overview-card">
          <p className="eyebrow">Name</p>
          <h2>Personal Details</h2>
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
                <span>Middle name (optional)</span>
                <input
                  type="text"
                  value={middleName}
                  onChange={(event) => setMiddleName(event.target.value)}
                  placeholder="Miguel"
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
                disabled={isSavingName}
              >
                {isSavingName ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>
      </section>
    </RoleGate>
  )
}

export default UpdateDetailsPage
