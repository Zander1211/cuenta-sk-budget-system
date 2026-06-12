import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { createClient } from '@supabase/supabase-js'

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

              const secret = env.RECAPTCHA_SECRET_KEY
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

export default defineConfig(({ mode }) => {
  // eslint-disable-next-line no-undef
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [
      react(),
      tailwindcss(),
      localRecaptchaMock(env),
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
          }
        },
      },
    },
  }
})