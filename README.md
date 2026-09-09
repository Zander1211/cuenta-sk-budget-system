# Cuenta — SK Budget Monitoring System

A budget request, approval and expenditure tracking system for a Sangguniang
Kabataan council, with a public transparency portal. React 19 + Vite on the
front end, Supabase (Postgres, Auth, Storage, RLS) for data, and serverless
`/api` handlers for the operations that need a service-role key.

**New collaborator? Read [docs/COLLABORATOR_SETUP.md](docs/COLLABORATOR_SETUP.md)** —
it covers repo access, Supabase credentials, and the reCAPTCHA key pair you
need before you can log in.

---

## Quick start

```bash
git clone https://github.com/Zander1211/cuenta-sk-budget-system.git
cd cuenta-sk-budget-system
npm install
cp .env.example .env.local   # then fill in every value
npm run dev
```

Open <http://localhost:5173>.

The app will build and serve without credentials, but **login will fail** until
`.env.local` has a real Supabase project and a real reCAPTCHA key pair — the
login route verifies the captcha server-side before it touches Supabase.

No Vercel CLI needed for local work: `vite.config.js` reimplements every
`/api/*` route as dev middleware.

## Scripts

| Command | Does |
| --- | --- |
| `npm run dev` | Vite dev server plus the local `/api` middleware |
| `npm run build` | Production build into `dist/` |
| `npm run preview` | Serve the built bundle |
| `npm run lint` | ESLint |

## Layout

| Path | Contents |
| --- | --- |
| `src/` | React app — pages, components, services, Supabase client |
| `api/` | Serverless handlers (login, OTP, user creation, chat) |
| `supabase/migrations/` | SQL schema, RLS policies, storage buckets |
| `supabase/functions/` | Edge functions for the AI assistant |
| `scripts/` | One-off maintenance and audit scripts — several are destructive |
| `docs/` | Setup guide and system flow |

## Docs

- [docs/COLLABORATOR_SETUP.md](docs/COLLABORATOR_SETUP.md) — onboarding, credentials, troubleshooting
- [docs/SYSTEM_FLOW.md](docs/SYSTEM_FLOW.md) — how data moves through the system
- [System_Manual.md](System_Manual.md) — end-user manual

## Security

`.env.local` is git-ignored and must stay that way. `SUPABASE_SERVICE_ROLE_KEY`
bypasses Row Level Security completely — treat it as a database password, keep
it out of `src/`, and never commit it. Only `VITE_`-prefixed variables reach
the browser bundle.
