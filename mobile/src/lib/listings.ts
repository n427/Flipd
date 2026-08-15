import { File } from 'expo-file-system';
import { decode } from 'base64-arraybuffer';
import { supabase } from './supabase';
import { orFilterForSearch } from './searchTerm';

export type FeedSeller = {
  id: string;
  display_name: string | null;
  school_unit: string | null;
  class_year: string | null;
  avatar_url: string | null;
};

export type FeedListing = {
  id: string;
  title: string;
  price: number;
  location: string | null;
  photo_urls: string[];
  seller_id: string;
  category: string | null;
  created_at: string;
  seller: FeedSeller | null;
};

export function priceLabel(price: number): string {
  return price > 0 ? '$' + price.toLocaleString('en-US') : 'Free';
}

// RLS-safe feed fetch: two queries merged client-side. Seller info comes
// from public_profiles (the base profiles table is not readable for others
// under RLS, so a listings->profiles embedded join returns null).
export type FeedSort = 'recent' | 'price_low' | 'price_high';

// Date range is a FILTER, not a sort: it narrows which listings come back, and
// the sort then applies within that window. So "Price ↑ / past week" means the
// cheapest listings posted in the last 7 days, not the cheapest overall.
export type FeedRange = 'day' | 'week' | 'month' | 'all';

// Days back from now. 'all' has no cutoff.
const RANGE_DAYS: Record<Exclude<FeedRange, 'all'>, number> = { day: 1, week: 7, month: 30 };

/** Cutoff timestamp for a range, or null when unbounded. */
export function rangeSince(range: FeedRange | undefined): string | null {
  if (!range || range === 'all') return null;
  const days = RANGE_DAYS[range];
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

export type FeedQuery = {
  query?: string;
  category?: string | null; // null/'all' → all categories
  sort?: FeedSort;
  range?: FeedRange;
  blockedIds?: string[];
  limit?: number;
  offset?: number;
};

const PAGE = 20;

// Query-backed feed: search (title/description), category, sort, and paging are
// all pushed to the DB. Returns hasMore so the UI can lazy-load the next page.
export async function fetchFeed(opts: FeedQuery = {}): Promise<{ listings: FeedListing[]; hasMore: boolean }> {
  const limit = opts.limit ?? PAGE;
  const offset = opts.offset ?? 0;

  let q = supabase
    .from('listings')
    .select('id, title, price, location, photo_urls, seller_id, category, created_at')
    .eq('archived', false);

  if (opts.category && opts.category !== 'all') q = q.eq('category', opts.category);
  if (opts.query) {
    const filter = orFilterForSearch(opts.query);
    if (filter) q = q.or(filter);
  }
  // Exclude blocked sellers server-side so paging counts stay correct.
  if (opts.blockedIds && opts.blockedIds.length) {
    q = q.not('seller_id', 'in', `(${opts.blockedIds.join(',')})`);
  }
  // Applied before the sort, so price ordering ranks only in-window listings.
  const since = rangeSince(opts.range);
  if (since) q = q.gte('created_at', since);

  if (opts.sort === 'price_low') q = q.order('price', { ascending: true, nullsFirst: true });
  else if (opts.sort === 'price_high') q = q.order('price', { ascending: false, nullsFirst: false });
  else q = q.order('created_at', { ascending: false });

  // Fetch one extra row to detect a next page without a count query.
  const { data: rows, error } = await q.range(offset, offset + limit);
  if (error) throw error;
  const all = (rows ?? []) as Omit<FeedListing, 'seller'>[];
  const hasMore = all.length > limit;
  const page = hasMore ? all.slice(0, limit) : all;

  const sellerIds = [...new Set(page.map((l) => l.seller_id))];
  const sellerMap = new Map<string, FeedSeller>();
  if (sellerIds.length) {
    const { data: sellers, error: se } = await supabase
      .from('public_profiles')
      .select('id, display_name, school_unit, class_year, avatar_url')
      .in('id', sellerIds);
    if (se) throw se;
    for (const s of (sellers ?? []) as FeedSeller[]) sellerMap.set(s.id, s);
  }

  return {
    listings: page.map((l) => ({
      ...l,
      price: l.price ?? 0,
      photo_urls: l.photo_urls ?? [],
      seller: sellerMap.get(l.seller_id) ?? null,
    })),
    hasMore,
  };
}

export type ListingDetail = {
  id: string;
  title: string;
  price: number;
  negotiable: boolean;
  description: string | null;
  category: string | null;
  location: string | null;
  photo_urls: string[];
  lat: number | null;
  lng: number | null;
  place_name: string | null;
  event_start: string | null;
  event_end: string | null;
  archived: boolean;
  seller_id: string;
  seller: FeedSeller | null;
};

// Single listing for the detail screen. Same RLS-safe pattern as fetchFeed:
// seller info from public_profiles, never the base profiles table.
export async function fetchListing(id: string): Promise<ListingDetail | null> {
  const { data: row, error } = await supabase
    .from('listings')
    .select(
      'id, title, price, negotiable, description, category, location, photo_urls, lat, lng, place_name, event_start, event_end, archived, seller_id',
    )
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!row) return null;

  const { data: s, error: se } = await supabase
    .from('public_profiles')
    .select('id, display_name, school_unit, class_year, avatar_url')
    .eq('id', row.seller_id)
    .maybeSingle();
  if (se) throw se;

  return {
    ...(row as Omit<ListingDetail, 'seller'>),
    price: row.price ?? 0,
    negotiable: row.negotiable ?? false,
    photo_urls: row.photo_urls ?? [],
    archived: row.archived ?? false,
    seller: (s as FeedSeller) ?? null,
  };
}

