import { describe, expect, it } from 'vitest';
import { wantedHistoryBucket } from './myMarketplace';

describe('wantedHistoryBucket', () => {
  it('keeps active requests separate from resolved history', () => {
    expect(wantedHistoryBucket({ status: 'active', needed_by: '2026-09-10T00:00:00Z' }, new Date('2026-09-01T00:00:00Z'))).toBe('active');
    expect(wantedHistoryBucket({ status: 'fulfilled', needed_by: '2026-09-10T00:00:00Z' }, new Date('2026-09-01T00:00:00Z'))).toBe('past');
    expect(wantedHistoryBucket({ status: 'active', needed_by: '2026-08-20T00:00:00Z' }, new Date('2026-09-01T00:00:00Z'))).toBe('past');
  });
});
