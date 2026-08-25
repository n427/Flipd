// Flipd — shared types

export type PhotoTone = 'cream' | 'cardinal' | 'gold' | 'ink';
// 'food' is retired from CATEGORIES (no longer postable or filterable) but
// stays in the union: existing listings still carry it and must remain
// representable. Do not remove without migrating those rows.
export type CategoryId = 'all' | 'services' | 'food' | 'event' | 'housing' | 'goods';
export type ContactMethod = 'instagram' | 'email';

export interface Seller {
  id: string;
  name: string;
  unit: string;
  year: string;
  handle?: string;
  isDemo?: boolean;
  avatarUrl?: string;
}

export interface Profile {
  id: string;
  display_name: string | null;
  handle: string | null;
  school_unit: string | null;
  class_year: string | null;
  contact_method: ContactMethod | null;
  contact_instagram: string | null;
  contact_email: string | null;
  bio: string | null;
  avatar_url: string | null;
  notify_prefs: Record<string, { app?: boolean; email?: boolean }> | null;
  is_demo: boolean;
  created_at: string;
}

export interface Listing {
  id: string;
  category: CategoryId | string;
  categories?: (CategoryId | string)[];
  categoryLabel: string;
  categoryLabels?: string[];
  title: string;
  price?: number;
  priceLabel: string;
  negotiable?: boolean;
  seller: Seller;
  meta: string;
  lat?: number | null;
  lng?: number | null;
  placeName?: string | null;
  photoTone: PhotoTone;
  photoLabel: string;
  description?: string;
  photo_urls?: string[];
  photo_focus?: string[];
  photo_zoom?: string[];
  archived?: boolean;
  created_at?: string;
  mine?: boolean;
  eventPill?: string;
  eventStart?: string | null;
  eventEnd?: string | null;
  postedLabel?: string;
  contactMethods?: ContactMethod[];
  isNew?: boolean;
}

export type ActivityDir = 'in' | 'out';
export type ActivityStatus = 'PENDING' | 'APPROVED' | 'DECLINED' | 'EXPIRED' | 'COMPLETED';

export interface ActivityItem {
  id: string;
  dir: ActivityDir;
  who: string;
  // The other party's profile id, for fetching their trust signals.
  counterpartId?: string;
  school: string;
  avatarUrl?: string;
  listingTitle: string;
  listingId: string;
  listingArchived: boolean;
  listingRemoved: boolean;
  when: string;
  // Raw timestamp behind `when`, so date filters do not have to parse
  // a human label like "2d".
  createdAt: string;
  expiresAt: string;
  offer?: number;
  unread: boolean;
  dismissed: boolean;
  canRate: boolean;
  status: ActivityStatus;
  // The buyer's opening message: what the seller approves on.
  introMessage?: string;
  // Why the seller declined, when they picked a reason.
  declineReason?: string;
  // Set once approved. Contact details are never exchanged now — the
  // conversation happens in-app, and this points at it.
  threadId?: string;
}

export interface Category {
  id: CategoryId;
  label: string;
  icon: string;
}

export interface NewListingInput {
  category: CategoryId | string | null;
  title: string;
  price: string;
  negotiable: boolean;
  meta: string;
  contact: ContactMethod[];
  photoTone: PhotoTone;
  photoLabel: string;
  description?: string;
}

// Date range is a FILTER, not a sort: it narrows which listings show, and the
// sort then applies within that window. Mirrors FeedRange in the mobile app so
// both platforms offer the same windows.
export type FeedRange = 'day' | 'week' | 'month' | 'all';

export interface FilterArgs {
  activeCat?: CategoryId | string;
  query?: string;
  sort?: 'recent' | 'low' | 'high';
  range?: FeedRange;
  priceMin?: number | null;
  priceMax?: number | null;
}

// Ratings are anonymous — the rater is deliberately not carried here.
export interface RatingReview {
  score: number;
  text: string | null;
  created_at: string;
}

export interface RatingSummary {
  average: number | null;
  count: number;
  reviews: RatingReview[];
}

export interface WantedPostInput {
  title: string;
  category: 'goods' | 'services' | 'housing';
  max_budget: number;
  description: string;
  location: string;
  photo_urls: string[];
  needed_by: string;
}

// This is the complete public boundary for a wanted post. Keep it separate
// from database rows: offers and the buyer's identity are deliberately absent.
export interface WantedPostDTO {
  id: string;
  title: string;
  category: WantedPostInput['category'];
  max_budget: number;
  description: string;
  location: string;
  photo_urls: string[];
  needed_by: string;
  status: 'active' | 'fulfilled' | 'expired' | 'deleted';
  created_at: string;
  offer_count: number;
}
