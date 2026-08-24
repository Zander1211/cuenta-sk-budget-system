import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { createClient } from '@supabase/supabase-js'
import { verifyOtpRequest } from './api/verify-otp.js'
import { updateProfileRequest } from './api/update-profile.js'

// Local middleware to serve /api/chat using Gemini API
// instead of proxying to the deployed Vercel function
function localChatHandler(env) {
  return {
    name: 'local-chat-handler',
    configureServer(server) {
      // Set GEMINI_API_KEY in process.env at server startup
      if (env.GEMINI_API_KEY) {
        process.env.GEMINI_API_KEY = env.GEMINI_API_KEY
      }

      server.middlewares.use((req, res, next) => {
        if (req.url === '/api/chat' && req.method === 'POST') {
          let body = ''
          req.on('data', chunk => { body += chunk.toString() })
          req.on('end', async () => {
            res.setHeader('Content-Type', 'application/json')

            try {
              const { messages = [], systemContext = {} } = JSON.parse(body)
              const apiKey = process.env.GEMINI_API_KEY

              if (!apiKey) {
                res.statusCode = 500
                res.end(JSON.stringify({ error: 'Gemini API key not configured in .env.local' }))
                return
              }

              // Import the handler using file:// URL (works on Windows)
              const handlerUrl = new URL('./api/chat/index.js', import.meta.url)
              const mod = await import(handlerUrl.href + '?t=' + Date.now())
              const handler = mod.default

              // Create mock Vercel-style req/res
              const mockReq = { method: 'POST', body: { messages, systemContext } }
              let responded = false
              const mockRes = {
                statusCode: 200,
                status(code) { this.statusCode = code; return this },
                json(data) {
                  if (responded) return
                  responded = true
                  res.statusCode = this.statusCode
                  res.end(JSON.stringify(data))
                },
                end(data) {
                  if (responded) return
                  responded = true
                  res.statusCode = this.statusCode
                  res.end(data)
                },
                send(data) {
                  if (responded) return
                  responded = true
                  res.statusCode = this.statusCode
                  res.end(typeof data === 'string' ? data : JSON.stringify(data))
                },
              }

              await handler(mockReq, mockRes)
            } catch (err) {
              console.error('[Cue Chat] Local handler error:', err)
              res.statusCode = 500
              res.end(JSON.stringify({ error: err.message || 'Local chat handler failed' }))
            }
          })
          return
        }
        next()
      })
    }
  }
}

function localRecaptchaMock(env) {
  return {
    name: 'local-recaptcha-mock',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.url === '/api/login' && req.method === 'POST') {
          let body = ''
          req.on('data', chunk => { body += chunk.toString() })
          req.on('end', async () => {
            try {
              const { email, password, recaptchaToken } = JSON.parse(body)
              if (!email || !password || !recaptchaToken) {
                res.statusCode = 400
                res.end(JSON.stringify({ error: 'Missing required fields' }))
                return
              }

              const secret = env.RECAPTCHA_SECRET_KEY?.trim()
              if (!secret) {
                res.statusCode = 500
                res.end(JSON.stringify({ error: 'Server configuration missing RECAPTCHA_SECRET_KEY locally' }))
                return
              }

              const verifyResponse = await fetch('https://www.google.com/recaptcha/api/siteverify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: `secret=${secret}&response=${recaptchaToken}`,
              })

              const verifyData = await verifyResponse.json()
              if (!verifyData.success) {
                res.statusCode = 400
                res.end(JSON.stringify({ error: 'reCAPTCHA verification failed locally.' }))
                return
              }

              const supabaseUrl = env.VITE_SUPABASE_URL
              const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY
              const supabaseServiceKey = env.SUPABASE_SERVICE_ROLE_KEY
              if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
                res.statusCode = 500
                res.end(JSON.stringify({ error: 'Supabase configuration is missing locally' }))
                return
              }

              const supabase = createClient(supabaseUrl, supabaseAnonKey)
              const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

              const { data, error } = await supabase.auth.signInWithPassword({ email, password })
              if (error) {
                res.statusCode = 401
                res.end(JSON.stringify({ error: error.message }))
                return
              }

              // Check if account is disabled (bypassing RLS with service key for reliability)
              const { data: accountRow } = await supabaseAdmin
                .from('created_accounts')
                .select('is_active')
                .eq('id', data.session.user.id)
                .maybeSingle()

              if (accountRow && accountRow.is_active === false) {
                await supabase.auth.signOut()
                res.statusCode = 403
                res.end(JSON.stringify({
                  error: 'Your account has been disabled by the SK Chairman. Please contact the administrator for assistance.'
                }))
                return
              }

              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ session: data.session }))
            } catch (err) {
              res.statusCode = 500
              res.end(JSON.stringify({ error: err.message }))
            }
          })
          return
        }
        next()
      })
    }
  }
}

