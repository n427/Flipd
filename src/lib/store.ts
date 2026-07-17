// Flipd — shared interactive store. One hook mounted at the app root.
// Hydrates everything from the API routes; no mock data.
import React from 'react';
import { CATEGORIES } from './data';
import type {
  ActivityItem, ActivityStatus, FilterArgs, Listing, Profile, RevealContact, Seller,
} from './types';
import { effectiveRevealStatus, type RevealStatus } from './validation';

type DbSeller = {
  id: string;
  display_name: string | null;
  handle: string | null;
  school_unit: string | null;
  class_year: string | null;
  is_demo: boolean;
} | null;

type DbListing = {
  id: string;
  seller_id: string;
  category: string;
  title: string;
  description?: string | null;
  price?: number | null;
  negotiable?: boolean | null;
  location?: string | null;
  contact?: string[] | null;
  photo_urls?: string[] | null;
  photo_focus?: string[] | null;
  archived?: boolean | null;
  spoken_for?: boolean | null;
  created_at?: string | null;
  seller?: DbSeller;
};

type RevealDto = {
  id: string;
  listing_id: string;
  listing_title: string;
  status: RevealStatus;
  created_at: string;
  expires_at: string;
  offer?: number | null;
  unread?: boolean;
  dismissed?: boolean;
  counterpart: { id: string; display_name: string | null; school_unit: string | null; class_year: string | null; avatar_url: string | null } | null;
  listing_archived?: boolean;
  listing_removed?: boolean;
  contact?: RevealContact;
};

