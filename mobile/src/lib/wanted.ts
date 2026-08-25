const DEFAULT_API_BASE = 'https://www.flipdcampus.com';

async function defaultAccessToken(): Promise<string> {
  const { requireToken } = await import('./listings');
  return requireToken();
}

export type WantedCategory = 'goods' | 'services' | 'housing';
export type WantedPostStatus = 'active' | 'fulfilled' | 'expired' | 'deleted';
export type WantedOfferStatus = 'pending' | 'accepted' | 'declined' | 'withdrawn' | 'expired';

export type WantedPostInput = {
  title: string;
  category: WantedCategory;
  max_budget: number;
  description: string;
  location: string;
  photo_urls: string[];
  needed_by: string;
};

export type WantedPost = WantedPostInput & {
  id: string;
  status: WantedPostStatus;
  created_at: string;
  offer_count: number;
};
export type WantedPostDetail = { wanted_post: WantedPost; buyer?: WantedBuyer; management?: { buyer_id: string; updated_at: string; resolved_at: string | null }; participant_offer?: WantedOffer; thread_id?: string | null };

export type WantedBuyer = {
  id: string;
  display_name: string | null;
  handle: string | null;
  avatar_url: string | null;
};

export type WantedOfferInput = {
  id: string;
  price: number;
  description: string;
  message: string;
  photo_paths: string[];
};

export type WantedOffer = {
  id: string;
  wanted_post_id: string;
  buyer_id: string;
  seller_id: string;
  price: number;
  description: string;
  message: string;
  photo_urls: string[];
  photo_paths: string[];
  status: WantedOfferStatus;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  completed_at: string | null;
  role: 'buyer' | 'seller';
  counterpart_id: string;
  transaction_actions?: { can_complete: boolean; can_rate: boolean };
  wanted_post?: Pick<WantedPost, 'id' | 'title' | 'max_budget' | 'location' | 'needed_by' | 'status'>;
};

export type WantedFeedFilters = {
  q?: string;
  category?: WantedCategory | 'all';
  budget?: number;
  location?: string;
  neededBefore?: string;
  mine?: boolean;
  status?: WantedPostStatus;
  cursor?: string;
  limit?: number;
};

export type WantedNotificationEvent = {
  id: string;
  event_key: string;
  event_type: string;
  wanted_post_id: string | null;
  wanted_offer_id: string | null;
  title: string;
  body: string;
  created_at: string;
  read_at: string | null;
  dismissed_at: string | null;
};

type Fetcher = typeof fetch;
export type WantedClientDependencies = {
  getAccessToken?: () => Promise<string>;
  fetcher?: Fetcher;
  apiBase?: string;
};

export class WantedApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'WantedApiError';
  }
}

function dependencies(overrides: WantedClientDependencies = {}) {
  return {
    getAccessToken: overrides.getAccessToken ?? defaultAccessToken,
    fetcher: overrides.fetcher ?? fetch,
    apiBase: (overrides.apiBase ?? DEFAULT_API_BASE).replace(/\/$/, ''),
  };
}

