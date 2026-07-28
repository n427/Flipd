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
