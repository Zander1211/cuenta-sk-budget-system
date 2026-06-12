import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import ReCAPTCHA from 'react-google-recaptcha'
import { loginUser } from '../services/authService'
import { useAuditLog } from '../context/AuditLogContext'
import { useAuth } from '../context/AuthContext'
import logo from '../assets/logo.png'

function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [captchaToken, setCaptchaToken] = useState('')
  const recaptchaRef = useRef(null)
  
  const navigate = useNavigate()
  const { addLog } = useAuditLog()
  const { refreshSession } = useAuth()

  // Workaround for Google reCAPTCHA accessibility warnings
  useEffect(() => {
    const timer = setInterval(() => {
      const textarea = document.getElementById('g-recaptcha-response')
      if (textarea && !textarea.hasAttribute('title')) {
        textarea.setAttribute('title', 'reCAPTCHA response')
        textarea.setAttribute('aria-hidden', 'true')
        clearInterval(timer)
      }
    }, 500)
    return () => clearInterval(timer)
  }, [])

  async function handleLogin(e) {
    e.preventDefault()

    if (!captchaToken) {
      alert("Please complete the CAPTCHA verification")
      return
    }

    const { error } = await loginUser(email, password, captchaToken)

    if (error) {
      alert(error.message)
      if (recaptchaRef.current) {
        recaptchaRef.current.reset()
        setCaptchaToken('')
      }
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

            <div className="captcha-container" style={{ margin: '16px 0', display: 'flex', justifyContent: 'center' }}>
              <ReCAPTCHA
                ref={recaptchaRef}
                sitekey={import.meta.env.VITE_RECAPTCHA_SITE_KEY || 'dummy_key'}
                onChange={(token) => setCaptchaToken(token)}
                onExpired={() => setCaptchaToken('')}
              />
            </div>

            <button type="submit" className="primary-button" disabled={!captchaToken}>
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