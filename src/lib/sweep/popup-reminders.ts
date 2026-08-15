import { admin } from '@/lib/supabase/admin';
import { formatEventStart, formatEventWindow } from '@/lib/validation';
import {
  popupReminderEmail,
  sendEmail,
  sendPush,
  verifiedEmailFor,
  wantsEmail,
  wantsPush,
} from '@/lib/notify';
import { dueReminders, stampColumn, type ReminderListing, type ReminderRow } from './due-reminders';
import type { Producer } from './index';

// Moved from the old /api/cron/popup-reminders route, carrying one deliberate
// fix: the pref check below now reads 'popup_reminder' instead of 'reminder'.
// The old route sent popupReminderEmail (a popup starting soon) but gated it
// on 'reminder', which actually governs "your request is expiring soon" — a
// separate, independently-settable toggle. That meant the popup-reminder
// setting never did anything, and turning off expiry reminders silently
// killed popup reminders too.
//
// The single reminded_at flag is now split into reminded_24h_at and
// reminded_1h_at so the same opt-in fires twice: once about a day out, once
// about an hour out. All timing — which stage is due, and when a stage should
// be suppressed rather than sent — lives in the pure dueReminders() function;
// this file only fetches, calls it, and stamps/sends what it returns.
async function run(): Promise<Record<string, number>> {
  const now = new Date();
  const nowIso = now.toISOString();
  const soonIso = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();

  // Any row with an unsent stage is a candidate; dueReminders decides which.
  const { data: pending, error: pendingError } = await admin
    .from('popup_reminders')
    .select('user_id, listing_id, created_at, reminded_24h_at, reminded_1h_at')
    .or('reminded_24h_at.is.null,reminded_1h_at.is.null');
  if (pendingError) throw new Error(pendingError.message);

  const rows = (pending ?? []) as ReminderRow[];
  if (rows.length === 0) return { reminders: 0 };

  const listingIds = Array.from(new Set(rows.map((r) => r.listing_id)));
  const { data: listingRows, error: listingsError } = await admin
    .from('listings')
    .select('id, title, event_start, event_end, archived')
    .in('id', listingIds)
    .gte('event_start', nowIso)
    .lte('event_start', soonIso);
  if (listingsError) throw new Error(listingsError.message);

  const listings = new Map<string, ReminderListing>(
    (listingRows ?? []).map((l) => [l.id as string, l as ReminderListing]),
  );

  const due = dueReminders(rows, listings, now);
  if (due.length === 0) return { reminders: 0 };

  // One query for every profile we might need, rather than one per row inside
  // the loop. Two stages roughly doubles the row count, and this runs hourly
  // against a table that only grows.
  const userIds = Array.from(new Set(due.map((d) => d.user_id)));
  // Unchecked, a failed fetch here leaves prefsById empty, and wantsEmail()
  // defaults ON for a missing entry — every opted-out user would get emailed,
  // and the row still gets stamped below so the mistake never retries. Throw
  // instead, matching the two queries above, so the flags stay null and the
  // next hourly run tries again.
  const { data: profileRows, error: profilesError } = await admin
    .from('profiles')
    .select('id, notify_prefs')
    .in('id', userIds);
  if (profilesError) throw new Error(profilesError.message);
  const prefsById = new Map(
    (profileRows ?? []).map((p) => [p.id as string, (p as { notify_prefs: unknown }).notify_prefs]),
  );

  let sent = 0;
  for (const d of due) {
    const listing = listings.get(d.listing_id)!;
    const column = stampColumn(d.stage);

    if (!d.suppress && wantsEmail(prefsById.get(d.user_id), 'popup_reminder')) {
      const to = await verifiedEmailFor(d.user_id);
      if (to) {
        // event_end is nullable independently of event_start (see the same
        // guard in store.ts). Synthesizing an equal end time would render as
        // "3:00 PM – 3:00 PM" in the email, which reads as a bug to the
        // recipient — so a missing end time gets its own start-only label.
        const when = listing.event_end
          ? formatEventWindow(listing.event_start, listing.event_end)
          : formatEventStart(listing.event_start);
        const { subject, html } = popupReminderEmail(listing.title, when, d.stage);
        await sendEmail(to, subject, html);
        sent++;
      }
    }

    // Push runs off the same suppression rule as email, and independently of
    // whether a verified address existed — this event had email only, so the
    // popup_reminder toggle did nothing for anyone relying on push.
    if (!d.suppress && wantsPush(prefsById.get(d.user_id), 'popup_reminder')) {
      const when = listing.event_end
        ? formatEventWindow(listing.event_start, listing.event_end)
        : formatEventStart(listing.event_start);
      void sendPush(
        d.user_id,
        d.stage === '1h' ? 'Starting soon' : 'Tomorrow',
        `${listing.title} · ${when}`,
        { type: 'popup_reminder' },
      );
    }

    // Stamp regardless of outcome — suppressed, opted out, or no verified
    // address — so a dead row isn't reconsidered every hour.
    await admin
      .from('popup_reminders')
      .update({ [column]: new Date().toISOString() })
      .eq('user_id', d.user_id)
      .eq('listing_id', d.listing_id);
  }

  return { reminders: sent };
}

export const popupRemindersProducer: Producer = { name: 'popup_reminders', run };
