import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';
import { eligibleNotification, pushBody, pushTarget, validPushEndpoint, viewingTarget } from './policy.js';

Deno.serve(async request => {
  // A separate scheduler secret, never the public anon key or a user JWT.
  const schedulerKey = Deno.env.get('DESKTOP_PUSH_DISPATCH_SECRET');
  if (!schedulerKey || request.headers.get('Authorization') !== `Bearer ${schedulerKey}`) return new Response('Unauthorized', { status: 401 });
  if (request.method !== 'POST') return new Response('Use POST', { status: 405 });
  const publicKey = Deno.env.get('VAPID_PUBLIC_KEY');
  const privateKey = Deno.env.get('VAPID_PRIVATE_KEY');
  const subject = Deno.env.get('VAPID_SUBJECT');
  if (!publicKey || !privateKey || !subject) return new Response('Push is not configured', { status: 503 });
  const service = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });
  try {
    const { data: jobs, error } = await service.rpc('claim_desktop_push', { p_limit: 20 });
    if (error) throw error;
    const counts = { sent: 0, skipped: 0, retry: 0, failed: 0 };
    async function deliver(job: { id: string; lease_token: string; attempts: number; notification_id: string; announcement_id: string }) {
      const finish = async (state: string, delay = 0) => {
        const { error } = await service.from('desktop_push_deliveries').update({ state, available_at: new Date(Date.now() + delay).toISOString() }).eq('id', job.id).eq('lease_token', job.lease_token);
        if (error) throw error;
      };
      try {
        const { data: context, error } = await service.rpc('desktop_push_context', { p_delivery_id: job.id, p_lease_token: job.lease_token });
        if (error) throw error;
        if (!context) { await finish('skipped'); counts.skipped++; return; }
        const { subscription: sub, notification, presence } = context;
        const target = pushTarget(notification);
        if (!eligibleNotification(notification, sub.user_id) || presence.some((entry: { route: string; inbox_open: boolean }) => viewingTarget(entry, target))) {
          await finish('skipped'); counts.skipped++; return;
        }
        if (!validPushEndpoint(sub.endpoint)) { await finish('failed'); counts.failed++; return; }
        const payload = JSON.stringify({ version: 1, recipientId: sub.user_id, eventId: `${job.notification_id ? 'personal' : 'announcement'}:${notification.id}`,
          title: 'LitShelf', body: pushBody(notification, context.actor_name, sub.language), target, timestamp: Date.now() });
        // Use the established library for RFC 8291 encryption and VAPID signing.
        // Fetch forbids redirects so a push endpoint cannot redirect to an internal service.
        const details = webpush.generateRequestDetails({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } }, payload,
          { TTL: 300, urgency: 'normal', vapidDetails: { subject, publicKey, privateKey } });
        const response = await fetch(details.endpoint, { method: 'POST', headers: details.headers, body: new Uint8Array(details.body), redirect: 'error', signal: AbortSignal.timeout(10000) });
        if (response.status === 404 || response.status === 410) {
          const { error } = await service.from('desktop_push_subscriptions').delete().eq('id', sub.id).eq('updated_at', sub.updated_at);
          if (error) throw error;
          counts.skipped++; return;
        }
        if (response.ok) { await finish('sent'); counts.sent++; return; }
        if (response.status === 429 || response.status >= 500) throw new Error('Transient provider error');
        // Configuration/key errors must not cause a retry storm.
        await finish('failed'); counts.failed++;
      } catch {
        const retry = job.attempts < 5;
        await finish(retry ? 'pending' : 'failed', Math.min(3600000, 60000 * 2 ** job.attempts));
        counts[retry ? 'retry' : 'failed']++;
      }
    }
    // Bound concurrency and execution time, even when a push service is slow.
    for (let index = 0; index < jobs.length; index += 5) await Promise.all(jobs.slice(index, index + 5).map(deliver));
    return Response.json(counts);
  } catch {
    // Do not log endpoints, encryption keys, access tokens, or notification contents.
    return new Response('Push delivery unavailable', { status: 503 });
  }
});