// Upload local image URIs (from expo-image-picker) to listing-photos/{userId}/.
// RN reliable path: read file as base64 -> ArrayBuffer -> upload. Returns the
// public URLs in order. Storage RLS (migration 021) enforces the {uid}/ folder,
// so userId must be the caller's own auth uid.
export async function uploadListingPhotos(localUris: string[], userId: string): Promise<string[]> {
  const urls: string[] = [];
  for (let i = 0; i < localUris.length; i++) {
    const uri = localUris[i];
    const base64 = await new File(uri).base64();
    const path = `${userId}/${i}-${Date.now()}.jpg`;
    const { error } = await supabase.storage
      .from('listing-photos')
      .upload(path, decode(base64), { contentType: 'image/jpeg', upsert: false });
    if (error) throw error;
    const { data } = supabase.storage.from('listing-photos').getPublicUrl(path);
    urls.push(data.publicUrl);
  }
  return urls;
}

export type NewListing = {
  seller_id: string;
  title: string;
  price: number;
  description: string | null;
  category: string;
  location: string | null;
  place_name: string | null;
  lat: number | null;
  lng: number | null;
  negotiable: boolean;
  photo_urls: string[];
  // Popups only (category 'event'). Both set together or both null — a
  // half-open window would render as a popup with no end time.
  event_start: string | null;
  event_end: string | null;
};

// Direct insert (RLS listings_insert_own requires seller_id = auth.uid()).
// Returns the new listing id.
export async function createListing(input: NewListing): Promise<string> {
  const { data, error } = await supabase
    .from('listings')
    .insert({
      seller_id: input.seller_id,
      title: input.title,
      price: input.price,
      description: input.description,
      category: input.category,
      location: input.location,
      place_name: input.place_name,
      lat: input.lat,
      lng: input.lng,
      negotiable: input.negotiable,
      photo_urls: input.photo_urls,
      event_start: input.event_start,
      event_end: input.event_end,
    })
    .select('id')
    .single();
  if (error) throw error;
  return data.id as string;
}

// Per-event notification prefs. Both channels default ON — a stored `false`
// turns that channel off for that event. Matches the web/server shape.
export type NotifyEvent = 'new_request' | 'approval' | 'reminder' | 'expiry' | 'new_message' | 'popup_reminder';
// `app` is the key the web preference UI writes for push; `push` is the older
// name. Both are written and read so either client's saved shape is honoured.
export type NotifyPrefs = Partial<Record<NotifyEvent, { app?: boolean; email?: boolean; push?: boolean }>>;

