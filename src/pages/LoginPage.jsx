import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { loginUser } from '../services/authService'
import { useAuditLog } from '../context/AuditLogContext'
import { useAuth } from '../context/AuthContext'
import logo from '../assets/logo.png'

function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const navigate = useNavigate()
  const { addLog } = useAuditLog()
  const { refreshSession } = useAuth()

  async function handleLogin(e) {
    e.preventDefault()

    const { data, error } = await loginUser(email, password)

    if (error) {
      alert(error.message)
      return
    }

    await refreshSession()
    addLog({ action: 'Logged in', actor: email || 'SK Chairman' })
    navigate('/dashboard')
  }

  return (
    <div className="login-page">
      <div className="login-shell">
        <section className="login-panel">
          <header className="login-header">
            <div className="login-logo-container">
              <img src={logo} alt="Cuenta Logo" className="login-logo" />
            </div>
            <p className="eyebrow">Welcome back</p>
            <h2>Sign in to Cuenta</h2>
            <p className="subcopy">Use your work email to continue.</p>
          </header>

          <form onSubmit={handleLogin} className="login-form">
            <label className="field">
              <span>Email</span>
              <input
                type="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </label>

            <label className="field">
              <span>Password</span>
              <div className="field-row">
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  className="text-button"
                  onClick={() => setShowPassword((prev) => !prev)}
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            </label>

            <button type="submit" className="primary-button">
              Login
            </button>
          </form>

          <div className="login-footer">
            <span>Need access?</span>
            <button type="button" className="ghost-button">
              Request an invite
            </button>
          </div>
        </section>
      </div>
    </div>
  )
}

export default LoginPage