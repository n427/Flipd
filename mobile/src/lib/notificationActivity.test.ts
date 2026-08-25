import { describe, expect, it } from 'vitest';
import { isCurrentNotificationLoad, mergeNotificationSources } from './notificationActivity';

const initial = {
  listings: [{ id: 'listing-old' }],
  wanted: [{ id: 'wanted-old' }],
  listingError: false,
  wantedError: false,
};

describe('mergeNotificationSources', () => {
  it('updates a successful source while preserving prior rows from a failed source', () => {
    expect(mergeNotificationSources(initial, {
      listings: { ok: true, items: [{ id: 'listing-new' }] },
      wanted: { ok: false },
    })).toEqual({
      listings: [{ id: 'listing-new' }],
      wanted: [{ id: 'wanted-old' }],
      listingError: false,
      wantedError: true,
    });
  });

  it('retains the full prior view when both sources fail', () => {
    expect(mergeNotificationSources(initial, {
      listings: { ok: false }, wanted: { ok: false },
    })).toEqual({ ...initial, listingError: true, wantedError: true });
  });

  it('deduplicates rows returned by either source', () => {
    const next = mergeNotificationSources(initial, {
      listings: { ok: true, items: [{ id: 'same' }, { id: 'same' }] },
      wanted: { ok: true, items: [{ id: 'event' }, { id: 'event' }] },
    });
    expect(next.listings).toEqual([{ id: 'same' }]);
    expect(next.wanted).toEqual([{ id: 'event' }]);
  });

  it('rejects a stale response after a newer refresh has started', () => {
    expect(isCurrentNotificationLoad(2, 3)).toBe(false);
    expect(isCurrentNotificationLoad(3, 3)).toBe(true);
  });
});
