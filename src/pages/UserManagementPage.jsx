import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useAuditLog } from '../context/AuditLogContext'
import RoleGate from '../components/RoleGate'
import { supabase, supabaseAnonKey, supabaseUrl } from '../supabase/supabaseClient'

const roles = ['SK Treasurer', 'SK Kagawad', 'Barangay Treasurer']
const adminClient = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
})

function UserManagementPage() {
  const [formState, setFormState] = useState({
    name: '',
    email: '',
    password: '',
    role: roles[0],
  })
  const [accounts, setAccounts] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formError, setFormError] = useState('')
  const [formStatus, setFormStatus] = useState('')
  const { addLog } = useAuditLog()

  useEffect(() => {
    async function loadAccounts() {
      const { data, error } = await supabase
        .from('created_accounts')
        .select('id, full_name, email, role, created_at')
        .order('created_at', { ascending: false })

      if (error) {
        setFormError('Create the created_accounts table to load users.')
        setIsLoading(false)
        return
      }

      setAccounts(data ?? [])
      setIsLoading(false)
    }

    loadAccounts()
  }, [])

  function handleChange(event) {
    const { name, value } = event.target
    setFormState((prev) => ({
      ...prev,
      [name]: value,
    }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setFormError('')
    setFormStatus('')

    const name = formState.name.trim()
    const email = formState.email.trim()
    const password = formState.password.trim()

    if (!name || !email || !password) {
      return
    }

    setIsSubmitting(true)

    const { data, error } = await adminClient.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: name,
          role: formState.role,
        },
      },
    })

    if (error) {
      setFormError(error.message)
      setIsSubmitting(false)
      return
    }

    if (!data.user?.id) {
      setFormError('Unable to create the account. Try again.')
      setIsSubmitting(false)
      return
    }

    const { error: insertError } = await supabase.from('created_accounts').insert({
      id: data.user.id,
      full_name: name,
      email,
      role: formState.role,
    })

    if (insertError) {
      setFormError(insertError.message)
      setIsSubmitting(false)
      return
    }

    addLog({ action: `Created account for ${name} (${formState.role})` })
    setFormStatus('Account created. The user can log in after email verification.')

    setFormState({
      name: '',
      email: '',
      password: '',
      role: roles[0],
    })

    const { data: refreshed } = await supabase
      .from('created_accounts')
      .select('id, full_name, email, role, created_at')
      .order('created_at', { ascending: false })
    setAccounts(refreshed ?? [])
    setIsSubmitting(false)
  }

  return (
    <RoleGate allow={['SK Chairman']}>
      <header className="dashboard-header">
        <div className="header-left">
          <div>
            <p className="eyebrow">User Management</p>
            <h1>Create and assign user accounts</h1>
            <p>
              The SK Chairman can create accounts and assign roles for SK
              Treasurer, SK Kagawad, or Barangay Treasurer.
            </p>
          </div>
        </div>
      </header>

      <section className="dashboard-content">
        <div className="user-management-grid">
          <div className="overview-card">
            <p className="eyebrow">New account</p>
            <h2>Create a user</h2>
            <form className="user-form" onSubmit={handleSubmit}>
              <label className="field">
                <span>Full name</span>
                <input
                  type="text"
                  name="name"
                  value={formState.name}
                  onChange={handleChange}
                  placeholder="Juan Dela Cruz"
                  required
                />
              </label>

              <label className="field">
                <span>Email address</span>
                <input
                  type="email"
                  name="email"
                  value={formState.email}
                  onChange={handleChange}
                  placeholder="user@barangay.gov"
                  required
                />
              </label>

              <label className="field">
                <span>Password</span>
                <input
                  type="password"
                  name="password"
                  value={formState.password}
                  onChange={handleChange}
                  placeholder="Create a temporary password"
                  required
                />
              </label>

              <label className="field">
                <span>Role</span>
                <select
                  name="role"
                  value={formState.role}
                  onChange={handleChange}
                >
                  {roles.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>
              </label>

              <p className="form-note">
                Accounts created here are assigned directly by the SK Chairman.
              </p>

              {formError ? <p className="form-error">{formError}</p> : null}
              {formStatus ? <p className="form-status">{formStatus}</p> : null}

              <button
                type="submit"
                className="primary-button"
                disabled={isSubmitting}
              >
                Create Account
              </button>
            </form>
          </div>

          <div className="overview-card">
            <p className="eyebrow">Directory</p>
            <h2>Created accounts</h2>
            <table className="user-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan="3" className="empty-state">
                      Loading accounts...
                    </td>
                  </tr>
                ) : accounts.length ? (
                  accounts.map((user) => (
                    <tr key={user.id}>
                      <td>{user.full_name}</td>
                      <td>{user.email}</td>
                      <td>
                        <span className="role-pill">{user.role}</span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="3" className="empty-state">
                      No accounts yet. Create the first user.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </RoleGate>
  )
}

export default UserManagementPage
