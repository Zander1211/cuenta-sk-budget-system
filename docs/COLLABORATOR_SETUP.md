# Collaborator Setup

How to get Cuenta running on your own machine after you have been added to the
GitHub repository. Budget about 20 minutes the first time.

Repository: <https://github.com/Zander1211/cuenta-sk-budget-system>

---

## 1. What you need before you start

| Requirement | Notes |
| --- | --- |
| Node.js 20 or newer | `node -v` to check. Vite 7 and React 19 need 20+. |
| Git | Any recent version. |
| A GitHub account | The owner must add you as a collaborator (see below). |
| Access to Supabase | Either an invite to the shared project, or your own free project. See section 4. |
| A reCAPTCHA v2 key pair | Either the shared one, or your own free pair. See section 5. |

You do **not** need the Vercel CLI. Every `/api/*` route is reimplemented as
Vite dev middleware in `vite.config.js`, so `npm run dev` alone gives you a
fully working backend locally.

---

## 2. Getting repository access

The repository owner does this once per collaborator:

1. Open <https://github.com/Zander1211/cuenta-sk-budget-system>
2. **Settings -> Collaborators -> Add people**
3. Enter the collaborator's GitHub username or email, pick **Write** access,
   and send the invite.

The collaborator accepts the emailed invitation, then clones:

```bash
git clone https://github.com/Zander1211/cuenta-sk-budget-system.git
cd cuenta-sk-budget-system
npm install
```

> ⚠️ **Do not skip step 3.** `src/supabase/supabaseClient.js` hardcodes the
> production Supabase URL and anon key as a fallback, so the app *will* start
> without a `.env.local` — silently connected to the **live production
> database**. Anything you click while testing writes to real data. Always
> create `.env.local` before you run the app.

---

## 3. Creating your `.env.local`

```bash
cp .env.example .env.local
```

Then fill in every value. The file is git-ignored and must stay that way.

| Variable | Where it comes from | Secret? |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Supabase -> Project Settings -> Data API | No |
| `VITE_SUPABASE_ANON_KEY` | Same page, "anon / public" key | No — protected by RLS |
| `VITE_RECAPTCHA_SITE_KEY` | Google reCAPTCHA admin console | No |
| `RECAPTCHA_SECRET_KEY` | Google reCAPTCHA admin console | **Yes** |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase -> Project Settings -> API Keys | **Yes — bypasses RLS entirely** |
| `GEMINI_API_KEY` | Google AI Studio | **Yes** |
| `GMAIL_USER` | The Gmail account that sends OTP emails | No |
| `GMAIL_APP_PASSWORD` | Google Account -> Security -> App passwords | **Yes** |
| `RECAPTCHA_ALLOWED_HOSTNAMES` | Optional; defaults to the Vercel host + `localhost` | No |

### How the owner should hand over the secret values

This team shares one set of credentials, so the handover is simply the owner's
completed `.env.local`, sent once per collaborator.

Never paste it into a commit, a GitHub issue, a README, or a group chat — a
group chat is the worst of these, because the key stays readable in scrollback
to everyone who joins the thread later. Pick one of these instead:

- **1Password / Bitwarden shared vault** — best option if the team already has one.
- **Vercel or GitHub Actions environment variables** — for deploys, not local dev.
- **A one-time-view link** — e.g. <https://onetimesecret.com>. The link dies
  after it is opened once, so a leaked chat log is not enough to replay it.

If a secret does leak, rotate it: Supabase can reissue the service role key,
Google can reissue the reCAPTCHA secret, and Gmail app passwords are revocable
individually.

---

## 4. Supabase access — this team shares one project

**Decided model: everyone uses the same credentials.** You do not create your
own Supabase project and you do not need a Supabase dashboard account. The
owner sends you the filled-in `.env.local` values (see section 3), you paste
them in, and you are done. No migrations to run, no buckets to create.

The upside is that setup takes two minutes and everyone sees the same budgets,
accounts and receipts. The cost is that **there is no separate staging
database — the project in your `.env.local` is the live one.**

### Rules that follow from that

1. **Everything you do in local dev hits real data.** A budget you create while
   testing is a real row that the council sees. Clean up after yourself.
2. **Never run the destructive helpers.** These wipe shared data:
   - `scripts/reset_supabase.js` — empties 14 tables and 2 storage buckets.
     It now refuses to run until you retype the project ref, and refuses
     outright in a non-interactive shell. Do not talk your way past it.
   - `supabase/migrations/wipe_test_data.sql`
   - `supabase/migrations/reset_database_data.sql`

   The two SQL files have no such guard — pasting either into the Supabase SQL
   Editor executes immediately. Do not open them expecting a safety net.
3. **Do not run `supabase db push` or `db reset`.** The schema is already
   applied. Pushing from a stale checkout can drop or rewrite live tables.
4. **Test with your own account.** Registration is restricted to Gmail
   addresses (the `enforce_gmail_only` migration), so sign up with a real
   Gmail account you can receive OTP mail on rather than reusing someone else's.
