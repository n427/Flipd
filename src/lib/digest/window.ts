// The digest is weekly, anchored to a weekday rather than to a gap.
//
// A gap alone cannot express "weekly". A strict 7-day gap repeats the drift
// this file was originally written to avoid, one week at a time: the send slides
// an hour later each week until it walks past the window and stops. A gap
// shorter than a week drifts the other way and lands on a different weekday
// every time. So the week is enforced by the weekday gate below, and the gap is
// demoted to a same-day guard — it only stops a second send a few hours after
// the first.
export const DIGEST_GAP_MS = 20 * 3600_000;

/**
 * How far back the digest looks for listings to recommend. Tied to the cadence:
 * a weekly digest that only considered the last day would drop six days of
 * listings, which is most of what it exists to surface.
 */
export const CANDIDATE_WINDOW_MS = 7 * 24 * 3600_000;

const SEND_TZ = 'America/Los_Angeles';
const WINDOW_START_HOUR = 9;
const WINDOW_END_HOUR = 21;
const SEND_DAY = 'Sun';

// Pacific local time, not a fixed UTC offset: Pacific is UTC-7 in summer and
// UTC-8 in winter, and hardcoding either would shift everything by an hour half
// the year. The day matters as much as the hour — Sunday 8pm Pacific is already
// Monday in UTC, and the digest is anchored to the recipient's Sunday.
function pacificParts(now: Date): { hour: number; weekday: string } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: SEND_TZ,
    hour: 'numeric',
    hour12: false,
    weekday: 'short',
  }).formatToParts(now);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return { hour: Number(get('hour')), weekday: get('weekday') };
}

export function isInSendWindow(now: Date): boolean {
  const { hour } = pacificParts(now);
  return hour >= WINDOW_START_HOUR && hour < WINDOW_END_HOUR;
}

/** Weekly cadence lives here, not in the gap. */
export function isSendDay(now: Date): boolean {
  return pacificParts(now).weekday === SEND_DAY;
}

/**
 * Same-day guard. The sweep runs hourly, so without this a user would be mailed
 * again at 10am, 11am, and every hour until the window closed.
 */
export function isDue(lastDigestAt: string | null, now: Date): boolean {
  if (!lastDigestAt) return true;
  return now.getTime() - new Date(lastDigestAt).getTime() >= DIGEST_GAP_MS;
}