export function formatPostedDate(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function classYearLabel(year: string | null): string {
  if (!year) return '';
  // Numeric years abbreviate ("2027" -> ’27); named years ("Junior") pass through.
  if (/^\d{4}$/.test(year)) return `’${year.slice(-2)}`;
  return year;
}

function mapSeller(row: DbListing): Seller {
  const s = row.seller;
  return {
    id: s?.id ?? row.seller_id,
    name: s?.display_name ?? 'Flipd member',
    unit: s?.school_unit ?? '',
    year: classYearLabel(s?.class_year ?? null),
    handle: s?.handle ?? undefined,
    isDemo: s?.is_demo ?? false,
  };
}

function mapDbListing(row: DbListing, meId: string | null): Listing {
  const price = row.price ?? 0;
  return {
    id: row.id,
    mine: meId !== null && row.seller_id === meId,
    category: row.category,
    categoryLabel: CATEGORIES.find((c) => c.id === row.category)?.label || 'Goods',
    title: row.title,
    description: row.description || undefined,
    price,
    priceLabel: price > 0 ? '$' + price.toLocaleString('en-US') : 'Free',
    negotiable: row.negotiable ?? false,
    seller: mapSeller(row),
    meta: row.location || 'USC · pickup',
    photoTone: 'cream',
    photoLabel: 'photo',
    photo_urls: row.photo_urls || [],
    photo_focus: row.photo_focus || [],
    archived: row.archived ?? false,
    spokenFor: row.spoken_for ?? false,
    created_at: row.created_at || undefined,
    postedLabel: formatPostedDate(row.created_at) || 'just now',
    contactMethod: (row.contact?.[0] as Listing['contactMethod']) || 'instagram',
  };
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

function mapReveal(dto: RevealDto, dir: 'in' | 'out'): ActivityItem {
  return {
    id: dto.id,
    dir,
    who: dto.counterpart?.display_name ?? 'Flipd member',
    school: [dto.counterpart?.school_unit, classYearLabel(dto.counterpart?.class_year ?? null)]
      .filter(Boolean).join(' '),
    avatarUrl: dto.counterpart?.avatar_url ?? undefined,
    listingTitle: dto.listing_title,
    listingId: dto.listing_id,
    listingArchived: dto.listing_archived ?? false,
    listingRemoved: dto.listing_removed ?? false,
    when: timeAgo(dto.created_at),
    expiresAt: dto.expires_at,
    offer: dto.offer ?? undefined,
    unread: dto.unread ?? false,
    dismissed: dto.dismissed ?? false,
    status: effectiveRevealStatus(dto.status, dto.expires_at).toUpperCase() as ActivityStatus,
    contact: dto.contact,
  };
}

export interface FlipdStore {
  me: Profile | null;
  listings: Listing[];
  listingsLoading: boolean;
  savedIds: Set<string>;
  activity: ActivityItem[];
  isSaved: (id: string) => boolean;
  toggleSave: (id: string) => void;
  addListing: (formData: FormData) => Promise<Listing | null>;
  updateListing: (id: string, formData: FormData) => Promise<Listing | null>;
  removeListing: (id: string) => Promise<boolean>;
  getListing: (id: string) => Promise<Listing | null>;
  setArchived: (id: string, archived: boolean) => Promise<boolean>;
  requestReveal: (listingId: string, offer?: number) => Promise<{ ok: boolean; error?: string }>;
  respondReveal: (id: string, action: 'approve' | 'decline' | 'complete', opts?: { markSold?: boolean }) => Promise<boolean>;
  latestRevealFor: (listingId: string) => ActivityItem | undefined;
  pendingByListing: Record<string, number>;
  unreadCount: number;
  markAllSeen: () => Promise<void>;
  dismissNotification: (id: string) => Promise<void>;
  refreshActivity: () => Promise<void>;
  refreshMe: () => Promise<void>;
  myRevealFor: (listingId: string) => ActivityItem | undefined;
  signOut: () => Promise<void>;
  myListings: Listing[];
  pastListings: Listing[];
  savedListings: Listing[];
  pendingCount: number;
}

export function useFlipdStore(): FlipdStore {
  const [me, setMe] = React.useState<Profile | null>(null);
  const [meId, setMeId] = React.useState<string | null>(null);
  const [listings, setListings] = React.useState<Listing[]>([]);
  const [listingsLoading, setListingsLoading] = React.useState(true);
  const [savedIds, setSavedIds] = React.useState<Set<string>>(() => new Set());
  const [activity, setActivity] = React.useState<ActivityItem[]>([]);

  const refreshActivity = React.useCallback(async () => {
    const res = await fetch('/api/reveals').catch(() => null);
    if (!res || !res.ok) return;
    const { incoming, outgoing } = await res.json();
    const items = [
      ...(incoming as RevealDto[]).map((r) => ({ dto: r, dir: 'in' as const })),
      ...(outgoing as RevealDto[]).map((r) => ({ dto: r, dir: 'out' as const })),
    ]
      .sort((a, b) => new Date(b.dto.created_at).getTime() - new Date(a.dto.created_at).getTime())
      .map(({ dto, dir }) => mapReveal(dto, dir));
    setActivity(items);
  }, []);

  React.useEffect(() => {
    let alive = true;

    fetch('/api/me')
      .then((r) => (r.ok ? r.json() : { profile: null }))
      .then(({ profile }) => {
        if (!alive) return;
        setMe(profile);
        const id = profile?.id ?? null;
        setMeId(id);
        // Listings need meId to compute `mine`; fetch after /api/me resolves.
        return fetch('/api/listings?include_archived=1')
          .then((r) => r.json())
          .then(({ listings: fetched }) => {
            if (alive && Array.isArray(fetched)) {
              setListings(fetched.map((row: DbListing) => mapDbListing(row, id)));
            }
          });
      })
      .catch(() => {})
      .finally(() => { if (alive) setListingsLoading(false); });

    fetch('/api/saves')
      .then((r) => r.json())
      .then(({ ids }) => { if (alive && Array.isArray(ids)) setSavedIds(new Set(ids)); })
      .catch(() => {});

    refreshActivity();
    const interval = setInterval(refreshActivity, 30_000);
    return () => { alive = false; clearInterval(interval); };
  }, [refreshActivity]);

  const isSaved = (id: string) => savedIds.has(id);

  const toggleSave = (id: string) => {
    const willSave = !savedIds.has(id);
    setSavedIds((prev) => {
      const next = new Set(prev);
      if (willSave) next.add(id); else next.delete(id);
      return next;
    });
    fetch('/api/saves', {
      method: willSave ? 'POST' : 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ listing_id: id }),
    }).catch(() => {
      setSavedIds((prev) => {
        const next = new Set(prev);
        if (willSave) next.delete(id); else next.add(id);
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
      } catch { /* no JSON body */ }
      throw new Error(detail);
    }
    const { listing } = await res.json();
    const mapped = mapDbListing(listing, meId);
    setListings((prev) => [mapped, ...prev]);
    return mapped;
  };

  const updateListing = async (id: string, formData: FormData): Promise<Listing | null> => {
    const res = await fetch(`/api/listings/${id}`, { method: 'PATCH', body: formData }).catch(() => null);
    if (!res || !res.ok) {
      let detail = res ? `HTTP ${res.status}` : 'Network error';
      try { const body = await res?.json(); if (body?.error) detail = body.error; } catch { /* no body */ }
      throw new Error(detail);
    }
    const { listing } = await res.json();
    const mapped = mapDbListing(listing, meId);
    setListings((prev) => prev.map((l) => (l.id === id ? mapped : l)));
    return mapped;
  };

  const removeListing = async (id: string): Promise<boolean> => {
    const res = await fetch(`/api/listings/${id}`, { method: 'DELETE' }).catch(() => null);
    if (!res || !res.ok) return false;
    setListings((prev) => prev.filter((l) => l.id !== id));
    await refreshActivity();
    return true;
  };

  const getListing = async (id: string): Promise<Listing | null> => {
    const local = listings.find((l) => l.id === id);
    if (local) return local;
    const res = await fetch(`/api/listings/${id}`).catch(() => null);
    if (!res || !res.ok) return null;
    const { listing } = await res.json();
    return mapDbListing(listing, meId);
  };

  const setArchived = async (id: string, archived: boolean): Promise<boolean> => {
    const res = await fetch(`/api/listings/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ archived }),
    }).catch(() => null);
    if (!res || !res.ok) return false;
    setListings((prev) => prev.map((l) => (l.id === id ? { ...l, archived } : l)));
    return true;
  };

  const requestReveal = async (listingId: string, offer?: number) => {
    const res = await fetch('/api/reveals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ listing_id: listingId, offer }),
    }).catch(() => null);
    if (!res) return { ok: false, error: 'Network error — try again.' };
    if (res.status === 409) { await refreshActivity(); return { ok: true }; }
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return { ok: false, error: body.error || `HTTP ${res.status}` };
    }
    await refreshActivity();
    return { ok: true };
  };

  const respondReveal = async (id: string, action: 'approve' | 'decline' | 'complete', opts: { markSold?: boolean } = {}) => {
    const res = await fetch(`/api/reveals/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, mark_sold: opts.markSold === true }),
    }).catch(() => null);
    if (!res || !res.ok) return false;
    setActivity((prev) => prev.map((a) =>
      a.id === id ? { ...a, status: action === 'approve' ? 'APPROVED' : action === 'complete' ? 'COMPLETED' : 'DECLINED' } : a,
    ));
    if (opts.markSold) {
      const sold = activity.find((a) => a.id === id);
      if (sold) {
        setListings((prev) => prev.map((l) => (l.id === sold.listingId ? { ...l, archived: true } : l)));
        await refreshActivity();
      }
    }
    return true;
  };

  const refreshMe = async () => {
    const res = await fetch('/api/me').catch(() => null);
    if (!res || !res.ok) return;
    const { profile } = await res.json();
    setMe(profile);
    setMeId(profile?.id ?? null);
  };

  const markAllSeen = async () => {
    setActivity((prev) => prev.map((a) => ({ ...a, unread: false })));
    await fetch('/api/reveals/seen', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mark: 'seen' }),
    }).catch(() => {});
  };

  const dismissNotification = async (id: string) => {
    setActivity((prev) => prev.map((a) => (a.id === id ? { ...a, dismissed: true } : a)));
    await fetch('/api/reveals/seen', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mark: 'dismiss', ids: [id] }),
    }).catch(() => {});
  };

  const myRevealFor = (listingId: string) =>
    activity.find((a) => a.dir === 'out' && a.listingId === listingId &&
      (a.status === 'PENDING' || a.status === 'APPROVED' || a.status === 'COMPLETED'));

  // Newest request regardless of status — activity is sorted newest-first.
  const latestRevealFor = (listingId: string) =>
    activity.find((a) => a.dir === 'out' && a.listingId === listingId);

  // Pending incoming requests per owned listing, for seller badges.
  const pendingByListing: Record<string, number> = {};
  for (const a of activity) {
    if (a.dir === 'in' && a.status === 'PENDING') {
      pendingByListing[a.listingId] = (pendingByListing[a.listingId] ?? 0) + 1;
    }
  }

  const signOut = async () => {
    await fetch('/api/auth/signout', { method: 'POST' }).catch(() => {});
    window.location.href = '/';
  };

  const myListings = listings.filter((l) => l.mine && !l.archived);
  const pastListings = listings.filter((l) => l.mine && l.archived);
  const savedListings = listings.filter((l) => savedIds.has(l.id) && !l.archived);
  const pendingCount = activity.filter((a) => a.dir === 'in' && a.status === 'PENDING').length;
  const unreadCount = activity.filter((a) => a.unread && !a.dismissed).length;

  return {
    me, listings, listingsLoading, savedIds, activity,
    isSaved, toggleSave, addListing, updateListing, removeListing, getListing, setArchived,
    requestReveal, respondReveal, refreshActivity, refreshMe, myRevealFor, latestRevealFor, pendingByListing, unreadCount, markAllSeen, dismissNotification, signOut,
    myListings, pastListings, savedListings, pendingCount,
  };
}

export function filterListings(
  listings: Listing[],
  { activeCat = 'all', query = '', sort = 'recent', priceFilter = 'any' }: FilterArgs = {},
): Listing[] {
  let out = listings.filter((l) => {
    if (l.archived) return false;
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
