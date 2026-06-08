import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import RoleGate from '../components/RoleGate'
import { useAuditLog } from '../context/AuditLogContext'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabase/supabaseClient'

function UpdateDetailsPage() {
  const { user, refreshSession } = useAuth()
  const { addLog } = useAuditLog()
  const navigate = useNavigate()

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

  useEffect(() => {
    setFirstName(user?.user_metadata?.first_name || '')
    setLastName(user?.user_metadata?.last_name || '')
    setNickname(user?.user_metadata?.nickname || '')
  }, [user])

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
                Save Name
              </button>
            </div>
          </form>
        </div>
      </section>
    </RoleGate>
  )
}

export default UpdateDetailsPage
