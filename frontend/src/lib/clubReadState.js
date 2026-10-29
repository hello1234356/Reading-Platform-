import { requireSupabase } from './supabase';

export async function getClubChannelUnreads(clubId) {
  const { data, error } = await requireSupabase().rpc('get_club_channel_unreads', { p_club_id: clubId });
  if (error) throw error;
  return Object.fromEntries((data || []).map(row => [row.channel_id, row]));
}

export async function markClubChannelRead(clubId, channelId, postId) {
  const { error } = await requireSupabase().rpc('mark_club_channel_read', {
    p_club_id: clubId, p_channel_id: channelId, p_post_id: postId,
  });
  if (error) throw error;
}
