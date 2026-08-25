import { describe, expect, it } from 'vitest';
import {
  beginWantedNotificationDismissal,
  confirmWantedNotificationDismissal,
  failWantedNotificationDismissal,
  isCurrentNotificationLoad,
  mergeNotificationSources,
} from './notificationActivity';

const initial = {
  listings: [{ id: 'listing-old' }],
  wanted: [{ id: 'wanted-old' }],
  listingError: false,
  wantedError: false,
  wantedTombstones: [],
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
      wantedTombstones: [],
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

  it('keeps a dismissed row hidden when a newer load still returns it', () => {
    const dismissing = beginWantedNotificationDismissal(initial, 'wanted-old');
    const refreshed = mergeNotificationSources(dismissing, {
      wanted: { ok: true, items: [{ id: 'wanted-old' }, { id: 'wanted-new' }] },
    });

    expect(refreshed.wanted).toEqual([{ id: 'wanted-new' }]);
    expect(refreshed.wantedTombstones.map((entry) => entry.id)).toEqual(['wanted-old']);
  });

  it('restores a row and visible error state when dismissal fails', () => {
    const dismissing = beginWantedNotificationDismissal(initial, 'wanted-old');
    const failed = failWantedNotificationDismissal(dismissing, 'wanted-old');

    expect(failed.wanted).toEqual([{ id: 'wanted-old' }]);
    expect(failed.wantedTombstones).toEqual([]);
    expect(failed.wantedError).toBe(true);
  });

  it('reconciles a confirmed tombstone once the server excludes the dismissed row', () => {
    const confirmed = confirmWantedNotificationDismissal(
      beginWantedNotificationDismissal(initial, 'wanted-old'),
      'wanted-old',
    );
    const stale = mergeNotificationSources(confirmed, {
      wanted: { ok: true, items: [{ id: 'wanted-old' }] },
    });
    expect(stale.wanted).toEqual([]);
    expect(stale.wantedTombstones).toHaveLength(1);

    const authoritative = mergeNotificationSources(stale, {
      wanted: { ok: true, items: [] },
    });
    expect(authoritative.wantedTombstones).toEqual([]);
  });
});
