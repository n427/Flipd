import { admin } from '../supabase/admin';
import { sendPush, wantedNotificationKey, wantsPush, type NotifyEvent } from '../notify';
import type { Producer } from './index';

const DAY_MS = 24 * 60 * 60 * 1000;

export type WantedLifecycleRow = {
  id: string;
  status: string;
  needed_by: string;
  reminder_sent_at: string | null;
};

export function dueWantedTransitions<T extends WantedLifecycleRow>(rows: T[], now: Date): {
  remind: T[];
  expire: T[];
} {
  const nowMs = now.getTime();
  const reminderHorizon = nowMs + DAY_MS;
  const active = rows.filter((row) => row.status === 'active');
  return {
    remind: active.filter((row) => {
      const due = new Date(row.needed_by).getTime();
      return row.reminder_sent_at === null && due > nowMs && due <= reminderHorizon;
    }),
    expire: active.filter((row) => new Date(row.needed_by).getTime() <= nowMs),
  };
}

type LifecycleCandidate = WantedLifecycleRow & { buyer_id: string; title: string };

async function sendPreferredPush(
  userId: string,
  preference: NotifyEvent,
  title: string,
  body: string,
  data: Record<string, unknown>,
) {
  const { data: profile, error } = await admin
    .from('profiles')
    .select('notify_prefs')
    .eq('id', userId)
    .single();
  if (error) {
    console.error(`[notify] unable to load preferences for ${userId}`, error);
    return;
  }
  if (wantsPush(profile?.notify_prefs, preference)) {
    await sendPush(userId, title, body, data);
  }
}

async function run(): Promise<Record<string, number>> {
  const now = new Date();
  const horizon = new Date(now.getTime() + DAY_MS).toISOString();
  const { data, error } = await admin
    .from('wanted_posts')
    .select('id,buyer_id,title,status,needed_by,reminder_sent_at')
    .eq('status', 'active')
    .lte('needed_by', horizon);
  if (error) throw new Error(error.message);

  const candidates = (data ?? []) as LifecycleCandidate[];
  const transitions = dueWantedTransitions(candidates, now);
  let reminded = 0;
  let expired = 0;

  for (const post of transitions.remind) {
    const body = `Your request “${post.title}” is due within 24 hours.`;
    const { data: claimed, error: claimError } = await admin.rpc('claim_wanted_reminder', {
      target_post_id: post.id,
      expected_buyer_id: post.buyer_id,
      event_key_value: wantedNotificationKey('reminder', post.id),
      event_title: 'Wanted request due soon',
      event_body: body,
      claimed_at: now.toISOString(),
    });
    if (claimError) throw new Error(claimError.message);
    if (claimed) {
      await sendPreferredPush(post.buyer_id, 'reminder', 'Wanted request due soon', body, {
        type: 'wanted_reminder', wanted_post_id: post.id,
      });
      reminded++;
    }
  }

  for (const post of transitions.expire) {
    const { data: sellerIds, error: expiryError } = await admin.rpc('expire_wanted_post', {
      target_post_id: post.id,
      expired_at: now.toISOString(),
    });
    if (expiryError) throw new Error(expiryError.message);
    const recipients = (sellerIds ?? []) as string[];
    for (const sellerId of recipients) {
      await sendPreferredPush(sellerId, 'expiry', 'Wanted request expired', `“${post.title}” expired, so your offer was closed.`, {
        type: 'wanted_expired', wanted_post_id: post.id,
      });
    }
    if (recipients.length > 0 || sellerIds !== null) expired++;
  }

  return { wanted_reminders: reminded, wanted_expiries: expired };
}

export const wantedLifecycleProducer: Producer = { name: 'wanted_lifecycle', run };
