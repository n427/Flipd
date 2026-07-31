import * as FileSystem from 'expo-file-system';
import { decode } from 'base64-arraybuffer';
import { supabase } from './supabase';

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
  seller: FeedSeller | null;
};

export function priceLabel(price: number): string {
  return price > 0 ? '$' + price.toLocaleString('en-US') : 'Free';
}

// RLS-safe feed fetch: two queries merged client-side. Seller info comes
// from public_profiles (the base profiles table is not readable for others
// under RLS, so a listings->profiles embedded join returns null).
export type FeedSort = 'recent' | 'price_low' | 'price_high';
export type FeedQuery = {
  query?: string;
  category?: string | null; // null/'all' → all categories
  sort?: FeedSort;
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
    .select('id, title, price, location, photo_urls, seller_id, category')
    .eq('archived', false);

  if (opts.category && opts.category !== 'all') q = q.eq('category', opts.category);
  if (opts.query && opts.query.trim()) {
    const term = `%${opts.query.trim().replace(/[%_]/g, '')}%`;
    q = q.or(`title.ilike.${term},description.ilike.${term}`);
  }
  // Exclude blocked sellers server-side so paging counts stay correct.
  if (opts.blockedIds && opts.blockedIds.length) {
    q = q.not('seller_id', 'in', `(${opts.blockedIds.join(',')})`);
  }

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
    const base64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
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
    })
    .select('id')
    .single();
  if (error) throw error;
  return data.id as string;
}

// Per-event notification prefs. Both channels default ON — a stored `false`
// turns that channel off for that event. Matches the web/server shape.
export type NotifyEvent = 'new_request' | 'approval' | 'reminder' | 'expiry';
export type NotifyPrefs = Partial<Record<NotifyEvent, { email?: boolean; push?: boolean; sms?: boolean }>>;

export type MyProfile = {
  id: string;
  display_name: string | null;
  school_unit: string | null;
  class_year: string | null;
  bio: string | null;
  avatar_url: string | null;
  contact_instagram: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  notify_prefs: NotifyPrefs;
};

export async function fetchMyProfile(userId: string): Promise<MyProfile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, display_name, school_unit, class_year, bio, avatar_url, contact_instagram, contact_phone, contact_email, notify_prefs')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { ...(data as MyProfile), notify_prefs: (data.notify_prefs as NotifyPrefs) ?? {} };
}

export async function fetchMyListings(userId: string): Promise<FeedListing[]> {
  const { data, error } = await supabase
    .from('listings')
    .select('id, title, price, location, photo_urls, seller_id, category')
    .eq('seller_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return ((data ?? []) as Omit<FeedListing, 'seller'>[]).map((l) => ({
    ...l,
    price: l.price ?? 0,
    photo_urls: l.photo_urls ?? [],
    seller: null,
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
export type SharedContact = { instagram?: string; phone?: string; email?: string };

export type RevealRequest = {
  id: string;
  status: string;
  offer: number | null;
  created_at: string;
  listing_id: string;
  listing_title: string | null;
  counterpart: RevealCounterpart | null;
  // Present only when approved/completed — the contact you're owed.
  contact?: SharedContact;
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
    .select('id, title, price, location, photo_urls, seller_id, category')
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
const API_BASE = 'https://www.flipdcampus.com';
export async function generateDescription(title: string, category: string): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Not signed in.');
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

// Update the signed-in user's own profile (RLS profiles_update_own allows it).
export async function updateMyProfile(
  userId: string,
  patch: {
    display_name?: string | null;
    bio?: string | null;
    school_unit?: string | null;
    class_year?: string | null;
    contact_instagram?: string | null;
    contact_phone?: string | null;
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
): Promise<void> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Not signed in.');
  const res = await fetch(`${API_BASE}/api/reveals/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ action, mark_sold: markSold }),
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
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Not signed in.');
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

// The buyer's own stored contact methods, so the reveal sheet can offer only
// the ones they've actually filled in. Reading your own profile row is allowed
// by RLS. Keys match what the reveal API expects in buyer_contact.
export type MyContactMethods = { instagram?: string; phone?: string; email?: string };
export async function fetchMyContactMethods(userId: string): Promise<MyContactMethods> {
  const { data, error } = await supabase
    .from('profiles')
    .select('contact_instagram, contact_phone, contact_email')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  const out: MyContactMethods = {};
  if (data?.contact_instagram) out.instagram = data.contact_instagram;
  if (data?.contact_phone) out.phone = data.contact_phone;
  if (data?.contact_email) out.email = data.contact_email;
  return out;
}

// Buyer requests the seller's contact. methods = which of the buyer's OWN
// contact methods to share back (mutual reveal). offer is optional. Returns the
// server's error code so the UI can special-case 'already requested'.
export async function createReveal(
  listingId: string,
  methods: string[],
  offer: number | null,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const token = await requireToken();
  const res = await fetch(`${API_BASE}/api/reveals`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ listing_id: listingId, buyer_contact: methods, offer }),
  });
  if (res.ok) return { ok: true };
  const body = await res.json().catch(() => ({}));
  return { ok: false, status: res.status, error: body.error || `Request failed (${res.status})` };
}

// Bearer token for the token-authed web listing routes.
async function requireToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Not signed in.');
  return token;
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
