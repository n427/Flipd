// The sweep runs hourly, so a strict 24h gap would push each user's digest an
// hour later every day until it drifted out of the send window entirely. 20h
// lets a daily digest keep roughly the same slot.
export const DIGEST_GAP_MS = 20 * 3600_000;

const SEND_TZ = 'America/Los_Angeles';
const WINDOW_START_HOUR = 9;
const WINDOW_END_HOUR = 21;

export function isInSendWindow(now: Date): boolean {
  // Intl, not a fixed UTC offset: Pacific is UTC-7 in summer and UTC-8 in
  // winter, and hardcoding either would shift the window by an hour half the year.
  const hour = Number(
    new Intl.DateTimeFormat('en-US', {
      timeZone: SEND_TZ, hour: 'numeric', hour12: false,
    }).format(now)
  );
  return hour >= WINDOW_START_HOUR && hour < WINDOW_END_HOUR;
}

export function isDue(lastDigestAt: string | null, now: Date): boolean {
  if (!lastDigestAt) return true;
  return now.getTime() - new Date(lastDigestAt).getTime() >= DIGEST_GAP_MS;
}