async function requestJson<T>(path: string, init: RequestInit = {}, overrides: WantedClientDependencies = {}): Promise<T> {
  const { getAccessToken, fetcher, apiBase } = dependencies(overrides);
  const token = await getAccessToken();
  const response = await fetcher(`${apiBase}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...init.headers },
  });
  const body = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new WantedApiError(body.error || `Request failed (${response.status})`, response.status);
  return body as T;
}

function json(method: string, body: unknown): RequestInit {
  return { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

function append(params: URLSearchParams, key: string, value: string | number | undefined) {
  if (value !== undefined && value !== '') params.set(key, String(value));
}

export function wantedFeedPath(filters: WantedFeedFilters = {}): string {
  const params = new URLSearchParams();
  append(params, 'q', filters.q?.trim());
  append(params, 'category', filters.category === 'all' ? undefined : filters.category);
  append(params, 'budget', filters.budget);
  append(params, 'location', filters.location?.trim());
  append(params, 'needed_before', filters.neededBefore);
  append(params, 'mine', filters.mine ? 1 : undefined);
  append(params, 'status', filters.status);
  append(params, 'cursor', filters.cursor);
  append(params, 'limit', filters.limit);
  const query = params.toString();
  return `/api/wanted${query ? `?${query}` : ''}`;
}

function cleanPost(input: WantedPostInput): WantedPostInput {
  return {
    ...input,
    title: input.title.trim(),
    description: input.description.trim(),
    location: input.location.trim(),
    photo_urls: input.photo_urls.map((url) => url.trim()),
  };
}

export async function fetchWantedFeed(filters: WantedFeedFilters = {}, deps?: WantedClientDependencies) {
  return requestJson<{ wanted_posts: WantedPost[]; next_cursor: string | null }>(wantedFeedPath(filters), {}, deps);
}

export async function fetchWantedPost(id: string, deps?: WantedClientDependencies) {
  const body = await requestJson<WantedPostDetail>(`/api/wanted/${id}`, {}, deps);
  return body;
}

export async function createWantedPost(input: WantedPostInput, deps?: WantedClientDependencies) {
  const body = await requestJson<{ wanted_post: WantedPost }>('/api/wanted', json('POST', cleanPost(input)), deps);
  return body.wanted_post;
}

export async function updateWantedPost(id: string, input: WantedPostInput, deps?: WantedClientDependencies) {
  const body = await requestJson<{ wanted_post: WantedPost }>(`/api/wanted/${id}`, json('PATCH', cleanPost(input)), deps);
  return body.wanted_post;
}

export async function deleteWantedPost(id: string, deps?: WantedClientDependencies): Promise<void> {
  await requestJson<{ ok: true }>(`/api/wanted/${id}`, { method: 'DELETE' }, deps);
}

export async function fetchWantedOffers(direction: 'received' | 'sent', cursor?: string, deps?: WantedClientDependencies) {
  const params = new URLSearchParams({ role: direction === 'received' ? 'buyer' : 'seller' });
  if (cursor) params.set('cursor', cursor);
  return requestJson<{ wanted_offers: WantedOffer[]; next_cursor: string | null }>(`/api/wanted-offers?${params}`, {}, deps);
}

export async function fetchWantedOffersForPost(postId: string, deps?: WantedClientDependencies) {
  const body = await requestJson<{ wanted_offers: WantedOffer[] }>(`/api/wanted/${postId}/offers`, {}, deps);
  return body.wanted_offers;
}

export async function createWantedOffer(postId: string, input: WantedOfferInput, deps?: WantedClientDependencies) {
  const body = await requestJson<{ wanted_offer: WantedOffer }>(`/api/wanted/${postId}/offers`, json('POST', input), deps);
  return body.wanted_offer;
}

export async function updateWantedOffer(id: string, input: Omit<WantedOfferInput, 'id'>, deps?: WantedClientDependencies) {
  const body = await requestJson<{ wanted_offer: WantedOffer }>(`/api/wanted-offers/${id}`, json('PATCH', { action: 'edit', ...input }), deps);
  return body.wanted_offer;
}

export async function resolveWantedOffer(id: string, action: 'withdraw' | 'decline', deps?: WantedClientDependencies) {
  const init = action === 'withdraw' ? { method: 'DELETE' } : json('PATCH', { action: 'decline' });
  const body = await requestJson<{ wanted_offer: WantedOffer }>(`/api/wanted-offers/${id}`, init, deps);
  return body.wanted_offer;
}

export async function acceptWantedOffer(id: string, deps?: WantedClientDependencies): Promise<string> {
  const body = await requestJson<{ thread_id: string }>(`/api/wanted-offers/${id}/accept`, { method: 'POST' }, deps);
  return body.thread_id;
}

export async function completeWantedOffer(id: string, deps?: WantedClientDependencies): Promise<void> {
  await requestJson(`/api/transactions/wanted/${id}/complete`, { method: 'POST' }, deps);
}

export async function rateWantedOffer(id: string, score: number, text: string, deps?: WantedClientDependencies): Promise<void> {
  await requestJson('/api/ratings', json('POST', { wanted_offer_id: id, score, ...(text.trim() ? { text: text.trim() } : {}) }), deps);
}

export async function reportWantedTarget(target: { wantedPostId?: string; wantedOfferId?: string }, reason: 'scam' | 'prohibited' | 'harassment' | 'other', note: string, deps?: WantedClientDependencies): Promise<void> {
  await requestJson('/api/reports', json('POST', {
    ...(target.wantedPostId ? { wanted_post_id: target.wantedPostId } : {}),
    ...(target.wantedOfferId ? { wanted_offer_id: target.wantedOfferId } : {}),
    reason,
    ...(note.trim() ? { note: note.trim() } : {}),
  }), deps);
}

export async function uploadWantedPhotos(
  photos: { uri: string; name: string; type: string }[],
  mode: 'reference' | 'offer',
  offerId?: string,
  deps?: WantedClientDependencies,
) {
  const form = new FormData();
  form.append('mode', mode);
  if (offerId) form.append('offer_id', offerId);
  photos.forEach((photo) => form.append('photos', photo as unknown as Blob));
  return requestJson<{ paths: string[]; urls?: string[] }>('/api/wanted-uploads', { method: 'POST', body: form }, deps);
}

export async function cleanupWantedPhotos(paths: string[], mode: 'reference' | 'offer', deps?: WantedClientDependencies): Promise<void> {
  await requestJson<{ ok: true }>('/api/wanted-uploads', json('DELETE', { paths, mode }), deps);
}

export async function fetchWantedNotifications(deps?: WantedClientDependencies): Promise<WantedNotificationEvent[]> {
  const body = await requestJson<{ notification_events: WantedNotificationEvent[] }>('/api/notification-events', {}, deps);
  return body.notification_events;
}

export async function updateWantedNotifications(ids: string[], action: 'read' | 'dismiss', deps?: WantedClientDependencies) {
  const body = await requestJson<{ notification_events: WantedNotificationEvent[] }>('/api/notification-events', json('PATCH', { ids, action }), deps);
  return body.notification_events;
}

export function wantedNotificationDestination(event: WantedNotificationEvent): string {
  if (event.event_type === 'new-offer') return '/(tabs)/requests?tab=wanted&direction=received';
  if (event.event_type === 'accepted' || event.event_type === 'declined' || event.event_type === 'expired') {
    return '/(tabs)/requests?tab=wanted&direction=sent';
  }
  if ((event.event_type === 'edit' || event.event_type === 'reminder') && event.wanted_post_id) {
    return `/wanted/${event.wanted_post_id}`;
  }
  return '/(tabs)/wanted';
}

export function wantedPushNotificationDestination(type: string, wantedPostId?: string | null): string | null {
  const eventType = type === 'wanted_reminder' ? 'reminder' : type === 'wanted_expired' ? 'expired' : type;
  if (!['new-offer', 'accepted', 'declined', 'expired', 'edit', 'reminder'].includes(eventType)) return null;
  return wantedNotificationDestination({
    id: '', event_key: '', event_type: eventType, wanted_post_id: wantedPostId ?? null,
    wanted_offer_id: null, title: '', body: '', created_at: '', read_at: null, dismissed_at: null,
  });
}
