// Which reminders are due, as a pure function of (rows, listings, now).
// Kept free of Supabase so every timing rule is testable against a fixed clock
// instead of a mocked database — the rules are the whole feature here.

export type ReminderStage = '24h' | '1h';

export type ReminderRow = {
  user_id: string;
  listing_id: string;
  /** When they opted in. Drives suppression of the 24h stage. */
  created_at: string;
  reminded_24h_at: string | null;
  reminded_1h_at: string | null;
};

export type ReminderListing = {
  id: string;
  title: string;
  event_start: string;
  event_end: string | null;
  archived: boolean;
};

export type DueReminder = {
  user_id: string;
  listing_id: string;
  stage: ReminderStage;
  /** true = stamp the flag but send nothing. */
  suppress: boolean;
};

const HOUR = 60 * 60 * 1000;
const LEAD_24H = 24 * HOUR;
const LEAD_1H = 1 * HOUR;

export function dueReminders(
  rows: ReminderRow[],
  listings: Map<string, ReminderListing>,
  now: Date,
): DueReminder[] {
  const out: DueReminder[] = [];

  for (const r of rows) {
    const listing = listings.get(r.listing_id);
    if (!listing || listing.archived) continue;

    const delta = new Date(listing.event_start).getTime() - now.getTime();
    if (!Number.isFinite(delta) || delta <= 0) continue; // started, or an unparseable date

    const inOneHour = delta <= LEAD_1H;
    const inOneDay = delta <= LEAD_24H;

    // The 24h notice is stamped-but-not-sent in two situations. Both produce a
    // "tomorrow!" email that is plainly wrong by the time it would arrive:
    //   1. They opted in when the event was already under 24h away — they had
    //      just looked at the listing, so a day-ahead notice is noise.
    //   2. The event is already inside the 1h window and the 24h flag is still
    //      null, which means the sweep missed runs.
    const optedInInsideWindow =
      new Date(listing.event_start).getTime() - new Date(r.created_at).getTime() <= LEAD_24H;

    // Windows do not overlap: (1h, 24h] and (0, 1h].
    if (inOneHour) {
      if (!r.reminded_24h_at) {
        out.push({ user_id: r.user_id, listing_id: r.listing_id, stage: '24h', suppress: true });
      }
      if (!r.reminded_1h_at) {
        out.push({ user_id: r.user_id, listing_id: r.listing_id, stage: '1h', suppress: false });
      }
    } else if (inOneDay && !r.reminded_24h_at) {
      out.push({
        user_id: r.user_id,
        listing_id: r.listing_id,
        stage: '24h',
        suppress: optedInInsideWindow,
      });
    }
  }

  return out;
}
