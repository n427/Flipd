// Flipd — shared interactive store (ported from store.jsx)
// One hook the web app mounts at its root. Holds listings (incl. user-posted),
// saved set, and activity feed, plus the actions that make every feature work.
// In-memory only — no database yet.
import React from 'react';
import { CATEGORIES, CURRENT_USER, MOCK_LISTINGS } from './data';
import type { ActivityItem, ActivityStatus, FilterArgs, Listing, NewListingInput } from './types';

// A few listings authored by the current user (for "My Listings")
const MY_SEED: Listing[] = [
  {
    id: 'me1', mine: true, category: 'goods', categoryLabel: 'Goods',
    title: 'Desk lamp + monitor riser', price: 30, priceLabel: '$30',
    seller: { ...CURRENT_USER }, meta: 'USC Village · pickup only',
    photoTone: 'cream', photoLabel: 'desk lamp', postedLabel: '3d ago',
  },
  {
    id: 'me2', mine: true, category: 'services', categoryLabel: 'Services',
    title: 'Resume + cover-letter edits', price: 25, priceLabel: '$25',
    seller: { ...CURRENT_USER }, meta: 'Zoom · 24h turnaround',
    photoTone: 'ink', photoLabel: 'resume edit', postedLabel: '1w ago',
  },
];

// Shape a raw Supabase listings row into the UI's Listing model.
// The DB stores snake_case columns (seller_id, photo_urls, contact, location)
// and none of the presentational fields the components need (seller object,
// priceLabel, categoryLabel, photoTone, etc.). Both the fetch-on-mount path
// and addListing route their rows through this so the feed always gets a
// fully-shaped Listing.
type DbListing = {
  id: string;
  category: string;
  title: string;
  description?: string | null;
  price?: number | null;
  location?: string | null;
  contact?: string[] | null;
  photo_urls?: string[] | null;
  photo_focus?: string[] | null;
  archived?: boolean | null;
  created_at?: string | null;
};

