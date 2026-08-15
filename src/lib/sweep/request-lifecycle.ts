import { admin } from '@/lib/supabase/admin';
import {
  expiryEmail,
  reminderEmail,
  sendEmail,
  sendPush,
  verifiedEmailFor,
  wantsEmail,
  wantsPush,
} from '@/lib/notify';
import { dueRequests, type RequestRow } from './due-requests';
import type { Producer } from './index';

// Nudges sellers before a request lapses, and closes out the ones that did.
//
// Both notifications existed as templates (reminderEmail, expiryEmail) with
// nothing calling them, and expiry itself was only ever computed on read. So a
// request could quietly pass its 72 hours with neither party told. This is the
// producer that makes both events real.
//
// All timing lives in the pure dueRequests(); this file only fetches, calls it,
// and sends/stamps what comes back.
async function run(): Promise<Record<string, number>> {
  const now = new Date();
  const horizon = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();

  // Candidates are pending requests already inside the reminder window — which
  // includes every overdue one, since their deadline is further in the past.
  const { data: pending, error } = await admin
    .from('reveal_requests')
    .select('id, buyer_id, seller_id, listing_id, listing_title, status, expires_at, reminded_at')
    .eq('status', 'pending')
    .lte('expires_at', horizon);
  if (error) throw new Error(error.message);

  const rows = (pending ?? []) as (RequestRow & { listing_title: string | null })[];
  if (rows.length === 0) return { request_reminders: 0, request_expiries: 0 };

  const titleById = new Map(rows.map((r) => [r.id, r.listing_title || 'a listing']));
  const due = dueRequests(rows, now);
  if (due.length === 0) return { request_reminders: 0, request_expiries: 0 };

  // One profiles query for every recipient and every named buyer, rather than
  // one per row inside the loop.
  const userIds = Array.from(
    new Set(due.flatMap((d) => (d.kind === 'reminder' ? [d.sellerId, d.buyerId] : [d.buyerId]))),
  );
  // Unchecked, a failed fetch leaves the map empty and wantsEmail() defaults ON
  // for a missing entry, so every opted-out user would be mailed — and the row
  // is stamped below, so the mistake would never retry. Throw instead and let
  // the next run handle it, matching popup-reminders.
  const { data: profileRows, error: profilesError } = await admin
    .from('profiles')
    .select('id, display_name, notify_prefs')
    .in('id', userIds);
  if (profilesError) throw new Error(profilesError.message);

  const profiles = new Map(
    (profileRows ?? []).map((p) => [
      p.id as string,
      p as { id: string; display_name: string | null; notify_prefs: unknown },
    ]),
  );

  let reminders = 0;
  let expiries = 0;

  for (const d of due) {
    const title = titleById.get(d.id) ?? 'a listing';

    if (d.kind === 'reminder') {
      const seller = profiles.get(d.sellerId);
      const buyerName = profiles.get(d.buyerId)?.display_name ?? 'Someone';

      if (wantsEmail(seller?.notify_prefs, 'reminder')) {
        const to = await verifiedEmailFor(d.sellerId);
        if (to) {
          const { subject, html } = reminderEmail(buyerName, title, d.hoursLeft);
          await sendEmail(to, subject, html);
        }
      }
      if (wantsPush(seller?.notify_prefs, 'reminder')) {
        void sendPush(
          d.sellerId,
          'Request expiring',
          `${buyerName}'s request about "${title}" expires in about ${d.hoursLeft}h.`,
          { type: 'reminder' },
        );
      }

      // Stamp regardless of outcome — opted out, or no verified address — so a
      // dead row isn't reconsidered on every run.
      await admin
        .from('reveal_requests')
        .update({ reminded_at: new Date().toISOString() })
        .eq('id', d.id);
      reminders++;
      continue;
    }

    // Expiry: resolve the row first. If the notification fails afterwards the
    // request is still correctly closed, whereas notifying first and failing to
    // update would re-send the same "expired" notice on every run.
    const { error: updateError } = await admin
      .from('reveal_requests')
      .update({ status: 'expired', resolved_at: new Date().toISOString() })
      .eq('id', d.id)
      .eq('status', 'pending'); // no-op if someone answered in the meantime
    if (updateError) throw new Error(updateError.message);

    const buyer = profiles.get(d.buyerId);
    if (wantsEmail(buyer?.notify_prefs, 'expiry')) {
      const to = await verifiedEmailFor(d.buyerId);
      if (to) {
        const { subject, html } = expiryEmail(title);
        await sendEmail(to, subject, html);
      }
    }
    if (wantsPush(buyer?.notify_prefs, 'expiry')) {
      void sendPush(d.buyerId, 'Request expired', `Your request about "${title}" wasn't answered in time.`, {
        type: 'expiry',
      });
    }
    expiries++;
  }

  return { request_reminders: reminders, request_expiries: expiries };
}

export const requestLifecycleProducer: Producer = { name: 'request_lifecycle', run };
