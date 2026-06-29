import { requireSupabase } from './supabase'

function unwrap({ data, error }) {
  if (error) throw error
  return data
}

async function currentUser() {
  const { data: { user }, error } = await requireSupabase().auth.getUser()
  if (error) throw error
  if (!user) throw new Error('You must be signed in.')
  return user
}

export async function getFeed(limit = 20) {
  return unwrap(await requireSupabase().from('posts').select(`
    *, user:profiles(id, name, profile_picture),
    book:books(id, title, author, cover_image), comments(count), likes(count)
  `).order('created_at', { ascending: false }).limit(limit))
}

export async function createPost(content, bookId = null) {
  const user = await currentUser()
  return unwrap(await requireSupabase().from('posts')
    .insert({ user_id: user.id, content, book_id: bookId }).select().single())
}

export async function searchBooks(query = '') {
  const clean = query.trim().replaceAll(',', ' ')
  let request = requireSupabase().from('books').select('*').order('title').limit(50)
  if (clean) request = request.or(`title.ilike.%${clean}%,author.ilike.%${clean}%,isbn.ilike.%${clean}%`)
  return unwrap(await request)
}

export async function logBook(bookId, details) {
  const user = await currentUser()
  return unwrap(await requireSupabase().from('user_books')
    .upsert({ user_id: user.id, book_id: bookId, ...details }, { onConflict: 'user_id,book_id' })
    .select().single())
}

export async function getFeaturedContent(month, year) {
  return unwrap(await requireSupabase().from('featured_content').select('*')
    .eq('month', month).eq('year', year).order('created_at', { ascending: false }))
}

export async function getClubs() {
  return unwrap(await requireSupabase().from('book_clubs').select(`
    *, book:books(*), creator:profiles!creator_id(id, name, profile_picture), club_members(count)
  `).order('created_at', { ascending: false }))
}

export async function createClub({ name, description, bookId }) {
  const user = await currentUser()
  return unwrap(await requireSupabase().from('book_clubs')
    .insert({ name, description, book_id: bookId, creator_id: user.id }).select().single())
}

export async function joinClub(clubId) {
  const user = await currentUser()
  return unwrap(await requireSupabase().from('club_members')
    .upsert({ club_id: clubId, user_id: user.id }, { onConflict: 'club_id,user_id' })
    .select().single())
}

export async function getClubMessages(clubId) {
  return unwrap(await requireSupabase().from('club_messages')
    .select('*, user:profiles(id, name, profile_picture)')
    .eq('club_id', clubId).order('created_at'))
}

export async function sendClubMessage(clubId, message) {
  const user = await currentUser()
  return unwrap(await requireSupabase().from('club_messages')
    .insert({ club_id: clubId, user_id: user.id, message }).select().single())
}

export async function getProfile(userId) {
  const client = requireSupabase()
  const results = await Promise.all([
    client.from('profiles').select('*').eq('id', userId).single(),
    client.from('user_books').select('*, book:books(*)').eq('user_id', userId),
    client.from('reading_challenges').select('*').eq('user_id', userId).order('year', { ascending: false }),
    client.from('user_badges').select('earned_at, badge:badges(*)').eq('user_id', userId),
  ])
  return {
    profile: unwrap(results[0]), shelves: unwrap(results[1]),
    challenges: unwrap(results[2]), badges: unwrap(results[3]),
  }
}

