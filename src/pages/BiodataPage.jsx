import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import RoleGate from '../components/RoleGate'
import { useAuditLog } from '../context/AuditLogContext'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabase/supabaseClient'
import { SEX_OPTIONS, CIVIL_STATUS_OPTIONS, isBiodataComplete } from '../utils/biodata'

const emptyForm = {
  birthdate: '',
  sex: '',
  civil_status: '',
  citizenship: 'Filipino',
  complete_address: '',
  mobile_number: '',
}

function BiodataPage() {
  const { user } = useAuth()
  const { addLog } = useAuditLog()
  const navigate = useNavigate()

  const [form, setForm] = useState(emptyForm)
  const [isComplete, setIsComplete] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')

  useEffect(() => {
    let isMounted = true

    async function loadBiodata() {
      if (!user?.id) {
        setIsLoading(false)
        return
      }

      const { data, error: fetchError } = await supabase
        .from('member_biodata')
        .select('*')
        .eq('id', user.id)
        .maybeSingle()

      if (!isMounted) return

      if (fetchError) {
        setError('Unable to load your saved biodata. You can still fill it out below.')
      } else if (data) {
        setForm({
          birthdate: data.birthdate || '',
          sex: data.sex || '',
          civil_status: data.civil_status || '',
          citizenship: data.citizenship || 'Filipino',
          complete_address: data.complete_address || '',
          mobile_number: data.mobile_number || '',
        })
        setIsComplete(isBiodataComplete(data))
      }
      setIsLoading(false)
    }

    loadBiodata()
    return () => {
      isMounted = false
    }
  }, [user?.id])

  function handleChange(event) {
    const { name, value } = event.target
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setStatus('')

    if (!user?.id) {
      setError('No user session found. Please log in again.')
      return
    }

    setIsSaving(true)

    const payload = {
      id: user.id,
      birthdate: form.birthdate || null,
      sex: form.sex || null,
      civil_status: form.civil_status || null,
      citizenship: form.citizenship.trim() || null,
      complete_address: form.complete_address.trim() || null,
      mobile_number: form.mobile_number.trim() || null,
      updated_at: new Date().toISOString(),
    }

    const { error: upsertError } = await supabase.from('member_biodata').upsert(payload)

    if (upsertError) {
      setError(upsertError.message)
      setIsSaving(false)
      return
    }

    const nowComplete = isBiodataComplete(payload)
    setIsComplete(nowComplete)
    if (nowComplete) {
      window.sessionStorage.setItem('cuenta.biodataBannerDismissed', 'true')
    }

    addLog({
      action: 'Biodata Updated',
      actionType: 'Profile Updated',
      module: 'Authentication',
      recordType: 'User',
      description: `${user.email || 'A member'} updated their personal information.`,
      status: 'Success',
      actor: user.email,
    })

    window.dispatchEvent(new CustomEvent('cuenta:profile-updated'))

    setStatus('Personal information saved successfully.')
    setIsSaving(false)
  }

  return (
    <RoleGate allow={['SK Chairman', 'SK Treasurer', 'SK Kagawad', 'Barangay Treasurer']}>
      <header className="dashboard-header">
        <div className="header-left">
          <div>
            <p className="eyebrow">Profile</p>
            <h1>Personal Information</h1>
            <p>
              This personal information is kept on file for SK records and is visible to the SK
              Chairman.
            </p>
          </div>
        </div>
      </header>

      <section className="dashboard-content">
        <div className="overview-card" style={{ maxWidth: '860px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', marginBottom: '16px' }}>
            <div>
              <p className="eyebrow" style={{ margin: '0 0 4px', fontSize: '0.85rem', fontWeight: 600, color: 'var(--ink-3)', textTransform: 'uppercase' }}>Personal Records</p>
              <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600, color: 'var(--ink)' }}>Your Personal Information</h2>
            </div>
            {isComplete ? (
              <span className="an-chip positive" style={{ padding: '4px 12px', borderRadius: '999px', fontSize: '0.8rem', fontWeight: 600, backgroundColor: '#dcfce7', color: '#15803d' }}>
                Complete
              </span>
            ) : (
              <span className="an-chip warning" style={{ padding: '4px 12px', borderRadius: '999px', fontSize: '0.8rem', fontWeight: 600, backgroundColor: '#fef3c7', color: '#92400e' }}>
                Incomplete
              </span>
            )}
          </div>

          {isComplete ? (
            <div style={{ padding: '12px 16px', marginBottom: '20px', borderRadius: '8px', backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
              <span style={{ fontSize: '0.875rem' }}>Your personal records are already complete. You can update existing values here or via Update Personal Details.</span>
              <button
                type="button"
                className="secondary-button"
                onClick={() => navigate('/dashboard/profile/update-details')}
                style={{ fontSize: '0.825rem', padding: '6px 12px' }}
              >
                Update Personal Details
              </button>
            </div>
          ) : null}

          {isLoading ? (
            <p className="form-note">Loading...</p>
          ) : (
            <form className="user-form" onSubmit={handleSubmit}>
              <div className="form-grid">
                <label className="field">
                  <span>Birthdate</span>
                  <input
                    type="date"
                    name="birthdate"
                    value={form.birthdate}
                    onChange={handleChange}
                  />
                </label>
                <label className="field">
                  <span>Sex</span>
                  <select name="sex" value={form.sex} onChange={handleChange}>
                    <option value="">Select</option>
                    {SEX_OPTIONS.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Civil status</span>
                  <select name="civil_status" value={form.civil_status} onChange={handleChange}>
                    <option value="">Select</option>
                    {CIVIL_STATUS_OPTIONS.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Citizenship</span>
                  <input
                    type="text"
                    name="citizenship"
                    value={form.citizenship}
                    onChange={handleChange}
                    placeholder="Filipino"
                  />
                </label>
                <label className="field">
                  <span>Mobile number</span>
                  <input
                    type="tel"
                    name="mobile_number"
                    value={form.mobile_number}
                    onChange={handleChange}
                    placeholder="09XX XXX XXXX"
                  />
                </label>
                <label className="field" style={{ gridColumn: '1 / -1' }}>
                  <span>Complete address</span>
                  <textarea
                    name="complete_address"
                    rows="3"
                    value={form.complete_address}
                    onChange={handleChange}
                    placeholder="House No., Street, Barangay Upper Glad II, Midsayap, Cotabato"
                  />
                </label>
              </div>
              {error ? <p className="form-error">{error}</p> : null}
              {status ? <p className="form-status">{status}</p> : null}
              <div className="content-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => navigate('/dashboard/profile')}
                >
                  Back to Profile
                </button>
                <button type="submit" className="primary-button" disabled={isSaving}>
                  {isSaving ? 'Saving...' : 'Save Personal Information'}
                </button>
              </div>
            </form>
          )}
        </div>
      </section>
    </RoleGate>
  )
}

export default BiodataPage
