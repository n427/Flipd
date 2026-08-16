import { describe, it, expect } from 'vitest';
import { isInSendWindow, isSendDay, isDue, DIGEST_GAP_MS } from './window';

describe('isInSendWindow', () => {
  it('accepts mid-morning Pacific', () => {
    expect(isInSendWindow(new Date('2026-08-10T17:00:00Z'))).toBe(true); // 10am PDT
  });
  it('rejects the middle of the night Pacific', () => {
    expect(isInSendWindow(new Date('2026-08-10T10:00:00Z'))).toBe(false); // 3am PDT
  });
  it('uses Pacific local time, not UTC — 21:00Z is 2pm PDT and allowed', () => {
    expect(isInSendWindow(new Date('2026-08-10T21:00:00Z'))).toBe(true);
  });
});

describe('isSendDay', () => {
  it('accepts Sunday in Pacific', () => {
    // 2026-08-09 is a Sunday; 17:00Z is 10am PDT the same day.
    expect(isSendDay(new Date('2026-08-09T17:00:00Z'))).toBe(true);
  });

  it('rejects every other day', () => {
    // Mon 10th through Sat 15th, each at 10am PDT.
    for (const day of ['10', '11', '12', '13', '14', '15']) {
      expect(isSendDay(new Date(`2026-08-${day}T17:00:00Z`))).toBe(false);
    }
  });

  it('reads the day in Pacific, not UTC', () => {
    // Sunday 2026-08-09 at 8pm PDT is already Monday 03:00 in UTC. The digest
    // is anchored to the recipient's Sunday, so this must still be a send day.
    expect(isSendDay(new Date('2026-08-10T03:00:00Z'))).toBe(true);
    // And Saturday 8pm PDT is Sunday 03:00Z — a UTC reading would wrongly allow it.
    expect(isSendDay(new Date('2026-08-09T03:00:00Z'))).toBe(false);
  });
});

describe('isDue', () => {
  const now = new Date('2026-08-09T17:00:00Z'); // Sunday 10am PDT

  it('a user who never got one is due', () => {
    expect(isDue(null, now)).toBe(true);
  });

  it('blocks a second send later the same Sunday', () => {
    expect(isDue(new Date(now.getTime() - 3 * 3600_000).toISOString(), now)).toBe(false);
  });

  it('a digest from last Sunday is due again', () => {
    expect(isDue(new Date(now.getTime() - 7 * 24 * 3600_000).toISOString(), now)).toBe(true);
  });

  it('the gap only guards the same day — the weekday gate enforces the week', () => {
    // Five days is past the gap, but a Tuesday tick never reaches isDue.
    expect(isDue(new Date(now.getTime() - 5 * 24 * 3600_000).toISOString(), now)).toBe(true);
    expect(DIGEST_GAP_MS).toBe(20 * 3600_000);
  });
});
