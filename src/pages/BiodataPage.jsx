import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import RoleGate from '../components/RoleGate'
import { useAuditLog } from '../context/AuditLogContext'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabase/supabaseClient'
import { SEX_OPTIONS, CIVIL_STATUS_OPTIONS } from '../utils/biodata'

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

    const { error: upsertError } = await supabase.from('member_biodata').upsert({
      id: user.id,
      birthdate: form.birthdate || null,
      sex: form.sex || null,
      civil_status: form.civil_status || null,
      citizenship: form.citizenship.trim() || null,
      complete_address: form.complete_address.trim() || null,
      mobile_number: form.mobile_number.trim() || null,
      updated_at: new Date().toISOString(),
    })

    if (upsertError) {
      setError(upsertError.message)
      setIsSaving(false)
      return
    }

    addLog({
      action: 'Biodata Updated',
      actionType: 'Profile Updated',
      module: 'Authentication',
      recordType: 'User',
      description: `${user.email || 'A member'} updated their biodata.`,
      status: 'Success',
      actor: user.email,
    })

    setStatus('Biodata saved.')
    setIsSaving(false)
  }

  return (
    <RoleGate allow={['SK Chairman', 'SK Treasurer', 'SK Kagawad', 'Barangay Treasurer']}>
      <header className="dashboard-header">
        <div className="header-left">
          <div>
            <p className="eyebrow">Profile</p>
            <h1>Biodata</h1>
            <p>
              This personal information is kept on file for SK records and is visible to the SK
              Chairman.
            </p>
          </div>
        </div>
      </header>

      <section className="dashboard-content">
        <div className="overview-card">
          <p className="eyebrow">Personal Information</p>
          <h2>Your Biodata</h2>
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
                  {isSaving ? 'Saving...' : 'Save Biodata'}
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