5. **Treat the shared keys as production credentials.** `SUPABASE_SERVICE_ROLE_KEY`
   bypasses Row Level Security completely. Do not paste it into a chat, an
   issue, a commit, or a screenshot. If it leaks, tell the owner so it can be
   rotated.

If this project ever holds data that genuinely cannot be lost, the right fix is
a second Supabase project for development. That is a deliberate change, not
something to improvise mid-task.

---

## 5. reCAPTCHA on the login page

Cuenta uses **reCAPTCHA v2 "I'm not a robot"** (`react-google-recaptcha`) on
[`src/pages/LoginPage.jsx`](../src/pages/LoginPage.jsx). The token is verified
server-side against Google's `siteverify` endpoint before Supabase is ever
asked to sign the user in — locally by the `localRecaptchaMock` plugin in
`vite.config.js`, in production by [`api/login.js`](../api/login.js).

Because verification is server-side, **you cannot log in without a working key
pair.** Choose one:

### Option A — the shared key pair (what this team uses)

Both `VITE_RECAPTCHA_SITE_KEY` and `RECAPTCHA_SECRET_KEY` arrive in the
`.env.local` the owner sends you, so there is nothing to register.

One-time step for the owner: add `localhost` under **Domains** for the site key
at <https://www.google.com/recaptcha/admin>, otherwise every collaborator's
local login fails. reCAPTCHA v2 accepts `localhost` as a domain entry; no port
is needed.

### Option B — register your own instead (free, 2 minutes)

Useful if you would rather not use the shared secret, or you are testing
captcha behaviour itself. Overrides the two values from the shared file.

1. Go to <https://www.google.com/recaptcha/admin/create>
2. Label: anything. Type: **Challenge (v2) -> "I'm not a robot" Checkbox**
3. Domains: add `localhost`
4. Copy the **site key** into `VITE_RECAPTCHA_SITE_KEY` and the **secret key**
   into `RECAPTCHA_SECRET_KEY`.

### Option C — Google's universal test keys (UI work only)

These always pass verification and always show a "this is for testing only"
banner. Fine for styling the login page, useless for testing real captcha
behaviour.

```
VITE_RECAPTCHA_SITE_KEY=6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI
RECAPTCHA_SECRET_KEY=6LeIxAcTAAAAAGG-vFI1TnRWxMZNFuojJ4WifJWe
```

### Hostname allow-list

After verifying the token, `api/login.js` also checks the hostname Google
reports against `RECAPTCHA_ALLOWED_HOSTNAMES`, which defaults to
`cuenta-sk-budget-system.vercel.app,localhost`. If you serve the dev site on
anything else (a LAN IP for phone testing, a tunnel URL), add that host:

```
RECAPTCHA_ALLOWED_HOSTNAMES=cuenta-sk-budget-system.vercel.app,localhost,192.168.1.20
```

---

## 6. Run it

```bash
npm run dev
```

Open <http://localhost:5173>. To verify the whole chain works, log in — a
successful login proves reCAPTCHA verification, the Supabase anon key and the
service role key are all wired correctly, since `/api/login` touches all three.

Other commands:

```bash
npm run build      # production build into dist/
npm run preview    # serve the built bundle
npm run lint       # eslint
```

---

## 7. Troubleshooting

| Symptom | Cause |
| --- | --- |
| `Server configuration missing RECAPTCHA_SECRET_KEY locally` | `RECAPTCHA_SECRET_KEY` absent from `.env.local`. Restart the dev server after editing it — Vite reads env at startup only. |
| `reCAPTCHA verification failed` | Site key and secret key are from different key pairs, or the token was reused. |
| `reCAPTCHA was completed for an unauthorized website hostname` | Add your host to `RECAPTCHA_ALLOWED_HOSTNAMES`. |
| `Supabase configuration is missing locally` | One of `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` is blank. |
| Login returns 401 for a known-good account | You are pointed at a different Supabase project than the one holding that account. |
| Data appears even though `.env.local` is empty | The hardcoded fallback in `src/supabase/supabaseClient.js` has connected you to production. Stop and fill in `.env.local`. |
| Empty dashboards, no errors | RLS is working but your account has no role row. Check `created_accounts`. |
| `Email service is not configured` | `GMAIL_USER` / `GMAIL_APP_PASSWORD` missing. Needs a Google **app password**, not the account password. |
| An env change appears to do nothing | Restart `npm run dev`. |

`VITE_API_BASE_URL` appears in `.env.example` but nothing reads it — the app
calls `/api/*` on the same origin. It has no effect either way.

---

## 8. Working together on the repo

```bash
git checkout -b feature/your-change
# ...edit...
git add -A
git commit -m "Describe the change"
git push -u origin feature/your-change
```

Then open a pull request on GitHub. Avoid committing straight to `main` once
more than one person is working.

Before every push, confirm no secret is staged:

```bash
git status --short
git diff --cached --stat
```

`.gitignore` already blocks `.env`, `.env.*` (except `.env.example`), `dist`,
`node_modules` and `.vercel`. Do not weaken those rules.
