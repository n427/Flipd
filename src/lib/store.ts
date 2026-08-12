// Flipd — shared interactive store. One hook mounted at the app root.
// Hydrates everything from the API routes; no mock data.
import React from 'react';
import { CATEGORIES } from './data';
import type {
  ActivityItem, ActivityStatus, FeedRange, FilterArgs, Listing, Profile, RatingSummary, Seller,
} from './types';
import { effectiveRevealStatus, formatEventWindow, type RevealStatus } from './validation';

type DbSeller = {
  id: string;
  display_name: string | null;
  handle: string | null;
  school_unit: string | null;
  class_year: string | null;
  is_demo: boolean;
  avatar_url: string | null;
} | null;

type DbListing = {
  id: string;
  seller_id: string;
  category: string;
  categories?: string[] | null;
  title: string;
  description?: string | null;
  price?: number | null;
  negotiable?: boolean | null;
  location?: string | null;
  lat?: number | null;
  lng?: number | null;
  place_name?: string | null;
  contact?: string[] | null;
  photo_urls?: string[] | null;
  photo_focus?: string[] | null;
  photo_zoom?: string[] | null;
  archived?: boolean | null;
  created_at?: string | null;
  event_start?: string | null;
  event_end?: string | null;
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
  can_rate?: boolean;
  counterpart: { id: string; display_name: string | null; school_unit: string | null; class_year: string | null; avatar_url: string | null } | null;
  listing_archived?: boolean;
  listing_removed?: boolean;
  intro_message?: string | null;
  decline_reason?: string | null;
  thread_id?: string | null;
};

// Per-photo crop styling. `cover` fills the tile; the extra scale() lets a
// seller push baked-in letterbox bars (screenshots) outside the frame.
// transform-origin follows the focus point so zooming keeps the chosen
// subject centred instead of drifting toward the middle.
export function photoCropStyle(
  focus?: string | null,
  zoom?: string | null,
): React.CSSProperties {
  const origin = focus || '50% 50%';
  const z = Number(zoom);
  const scale = Number.isFinite(z) && z > 1 ? Math.min(z, 3) : 1;
  return {
    objectFit: 'cover',
    objectPosition: origin,
    // --photo-zoom lets CSS compose this scale with its own (see the feed-card
    // hover in globals.css); transform is the fallback where nothing composes.
    ...(scale > 1
      ? { ['--photo-zoom' as string]: String(scale), transform: `scale(${scale})`, transformOrigin: origin }
      : {}),
  };
}

export function formatPostedDate(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function classYearLabel(year: string | null): string {
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
    avatarUrl: s?.avatar_url ?? undefined,
  };
}

export function mapDbListing(row: DbListing, meId: string | null): Listing {
  const price = row.price ?? 0;
  return {
    id: row.id,
    mine: meId !== null && row.seller_id === meId,
    category: row.category,
    categories: (row.categories && row.categories.length ? row.categories : [row.category]),
    categoryLabel: CATEGORIES.find((c) => c.id === row.category)?.label || 'Goods',
    categoryLabels: (row.categories && row.categories.length ? row.categories : [row.category])
      .map((c) => CATEGORIES.find((x) => x.id === c)?.label || 'Goods'),
    title: row.title,
    description: row.description || undefined,
    price,
    priceLabel: price > 0 ? '$' + price.toLocaleString('en-US') : 'Free',
    negotiable: row.negotiable ?? false,
    seller: mapSeller(row),
    meta: row.location || 'USC · pickup',
    lat: row.lat ?? null,
    lng: row.lng ?? null,
    placeName: row.place_name ?? null,
    photoTone: 'cream',
    photoLabel: 'photo',
    photo_urls: row.photo_urls || [],
    photo_focus: row.photo_focus || [],
    photo_zoom: row.photo_zoom || [],
    archived: row.archived ?? false,
    created_at: row.created_at || undefined,
    postedLabel: formatPostedDate(row.created_at) || 'just now',
    contactMethods: (row.contact ?? []) as Listing['contactMethods'],
    eventStart: row.event_start ?? null,
    eventEnd: row.event_end ?? null,
    eventPill:
      row.event_start && row.event_end
        ? formatEventWindow(row.event_start, row.event_end)
        : undefined,
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
    counterpartId: dto.counterpart?.id ?? undefined,
    school: [dto.counterpart?.school_unit, classYearLabel(dto.counterpart?.class_year ?? null)]
      .filter(Boolean).join(' '),
    avatarUrl: dto.counterpart?.avatar_url ?? undefined,
    listingTitle: dto.listing_title,
    listingId: dto.listing_id,
    listingArchived: dto.listing_archived ?? false,
    listingRemoved: dto.listing_removed ?? false,
    when: timeAgo(dto.created_at),
    createdAt: dto.created_at,
    expiresAt: dto.expires_at,
    offer: dto.offer ?? undefined,
    unread: dto.unread ?? false,
    dismissed: dto.dismissed ?? false,
    canRate: dto.can_rate ?? false,
    status: effectiveRevealStatus(dto.status, dto.expires_at).toUpperCase() as ActivityStatus,
    // What the buyer wrote when asking — the basis for the seller's decision.
    introMessage: dto.intro_message ?? undefined,
    declineReason: dto.decline_reason ?? undefined,
    // Present once approved: contact details are never exchanged now, the
    // conversation lives here instead.
    threadId: dto.thread_id ?? undefined,
  };
}