// Format an ISO timestamp as an absolute date, e.g. "Jun 2, 2026".
export function formatPostedDate(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function mapDbListing(row: DbListing): Listing {
  const price = row.price ?? 0;
  return {
    id: row.id,
    mine: true,
    category: row.category,
    categoryLabel: CATEGORIES.find((c) => c.id === row.category)?.label || 'Goods',
    title: row.title,
    description: row.description || undefined,
    price,
    priceLabel: price > 0 ? '$' + price : 'Free',
    seller: { ...CURRENT_USER },
    meta: row.location || 'USC · pickup',
    photoTone: 'cream',
    photoLabel: 'photo',
    photo_urls: row.photo_urls || [],
    photo_focus: row.photo_focus || [],
    archived: row.archived ?? false,
    created_at: row.created_at || undefined,
    postedLabel: formatPostedDate(row.created_at) || 'just now',
    contactMethod: (row.contact?.[0] as Listing['contactMethod']) || 'instagram',
    isNew: true,
  };
}

const DEFAULT_ACTIVITY: ActivityItem[] = [
  { id: 'a1', dir: 'in', who: 'Sofia R.', school: 'Dornsife', listingTitle: 'Desk lamp + monitor riser', when: '2h', status: 'PENDING' },
  { id: 'a2', dir: 'out', who: 'Maya M.', school: 'Marshall', listingTitle: 'Sourdough loaves', when: '6h', status: 'APPROVED', contact: '@maya.bakes.sc' },
  { id: 'a3', dir: 'in', who: 'Tyler N.', school: 'Marshall', listingTitle: 'Resume + cover-letter edits', when: '1d', status: 'APPROVED' },
  { id: 'a4', dir: 'out', who: 'Jada P.', school: 'Annenberg', listingTitle: 'Press-on nails', when: '2d', status: 'EXPIRED' },
];

export interface FlipdStore {
  CURRENT_USER: typeof CURRENT_USER;
  listings: Listing[];
  listingsLoading: boolean;
  savedIds: Set<string>;
  activity: ActivityItem[];
  isSaved: (id: string) => boolean;
  toggleSave: (id: string) => void;
  addListing: (formData: FormData) => Promise<Listing | null>;
  getListing: (id: string) => Promise<Listing | null>;
  setArchived: (id: string, archived: boolean) => Promise<boolean>;
  logReveal: (listing: Listing) => void;
  setActivityStatus: (id: string, status: ActivityStatus) => void;
  myListings: Listing[];
  pastListings: Listing[];
  savedListings: Listing[];
  pendingCount: number;
}

export function useFlipdStore(): FlipdStore {
  const [listings, setListings] = React.useState<Listing[]>([]);
  const [listingsLoading, setListingsLoading] = React.useState(true);
  const [savedIds, setSavedIds] = React.useState<Set<string>>(() => new Set());
  const [activity, setActivity] = React.useState<ActivityItem[]>(() => DEFAULT_ACTIVITY);

  React.useEffect(() => {
    fetch('/api/listings')
      .then((r) => r.json())
      .then(({ listings: fetched }) => {
        if (Array.isArray(fetched)) setListings(fetched.map(mapDbListing));
      })
      .catch(() => {})
      .finally(() => setListingsLoading(false));

    fetch('/api/saves')
      .then((r) => r.json())
      .then(({ ids }) => {
        if (Array.isArray(ids)) setSavedIds(new Set(ids));
      })
      .catch(() => {});
  }, []);

  const isSaved = (id: string) => savedIds.has(id);

  const toggleSave = (id: string) => {
    const willSave = !savedIds.has(id);
    // Optimistic local update.
    setSavedIds((prev) => {
      const next = new Set(prev);
      if (willSave) next.add(id);
      else next.delete(id);
      return next;
    });
    // Persist to DB.
    fetch('/api/saves', {
      method: willSave ? 'POST' : 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ listing_id: id }),
    }).catch(() => {
      // Roll back on failure.
      setSavedIds((prev) => {
        const next = new Set(prev);
        if (willSave) next.delete(id);
        else next.add(id);
        return next;
      });
    });
  };

  const addListing = async (formData: FormData): Promise<Listing | null> => {
    let res: Response;
    try {
      res = await fetch('/api/listings', { method: 'POST', body: formData });
    } catch (err) {
      console.error('[addListing] network error', err);
      throw new Error('Could not reach the server. Check your connection and try again.');
    }
    if (!res.ok) {
      let detail = `HTTP ${res.status}`;
      try {
        const body = await res.json();
        if (body?.error) detail = body.error;
      } catch {
        /* response had no JSON body */
      }
      console.error('[addListing] server rejected publish:', detail);
      throw new Error(detail);
    }
    const { listing } = await res.json();
    const mapped = mapDbListing(listing);
    setListings((prev) => [mapped, ...prev]);
    return mapped;
  };

  // Find a listing by id — from loaded state, else fetch it (works for
  // archived listings that aren't in the feed list).
  const getListing = async (id: string): Promise<Listing | null> => {
    const local = listings.find((l) => l.id === id);
    if (local) return local;
    const res = await fetch(`/api/listings/${id}`).catch(() => null);
    if (!res || !res.ok) return null;
    const { listing } = await res.json();
    return mapDbListing(listing);
  };

  // Archive (move to past) or restore a listing.
  const setArchived = async (id: string, archived: boolean): Promise<boolean> => {
    const res = await fetch(`/api/listings/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ archived }),
    }).catch(() => null);
    if (!res || !res.ok) {
      console.error('[setArchived] failed for', id);
      return false;
    }
    setListings((prev) => prev.map((l) => (l.id === id ? { ...l, archived } : l)));
    return true;
  };

  // Buyer taps Reveal → log an outgoing request (approved instantly in this demo)
  const logReveal = (listing: Listing) => {
    setActivity((prev) => [
      {
        id: 'r' + Date.now(),
        dir: 'out',
        who: listing.seller.first || listing.seller.name.split(' ')[0] + '.',
        school: listing.seller.unit,
        listingTitle: listing.title,
        when: 'just now',
        status: 'APPROVED',
        contact:
          listing.contactMethod === 'phone'
            ? '(213) 555-0147'
            : listing.contactMethod === 'email'
            ? (listing.seller.first?.toLowerCase() || 'maya') + '@usc.edu'
            : '@maya.bakes.sc',
      },
      ...prev,
    ]);
  };

  const setActivityStatus = (id: string, status: ActivityStatus) =>
    setActivity((prev) => prev.map((a) => (a.id === id ? { ...a, status } : a)));

  const myListings = listings.filter((l) => l.mine && !l.archived);
  const pastListings = listings.filter((l) => l.mine && l.archived);
  const savedListings = listings.filter((l) => savedIds.has(l.id) && !l.archived);
  const pendingCount = activity.filter((a) => a.dir === 'in' && a.status === 'PENDING').length;

  return {
    CURRENT_USER,
    listings, listingsLoading, savedIds, activity,
    isSaved, toggleSave, addListing, getListing, setArchived, logReveal, setActivityStatus,
    myListings, pastListings, savedListings, pendingCount,
  };
}

// Shared filter+sort helper used by the feed
export function filterListings(
  listings: Listing[],
  { activeCat = 'all', query = '', sort = 'recent', priceFilter = 'any' }: FilterArgs = {},
): Listing[] {
  let out = listings.filter((l) => {
    if (activeCat !== 'all' && l.category !== activeCat) return false;
    if (query) {
      const q = query.toLowerCase();
      const hay = (l.title + ' ' + l.meta + ' ' + l.categoryLabel + ' ' + l.seller.name).toLowerCase();
      if (!hay.includes(q)) return false;
    }
    const price = l.price ?? 0;
    if (priceFilter === 'free' && price !== 0) return false;
    if (priceFilter === 'u25' && price > 25) return false;
    if (priceFilter === 'u100' && price > 100) return false;
    return true;
  });
  if (sort === 'low') out = [...out].sort((a, b) => (a.price ?? 0) - (b.price ?? 0));
  if (sort === 'high') out = [...out].sort((a, b) => (b.price ?? 0) - (a.price ?? 0));
  return out;
}
