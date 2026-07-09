import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

const hasRealSupabaseUrl = Boolean(url && !url.includes('your-project.supabase.co'))
const hasRealAnonKey = Boolean(anonKey && !anonKey.includes('your-anon'))

export const isSupabaseConfigured = hasRealSupabaseUrl && hasRealAnonKey
export const supabase = isSupabaseConfigured
  ? createClient(url, anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null

export function requireSupabase() {
  if (!supabase) {
    throw new Error('Add your Supabase URL and anon key to frontend/.env first.')
  }
  return supabase
}