export type MyProfile = {
  id: string;
  display_name: string | null;
  school_unit: string | null;
  class_year: string | null;
  bio: string | null;
  avatar_url: string | null;
  contact_instagram: string | null;
  contact_email: string | null;
  notify_prefs: NotifyPrefs;
  heard_from: string | null;
};

export async function fetchMyProfile(userId: string): Promise<MyProfile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, display_name, school_unit, class_year, bio, avatar_url, contact_instagram, contact_email, notify_prefs, heard_from')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { ...(data as MyProfile), notify_prefs: (data.notify_prefs as NotifyPrefs) ?? {} };
}

/** Own listings, active and sold. `archived` is what separates the two. */
export type MyListing = FeedListing & { archived: boolean };

export async function fetchMyListings(userId: string): Promise<MyListing[]> {
  const { data, error } = await supabase
    .from('listings')
    .select('id, title, price, location, photo_urls, seller_id, category, created_at, archived')
    .eq('seller_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return ((data ?? []) as Omit<MyListing, 'seller'>[]).map((l) => ({
    ...l,
    price: l.price ?? 0,
    photo_urls: l.photo_urls ?? [],
    archived: l.archived ?? false,
    seller: null,
  }));
}

// --- Saved listings (favorites) — direct-to-Supabase, own-row RLS ---
// Uses the same `saves` table the web app writes through /api/saves, so a
// listing saved on one platform shows as saved on the other. An earlier
// migration introduced a parallel `saved_listings` table; it was never applied
// and would have split saves across two stores, so it was dropped.

// IDs the user has saved, for hydrating heart state on cards/detail.
export async function fetchSavedIds(userId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('saves')
    .select('listing_id')
    .eq('user_id', userId);
  if (error) throw error;
  return (data ?? []).map((r) => r.listing_id as string);
}

// Toggle a save. Returns the new saved state so callers can update optimistically.
export async function toggleSaved(userId: string, listingId: string, saved: boolean): Promise<boolean> {
  if (saved) {
    const { error } = await supabase
      .from('saves')
      .delete()
      .eq('user_id', userId)
      .eq('listing_id', listingId);
    if (error) throw error;
    return false;
  }
  const { error } = await supabase
    .from('saves')
    .insert({ user_id: userId, listing_id: listingId });
  // Ignore a duplicate-save race (already saved elsewhere).
  if (error && error.code !== '23505') throw error;
  return true;
}

