import { admin } from '@/lib/supabase/admin';
import { formatEventWindow } from '@/lib/validation';
import { popupReminderEmail, sendEmail, verifiedEmailFor, wantsEmail } from '@/lib/notify';
import type { Producer } from './index';

// Moved from the old /api/cron/popup-reminders route, carrying one deliberate
// fix: the pref check below now reads 'popup_reminder' instead of 'reminder'.
// The old route sent popupReminderEmail (a popup starting soon) but gated it
// on 'reminder', which actually governs "your request is expiring soon" — a
// separate, independently-settable toggle. That meant the popup-reminder
// setting never did anything, and turning off expiry reminders silently
// killed popup reminders too. Everything else — the 24h lookahead and the
// single reminded_at flag — is unchanged; the two-stage 24h/1h split is a
// later step.
async function run(): Promise<Record<string, number>> {
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const soonIso = new Date(now + 24 * 60 * 60 * 1000).toISOString();

  const { data: pending, error: pendingError } = await admin
    .from('popup_reminders')
    .select('user_id, listing_id')
    .is('reminded_at', null);
  if (pendingError) throw new Error(pendingError.message);

  const rows = pending ?? [];
  if (rows.length === 0) return { reminders: 0 };

  const listingIds = Array.from(new Set(rows.map((r) => r.listing_id)));
  const { data: listings, error: listingsError } = await admin
    .from('listings')
    .select('id, title, event_start, event_end')
    .in('id', listingIds)
    .gte('event_start', nowIso)
    .lte('event_start', soonIso);
  if (listingsError) throw new Error(listingsError.message);

  const listingById = new Map((listings ?? []).map((l) => [l.id, l]));

  let sent = 0;
  for (const r of rows) {
    const listing = listingById.get(r.listing_id);
    if (!listing) continue; // not starting within the next 24h (or gone)

    const { data: profile } = await admin
      .from('profiles')
      .select('notify_prefs')
      .eq('id', r.user_id)
      .single();

    if (wantsEmail(profile?.notify_prefs, 'popup_reminder')) {
      const to = await verifiedEmailFor(r.user_id);
      if (to) {
        const when = formatEventWindow(listing.event_start, listing.event_end);
        const { subject, html } = popupReminderEmail(listing.title, when);
        await sendEmail(to, subject, html);
        sent++;
      }
    }

    // Mark reminded regardless of send outcome so a bad address or an opt-out
    // doesn't retry this row every run.
    await admin
      .from('popup_reminders')
      .update({ reminded_at: new Date().toISOString() })
      .eq('user_id', r.user_id)
      .eq('listing_id', r.listing_id);
  }

  return { reminders: sent };
}

export const popupRemindersProducer: Producer = { name: 'popup_reminders', run };
