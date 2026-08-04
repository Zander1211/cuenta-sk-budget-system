import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import ReCAPTCHA from 'react-google-recaptcha'
import { Eye, EyeOff } from 'lucide-react'
import { loginUser } from '../services/authService'
import { useAuditLog } from '../context/AuditLogContext'
import { useAuth } from '../context/AuthContext'
import logo from '../assets/logo.png'
import VantaClouds from '../components/VantaClouds'

function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [captchaToken, setCaptchaToken] = useState('')
  const [captchaError, setCaptchaError] = useState('')
  const recaptchaRef = useRef(null)

  const navigate = useNavigate()
  const { addLog } = useAuditLog()
  const { refreshSession, isAuthenticated } = useAuth()

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/dashboard', { replace: true })
    }
  }, [isAuthenticated, navigate])

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
      setCaptchaError("Please complete the CAPTCHA verification before logging in.")
      return
    }
    setCaptchaError('')

    const { error } = await loginUser(email, password, captchaToken)

    if (error) {
      addLog({
        action: 'User Login Failed',
        actionType: 'User Login',
        module: 'Authentication',
        recordType: 'User',
        description: `Failed login attempt for ${email}`,
        status: 'Failed',
        remarks: error.message,
        actor: email,
      })
      alert(error.message)
      if (recaptchaRef.current) {
        recaptchaRef.current.reset()
        setCaptchaToken('')
      }
      setCaptchaError(error.message)
      return
    }

    await refreshSession()
    addLog({
      action: 'User Login',
      actionType: 'User Login',
      module: 'Authentication',
      recordType: 'User',
      description: `${email} successfully logged into the system`,
      status: 'Success',
      actor: email,
    })
  }

  return (
    <div className="login-page">
      <VantaClouds />
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
              <div className="password-field">
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </label>

            <div className="captcha-instruction" style={{ marginTop: '24px', marginBottom: '8px', fontSize: '0.9rem', color: 'var(--ink-soft)', textAlign: 'center' }}>
              Please complete the CAPTCHA verification before logging in.
            </div>
            <div className="captcha-container" style={{ margin: '8px 0 16px 0', display: 'flex', justifyContent: 'center' }}>
              <ReCAPTCHA
                ref={recaptchaRef}
                sitekey={import.meta.env.VITE_RECAPTCHA_SITE_KEY || 'dummy_key'}
                onChange={(token) => {
                  setCaptchaToken(token)
                  setCaptchaError('')
                }}
                onExpired={() => {
                  setCaptchaToken('')
                  setCaptchaError('CAPTCHA expired. Please verify again.')
                }}
                onErrored={() => {
                  setCaptchaToken('')
                  setCaptchaError('CAPTCHA could not load correctly. Please refresh the page and try again.')
                }}
              />
            </div>
            {captchaError && (
              <div style={{ color: '#b91c1c', fontSize: '0.85rem', textAlign: 'center', marginBottom: '16px' }}>
                {captchaError}
              </div>
            )}

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