// The user's saved listings, newest-saved first, as feed cards. Archived/removed
// listings are dropped. Two-step (saves → listings by id) rather than an
// embedded join, so it doesn't depend on PostgREST's FK-relationship cache.
export async function fetchSavedListings(userId: string): Promise<FeedListing[]> {
  const { data: saves, error } = await supabase
    .from('saves')
    .select('listing_id, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  const orderedIds = (saves ?? []).map((s) => s.listing_id as string);
  if (orderedIds.length === 0) return [];

  const { data: rows, error: le } = await supabase
    .from('listings')
    .select('id, title, price, location, photo_urls, seller_id, category, created_at')
    .in('id', orderedIds)
    .eq('archived', false);
  if (le) throw le;
  const byId = new Map((rows ?? []).map((l) => [l.id as string, l as Omit<FeedListing, 'seller'>]));

  const sellerIds = [...new Set((rows ?? []).map((l) => l.seller_id as string))];
  const sellerMap = new Map<string, FeedSeller>();
  if (sellerIds.length) {
    const { data: sellers, error: se } = await supabase
      .from('public_profiles')
      .select('id, display_name, school_unit, class_year, avatar_url')
      .in('id', sellerIds);
    if (se) throw se;
    for (const s of (sellers ?? []) as FeedSeller[]) sellerMap.set(s.id, s);
  }

  // Preserve saved-order (newest first); skip archived/removed (not in byId).
  return orderedIds
    .map((id) => byId.get(id))
    .filter((l): l is Omit<FeedListing, 'seller'> => !!l)
    .map((l) => ({
      ...l,
      price: l.price ?? 0,
      photo_urls: l.photo_urls ?? [],
      seller: sellerMap.get(l.seller_id) ?? null,
    }));
}

// The other party on a reveal (buyer sees seller, seller sees buyer).
export type RevealCounterpart = {
  id: string;
  display_name: string | null;
  school_unit: string | null;
  class_year: string | null;
  avatar_url: string | null;
};

// Contact methods shared once a request is approved/completed. Only the methods
// each side actually offered are present.

export type RevealRequest = {
  id: string;
  status: string;
  offer: number | null;
  created_at: string;
  listing_id: string;
  listing_title: string | null;
  counterpart: RevealCounterpart | null;
  // What the buyer wrote when asking: the basis for the seller's decision.
  intro_message?: string | null;
  decline_reason?: string | null;
  // Present once approved. Contact details are never exchanged now — the
  // conversation happens in-app and this points at it.
  thread_id?: string | null;
  // Sellers: an unseen incoming request. Buyers: an unseen resolution.
  unread?: boolean;
  // Completed and the viewer hasn't left their rating yet.
  can_rate?: boolean;
};

// Reveal requests where the user is buyer or seller. Goes through the token-
// authed web API (GET /api/reveals) rather than a direct query, because the API
// resolves the shared contact server-side once approved — RLS won't let the
// client join the other party's private contact columns.
// Returns { incoming: I'm the seller, outgoing: I'm the buyer }.
export async function fetchRequests(
  _userId: string,
): Promise<{ incoming: RevealRequest[]; outgoing: RevealRequest[] }> {
  const token = await requireToken();
  const res = await fetch(`${API_BASE}/api/reveals`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed (${res.status})`);
  }
  const json = (await res.json()) as { incoming: RevealRequest[]; outgoing: RevealRequest[] };
  return { incoming: json.incoming ?? [], outgoing: json.outgoing ?? [] };
}

// Leave a rating (1-5 + optional text) for the other party of a completed
// transaction. Anonymous. 409 if already rated.
export async function submitRating(
  requestId: string,
  score: number,
  text: string,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const token = await requireToken();
  const res = await fetch(`${API_BASE}/api/ratings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ request_id: requestId, score, text: text.trim() || undefined }),
  });
  if (res.ok) return { ok: true };
  const body = await res.json().catch(() => ({}));
  return { ok: false, status: res.status, error: body.error || `Request failed (${res.status})` };
}

export type RatingSummary = {
  average: number | null;
  count: number;
  reviews: { score: number; text: string | null; created_at: string }[];
};

// Aggregate rating + recent anonymous reviews for a profile. Returns an empty
// summary on failure so a profile still renders without ratings.
export async function fetchRatings(userId: string): Promise<RatingSummary> {
  try {
    const token = await requireToken();
    const res = await fetch(`${API_BASE}/api/ratings?user=${userId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return { average: null, count: 0, reviews: [] };
    return (await res.json()) as RatingSummary;
  } catch {
    return { average: null, count: 0, reviews: [] };
  }
}

export type ReportReason = 'scam' | 'prohibited' | 'harassment' | 'other';

// Block a user — mutual block hides them from feed/search and prevents reveals
// in either direction. Idempotent (upsert server-side).
export async function blockUser(userId: string): Promise<void> {
  const token = await requireToken();
  const res = await fetch(`${API_BASE}/api/blocks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ user_id: userId }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed (${res.status})`);
  }
}

export async function unblockUser(userId: string): Promise<void> {
  const token = await requireToken();
  const res = await fetch(`${API_BASE}/api/blocks`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ user_id: userId }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed (${res.status})`);
  }
}

