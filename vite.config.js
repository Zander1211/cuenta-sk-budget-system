import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { createClient } from '@supabase/supabase-js'

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
              if (!supabaseUrl || !supabaseAnonKey) {
                res.statusCode = 500
                res.end(JSON.stringify({ error: 'Supabase configuration is missing locally' }))
                return
              }

              const supabase = createClient(supabaseUrl, supabaseAnonKey)

              const { data, error } = await supabase.auth.signInWithPassword({ email, password })
              if (error) {
                res.statusCode = 401
                res.end(JSON.stringify({ error: error.message }))
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

export default defineConfig(({ mode }) => {
  // eslint-disable-next-line no-undef
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [
      react(),
      tailwindcss(),
      localChatHandler(env),
      localRecaptchaMock(env),
      localUserLoginHandler(env),
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
          }
        },
      },
    },
  }
})