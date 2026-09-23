import { requireSupabase } from './supabase.js';
export const DISPLAY_PHOTO_BUCKET = 'library-display-photos';
export function validDisplayPhoto(file) {
  return Boolean(file && ['image/jpeg', 'image/png', 'image/webp'].includes(file.type) && file.size > 0 && file.size <= 5 * 1024 * 1024);
}
export async function getMyDisplaySubmission(userId) {
  const { data, error } = await requireSupabase().from('library_display_submissions').select('*').eq('student_id', userId).maybeSingle();
  if (error) throw error;
  return data;
}
export async function submitDisplayRecommendation({ userId, book, photo, quote, reason }) {
  if (!validDisplayPhoto(photo) || !book?.bookId || !quote.trim() || !reason.trim()) throw new Error('Invalid submission');
  const db = requireSupabase();
  const existing = await getMyDisplaySubmission(userId);
  if (existing) return existing;
  const extension = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[photo.type];
  const path = `${userId}/${crypto.randomUUID()}.${extension}`;
  const { error: uploadError } = await db.storage.from(DISPLAY_PHOTO_BUCKET).upload(path, photo, { contentType: photo.type });
  if (uploadError) throw uploadError;
  const { data, error } = await db.from('library_display_submissions').insert({ student_id: userId, book_id: book.bookId, photo_path: path, quote: quote.trim(), reason: reason.trim() }).select().single();
  if (error) {
    // A timeout can happen after a committed insert. Check before reporting failure.
    let saved;
    try { saved = await getMyDisplaySubmission(userId); } catch { /* retry safely on next attempt */ }
    if (saved?.photo_path !== path) await db.storage.from(DISPLAY_PHOTO_BUCKET).remove([path]);
    if (saved) return saved;
    throw error;
  }
  return data;
}
export async function getDisplaySubmissions(page = 0) {
  const { data, error } = await requireSupabase().from('library_display_submissions').select('*').order('created_at', { ascending: false }).range(page * 20, page * 20 + 19);
  if (error) throw error;
  return data;
}
export async function reviewDisplaySubmission(id, status) {
  const { data, error } = await requireSupabase().from('library_display_submissions').update({ status }).eq('id', id).select('id').single();
  if (error) throw error;
  return data;
}
export async function displayPhotoUrl(path) {
  const { data, error } = await requireSupabase().storage.from(DISPLAY_PHOTO_BUCKET).createSignedUrl(path, 300);
  if (error) throw error;
  return data.signedUrl;
}