// IDs the user has blocked, so surfaces can filter them out. Empty on failure.
export async function fetchBlockedIds(): Promise<string[]> {
  try {
    const token = await requireToken();
    const res = await fetch(`${API_BASE}/api/blocks`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return [];
    return ((await res.json()).ids as string[]) ?? [];
  } catch {
    return [];
  }
}

// Report a user or listing. Capture only — routed to moderation later.
export async function reportUser(
  target: { userId?: string; listingId?: string },
  reason: ReportReason,
  note: string,
): Promise<void> {
  const token = await requireToken();
  const res = await fetch(`${API_BASE}/api/reports`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      user_id: target.userId,
      listing_id: target.listingId,
      reason,
      note: note.trim() || undefined,
    }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed (${res.status})`);
  }
}

// Mark all the user's reveals seen (clears the unread badge). Best-effort.
export async function markRevealsSeen(): Promise<void> {
  try {
    const token = await requireToken();
    await fetch(`${API_BASE}/api/reveals/seen`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ mark: 'seen' }),
    });
  } catch {
    // ignore — a failed mark-seen just leaves the badge until next load
  }
}

// New listings (from other sellers) posted since a timestamp — drives the bell
// tab's event dot. Returns 0 on any failure.
export async function countNewListingsSince(sinceIso: string, userId: string): Promise<number> {
  try {
    const { count, error } = await supabase
      .from('listings')
      .select('id', { count: 'exact', head: true })
      .eq('archived', false)
      .neq('seller_id', userId)
      .gt('created_at', sinceIso);
    if (error) return 0;
    return count ?? 0;
  } catch {
    return 0;
  }
}

// Count of reveals needing the user's attention, for the tab badge. Returns 0
// on any failure (a badge should never break navigation).
export async function fetchUnreadCount(): Promise<number> {
  try {
    const { incoming, outgoing } = await fetchRequests('');
    return [...incoming, ...outgoing].filter((r) => r.unread).length;
  } catch {
    return 0;
  }
}

// Another user's PUBLIC profile (safe columns only, via public_profiles) +
// their active listings. Used by the tappable seller profile screen.
export async function fetchPublicProfile(userId: string): Promise<FeedSeller | null> {
  const { data, error } = await supabase
    .from('public_profiles')
    .select('id, display_name, school_unit, class_year, avatar_url')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  return (data as FeedSeller) ?? null;
}

export async function fetchUserListings(userId: string): Promise<FeedListing[]> {
  const { data, error } = await supabase
    .from('listings')
    .select('id, title, price, location, photo_urls, seller_id, category, created_at')
    .eq('seller_id', userId)
    .eq('archived', false)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return ((data ?? []) as Omit<FeedListing, 'seller'>[]).map((l) => ({
    ...l,
    price: l.price ?? 0,
    photo_urls: l.photo_urls ?? [],
    seller: null,
  }));
}

// Generate a listing description via the web API (server-side Anthropic key).
// Sends the user's Supabase access token so the route can authenticate the
// mobile client (see web src/lib/supabase/authAny.ts).
export const API_BASE = 'https://www.flipdcampus.com';
export async function generateDescription(title: string, category: string): Promise<string> {
  const token = await requireToken();
  const res = await fetch(`${API_BASE}/api/generate-description`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ title, category }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed (${res.status})`);
  }
  const body = await res.json();
  return body.description as string;
}

// Contact channels, in the order that decides the primary one. Mirrors
// METHOD_ORDER in web src/lib/validation.ts — /api/me validates contact_method
// against the same list. Email is the only one left: Instagram was never a
// notification destination, and phone went with the SMS channel.
const METHOD_ORDER = ['email'] as const;

export type OnboardingInput = {
  display_name: string;
  class_year: string;
  school_unit: string | null;
  heard_from: string;
  heard_from_detail: string | null;
  // Notification destinations, never shown to other users.
  contact_email: string | null;
  notify_prefs?: Record<string, { app?: boolean; email?: boolean }>;
};

