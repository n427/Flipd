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
export async function fetchFeed(): Promise<FeedListing[]> {
  const { data: rows, error } = await supabase
    .from('listings')
    .select('id, title, price, location, photo_urls, seller_id, category')
    .eq('archived', false)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  const listings = (rows ?? []) as Omit<FeedListing, 'seller'>[];

  const sellerIds = [...new Set(listings.map((l) => l.seller_id))];
  const sellerMap = new Map<string, FeedSeller>();
  if (sellerIds.length) {
    const { data: sellers, error: se } = await supabase
      .from('public_profiles')
      .select('id, display_name, school_unit, class_year, avatar_url')
      .in('id', sellerIds);
    if (se) throw se;
    for (const s of (sellers ?? []) as FeedSeller[]) sellerMap.set(s.id, s);
  }

  return listings.map((l) => ({
    ...l,
    price: l.price ?? 0,
    photo_urls: l.photo_urls ?? [],
    seller: sellerMap.get(l.seller_id) ?? null,
  }));
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
  seller_id: string;
  seller: FeedSeller | null;
};

// Single listing for the detail screen. Same RLS-safe pattern as fetchFeed:
// seller info from public_profiles, never the base profiles table.
export async function fetchListing(id: string): Promise<ListingDetail | null> {
  const { data: row, error } = await supabase
    .from('listings')
    .select(
      'id, title, price, negotiable, description, category, location, photo_urls, lat, lng, place_name, event_start, event_end, seller_id',
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

export type MyProfile = {
  id: string;
  display_name: string | null;
  school_unit: string | null;
  class_year: string | null;
  bio: string | null;
  avatar_url: string | null;
};

export async function fetchMyProfile(userId: string): Promise<MyProfile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, display_name, school_unit, class_year, bio, avatar_url')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  return (data as MyProfile) ?? null;
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

export type RevealRequest = {
  id: string;
  buyer_id: string;
  seller_id: string;
  status: string;
  offer: number | null;
  created_at: string;
  listing_id: string;
  listing_title: string | null;
};

// Reveal requests where the user is buyer or seller (RLS reveals_select_party).
// Returns { incoming: I'm the seller, outgoing: I'm the buyer }.
export async function fetchRequests(userId: string): Promise<{ incoming: RevealRequest[]; outgoing: RevealRequest[] }> {
  const { data, error } = await supabase
    .from('reveal_requests')
    .select('id, buyer_id, seller_id, status, offer, created_at, listing_id, listing_title')
    .or(`buyer_id.eq.${userId},seller_id.eq.${userId}`)
    .order('created_at', { ascending: false });
  if (error) throw error;
  const rows = (data ?? []) as RevealRequest[];
  return {
    incoming: rows.filter((r) => r.seller_id === userId),
    outgoing: rows.filter((r) => r.buyer_id === userId),
  };
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
  patch: { display_name?: string | null; bio?: string | null; school_unit?: string | null; class_year?: string | null },
): Promise<void> {
  const { error } = await supabase.from('profiles').update(patch).eq('id', userId);
  if (error) throw error;
}

// Seller responds to a reveal request (approve/decline/complete) via the
// token-authed web API. Reveal writes go through the server so the mutual-
// reveal rules + emails run (RLS blocks direct client writes by design).
export async function respondReveal(id: string, action: 'approve' | 'decline' | 'complete'): Promise<void> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Not signed in.');
  const res = await fetch(`${API_BASE}/api/reveals/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ action }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed (${res.status})`);
  }
}
