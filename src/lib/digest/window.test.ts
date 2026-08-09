import { describe, it, expect } from 'vitest';
import { isInSendWindow, isDue, DIGEST_GAP_MS } from './window';

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

describe('isDue', () => {
  const now = new Date('2026-08-10T17:00:00Z');
  it('a user who never got one is due', () => {
    expect(isDue(null, now)).toBe(true);
  });
  it('19 hours ago is not yet due', () => {
    expect(isDue(new Date(now.getTime() - 19 * 3600_000).toISOString(), now)).toBe(false);
  });
  it('21 hours ago is due — the 20h gap lets a daily digest hold its slot', () => {
    expect(isDue(new Date(now.getTime() - 21 * 3600_000).toISOString(), now)).toBe(true);
  });
  it('exposes the gap as 20 hours', () => {
    expect(DIGEST_GAP_MS).toBe(20 * 3600_000);
  });
});
