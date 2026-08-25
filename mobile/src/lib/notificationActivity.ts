export type NotificationSourceResult<T> = { ok: true; items: T[] } | { ok: false };

export type NotificationSourceState<Listing extends { id: string }, Wanted extends { id: string }> = {
  listings: Listing[];
  wanted: Wanted[];
  listingError: boolean;
  wantedError: boolean;
};

function uniqueById<T extends { id: string }>(items: T[]): T[] {
  return [...new Map(items.map((item) => [item.id, item])).values()];
}

export function isCurrentNotificationLoad(requestGeneration: number, currentGeneration: number): boolean {
  return requestGeneration === currentGeneration;
}

export function mergeNotificationSources<Listing extends { id: string }, Wanted extends { id: string }>(
  previous: NotificationSourceState<Listing, Wanted>,
  results: {
    listings?: NotificationSourceResult<Listing>;
    wanted?: NotificationSourceResult<Wanted>;
  },
): NotificationSourceState<Listing, Wanted> {
  return {
    listings: results.listings?.ok ? uniqueById(results.listings.items) : previous.listings,
    wanted: results.wanted?.ok ? uniqueById(results.wanted.items) : previous.wanted,
    listingError: results.listings ? !results.listings.ok : previous.listingError,
    wantedError: results.wanted ? !results.wanted.ok : previous.wantedError,
  };
}
