// Flipd — shared types

export type PhotoTone = 'cream' | 'cardinal' | 'gold' | 'ink';
export type CategoryId = 'all' | 'services' | 'food' | 'event' | 'housing' | 'goods';
export type ContactMethod = 'instagram' | 'phone' | 'email';

export interface Seller {
  name: string;
  unit: string;
  year: string;
  sales: number;
  first?: string;
  handle?: string;
}

export interface Listing {
  id: string;
  category: CategoryId | string;
  categoryLabel: string;
  title: string;
  price?: number;
  priceLabel: string;
  seller: Seller;
  meta: string;
  photoTone: PhotoTone;
  photoLabel: string;
  description?: string;
  photo_urls?: string[];
  photo_focus?: string[];
  archived?: boolean;
  created_at?: string;
  mine?: boolean;
  eventPill?: string;
  postedLabel?: string;
  contactMethod?: ContactMethod;
  isNew?: boolean;
}

export type ActivityDir = 'in' | 'out';
export type ActivityStatus = 'PENDING' | 'APPROVED' | 'DECLINED' | 'EXPIRED';

export interface ActivityItem {
  id: string;
  dir: ActivityDir;
  who: string;
  school: string;
  listingTitle: string;
  when: string;
  status: ActivityStatus;
  contact?: string;
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

export interface FilterArgs {
  activeCat?: CategoryId | string;
  query?: string;
  sort?: 'recent' | 'low' | 'high';
  priceFilter?: 'any' | 'free' | 'u25' | 'u100';
}