// Finish onboarding. Goes through /api/me rather than a direct table write so
// the server keeps enforcing the heard_from CHECK and its write-once rule —
// a direct Supabase update would bypass both.
export async function completeOnboarding(input: OnboardingInput): Promise<void> {
  const token = await requireToken();
  const contact_method =
    METHOD_ORDER.find((m) => input[`contact_${m}` as keyof OnboardingInput]) ?? null;
  const res = await fetch(`${API_BASE}/api/me`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ ...input, contact_method }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Could not save (${res.status})`);
  }
}

// Update the signed-in user's own profile (RLS profiles_update_own allows it).
export async function updateMyProfile(
  userId: string,
  patch: {
    display_name?: string | null;
    bio?: string | null;
    school_unit?: string | null;
    class_year?: string | null;
    contact_instagram?: string | null;
    contact_email?: string | null;
    notify_prefs?: NotifyPrefs;
  },
): Promise<void> {
  const { error } = await supabase.from('profiles').update(patch).eq('id', userId);
  if (error) throw error;
}

// Seller responds to a reveal request (approve/decline/complete) via the
// token-authed web API. Reveal writes go through the server so the mutual-
// reveal rules + emails run (RLS blocks direct client writes by design).
// When markSold is passed with an approve, the server also archives the
// listing and auto-declines its other pending requests.
export async function respondReveal(
  id: string,
  action: 'approve' | 'decline' | 'complete',
  markSold = false,
  declineReason?: string | null,
): Promise<void> {
  const token = await requireToken();
  const res = await fetch(`${API_BASE}/api/reveals/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ action, mark_sold: markSold, decline_reason: declineReason ?? null }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed (${res.status})`);
  }
}

// Upload a profile photo. Goes through the web API (service-role writes the
// avatars bucket + profiles.avatar_url), so no client storage RLS is needed.
// Returns the new public avatar URL. Do NOT set Content-Type — RN fills the
// multipart boundary itself.
export async function uploadAvatar(localUri: string): Promise<string> {
  const token = await requireToken();
  const ext = (localUri.split('.').pop() || 'jpg').toLowerCase();
  const form = new FormData();
  form.append('photo', {
    uri: localUri,
    name: `avatar.${ext}`,
    type: `image/${ext === 'jpg' ? 'jpeg' : ext}`,
  } as unknown as Blob);
  const res = await fetch(`${API_BASE}/api/me/avatar`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Upload failed (${res.status})`);
  }
  return (await res.json()).avatar_url as string;
}

// Buyer asks about a listing. introMessage is required: it's what the seller
// approves on, and for services it's the only way they know what's being asked.
// The server rejects contact details in it with a 422, so the UI runs the same
// check first for fast feedback.
export async function createReveal(
  listingId: string,
  introMessage: string,
  offer: number | null,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const token = await requireToken();
  const res = await fetch(`${API_BASE}/api/reveals`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ listing_id: listingId, intro_message: introMessage, offer }),
  });
  if (res.ok) return { ok: true };
  const body = await res.json().catch(() => ({}));
  return { ok: false, status: res.status, error: body.error || `Request failed (${res.status})` };
}

// Bearer token for the token-authed web routes.
//
// getSession() hands back whatever is cached without necessarily refreshing it,
// so an hour into a session the access token is expired and every API-backed
// action (Fill with AI, delete, mark sold, edit) fails with 'unauthorized'
// while direct Supabase queries keep working. Refresh when the token is
// expired or nearly so.
export async function requireToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  let session = data.session;
  if (!session) throw new Error('Not signed in.');

  // expires_at is epoch seconds. Refresh with a minute of headroom so a token
  // can't expire in flight.
  const expiresAt = session.expires_at ?? 0;
  if (expiresAt * 1000 - Date.now() < 60_000) {
    const { data: refreshed, error } = await supabase.auth.refreshSession();
    if (error || !refreshed.session) throw new Error('Your session expired. Sign in again.');
    session = refreshed.session;
  }
  return session.access_token;
}

