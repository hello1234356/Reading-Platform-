import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { mayPublish, validNickname } from './policy.ts';
const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
function json(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { ...headers, 'Content-Type': 'application/json' } }); }
Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers });
  if (request.method !== 'POST') return json({ error: 'Use POST' }, 405);
  try {
    const url = Deno.env.get('SUPABASE_URL') || '';
    const anon = Deno.env.get('SUPABASE_ANON_KEY') || '';
    const secret = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    if (!url || !anon || !secret) return json({ error: 'Service unavailable' }, 503);
    const authorization = request.headers.get('Authorization') || '';
    const client = createClient(url, anon, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } });
    const { data: auth, error: authError } = await client.auth.getUser(authorization.replace(/^Bearer\s+/i, ''));
    if (authError || !auth.user) return json({ error: 'Sign in required' }, 401);
    const payload = await request.json();
    if (!['message', 'profile'].includes(payload.action) || !/^\d+$/.test(String(payload.clubId))) return json({ error: 'Invalid request' }, 400);
    const { data: membership, error: membershipError } = await client.from('club_members').select('user_id,nickname').eq('club_id', payload.clubId).eq('user_id', auth.user.id).maybeSingle();
    if (membershipError || !membership) return json({ error: 'Membership required' }, 403);
    const profile = payload.action === 'profile';
    const text = String(profile ? payload.nickname ?? '' : payload.text ?? '').trim();
    if (profile ? !validNickname(text) : !text || Array.from(text).length > 2000) return json({ error: 'Invalid text' }, 400);
    if (profile && (!Array.isArray(payload.tagIds) || payload.tagIds.length > 3 || payload.tagIds.some((id: unknown) => !/^\d+$/.test(String(id))))) return json({ error: 'Invalid member tags' }, 400);
    // Do not publish a draft, broadcast its content, or accept client-supplied
    // moderation results. The existing deployed service makes every decision.
    if (text && (!profile || text !== (membership.nickname || ''))) {
      const response = await fetch(`${url}/functions/v1/moderation-content`, {
        method: 'POST', headers: { Authorization: authorization, apikey: anon, 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, contextType: 'club_message' }), signal: AbortSignal.timeout(30000),
      });
      if (!response.ok) return json({ error: 'Moderation unavailable' }, 503);
      const decision = await response.json();
      if (!mayPublish(decision?.action, payload.allowWarning === true)) {
        if (!['warn', 'block', 'report'].includes(decision?.action)) return json({ error: 'Moderation unavailable' }, 503);
        return json({ moderation: { action: decision.action, feedback: decision.feedback || '' } }, 422);
      }
    }
    const service = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = profile
      ? await service.rpc('save_club_member_profile', { p_club_id: payload.clubId, p_user_id: auth.user.id, p_nickname: text, p_tag_ids: payload.tagIds })
      : await service.rpc('publish_club_message', { p_club_id: payload.clubId, p_channel_id: payload.channelId || null, p_user_id: auth.user.id, p_message: text });
    if (error) return json({ error: 'Could not save club content' }, 400);
    return json({ data });
  } catch { return json({ error: 'Club content unavailable' }, 503); }
});
