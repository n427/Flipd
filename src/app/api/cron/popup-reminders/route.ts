import { NextRequest, NextResponse } from 'next/server';
import { admin } from '@/lib/supabase/admin';
import { formatEventWindow } from '@/lib/validation';
import { popupReminderEmail, sendEmail, verifiedEmailFor, wantsEmail } from '@/lib/notify';

// Secret-guarded sweep — the scheduler calls this with
// `Authorization: Bearer $CRON_SECRET` (CRON_SECRET must be set in the
// environment). Emails each opted-in buyer once for popups starting within
// the next 24h, then marks the reminder sent so it never double-sends.
//
// Runs once a day (see vercel.json): Vercel's Hobby plan caps crons at daily,
// and the 24h lookahead means a single daily pass still catches every popup.
// The tradeoff is timing, not coverage — a popup created after the day's run
// gets its reminder on the next pass rather than within the hour. If the plan
// ever moves to Pro, an hourly schedule tightens that up.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization');
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const soonIso = new Date(now + 24 * 60 * 60 * 1000).toISOString();

  // Two-step lookup rather than an embedded-filter select: this codebase's
  // existing embedded selects (e.g. reveals) never filter on a nested
  // column, so `.gte('listing.event_start', ...)` PostgREST support is
  // unverified here — a direct listings query with a plain filter is the
  // safe, precedented path.
  const { data: pending, error: pendingError } = await admin
    .from('popup_reminders')
    .select('user_id, listing_id')
    .is('reminded_at', null);
  if (pendingError) return NextResponse.json({ error: pendingError.message }, { status: 500 });

  const rows = pending ?? [];
  if (rows.length === 0) return NextResponse.json({ ok: true, sent: 0 });

  const listingIds = Array.from(new Set(rows.map((r) => r.listing_id)));
  const { data: listings, error: listingsError } = await admin
    .from('listings')
    .select('id, title, event_start, event_end')
    .in('id', listingIds)
    .gte('event_start', nowIso)
    .lte('event_start', soonIso);
  if (listingsError) return NextResponse.json({ error: listingsError.message }, { status: 500 });

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

    if (wantsEmail(profile?.notify_prefs, 'reminder')) {
      const to = await verifiedEmailFor(r.user_id);
      if (to) {
        const when = formatEventWindow(listing.event_start, listing.event_end);
        const { subject, html } = popupReminderEmail(listing.title, when);
        await sendEmail(to, subject, html);
        sent++;
      }
    }

    // Mark reminded regardless of send outcome for this row so a bad email
    // (no verified address / opted out) doesn't retry it every hour.
    await admin
      .from('popup_reminders')
      .update({ reminded_at: new Date().toISOString() })
      .eq('user_id', r.user_id)
      .eq('listing_id', r.listing_id);
  }

  return NextResponse.json({ ok: true, sent });
}
