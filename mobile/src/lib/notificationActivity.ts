export type NotificationSourceResult<T> = { ok: true; items: T[] } | { ok: false };

export type NotificationSourceState<Listing extends { id: string }, Wanted extends { id: string }> = {
  listings: Listing[];
  wanted: Wanted[];
  listingError: boolean;
  wantedError: boolean;
  wantedTombstones: { id: string; item: Wanted; status: 'pending' | 'confirmed' }[];
};

function uniqueById<T extends { id: string }>(items: T[]): T[] {
  return [...new Map(items.map((item) => [item.id, item])).values()];
}

export function isCurrentNotificationLoad(requestGeneration: number, currentGeneration: number): boolean {
  return requestGeneration === currentGeneration;
}

export function beginWantedNotificationDismissal<Listing extends { id: string }, Wanted extends { id: string }>(
  state: NotificationSourceState<Listing, Wanted>,
  id: string,
): NotificationSourceState<Listing, Wanted> {
  const item = state.wanted.find((candidate) => candidate.id === id);
  if (!item || state.wantedTombstones.some((entry) => entry.id === id)) return state;
  return {
    ...state,
    wanted: state.wanted.filter((candidate) => candidate.id !== id),
    wantedTombstones: [...state.wantedTombstones, { id, item, status: 'pending' }],
  };
}

export function confirmWantedNotificationDismissal<Listing extends { id: string }, Wanted extends { id: string }>(
  state: NotificationSourceState<Listing, Wanted>,
  id: string,
): NotificationSourceState<Listing, Wanted> {
  return {
    ...state,
    wantedTombstones: state.wantedTombstones.map((entry) => entry.id === id ? { ...entry, status: 'confirmed' } : entry),
  };
}

export function failWantedNotificationDismissal<Listing extends { id: string }, Wanted extends { id: string }>(
  state: NotificationSourceState<Listing, Wanted>,
  id: string,
): NotificationSourceState<Listing, Wanted> {
  const tombstone = state.wantedTombstones.find((entry) => entry.id === id);
  if (!tombstone) return { ...state, wantedError: true };
  return {
    ...state,
    wanted: uniqueById([...state.wanted, tombstone.item]),
    wantedError: true,
    wantedTombstones: state.wantedTombstones.filter((entry) => entry.id !== id),
  };
}

export function mergeNotificationSources<Listing extends { id: string }, Wanted extends { id: string }>(
  previous: NotificationSourceState<Listing, Wanted>,
  results: {
    listings?: NotificationSourceResult<Listing>;
    wanted?: NotificationSourceResult<Wanted>;
  },
): NotificationSourceState<Listing, Wanted> {
  const returnedWanted = results.wanted?.ok ? uniqueById(results.wanted.items) : null;
  const returnedWantedById = new Map((returnedWanted ?? []).map((item) => [item.id, item]));
  const wantedTombstones = returnedWanted
    ? previous.wantedTombstones
      .filter((entry) => entry.status === 'pending' || returnedWantedById.has(entry.id))
      .map((entry) => ({ ...entry, item: returnedWantedById.get(entry.id) ?? entry.item }))
    : previous.wantedTombstones;
  const hiddenWantedIds = new Set(wantedTombstones.map((entry) => entry.id));
  return {
    listings: results.listings?.ok ? uniqueById(results.listings.items) : previous.listings,
    wanted: returnedWanted ? returnedWanted.filter((item) => !hiddenWantedIds.has(item.id)) : previous.wanted,
    listingError: results.listings ? !results.listings.ok : previous.listingError,
    wantedError: results.wanted ? !results.wanted.ok : previous.wantedError,
    wantedTombstones,
  };
}
