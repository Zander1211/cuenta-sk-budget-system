import { createClient } from '@supabase/supabase-js'
import { existsSync, readFileSync } from 'fs'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'

/**
 * Shared Supabase client for the maintenance scripts in this folder.
 *
 * These scripts need the service role key, which bypasses Row Level Security
 * entirely. That key must never be written into a source file: anything
 * committed here is one `git push` away from being public, and GitHub's push
 * protection has already caught exactly that in this repository.
 *
 * The key is read from `.env.local`, which is git-ignored, matching the
 * convention already used by `reset_supabase.js`.
 *
 * `.env.local` needs:
 *   VITE_SUPABASE_URL=https://<project>.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY=<the secret key>
 */

const here = dirname(fileURLToPath(import.meta.url))
const ENV_PATH = resolve(here, '../.env.local')

function readEnvFile() {
  if (!existsSync(ENV_PATH)) return {}

  const values = {}
  for (const line of readFileSync(ENV_PATH, 'utf-8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    const separator = trimmed.indexOf('=')
    if (separator === -1) continue

    const key = trimmed.slice(0, separator).trim()
    // Values can legitimately contain '=', so only the first one splits.
    const value = trimmed.slice(separator + 1).trim().replace(/^["']|["']$/g, '')
    if (key) values[key] = value
  }
  return values
}

/**
 * Builds an admin client, or exits with an actionable message.
 *
 * Real environment variables win over `.env.local`, so CI can supply the key
 * without a file on disk.
 *
 * @returns {import('@supabase/supabase-js').SupabaseClient}
 */
export function createAdminClient() {
  const fileEnv = readEnvFile()

  const url = process.env.VITE_SUPABASE_URL || fileEnv.VITE_SUPABASE_URL
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || fileEnv.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceKey) {
    console.error(
      [
        'Missing Supabase admin credentials.',
        '',
        `Add these to ${ENV_PATH} (git-ignored), or set them in the environment:`,
        '  VITE_SUPABASE_URL=https://<project>.supabase.co',
        '  SUPABASE_SERVICE_ROLE_KEY=<the secret key>',
        '',
        'Never hardcode the service role key in a script. It bypasses all',
        'Row Level Security and is blocked by GitHub push protection.',
      ].join('\n'),
    )
    process.exit(1)
  }

  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
