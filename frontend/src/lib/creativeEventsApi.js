import { requireSupabase } from './supabase.js';

async function rpc(name, args) {
  const { data, error } = await requireSupabase().rpc(name, args);
  if (error) throw error;
  return data;
}
export const listCreativeEvents = () => rpc('creative_event_list');
export const readCreativeEvent = slug => rpc('creative_event_state', { p_slug: slug });
export const matchCreativeWriters = () => rpc('creative_match_writers', { p_expected: null });
export function actOnCreativeEvent(slug, action, payload = {}) {
  if (action === 'save-writer-slots' && slug === 'story-relay') return rpc('creative_save_writer_slots', { p_slots: payload.slots, p_confirm: Boolean(payload.confirm) });
  if (action === 'join-market' && slug === 'theme-marketplace') {
    return rpc('creative_market_join').catch(error => {
      if (error.code === 'PGRST202') throw new Error('Invite your account from Organizer controls before submitting.');
      throw error;
    });
  }
  return rpc('creative_event_act', { p_slug: slug, p_action: action, p_payload: payload });
}
export const findCreativeUsers = (slug, query) => rpc('creative_find_users', { p_slug: slug, p_query: query });