export interface FlipdStore {
  me: Profile | null;
  listings: Listing[];
  listingsLoading: boolean;
  savedIds: Set<string>;
  popupReminderIds: Set<string>;
  activity: ActivityItem[];
  isSaved: (id: string) => boolean;
  toggleSave: (id: string) => void;
  isReminded: (id: string) => boolean;
  toggleReminder: (id: string) => void;
  addListing: (formData: FormData, onProgress?: (fraction: number) => void) => Promise<Listing | null>;
  updateListing: (id: string, formData: FormData, onProgress?: (fraction: number) => void) => Promise<Listing | null>;
  removeListing: (id: string) => Promise<boolean>;
  getListing: (id: string) => Promise<Listing | null>;
  setArchived: (id: string, archived: boolean) => Promise<boolean>;
  requestReveal: (listingId: string, offer: number | undefined, introMessage: string) => Promise<{ ok: boolean; error?: string }>;
  respondReveal: (id: string, action: 'approve' | 'decline' | 'complete', opts?: { markSold?: boolean; declineReason?: string }) => Promise<boolean>;
  latestRevealFor: (listingId: string) => ActivityItem | undefined;
  pendingByListing: Record<string, number>;
  blockedIds: Set<string>;
  blockUser: (userId: string) => Promise<boolean>;
  unblockUser: (userId: string) => Promise<boolean>;
  reportTarget: (target: { listingId?: string; userId?: string }, reason: string, note?: string) => Promise<boolean>;
  rateTransaction: (requestId: string, score: number, text?: string) => Promise<{ ok: boolean; error?: string }>;
  fetchRatings: (userId?: string) => Promise<RatingSummary>;
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
  const [popupReminderIds, setPopupReminderIds] = React.useState<Set<string>>(() => new Set());
  const [activity, setActivity] = React.useState<ActivityItem[]>([]);
  const [blockedIds, setBlockedIds] = React.useState<Set<string>>(() => new Set());

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

    fetch('/api/blocks')
      .then((r) => r.json())
      .then(({ ids }) => { if (alive && Array.isArray(ids)) setBlockedIds(new Set(ids)); })
      .catch(() => {});

    fetch('/api/popup-reminders')
      .then((r) => r.json())
      .then(({ ids }) => { if (alive && Array.isArray(ids)) setPopupReminderIds(new Set(ids)); })
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

  const isReminded = (id: string) => popupReminderIds.has(id);

