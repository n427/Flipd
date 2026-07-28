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
    .select('id, title, price, location, photo_urls, seller_id')
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