function localUserLoginHandler(env) {
  return {
    name: 'local-user-login-handler',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.url.startsWith('/api/user-login') && req.method === 'GET') {
          try {
            const url = new URL(req.url, `http://${req.headers.host}`)
            const id = url.searchParams.get('id')

            if (!id) {
              res.statusCode = 400
              res.end(JSON.stringify({ error: 'Missing user ID' }))
              return
            }

            const supabaseUrl = env.VITE_SUPABASE_URL
            const supabaseServiceKey = env.SUPABASE_SERVICE_ROLE_KEY

            if (!supabaseUrl || !supabaseServiceKey) {
              res.statusCode = 500
              res.end(JSON.stringify({ error: 'Configuration missing' }))
              return
            }

            const supabase = createClient(supabaseUrl, supabaseServiceKey)
            const { data, error } = await supabase.auth.admin.getUserById(id)

            if (error) {
              res.statusCode = 400
              res.end(JSON.stringify({ error: error.message }))
              return
            }

            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ last_sign_in_at: data.user.last_sign_in_at }))
          } catch (err) {
            res.statusCode = 500
            res.end(JSON.stringify({ error: err.message }))
          }
          return
        }
        next()
      })
    }
  }
}

function localOtpHandler(env) {
  return {
    name: 'local-otp-handler',
    configureServer(server) {
      const gmailUser = env.GMAIL_USER
      const gmailAppPassword = env.GMAIL_APP_PASSWORD
      const supabaseUrl = env.VITE_SUPABASE_URL
      const supabaseServiceKey = env.SUPABASE_SERVICE_ROLE_KEY

      console.log('[OTP] Gmail user:', gmailUser || 'NOT SET')
      console.log('[OTP] Gmail password:', gmailAppPassword ? '****' + gmailAppPassword.slice(-4) : 'NOT SET')

      server.middlewares.use(async (req, res, next) => {
        // ── SEND OTP ───────────────────────────────────────────
        if (req.url === '/api/send-otp' && req.method === 'POST') {
          let body = ''
          req.on('data', chunk => { body += chunk.toString() })
          req.on('end', async () => {
            res.setHeader('Content-Type', 'application/json')
            try {
              const { email } = JSON.parse(body)

              if (!email) {
                res.statusCode = 400
                res.end(JSON.stringify({ error: 'Email is required' }))
                return
              }

              const isGmail = /^[a-zA-Z0-9._%+-]+@gmail\.com$/i.test(email)
              if (!isGmail) {
                res.statusCode = 400
                res.end(JSON.stringify({ error: 'Only Gmail addresses are allowed.' }))
                return
              }

              if (!gmailUser || !gmailAppPassword) {
                res.statusCode = 500
                res.end(JSON.stringify({ error: 'Email service is not configured. Add GMAIL_USER and GMAIL_APP_PASSWORD to .env.local' }))
                return
              }

              // Generate 6-digit OTP
              const otp = String(Math.floor(100000 + Math.random() * 900000))

              // Store in database
              const supabase = createClient(supabaseUrl, supabaseServiceKey)
              await supabase.from('verification_codes').delete().eq('email', email)
              const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()
              const { error: dbError } = await supabase.from('verification_codes').insert({
                email,
                code: otp,
                expires_at: expiresAt,
                verified: false,
              })

              if (dbError) {
                console.error('[OTP] DB error:', dbError)
                res.statusCode = 500
                res.end(JSON.stringify({ error: 'Failed to store verification code: ' + dbError.message }))
                return
              }

              // Send email via Gmail SMTP
              const { default: nodemailer } = await import('nodemailer')
              const transporter = nodemailer.createTransport({
                service: 'gmail',
                auth: { user: gmailUser, pass: gmailAppPassword },
              })

              const mailOptions = {
                from: `"Cuenta System" <${gmailUser}>`,
                to: email,
                subject: 'Your Cuenta Verification Code',
                html: `
                  <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
                    <div style="text-align: center; margin-bottom: 24px;">
                      <h2 style="color: #0c2e30; margin: 0;">Cuenta</h2>
                      <p style="color: #6b7280; font-size: 14px; margin: 4px 0 0;">SK Budget Monitoring System</p>
                    </div>
                    <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; padding: 24px; text-align: center;">
                      <p style="color: #374151; font-size: 14px; margin: 0 0 16px;">Your verification code is:</p>
                      <div style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #0c2e30; padding: 12px 0;">
                        ${otp}
                      </div>
                      <p style="color: #6b7280; font-size: 12px; margin: 16px 0 0;">This code expires in 10 minutes.</p>
                    </div>
                    <p style="color: #9ca3af; font-size: 12px; text-align: center; margin-top: 24px;">
                      If you did not request this code, please ignore this email.
                    </p>
                  </div>
                `,
              }

              const info = await transporter.sendMail(mailOptions)
              console.log('[OTP] Email sent successfully:', info.messageId)

              res.statusCode = 200
              res.end(JSON.stringify({ success: true, message: 'Verification code sent successfully.' }))
            } catch (err) {
              console.error('[OTP] Send error:', err)
              res.statusCode = 500
              res.end(JSON.stringify({ error: 'Failed to send verification email: ' + err.message }))
            }
          })
          return
        }

        // ── VERIFY OTP ─────────────────────────────────────────
        if (req.url === '/api/verify-otp' && req.method === 'POST') {
          let body = ''
          req.on('data', chunk => { body += chunk.toString() })
          req.on('end', async () => {
            res.setHeader('Content-Type', 'application/json')
            try {
              const payload = JSON.parse(body)
              const result = await verifyOtpRequest({
                ...payload,
                authorization: req.headers.authorization,
                supabaseUrl,
                serviceKey: supabaseServiceKey,
              })

              res.statusCode = result.status
              res.end(JSON.stringify(result.body))
            } catch (err) {
              console.error('[OTP] Verify error:', err)
              res.statusCode = 500
              res.end(JSON.stringify({ error: 'Verification failed: ' + err.message }))
            }
          })
          return
        }

        // ── UPDATE PROFILE ──────────────────────────────────────
        if (req.url === '/api/update-profile' && req.method === 'POST') {
          let body = ''
          req.on('data', chunk => { body += chunk.toString() })
          req.on('end', async () => {
            res.setHeader('Content-Type', 'application/json')
            try {
              const payload = JSON.parse(body)
              const result = await updateProfileRequest({
                ...payload,
                authorization: req.headers.authorization,
                supabaseUrl,
                serviceKey: supabaseServiceKey,
              })
              res.statusCode = result.status
              res.end(JSON.stringify(result.body))
            } catch (error) {
              console.error('[Profile] Local update error:', error)
              res.statusCode = 500
              res.end(JSON.stringify({ error: 'Profile update failed. Please try again.' }))
            }
          })
          return
        }

        // ── DELETE USER ────────────────────────────────────────
        if (req.url === '/api/delete-user' && req.method === 'POST') {
          let body = ''
          req.on('data', chunk => { body += chunk.toString() })
          req.on('end', async () => {
            res.setHeader('Content-Type', 'application/json')
            try {
              const { userId } = JSON.parse(body)

              if (!userId) {
                res.statusCode = 400
                res.end(JSON.stringify({ error: 'User ID is required.' }))
                return
              }

              const supabase = createClient(supabaseUrl, supabaseServiceKey)

              // 1. Delete from created_accounts table first
              const { error: dbError } = await supabase
                .from('created_accounts')
                .delete()
                .eq('id', userId)

              if (dbError) {
                console.error('[Delete User] DB error:', dbError)
                res.statusCode = 500
                res.end(JSON.stringify({ error: 'Failed to remove user from directory: ' + dbError.message }))
                return
              }

              // 2. Delete from auth.users
              const { error: authError } = await supabase.auth.admin.deleteUser(userId)
              
              if (authError && !authError.message.includes('User not found')) {
                console.error('[Delete User] Auth error:', authError)
                res.statusCode = 500
                res.end(JSON.stringify({ error: 'Failed to delete authentication record: ' + authError.message }))
                return
              }

              res.statusCode = 200
              res.end(JSON.stringify({ success: true, message: 'User deleted successfully.' }))
            } catch (err) {
              console.error('[Delete User] Error:', err)
              res.statusCode = 500
              res.end(JSON.stringify({ error: 'Deletion failed: ' + err.message }))
            }
          })
          return
        }

        next()
      })
    }
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [
      react(),
      tailwindcss(),
      localChatHandler(env),
      localRecaptchaMock(env),
      localUserLoginHandler(env),
      localOtpHandler(env),
    ],
    server: {
      proxy: {
        '/api': {
          target: 'https://cuenta-chi.vercel.app',
          changeOrigin: true,
          secure: true,
          bypass: (req) => {
            if (req.url === '/api/login') {
              return req.url
            }
            if (req.url === '/api/chat') {
              return req.url
            }
            if (req.url.startsWith('/api/user-login')) {
              return req.url
            }
            if (req.url === '/api/send-otp' || req.url === '/api/verify-otp' || req.url === '/api/delete-user') {
              return req.url
            }
          }
        },
      },
    },
  }
})
