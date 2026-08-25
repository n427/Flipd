import type { WantedPostDTO, WantedPostInput } from './types';
import type { WantedOfferDTO, WantedOfferInput } from './wanted-offers';

export type WantedFeedFilters = {
  q?: string;
  category?: WantedPostInput['category'] | 'all';
  budget?: number;
  location?: string;
  neededBefore?: string;
  mine?: boolean;
  status?: WantedPostDTO['status'];
  cursor?: string;
  limit?: number;
};

export type WantedOfferDirection = 'received' | 'sent';

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

export class WantedClientError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'WantedClientError';
  }
}

function append(params: URLSearchParams, key: string, value: string | number | undefined) {
  if (value !== undefined && value !== '') params.set(key, String(value));
}

export function wantedFeedUrl(filters: WantedFeedFilters = {}): string {
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

export function wantedOffersUrl(direction: WantedOfferDirection): string {
  return `/api/wanted-offers?role=${direction === 'received' ? 'buyer' : 'seller'}`;
}

export function prepareWantedPostInput(input: WantedPostInput): WantedPostInput {
  return {
    ...input,
    title: input.title.trim(),
    description: input.description.trim(),
    location: input.location.trim(),
    photo_urls: input.photo_urls.map((url) => url.trim()),
  };
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new WantedClientError(body.error || `Request failed (${response.status})`, response.status);
  return body as T;
}

function jsonInit(method: string, body: unknown): RequestInit {
  return { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

export const wantedClient = {
  async feed(filters: WantedFeedFilters = {}) {
    return requestJson<{ wanted_posts: WantedPostDTO[]; next_cursor: string | null }>(wantedFeedUrl(filters));
  },
  async getPost(id: string) {
    return requestJson<{ wanted_post: WantedPostDTO }>(`/api/wanted/${id}`);
  },
  async createPost(input: WantedPostInput) {
    return requestJson<{ wanted_post: WantedPostDTO }>('/api/wanted', jsonInit('POST', prepareWantedPostInput(input)));
  },
  async updatePost(id: string, input: WantedPostInput) {
    return requestJson<{ wanted_post: WantedPostDTO }>(`/api/wanted/${id}`, jsonInit('PATCH', prepareWantedPostInput(input)));
  },
  async deletePost(id: string) {
    return requestJson<{ wanted_post: WantedPostDTO }>(`/api/wanted/${id}`, { method: 'DELETE' });
  },
  async offers(direction: WantedOfferDirection) {
    return requestJson<{ wanted_offers: WantedOfferDTO[] }>(wantedOffersUrl(direction));
  },
  async offersForPost(postId: string) {
    return requestJson<{ wanted_offers: WantedOfferDTO[] }>(`/api/wanted/${postId}/offers`);
  },
  async createOffer(postId: string, id: string, input: WantedOfferInput) {
    return requestJson<{ wanted_offer: WantedOfferDTO }>(`/api/wanted/${postId}/offers`, jsonInit('POST', { id, ...input }));
  },
  async updateOffer(id: string, input: WantedOfferInput) {
    return requestJson<{ wanted_offer: WantedOfferDTO }>(`/api/wanted-offers/${id}`, jsonInit('PATCH', { action: 'edit', ...input }));
  },
  async resolveOffer(id: string, action: 'withdraw' | 'decline') {
    return requestJson<{ wanted_offer: WantedOfferDTO }>(
      `/api/wanted-offers/${id}`,
      action === 'withdraw' ? { method: 'DELETE' } : jsonInit('PATCH', { action: 'decline' }),
    );
  },
  async acceptOffer(id: string) {
    return requestJson<{ thread_id: string }>(`/api/wanted-offers/${id}/accept`, { method: 'POST' });
  },
  async notifications() {
    return requestJson<{ notification_events: WantedNotificationEvent[] }>('/api/notification-events');
  },
  async updateNotifications(ids: string[], action: 'read' | 'dismiss') {
    return requestJson<{ notification_events: WantedNotificationEvent[] }>(
      '/api/notification-events', jsonInit('PATCH', { ids, action }),
    );
  },
};
