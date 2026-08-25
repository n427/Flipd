import { describe, expect, it } from 'vitest';
import { effectiveWantedStatus, isWantedCategory } from './wanted-contract';

describe('Wanted contract', () => {
  it('treats an active post past needed_by as expired', () => {
    expect(effectiveWantedStatus('active', '2026-08-25T10:00:00.000Z', new Date('2026-08-25T10:00:01.000Z'))).toBe('expired');
  });

  it('does not override fulfilled or deleted status', () => {
    expect(effectiveWantedStatus('fulfilled', '2026-08-20T10:00:00.000Z', new Date('2026-08-25T10:00:00.000Z'))).toBe('fulfilled');
    expect(effectiveWantedStatus('deleted', '2026-08-20T10:00:00.000Z', new Date('2026-08-25T10:00:00.000Z'))).toBe('deleted');
  });

  it('excludes the event category from Wanted posts', () => {
    expect(isWantedCategory('goods')).toBe(true);
    expect(isWantedCategory('event')).toBe(false);
  });
});
