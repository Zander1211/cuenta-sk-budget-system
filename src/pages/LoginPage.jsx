import { useState, useRef, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import ReCAPTCHA from 'react-google-recaptcha'
import { AlertCircle, ArrowLeft, CheckCircle2, Eye, EyeOff, FileText, Lock, ShieldCheck } from 'lucide-react'
import { loginUser, registerUser } from '../services/authService'
import { useAuditLog } from '../context/AuditLogContext'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabase/supabaseClient'
import logo from '../assets/logo.png'
import './LoginPage.css'

const GMAIL_PATTERN = /^[a-zA-Z0-9._%+-]+@gmail\.com$/i

function FieldError({ id, children }) {
  if (!children) return null
  return (
    <span className="auth-field-error" id={id}>
      <AlertCircle aria-hidden="true" />
      {children}
    </span>
  )
}

function Alert({ tone, children }) {
  if (!children) return null
  const Icon = tone === 'success' ? CheckCircle2 : AlertCircle
  return (
    <div className={`auth-alert auth-alert--${tone}`} role={tone === 'success' ? 'status' : 'alert'}>
      <Icon aria-hidden="true" />
      <span>{children}</span>
    </div>
  )
}

function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [captchaToken, setCaptchaToken] = useState('')
  const [hasChairman, setHasChairman] = useState(null)
  const [isRegistering, setIsRegistering] = useState(false)
  const [formStatus, setFormStatus] = useState('')
  const [formError, setFormError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [isSubmitting, setIsSubmitting] = useState(false)

  const [verificationStep, setVerificationStep] = useState(false)
  const [otpCode, setOtpCode] = useState('')
  const [pendingUser, setPendingUser] = useState(null)

  const recaptchaRef = useRef(null)

  const navigate = useNavigate()
  const { addLog } = useAuditLog()
  const { refreshSession, isAuthenticated } = useAuth()

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/dashboard', { replace: true })
    }
  }, [isAuthenticated, navigate])

  useEffect(() => {
    async function checkChairman() {
      const { data, error } = await supabase.rpc('has_sk_chairman')
      if (!error) {
        setHasChairman(data)
      } else {
        // If RPC fails (e.g., migration not run), assume we can't register securely
        setHasChairman(true)
      }
    }
    checkChairman()
  }, [])

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

  function clearMessages() {
    setFormError('')
    setFormStatus('')
    setFieldErrors({})
  }

  function resetCaptcha() {
    if (recaptchaRef.current) recaptchaRef.current.reset()
    setCaptchaToken('')
  }

  async function handleLogin(e) {
    e.preventDefault()
    clearMessages()

    if (!captchaToken) {
      setFieldErrors({ captcha: 'Complete the CAPTCHA to continue.' })
      return
    }

    setIsSubmitting(true)
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
      // Reported inline rather than through a blocking dialog: the user needs
      // to see the message next to the form they are about to correct.
      setFormError(error.message)
      resetCaptcha()
      setIsSubmitting(false)
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
    setIsSubmitting(false)
  }

  async function handleRegister(e) {
    e.preventDefault()
    clearMessages()

    if (!captchaToken) {
      setFieldErrors({ captcha: 'Complete the CAPTCHA to continue.' })
      return
    }

    if (!GMAIL_PATTERN.test(email)) {
      setFieldErrors({ email: 'Enter a valid Gmail address, for example name@gmail.com.' })
      return
    }

    setIsSubmitting(true)

    try {
      // Send custom OTP via our Gmail SMTP backend
      const res = await fetch('/api/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })

      const result = await res.json()

      if (!res.ok) {
        setFormError(result.error || 'Failed to send verification code.')
        setIsSubmitting(false)
        return
      }

      // Move to verification step
      setPendingUser({ fullName, email, password })
      setVerificationStep(true)
      setFormStatus(`Verification code sent. Check the inbox of ${email}.`)
      setIsSubmitting(false)
    } catch (err) {
      setFormError(`Failed to send verification code: ${err.message}`)
      setIsSubmitting(false)
    }
  }

  async function handleVerifyOtp(event) {
    event.preventDefault()
    clearMessages()

    if (!otpCode.trim()) {
      setFieldErrors({ otp: 'Enter the 6-digit code from your email.' })
      return
    }

    setIsSubmitting(true)

    try {
      // Verify the custom OTP
      const verifyRes = await fetch('/api/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: pendingUser.email, code: otpCode.trim() }),
      })

      const verifyResult = await verifyRes.json()

      if (!verifyRes.ok) {
        setFieldErrors({ otp: verifyResult.error || 'That code is not valid. Check it and try again.' })
        setIsSubmitting(false)
        return
      }

      // Code verified! Now finalize registration
      const { error } = await registerUser(pendingUser.email, pendingUser.password, {
        data: {
          full_name: pendingUser.fullName,
          role: 'SK Chairman',
        },
      })

      if (error) {
        setFormError(error.message)
        setIsSubmitting(false)
        return
      }

      setFormStatus('SK Chairman account registered. You can now sign in.')
      setIsSubmitting(false)
      setEmail('')
      setPassword('')
      setFullName('')
      setVerificationStep(false)
      setOtpCode('')
      setPendingUser(null)
      resetCaptcha()

      // Check chairman again so we can hide the form
      const { data: newHasChairman } = await supabase.rpc('has_sk_chairman')
      setHasChairman(newHasChairman)
      if (newHasChairman) {
        setIsRegistering(false)
      }
    } catch (err) {
      setFormError(`Verification failed: ${err.message}`)
      setIsSubmitting(false)
    }
  }

  async function handleResendOtp() {
    clearMessages()
    setIsSubmitting(true)

    try {
      const res = await fetch('/api/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: pendingUser.email }),
      })

      const result = await res.json()

      if (!res.ok) {
        setFormError(result.error || 'Failed to resend code.')
      } else {
        setFormStatus(`Verification code resent to ${pendingUser.email}.`)
      }
    } catch (err) {
      setFormError(`Failed to resend code: ${err.message}`)
    }
    setIsSubmitting(false)
  }

  function handleCancelVerification() {
    setVerificationStep(false)
    setOtpCode('')
    setPendingUser(null)
    clearMessages()
  }

  function toggleRegistering() {
    setIsRegistering(value => !value)
    clearMessages()
    setEmail('')
    setPassword('')
    setFullName('')
  }

  const registrationBlocked = isRegistering && hasChairman
  const fieldsDisabled = isSubmitting || registrationBlocked

  return (
    <div className="login-page">
      <Link to="/" className="login-transparency-back">
        <ArrowLeft size={16} aria-hidden="true" />
        Back to Transparency Portal
      </Link>

      <div className="login-shell">
        <section className="login-panel">
          <header className="login-header">
            <div className="login-logo-container">
              <img src={logo} alt="" className="login-logo" />
            </div>
            <p className="eyebrow">{isRegistering ? 'Initial setup' : 'Staff access'}</p>
            <h2>{isRegistering ? 'Register the SK Chairman' : 'Sign in to Cuenta'}</h2>
            <p className="subcopy">
              {isRegistering
                ? 'Create the master account for the SK Chairman. This can only be done once.'
                : 'Records, receipts and approvals live behind this door. Public figures need no account.'}
            </p>

            <ul className="login-assurance">
              <li>
                <ShieldCheck aria-hidden="true" />
                <span>Every sign-in attempt is recorded in the audit trail.</span>
              </li>
              <li>
                <Lock aria-hidden="true" />
                <span>Accounts are created by the SK Chairman, never self-served.</span>
              </li>
              <li>
                <FileText aria-hidden="true" />
                <span>Published project figures stay open to the public without an account.</span>
              </li>
            </ul>
          </header>

          <div className="login-right-side">
            {verificationStep ? (
              <form onSubmit={handleVerifyOtp} className="login-form" noValidate>
                <button type="button" className="auth-back" onClick={handleCancelVerification}>
                  <ArrowLeft size={16} aria-hidden="true" />
                  Cancel
                </button>

                <div className="login-form-title">
                  <h3>Verify your email address</h3>
                  <p>
                    Enter the 6-digit code sent to <strong>{pendingUser?.email}</strong>
                  </p>
                </div>

                <Alert tone="error">{formError}</Alert>
                <Alert tone="success">{formStatus}</Alert>

                <label className="auth-field" data-invalid={Boolean(fieldErrors.otp)}>
                  <span>Verification code</span>
                  <input
                    className="otp-input"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="000000"
                    value={otpCode}
                    onChange={e => setOtpCode(e.target.value)}
                    required
                    disabled={isSubmitting}
                    maxLength={6}
                    aria-describedby={fieldErrors.otp ? 'otp-error' : undefined}
                    aria-invalid={Boolean(fieldErrors.otp)}
                  />
                  <FieldError id="otp-error">{fieldErrors.otp}</FieldError>
                </label>

                <div className="auth-actions">
                  <button type="submit" className="auth-btn auth-btn--primary" disabled={isSubmitting}>
                    {isSubmitting && <span className="auth-spinner" aria-hidden="true" />}
                    {isSubmitting ? 'Verifying' : 'Verify and continue'}
                  </button>
                  <button
                    type="button"
                    className="auth-btn auth-btn--secondary"
                    onClick={handleResendOtp}
                    disabled={isSubmitting}
                  >
                    Resend code
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={isRegistering ? handleRegister : handleLogin} className="login-form" noValidate>
                {isRegistering && (
                  <button type="button" className="auth-back" onClick={toggleRegistering}>
                    <ArrowLeft size={16} aria-hidden="true" />
                    Back to sign in
                  </button>
                )}

                {registrationBlocked && (
                  <Alert tone="error">An SK Chairman account already exists. Only one SK Chairman is allowed.</Alert>
                )}

                <Alert tone="error">{formError}</Alert>
                <Alert tone="success">{formStatus}</Alert>

                {isRegistering && (
                  <label className="auth-field">
                    <span>Full name</span>
                    <input
                      type="text"
                      autoComplete="name"
                      placeholder="Juan Dela Cruz"
                      value={fullName}
                      onChange={e => setFullName(e.target.value)}
                      required={isRegistering}
                      disabled={fieldsDisabled}
                    />
                  </label>
                )}

                <label className="auth-field" data-invalid={Boolean(fieldErrors.email)}>
                  <span>Email</span>
                  <input
                    type="email"
                    autoComplete={isRegistering ? 'email' : 'username'}
                    placeholder="you@gmail.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                    disabled={fieldsDisabled}
                    aria-describedby={fieldErrors.email ? 'email-error' : undefined}
                    aria-invalid={Boolean(fieldErrors.email)}
                  />
                  <FieldError id="email-error">{fieldErrors.email}</FieldError>
                </label>

                <label className="auth-field">
                  <span>Password</span>
                  <div className="password-field">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      autoComplete={isRegistering ? 'new-password' : 'current-password'}
                      placeholder="Enter your password"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      required
                      disabled={fieldsDisabled}
                    />
                    <button
                      type="button"
                      className="password-toggle"
                      onClick={() => setShowPassword(prev => !prev)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      aria-pressed={showPassword}
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </label>

                <div className="auth-field">
                  <div className="captcha-container" data-invalid={Boolean(fieldErrors.captcha)}>
                    <ReCAPTCHA
                      ref={recaptchaRef}
                      sitekey={import.meta.env.VITE_RECAPTCHA_SITE_KEY || 'dummy_key'}
                      onChange={token => {
                        setCaptchaToken(token)
                        setFieldErrors(errors => ({ ...errors, captcha: '' }))
                      }}
                      onExpired={() => {
                        setCaptchaToken('')
                        setFieldErrors(errors => ({ ...errors, captcha: 'The CAPTCHA expired. Verify again.' }))
                      }}
                      onErrored={() => {
                        setCaptchaToken('')
                        setFieldErrors(errors => ({
                          ...errors,
                          captcha: 'The CAPTCHA could not load. Refresh the page and try again.',
                        }))
                      }}
                    />
                  </div>
                  <FieldError id="captcha-error">{fieldErrors.captcha}</FieldError>
                </div>

                <button type="submit" className="auth-btn auth-btn--primary" disabled={fieldsDisabled}>
                  {isSubmitting && <span className="auth-spinner" aria-hidden="true" />}
                  {isSubmitting
                    ? isRegistering
                      ? 'Sending code'
                      : 'Signing in'
                    : isRegistering
                      ? 'Send verification code'
                      : 'Sign in'}
                </button>
              </form>
            )}

            {!verificationStep && (
              <div className="login-footer">
                <p>Need access? Only the SK Chairman can create accounts for members.</p>
                <p className="login-footer-register">
                  SK Chairman registration:
                  <button type="button" className="auth-btn auth-btn--link" onClick={toggleRegistering}>
                    {isRegistering ? 'Back to sign in' : 'Open registration'}
                  </button>
                </p>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}

export default LoginPage