// Permanently delete a listing you own. The server also cleans up its photos
// and softly declines any pending requests on it.
export async function deleteListing(id: string): Promise<void> {
  const token = await requireToken();
  const res = await fetch(`${API_BASE}/api/listings/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Delete failed (${res.status})`);
  }
}

// Mark sold (archived=true) or relist (archived=false). Archived listings drop
// out of the feed but stay visible to you.
export async function setListingArchived(id: string, archived: boolean): Promise<void> {
  const token = await requireToken();
  const res = await fetch(`${API_BASE}/api/listings/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ archived }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Update failed (${res.status})`);
  }
}

export type EditListing = {
  title: string;
  price: number;
  description: string | null;
  category: string;
  negotiable: boolean;
  location: string | null;
  place_name: string | null;
  lat: number | null;
  lng: number | null;
  // Final photo order: existing photo URLs (kept) interleaved with local file
  // URIs (new). New URIs are detected as anything not starting with http.
  photos: string[];
};

// Full edit via the multipart PATCH. Builds the photo_manifest the route
// expects: kept URLs pass through as-is, new local URIs become '__new__'
// markers with the file appended to `photos` in order.
export async function updateListing(id: string, input: EditListing): Promise<void> {
  const token = await requireToken();
  const form = new FormData();
  form.append('title', input.title);
  form.append('price', String(input.price));
  form.append('description', input.description ?? '');
  form.append('category', input.category);
  form.append('categories', JSON.stringify([input.category]));
  form.append('negotiable', String(input.negotiable));
  form.append('location', input.location ?? '');
  form.append('place_name', input.place_name ?? '');
  if (input.lat != null) form.append('lat', String(input.lat));
  if (input.lng != null) form.append('lng', String(input.lng));

  const manifest: string[] = [];
  for (const p of input.photos) {
    if (p.startsWith('http')) {
      manifest.push(p);
    } else {
      manifest.push('__new__');
      const ext = (p.split('.').pop() || 'jpg').toLowerCase();
      form.append('photos', {
        uri: p,
        name: `photo.${ext}`,
        type: `image/${ext === 'jpg' ? 'jpeg' : ext}`,
      } as unknown as Blob);
    }
  }
  form.append('photo_manifest', JSON.stringify(manifest));

  const res = await fetch(`${API_BASE}/api/listings/${id}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Update failed (${res.status})`);
  }
}

// AI safety review of the person on the other side of a request. `role` is what
// THEY are: a buyer asks about the 'seller' before sending, a seller asks about
// the 'buyer' before approving.
export type SafetyReview = {
  verdict: 'looks_good' | 'mixed' | 'thin';
  summary: string;
  signals: string[];
};

export async function fetchSafetyReview(
  userId: string,
  role: 'seller' | 'buyer',
): Promise<SafetyReview | null> {
  const token = await requireToken();
  const res = await fetch(`${API_BASE}/api/safety?user=${userId}&role=${role}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  // Advisory only — a failure here must never block the transaction.
  if (!res.ok) return null;
  const body = await res.json().catch(() => ({}));
  return (body.review as SafetyReview) ?? null;
}

// Popup reminders. Direct Supabase like saves — migration 017 gives the user
// self select/insert/delete on popup_reminders. The web's /api/popup-reminders
// route is cookie-only, so it is not reachable from a Bearer-token client.
export async function fetchReminderIds(userId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('popup_reminders')
    .select('listing_id')
    .eq('user_id', userId);
  if (error) throw error;
  return (data ?? []).map((r) => r.listing_id as string);
}

export async function toggleReminder(userId: string, listingId: string, on: boolean): Promise<boolean> {
  if (on) {
    const { error } = await supabase
      .from('popup_reminders')
      .delete()
      .eq('user_id', userId)
      .eq('listing_id', listingId);
    if (error) throw error;
    return false;
  }
  const { error } = await supabase
    .from('popup_reminders')
    .insert({ user_id: userId, listing_id: listingId });
  // Ignore a duplicate race (reminder already set on another device).
  if (error && error.code !== '23505') throw error;
  return true;
}
