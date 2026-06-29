import { requireSupabase } from './supabase'

export async function signUp({ name, email, password }) {
  const { data, error } = await requireSupabase().auth.signUp({
    email,
    password,
    options: { data: { name } },
  })
  if (error) throw error
  return data
}

export async function signIn({ email, password }) {
  const { data, error } = await requireSupabase().auth.signInWithPassword({ email, password })
  if (error) throw error
  return data
}

export async function signOut() {
  const { error } = await requireSupabase().auth.signOut()
  if (error) throw error
}

export function watchAuth(callback) {
  return requireSupabase().auth.onAuthStateChange((_event, session) => callback(session))
}