  const toggleReminder = (id: string) => {
    const willRemind = !popupReminderIds.has(id);
    setPopupReminderIds((prev) => {
      const next = new Set(prev);
      if (willRemind) next.add(id); else next.delete(id);
      return next;
    });
    fetch('/api/popup-reminders', {
      method: willRemind ? 'POST' : 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ listing_id: id }),
    }).catch(() => {
      setPopupReminderIds((prev) => {
        const next = new Set(prev);
        if (willRemind) next.delete(id); else next.add(id);
        return next;
      });
    });
  };

  // Sends a listing FormData over XHR rather than fetch: only XHR exposes
  // upload progress (`xhr.upload.onprogress`), and photo uploads are slow
  // enough on a phone connection that a real percentage is worth the plumbing.
  // Shared by create (POST) and edit (PATCH), which differ only in verb + URL.
  const sendListing = (
    method: 'POST' | 'PATCH',
    url: string,
    formData: FormData,
    onProgress?: (fraction: number) => void,
  ): Promise<{ listing: DbListing }> =>
    new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open(method, url);

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress?.(e.loaded / e.total);
      };
      // The last byte is sent, but the server still has to push each photo to
      // storage and write the row. Report 1 so the caller can switch to its
      // indeterminate "server working" state.
      xhr.upload.onload = () => onProgress?.(1);

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            resolve(JSON.parse(xhr.responseText));
          } catch {
            reject(new Error('Server returned an unreadable response.'));
          }
          return;
        }
        let detail = `HTTP ${xhr.status}`;
        try {
          const body = JSON.parse(xhr.responseText);
          if (body?.error) detail = body.error;
        } catch { /* no JSON body */ }
        reject(new Error(detail));
      };

      xhr.onerror = () => {
        console.error(`[sendListing] ${method} network error`);
        reject(new Error('Could not reach the server. Check your connection and try again.'));
      };
      xhr.onabort = () => reject(new Error('Upload cancelled.'));

      xhr.send(formData);
    });

  const addListing = async (
    formData: FormData,
    onProgress?: (fraction: number) => void,
  ): Promise<Listing | null> => {
    const { listing } = await sendListing('POST', '/api/listings', formData, onProgress);
    const mapped = mapDbListing(listing, meId);
    setListings((prev) => [mapped, ...prev]);
    return mapped;
  };

  const updateListing = async (
    id: string,
    formData: FormData,
    onProgress?: (fraction: number) => void,
  ): Promise<Listing | null> => {
    const { listing } = await sendListing('PATCH', `/api/listings/${id}`, formData, onProgress);
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

  const requestReveal = async (listingId: string, offer: number | undefined, introMessage: string) => {
    const res = await fetch('/api/reveals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ listing_id: listingId, offer, intro_message: introMessage }),
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

  const respondReveal = async (id: string, action: 'approve' | 'decline' | 'complete', opts: { markSold?: boolean; declineReason?: string } = {}) => {
    const res = await fetch(`/api/reveals/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, mark_sold: opts.markSold === true, decline_reason: opts.declineReason ?? null }),
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

  const blockUser = async (userId: string) => {
    const res = await fetch('/api/blocks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId }),
    }).catch(() => null);
    if (!res || !res.ok) return false;
    setBlockedIds((prev) => new Set([...prev, userId]));
    setListings((prev) => prev.filter((l) => l.seller.id !== userId));
    return true;
  };

  const unblockUser = async (userId: string) => {
    const res = await fetch('/api/blocks', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId }),
    }).catch(() => null);
    if (!res || !res.ok) return false;
    setBlockedIds((prev) => { const next = new Set(prev); next.delete(userId); return next; });
    return true;
  };

  const reportTarget = async (target: { listingId?: string; userId?: string }, reason: string, note?: string) => {
    const res = await fetch('/api/reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ listing_id: target.listingId, user_id: target.userId, reason, note }),
    }).catch(() => null);
    return Boolean(res && res.ok);
  };

  const rateTransaction = async (requestId: string, score: number, text?: string) => {
    const res = await fetch('/api/ratings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ request_id: requestId, score, text }),
    }).catch(() => null);
    if (!res || !res.ok) {
      const body = await res?.json().catch(() => ({}));
      return { ok: false, error: body?.error || 'Could not submit — try again.' };
    }
    setActivity((prev) => prev.map((a) => (a.id === requestId ? { ...a, canRate: false } : a)));
    return { ok: true as const };
  };

  const fetchRatings = async (userId?: string) => {
    const q = userId ? `?user=${userId}` : '';
    const res = await fetch(`/api/ratings${q}`).catch(() => null);
    if (!res || !res.ok) return { average: null, count: 0, reviews: [] };
    return res.json();
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
    me, listings, listingsLoading, savedIds, popupReminderIds, activity,
    isSaved, toggleSave, isReminded, toggleReminder, addListing, updateListing, removeListing, getListing, setArchived,
    requestReveal, respondReveal, refreshActivity, refreshMe, myRevealFor, latestRevealFor, pendingByListing, blockedIds, blockUser, unblockUser, reportTarget, rateTransaction, fetchRatings, unreadCount, markAllSeen, dismissNotification, signOut,
    myListings, pastListings, savedListings, pendingCount,
  };
}

// Days back from now for each range. 'all' has no cutoff.
const RANGE_DAYS: Record<Exclude<FeedRange, 'all'>, number> = { day: 1, week: 7, month: 30 };

/** Cutoff timestamp in ms for a range, or null when unbounded. */
export function rangeSince(range: FeedRange | undefined): number | null {
  if (!range || range === 'all') return null;
  return Date.now() - RANGE_DAYS[range] * 86_400_000;
}

export function filterListings(
  listings: Listing[],
  { activeCat = 'all', query = '', sort = 'recent', range = 'all', priceMin = null, priceMax = null }: FilterArgs = {},
): Listing[] {
  const since = rangeSince(range);
  let out = listings.filter((l) => {
    if (l.archived) return false;
    if (activeCat !== 'all' && !(l.categories ?? [l.category]).includes(activeCat)) return false;
    if (query) {
      const q = query.toLowerCase();
      const hay = (l.title + ' ' + l.meta + ' ' + l.categoryLabel + ' ' + l.seller.name).toLowerCase();
      if (!hay.includes(q)) return false;
    }
    // Applied before the sort, so price ordering ranks only in-window listings.
    // A listing with no created_at is kept rather than silently hidden.
    if (since != null && l.created_at) {
      const t = new Date(l.created_at).getTime();
      if (Number.isFinite(t) && t < since) return false;
    }
    const price = l.price ?? 0;
    if (priceMin != null && price < priceMin) return false;
    if (priceMax != null && price > priceMax) return false;
    return true;
  });
  if (sort === 'low') out = [...out].sort((a, b) => (a.price ?? 0) - (b.price ?? 0));
  if (sort === 'high') out = [...out].sort((a, b) => (b.price ?? 0) - (a.price ?? 0));
  return out;
}
