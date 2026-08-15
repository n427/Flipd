// Which reveal requests need a nudge or have run out, as a pure function of
// (rows, now). Kept free of Supabase for the same reason as due-reminders: the
// timing rules are the feature, and they should be testable against a fixed
// clock rather than a mocked database.
//
// Until now expiry was only ever computed on read (see statusFor in
// validation.ts), so a request could lapse without anything noticing — which
// is why the "your request expired" notification had no way to fire.

export type RequestRow = {
  id: string;
  buyer_id: string;
  seller_id: string;
  listing_id: string;
  status: string;
  expires_at: string;
  /** Stamped when the seller has been nudged, so it happens at most once. */
  reminded_at: string | null;
};

export type DueRequest =
  | {
      kind: 'reminder';
      id: string;
      sellerId: string;
      buyerId: string;
      listingId: string;
      hoursLeft: number;
    }
  | { kind: 'expiry'; id: string; buyerId: string; listingId: string };

const HOUR = 60 * 60 * 1000;
const REMINDER_LEAD = 24 * HOUR;

export function dueRequests(rows: RequestRow[], now: Date): DueRequest[] {
  const out: DueRequest[] = [];

  for (const r of rows) {
    // Only a pending request can lapse. Anything already resolved is done.
    if (r.status !== 'pending') continue;

    const deadline = new Date(r.expires_at).getTime();
    // An unreadable deadline must not be treated as "long past" — that would
    // expire the request and email the buyer about it.
    if (!Number.isFinite(deadline)) continue;

    const remaining = deadline - now.getTime();

    if (remaining <= 0) {
      out.push({ kind: 'expiry', id: r.id, buyerId: r.buyer_id, listingId: r.listing_id });
      continue;
    }

    // Expiry wins over a reminder above, so the two can never both fire for
    // one request: a "12 hours left" nudge sent alongside an expiry notice
    // would contradict it.
    if (!r.reminded_at && remaining <= REMINDER_LEAD) {
      out.push({
        kind: 'reminder',
        id: r.id,
        sellerId: r.seller_id,
        buyerId: r.buyer_id,
        listingId: r.listing_id,
        // Never 0: the sweep runs hourly, so a request with minutes left still
        // reads as "about 1 hour" rather than "about 0 hours".
        hoursLeft: Math.max(1, Math.round(remaining / HOUR)),
      });
    }
  }

  return out;
}
