'use client';

// Flipd — Web app (ported from screens/web-app.jsx)
// Feed, search/sort/filter, listing detail, reveal flow, create-listing,
// profile (my listings / saved / activity), and a notifications panel.
// All wired to the in-memory store.
import React from 'react';
import { Icon } from './Icon';
import { Avatar, Button, Callout, CategoryChip, ListingCard, Pill, Placeholder, USCBadge, Wordmark } from './ui';
import { CATEGORIES } from '@/lib/data';
import { filterListings, formatPostedDate, useFlipdStore, type FlipdStore } from '@/lib/store';
import type { ActivityItem, ContactMethod, Listing, PhotoTone } from '@/lib/types';

interface DropdownOption { id: string; label: string; }

// ── Small dropdown ───────────────────────────────────────────────────
function WebDropdown({
  label, icon, options, value, onChange,
}: { label: string; icon?: string; options: DropdownOption[]; value: string; onChange: (id: string) => void }) {
  const [open, setOpen] = React.useState(false);
  const current = options.find((o) => o.id === value);
  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '8px 14px', borderRadius: 'var(--r-pill)',
          border: '1px solid ' + (open ? 'var(--cardinal)' : 'var(--rule)'), background: '#fff',
          color: 'var(--ink-2)', fontFamily: 'var(--sans)', fontWeight: 500, fontSize: 12.5,
        }}
      >
        {icon && <Icon name={icon} size={13} />}
        {current ? current.label : label}
        <Icon name="chevronDown" size={13} />
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
          <div style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 41, background: '#fff', border: '1px solid var(--rule)', borderRadius: 8, boxShadow: 'var(--shadow-strong)', padding: 6, minWidth: 180 }}>
            {options.map((o) => (
              <button
                key={o.id}
                onClick={() => { onChange(o.id); setOpen(false); }}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                  width: '100%', textAlign: 'left', background: 'none', border: 0,
                  padding: '9px 10px', borderRadius: 6,
                  fontFamily: 'var(--sans)', fontSize: 13,
                  color: value === o.id ? 'var(--cardinal)' : 'var(--ink)',
                  fontWeight: value === o.id ? 700 : 500,
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--cream)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
              >
                {o.label}
                {value === o.id && <Icon name="check" size={14} />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Header ───────────────────────────────────────────────────────────
export function WebAppHeader({
  onLogo, query, setQuery, onPost, onProfile, onBell, pendingCount,
}: {
  onLogo: () => void; query: string; setQuery: (q: string) => void;
  onPost: () => void; onProfile: () => void; onBell: () => void; pendingCount: number;
}) {
  return (
    <header style={{ padding: '14px 32px', background: '#fff', borderBottom: '1px solid var(--rule)', display: 'flex', alignItems: 'center', gap: 28, position: 'sticky', top: 0, zIndex: 30 }}>
      <button onClick={onLogo} style={{ background: 'none', border: 0, padding: 0, display: 'flex', alignItems: 'center', gap: 10 }} aria-label="Go to feed">
        <USCBadge size={26} />
        <Wordmark size={22} />
      </button>
      <div style={{ flex: 1, maxWidth: 520, position: 'relative' }}>
        <Icon name="search" size={15} color="var(--muted)" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)' }} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search Flipd"
          aria-label="Search Flipd"
          className="field"
          style={{ paddingLeft: 38, fontSize: 13.5, padding: '10px 16px 10px 38px', borderRadius: 'var(--r-pill)' }}
        />
        {query && (
          <button onClick={() => setQuery('')} aria-label="Clear search" style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 0, padding: 4, display: 'flex' }}>
            <Icon name="x" size={14} color="var(--muted)" />
          </button>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginLeft: 'auto' }}>
        <button onClick={onBell} aria-label="Notifications" style={{ background: 'none', border: 0, padding: 8, position: 'relative' }}>
          <Icon name="bell" size={18} color="var(--ink)" />
          {pendingCount > 0 && (
            <span style={{ position: 'absolute', top: 2, right: 2, minWidth: 15, height: 15, padding: '0 3px', borderRadius: 999, background: 'var(--cardinal)', color: '#fff', fontSize: 9, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1.5px solid #fff' }}>{pendingCount}</span>
          )}
        </button>
        <Button kind="primary" size="sm" icon="plus" onClick={onPost}>Post a listing</Button>
        <button onClick={onProfile} aria-label="Your profile" style={{ background: 'none', border: 0, padding: 0 }}>
          <Avatar name="Alex Park" size={30} tone="cardinal" />
        </button>
      </div>
    </header>
  );
}

// ── Activity row (shared by notifications + profile) ────────────────
function ActivityRow({
  a, onApprove, onDecline, last, compact,
}: { a: ActivityItem; onApprove?: (id: string) => void; onDecline?: (id: string) => void; last?: boolean; compact?: boolean }) {
  const statusColor = ({
    APPROVED: { bg: 'var(--gold)', fg: 'var(--ink)' },
    EXPIRED: { bg: 'var(--rule)', fg: 'var(--muted)' },
    DECLINED: { bg: 'var(--rule)', fg: 'var(--muted)' },
    PENDING: { bg: 'var(--cardinal)', fg: '#fff' },
  } as Record<string, { bg: string; fg: string }>)[a.status] || { bg: 'var(--rule)', fg: 'var(--muted)' };
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: compact ? '14px 18px' : '16px 0', borderBottom: last ? 0 : '1px solid var(--rule)' }}>
      <Avatar name={a.who} size={36} tone={a.dir === 'in' ? 'cardinal' : 'cream'} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: 'var(--sans)', fontSize: 13.5, color: 'var(--ink)', lineHeight: 1.4 }}>
          <strong style={{ fontWeight: 700 }}>{a.who}</strong>{' '}
          {a.dir === 'in' ? 'wants to connect about' : a.status === 'APPROVED' ? 'approved your request for' : 'on'}{' '}
          <span style={{ color: 'var(--ink-2)' }}>&quot;{a.listingTitle}&quot;</span>
        </div>
        <div className="t-meta" style={{ fontSize: 11, marginTop: 3 }}>{a.school} · {a.when} ago</div>

        {a.dir === 'out' && a.status === 'APPROVED' && a.contact && (
          <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-start' }}>
            {a.contact.instagram && (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: 'var(--cream)', border: '1px solid var(--rule)', borderRadius: 6, padding: '6px 10px', fontFamily: 'var(--sans)', fontWeight: 600, fontSize: 12.5, color: 'var(--cardinal)' }}>
                <Icon name="instagram" size={13} />
                {a.contact.instagram}
              </div>
            )}
            {a.contact.phone && (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: 'var(--cream)', border: '1px solid var(--rule)', borderRadius: 6, padding: '6px 10px', fontFamily: 'var(--sans)', fontWeight: 600, fontSize: 12.5, color: 'var(--cardinal)' }}>
                <Icon name="phone" size={13} />
                {a.contact.phone}
              </div>
            )}
            {a.contact.email && (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: 'var(--cream)', border: '1px solid var(--rule)', borderRadius: 6, padding: '6px 10px', fontFamily: 'var(--sans)', fontWeight: 600, fontSize: 12.5, color: 'var(--cardinal)' }}>
                <Icon name="mail" size={13} />
                {a.contact.email}
              </div>
            )}
          </div>
        )}

        {a.dir === 'in' && a.status === 'PENDING' && (
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <Button kind="primary" size="sm" onClick={() => onApprove && onApprove(a.id)} style={{ padding: '6px 16px' }}>Approve</Button>
            <Button kind="ghost" size="sm" onClick={() => onDecline && onDecline(a.id)} style={{ padding: '6px 14px' }}>Decline</Button>
          </div>
        )}
      </div>
      {!(a.dir === 'in' && a.status === 'PENDING') && (
        <span style={{ fontFamily: 'var(--sans)', fontWeight: 700, fontSize: 8.5, letterSpacing: '0.16em', textTransform: 'uppercase', padding: '4px 8px', borderRadius: 'var(--r-pill)', background: statusColor.bg, color: statusColor.fg, whiteSpace: 'nowrap' }}>{a.status}</span>
      )}
    </div>
  );
}

// ── Notifications panel (slides from bell) ──────────────────────────
export function WebNotifications({
  activity, onClose, onApprove, onDecline,
}: { activity: ActivityItem[]; onClose: () => void; onApprove: (id: string) => void; onDecline: (id: string) => void }) {
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 45 }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(26,26,26,0.18)' }} />
      <div style={{ position: 'absolute', top: 64, right: 32, width: 380, background: '#fff', borderRadius: 10, border: '1px solid var(--rule)', boxShadow: 'var(--shadow-strong)', overflow: 'hidden', animation: 'flipdReveal 200ms ease-out' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--rule)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 className="t-h3" style={{ margin: 0, fontSize: 15 }}>Notifications</h3>
          <button onClick={onClose} aria-label="Close notifications" style={{ background: 'none', border: 0, padding: 2 }}>
            <Icon name="x" size={16} color="var(--muted)" />
          </button>
        </div>
        <div style={{ maxHeight: 420, overflow: 'auto' }}>
          {activity.map((a, i) => (
            <ActivityRow key={a.id} a={a} compact onApprove={onApprove} onDecline={onDecline} last={i === activity.length - 1} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Feed ─────────────────────────────────────────────────────────────
export function WebAppFeed({
  store, activeCat, setActiveCat, onListing, query, sort, setSort, priceFilter, setPriceFilter,
}: {
  store: FlipdStore; activeCat: string; setActiveCat: (c: string) => void;
  onListing: (l: Listing) => void; query: string;
  sort: string; setSort: (s: string) => void;
  priceFilter: string; setPriceFilter: (p: string) => void;
}) {
  const items = filterListings(store.listings, { activeCat, query, sort: sort as never, priceFilter: priceFilter as never });
  return (
    <div style={{ padding: '32px 32px 64px', maxWidth: 1280, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontFamily: 'var(--serif)', fontWeight: 700, fontSize: 32, letterSpacing: '-0.015em', color: 'var(--ink)', margin: 0 }}>
            {query ? <>Results for <em style={{ color: 'var(--cardinal)' }}>&quot;{query}&quot;</em></> : "What's on Flipd today"}
          </h1>
        </div>
        <div className="t-meta" style={{ fontSize: 12 }}>{items.length} listing{items.length === 1 ? '' : 's'}</div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 24, alignItems: 'center', flexWrap: 'wrap' }}>
        {CATEGORIES.map((c) => (
          <CategoryChip key={c.id} category={c} active={activeCat === c.id} onClick={() => setActiveCat(c.id)} />
        ))}
        <div style={{ flex: 1 }} />
        <WebDropdown
          icon="filter" label="Price" value={priceFilter} onChange={setPriceFilter}
          options={[
            { id: 'any', label: 'Any price' },
            { id: 'free', label: 'Free only' },
            { id: 'u25', label: 'Under $25' },
            { id: 'u100', label: 'Under $100' },
          ]}
        />
        <WebDropdown
          label="Sort" value={sort} onChange={setSort}
          options={[
            { id: 'recent', label: 'Most recent' },
            { id: 'low', label: 'Price: low → high' },
            { id: 'high', label: 'Price: high → low' },
          ]}
        />
      </div>

      {items.length === 0 ? (
        <div style={{ padding: '80px 0', textAlign: 'center' }}>
          <Icon name="search" size={32} color="var(--rule-strong)" />
          <div className="t-h3" style={{ marginTop: 14, color: 'var(--ink)' }}>No listings match.</div>
          <div className="t-meta" style={{ fontSize: 12.5, marginTop: 6 }}>Try a different category or clear your search.</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 18 }}>
          {items.map((l) => (
            <div key={l.id} style={{ position: 'relative' }}>
              <ListingCard listing={l} onClick={() => onListing(l)} />
              <button
                onClick={(e) => { e.stopPropagation(); store.toggleSave(l.id); }}
                aria-label={store.isSaved(l.id) ? 'Remove from saved' : 'Save listing'}
                style={{ position: 'absolute', top: 8, right: 8, zIndex: 2, width: 30, height: 30, borderRadius: '50%', border: 0, background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'var(--shadow)' }}
              >
                <Icon name="bookmark" size={15} color={store.isSaved(l.id) ? 'var(--cardinal)' : 'var(--muted)'} stroke={store.isSaved(l.id) ? 0 : 1.6} />
                {store.isSaved(l.id) && (
                  <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="var(--cardinal)"><path d="M6 4h12v17l-6-4-6 4z" /></svg>
                  </span>
                )}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Listing detail ──────────────────────────────────────────────────
export function WebListingDetail({
  store, listing, onBack, onReveal, preview = false,
}: { store: FlipdStore; listing: Listing; onBack: () => void; onReveal: () => void; preview?: boolean }) {
  const saved = preview ? false : store.isSaved(listing.id);
  const isFood = listing.category === 'food';
  const thumbTones = [listing.photoTone, 'cream', 'gold', 'ink'] as const;
  const [activePhoto, setActivePhoto] = React.useState(0);
  return (
    <div style={{ padding: '24px 32px 64px', maxWidth: 1180, margin: '0 auto' }}>
      {!preview && (
      <button onClick={onBack} style={{ background: 'none', border: 0, padding: 0, display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--muted)', fontFamily: 'var(--sans)', fontSize: 12.5, marginBottom: 18 }}>
        <Icon name="chevronLeft" size={14} /> Back to feed
      </button>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 40 }}>
        <div>
          {listing.photo_urls?.[activePhoto] ? (
            <div style={{ width: '100%', aspectRatio: '1 / 1', borderRadius: 4, overflow: 'hidden' }}>
              <img
                src={listing.photo_urls[activePhoto]}
                alt={listing.title}
                style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: listing.photo_focus?.[activePhoto] || '50% 50%', display: 'block' }}
              />
            </div>
          ) : (
            <Placeholder label={listing.photoLabel} tone={thumbTones[activePhoto % thumbTones.length]} height={460} radius={4} />
          )}
          {((listing.photo_urls?.length ?? 0) > 1) && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginTop: 8 }}>
              {listing.photo_urls!.map((url, i) => (
                <div key={i} onClick={() => setActivePhoto(i)} style={{ cursor: 'pointer', position: 'relative', height: 84, borderRadius: 4, overflow: 'hidden', outline: activePhoto === i ? '2px solid var(--cardinal)' : 'none', outlineOffset: -1 }}>
                  <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
              ))}
            </div>
          )}
          {!(listing.photo_urls?.length ?? 0) && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginTop: 8 }}>
              {thumbTones.map((tone, i) => (
                <div key={i} onClick={() => setActivePhoto(i)} style={{ cursor: 'pointer' }}>
                  <Placeholder
                    tone={tone}
                    height={84}
                    label={i === 0 ? listing.photoLabel : `+${i}`}
                    style={{ outline: activePhoto === i ? '2px solid var(--cardinal)' : 'none', outlineOffset: activePhoto === i ? -1 : 0 }}
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center' }}>
            <Pill kind="category">{listing.categoryLabel.toUpperCase()}</Pill>
            <span className="t-meta" style={{ fontSize: 11 }}>· posted {listing.postedLabel || 'recently'}</span>
          </div>
          <h1 className="t-h1" style={{ fontSize: 30, margin: '0 0 4px' }}>{listing.title}</h1>
          {listing.meta && (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--muted)', fontFamily: 'var(--sans)', fontSize: 12.5, marginBottom: 12 }}>
              <Icon name="mapPin" size={13} /> {listing.meta.split(' · ')[0]}
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 20 }}>
            <span style={{ fontFamily: 'var(--serif)', fontWeight: 700, fontSize: 28, color: 'var(--cardinal)' }}>{listing.priceLabel}</span>
            <span className="t-meta" style={{ fontSize: 12 }}>negotiable</span>
          </div>

          <p style={{ fontFamily: 'var(--sans)', fontSize: 14, lineHeight: 1.6, color: 'var(--ink-2)', margin: '0 0 24px', whiteSpace: 'pre-wrap' }}>
            {listing.description?.trim()
              ? listing.description
              : isFood
              ? "Homemade weekly out of my apartment near campus - fresh, small-batch, and made to order. Cash, Venmo, or Zelle. Message me with your pickup time and I'll confirm."
              : "In great condition and ready to go. I'm on campus most days, so pickup is easy - flexible on timing and happy to answer any questions before we connect."}
          </p>

          <div style={{ background: 'var(--cream)', border: '1px solid var(--rule)', borderRadius: 6, padding: '14px 18px', display: 'flex', gap: 12, alignItems: 'center', marginBottom: 24 }}>
            <Avatar name={listing.seller.name} size={36} tone="cardinal" />
            <div style={{ fontFamily: 'var(--sans)', fontWeight: 700, fontSize: 14, color: 'var(--ink)' }}>
              {listing.seller.name}
            </div>
          </div>

          {!preview && listing.mine ? (
            listing.archived ? (
              <>
                <Button kind="primary" full size="lg" icon="upload" onClick={async () => { await store.setArchived(listing.id, false); onBack(); }}>
                  Restore to feed
                </Button>
                <div className="t-meta" style={{ fontSize: 11, marginTop: 12, textAlign: 'center', color: 'var(--muted)' }}>
                  This listing is in your past listings.
                </div>
              </>
            ) : (
              <>
                <Button kind="secondary" full size="lg" icon="x" onClick={async () => { await store.setArchived(listing.id, true); onBack(); }}>
                  Move to past listings
                </Button>
                <div className="t-meta" style={{ fontSize: 11, marginTop: 12, textAlign: 'center', color: 'var(--muted)' }}>
                  Removes it from the feed. You can restore it anytime.
                </div>
              </>
            )
          ) : (
            <>
              <div style={{ display: 'flex', gap: 10 }}>
                <Button kind="primary" full size="lg" onClick={preview ? () => {} : onReveal} icon="shield" disabled={preview}>Reveal Contact</Button>
                <Button kind={saved ? 'primary' : 'secondary'} size="lg" icon="bookmark" onClick={() => { if (!preview) store.toggleSave(listing.id); }} disabled={preview}>
                  {saved ? 'Saved' : 'Save'}
                </Button>
              </div>
              <div className="t-meta" style={{ fontSize: 11, marginTop: 12, textAlign: 'center', color: 'var(--muted)' }}>
                Your name and @usc.edu email will be shared with the seller.
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// Move an array item from one index to another (returns a new array).
function moveItem<T>(arr: T[], from: number, to: number): T[] {
  const next = [...arr];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

// ── Create listing (web, multi-step) ────────────────────────────────
export function WebCreate({
  onPublish, onCancel, store,
}: { onPublish: (formData: FormData) => void; onCancel: () => void; store: FlipdStore }) {
  const [step, setStep] = React.useState(1);
  const [category, setCategory] = React.useState<string | null>(null);
  const [title, setTitle] = React.useState('');
  const [price, setPrice] = React.useState('');
  const [neg, setNeg] = React.useState(false);
  const [location, setLocation] = React.useState('USC Village · pickup');
  const [contact, setContact] = React.useState<ContactMethod[]>([]);
  const [description, setDescription] = React.useState('');
  const [aiLoading, setAiLoading] = React.useState(false);
  const [photos, setPhotos] = React.useState<{ file: File; url: string }[]>([]);
  const [photoFocus, setPhotoFocus] = React.useState<string[]>([]);
  const [cropIndex, setCropIndex] = React.useState(0);
  const [dragIndex, setDragIndex] = React.useState<number | null>(null);
  const dragState = React.useRef<{ startX: number; startY: number; baseX: number; baseY: number; w: number; h: number } | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [pendingSlot, setPendingSlot] = React.useState<number | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setPhotos((prev) => {
      const next = [...prev];
      if (pendingSlot !== null && pendingSlot < next.length) {
        URL.revokeObjectURL(next[pendingSlot].url);
        next[pendingSlot] = { file, url };
      } else {
        next.push({ file, url });
      }
      return next;
    });
    setPhotoFocus((prev) => {
      const next = [...prev];
      if (pendingSlot !== null && pendingSlot < next.length) next[pendingSlot] = '50% 50%';
      else next.push('50% 50%');
      return next;
    });
    setCropIndex(pendingSlot !== null ? pendingSlot : photos.length);
    setPendingSlot(null);
    e.target.value = '';
  };

  const removePhoto = (index: number) => {
    setPhotos((prev) => {
      const next = [...prev];
      URL.revokeObjectURL(next[index].url);
      next.splice(index, 1);
      return next;
    });
    setPhotoFocus((prev) => { const next = [...prev]; next.splice(index, 1); return next; });
    setCropIndex((c) => Math.max(0, c >= index ? c - 1 : c));
  };

  const reorderPhotos = (from: number, to: number) => {
    if (from === to) return;
    setPhotos((prev) => moveItem(prev, from, to));
    setPhotoFocus((prev) => moveItem(prev, from, to));
    setCropIndex(to);
  };

  const generateDescription = async () => {
    if (!title.trim() || aiLoading) return;
    setAiLoading(true);
    try {
      const res = await fetch('/api/generate-description', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          category: cats.find((c) => c.id === category)?.label || category || 'goods',
        }),
      });
      const data = await res.json();
      if (data.description) setDescription(data.description);
    } catch {
      // silently fail — user can retry
    } finally {
      setAiLoading(false);
    }
  };

  const cats = [
    { id: 'services', label: 'Services', sub: 'Nails, hair, tutoring, photo', icon: 'services', tone: 'cardinal' },
    { id: 'food', label: 'Food & Baking', sub: 'Bakers, meal prep, drinks', icon: 'food', tone: 'gold' },
    { id: 'event', label: 'Popups', sub: 'Events, fundraisers, tickets', icon: 'event', tone: 'cardinal' },
    { id: 'housing', label: 'Housing', sub: 'Sublets, takeovers, roommates', icon: 'housing', tone: 'cream' },
    { id: 'goods', label: 'General Goods', sub: 'Furniture, books, electronics', icon: 'goods', tone: 'cream' },
  ];
  const toneFor = (id: string | null): PhotoTone =>
    (({ services: 'cardinal', food: 'gold', event: 'cardinal', housing: 'cream', goods: 'cream' } as Record<string, PhotoTone>)[id || ''] || 'cream');

  const parseFocus = (f: string): [number, number] => {
    const [x, y] = f.split(' ').map((p) => parseFloat(p));
    return [isNaN(x) ? 50 : x, isNaN(y) ? 50 : y];
  };

  const onCropPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const [bx, by] = parseFocus(photoFocus[cropIndex] || '50% 50%');
    dragState.current = { startX: e.clientX, startY: e.clientY, baseX: bx, baseY: by, w: rect.width, h: rect.height };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onCropPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragState.current;
    if (!d) return;
    // Dragging right reveals the left of the image → decrease X percent.
    const dxPct = ((e.clientX - d.startX) / d.w) * 100;
    const dyPct = ((e.clientY - d.startY) / d.h) * 100;
    const clamp = (n: number) => Math.max(0, Math.min(100, n));
    setPhotoFocus((prev) => {
      const next = [...prev];
      next[cropIndex] = `${clamp(d.baseX - dxPct)}% ${clamp(d.baseY - dyPct)}%`;
      return next;
    });
  };

  const onCropPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    dragState.current = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  const publish = () => {
    const fd = new FormData();
    fd.append('category', category || 'goods');
    fd.append('title', title || 'Untitled listing');
    fd.append('description', description);
    fd.append('price', price);
    fd.append('negotiable', String(neg));
    fd.append('location', location);
    fd.append('contact', JSON.stringify(contact));
    photos.forEach((p) => fd.append('photos', p.file, p.file.name));
    photoFocus.forEach((f) => fd.append('photo_focus', f));
    onPublish(fd);
  };

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '28px 32px 80px' }}>
      {/* Stepper */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 28 }}>
        <button onClick={step === 1 ? onCancel : () => setStep(step - 1)} style={{ background: 'none', border: 0, padding: 0, display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--muted)', fontFamily: 'var(--sans)', fontSize: 12.5 }}>
          <Icon name="chevronLeft" size={14} /> {step === 1 ? 'Cancel' : 'Back'}
        </button>
        <div style={{ flex: 1 }} />
        {[1, 2, 3].map((n) => (
          <span key={n} style={{ width: n === step ? 22 : 7, height: 7, borderRadius: 999, background: n <= step ? 'var(--cardinal)' : 'var(--rule-strong)', transition: 'all 180ms' }} />
        ))}
        <div style={{ flex: 1 }} />
        <span className="t-eyebrow" style={{ color: 'var(--muted)' }}>STEP {step} OF 3</span>
      </div>

      {step === 1 && (
        <div>
          <h1 className="t-h1" style={{ fontSize: 30, margin: '0 0 6px' }}>What are you posting?</h1>
          <p className="t-meta" style={{ fontSize: 13, marginBottom: 24 }}>Picking one shapes the rest of the form.</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {cats.map((c) => (
              <button key={c.id} onClick={() => { setCategory(c.id); setStep(2); }} style={{ background: '#fff', border: '1.5px solid ' + (category === c.id ? 'var(--cardinal)' : 'var(--rule)'), borderRadius: 8, padding: '18px', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer' }}>
                <div style={{ width: 46, height: 46, borderRadius: 8, flexShrink: 0, background: 'var(--cardinal)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name={c.icon} size={22} color="var(--gold)" />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: 'var(--serif)', fontWeight: 700, fontSize: 16, color: 'var(--ink)' }}>{c.label}</div>
                  <div className="t-meta" style={{ fontSize: 11, marginTop: 2 }}>{c.sub}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {step === 2 && (
        <div>
          <Pill kind="category" style={{ marginBottom: 12 }}>{((cats.find(c => c.id === category)?.label) || 'Goods').toUpperCase()}</Pill>
          <h1 className="t-h1" style={{ fontSize: 28, margin: '0 0 22px' }}>Tell us about it.</h1>

          <label className="field-label">Photos · up to 8 · at least 1 required</label>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />
          {photos.length > 1 && (
            <div className="t-meta" style={{ fontSize: 11, marginBottom: 8, color: 'var(--muted)' }}>
              Drag photos to reorder · the first photo is your cover
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8, marginBottom: 20 }}>
            {photos.map((p, i) => (
              <div
                key={i}
                draggable
                onDragStart={() => setDragIndex(i)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => { if (dragIndex !== null) reorderPhotos(dragIndex, i); setDragIndex(null); }}
                onDragEnd={() => setDragIndex(null)}
                onClick={() => setCropIndex(i)}
                style={{ position: 'relative', height: 84, borderRadius: 6, overflow: 'hidden', cursor: 'grab', opacity: dragIndex === i ? 0.4 : 1, outline: cropIndex === i ? '2px solid var(--cardinal)' : 'none', outlineOffset: -1 }}
              >
                <img src={p.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: photoFocus[i] || '50% 50%' }} />
                <button
                  onClick={(e) => { e.stopPropagation(); removePhoto(i); }}
                  style={{
                    position: 'absolute', top: 3, right: 3, width: 20, height: 20,
                    borderRadius: '50%', border: 0, background: 'rgba(0,0,0,0.55)',
                    color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer', padding: 0,
                  }}
                >
                  <Icon name="x" size={10} />
                </button>
              </div>
            ))}
            {photos.length < 8 && (
              <button
                onClick={() => { setPendingSlot(null); fileInputRef.current?.click(); }}
                style={{
                  height: 84, borderRadius: 6, border: '1.5px dashed var(--rule-strong)',
                  background: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'var(--muted-2)', cursor: 'pointer',
                }}
              >
                <Icon name="plus" size={18} />
              </button>
            )}
          </div>

          {photos[cropIndex] && (
            <div style={{ marginBottom: 24 }}>
              <div className="field-label" style={{ marginBottom: 8 }}>
                Adjust crop — photo {cropIndex + 1} of {photos.length} — drag to reposition
              </div>
              <div
                onPointerDown={onCropPointerDown}
                onPointerMove={onCropPointerMove}
                onPointerUp={onCropPointerUp}
                style={{ width: 220, aspectRatio: '1 / 1', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--rule)', cursor: 'grab', touchAction: 'none', userSelect: 'none' }}
              >
                <img
                  src={photos[cropIndex].url}
                  alt="crop preview"
                  draggable={false}
                  style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: photoFocus[cropIndex] || '50% 50%', display: 'block', pointerEvents: 'none' }}
                />
              </div>
            </div>
          )}

          <label className="field-label">Title</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} className="field" placeholder="e.g. Sourdough loaves" style={{ marginBottom: 24 }} />

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <label className="field-label" style={{ margin: 0 }}>Description</label>
            <button
              onClick={generateDescription}
              disabled={!title.trim() || aiLoading}
              style={{
                background: 'none', border: '1px solid var(--rule-strong)', borderRadius: 6,
                padding: '4px 10px', display: 'inline-flex', alignItems: 'center', gap: 5,
                fontFamily: 'var(--sans)', fontWeight: 600, fontSize: 11.5,
                color: (!title.trim() || aiLoading) ? 'var(--muted-2)' : 'var(--cardinal)',
                cursor: (!title.trim() || aiLoading) ? 'default' : 'pointer',
              }}
            >
              <Icon name="sparkle" size={12} />
              {aiLoading ? 'Generating…' : 'Generate with AI'}
            </button>
          </div>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="field"
            placeholder="Describe your item - condition, size, why you're selling it…"
            rows={3}
            style={{ marginBottom: 24, resize: 'vertical' }}
          />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 24 }}>
            <div>
              <label className="field-label">Price · USD</label>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', fontWeight: 600 }}>$</span>
                <input value={price} onChange={(e) => setPrice(e.target.value)} type="number" className="field" placeholder="0" style={{ paddingLeft: 28, fontWeight: 600 }} />
              </div>
            </div>
            <div>
              <label className="field-label">Pricing</label>
              <button onClick={() => setNeg(!neg)} style={{ width: '100%', height: 50, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: neg ? 'var(--cardinal)' : '#fff', color: neg ? '#fff' : 'var(--ink-2)', border: '1.5px solid ' + (neg ? 'var(--cardinal)' : 'var(--rule-strong)'), borderRadius: 8, fontFamily: 'var(--sans)', fontWeight: 600, fontSize: 13 }}>
                {neg && <Icon name="check" size={14} />} Negotiable
              </button>
            </div>
          </div>

          <label className="field-label">Pickup location</label>
          <div style={{ position: 'relative', marginBottom: 24 }}>
            <Icon name="mapPin" size={16} color="var(--muted)" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)' }} />
            <input value={location} onChange={(e) => setLocation(e.target.value)} className="field" style={{ paddingLeft: 38 }} />
          </div>

          <label className="field-label">How buyers reach you · after reveal</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 28 }}>
            {([{ id: 'instagram', label: 'Instagram', icon: 'instagram' }, { id: 'phone', label: 'Text', icon: 'phone' }, { id: 'email', label: 'Email', icon: 'mail' }] as const).map((c) => {
              const active = contact.includes(c.id);
              return (
                <button key={c.id} onClick={() => setContact((prev) => prev.includes(c.id) ? prev.filter((x) => x !== c.id) : [...prev, c.id])} style={{ background: active ? 'var(--cardinal)' : '#fff', color: active ? '#fff' : 'var(--ink)', border: '1.5px solid ' + (active ? 'var(--cardinal)' : 'var(--rule-strong)'), borderRadius: 8, padding: '14px 8px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, fontFamily: 'var(--sans)', fontWeight: 600, fontSize: 12.5 }}>
                  <Icon name={c.icon} size={16} /> {c.label}
                </button>
              );
            })}
          </div>

          {(() => {
            const missing = [
              photos.length === 0 && 'photo',
              !title.trim() && 'title',
              !description.trim() && 'description',
              !price.trim() && 'price',
              !location.trim() && 'pickup location',
              contact.length === 0 && 'contact method',
            ].filter(Boolean);
            return (
              <Button
                kind="primary" full size="lg" icon="arrowRight"
                onClick={() => setStep(3)}
                disabled={missing.length > 0}
              >
                {missing.length > 0 ? `Add ${missing[0]} to continue` : 'Preview listing'}
              </Button>
            );
          })()}
        </div>
      )}

      {step === 3 && (
        <div>
          <h1 className="t-h1" style={{ fontSize: 28, margin: '0 0 4px' }}>Here&apos;s how buyers will see it.</h1>
          <p className="t-meta" style={{ fontSize: 12.5, marginBottom: 22 }}>Looks good? Publish to go live on the feed.</p>

          {/* Card preview */}
          <div style={{ background: '#fff', border: '1px solid var(--rule)', borderRadius: 10, padding: 24, marginBottom: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
            <div className="t-eyebrow" style={{ color: 'var(--muted)', marginBottom: 16, paddingBottom: 14, borderBottom: '1px solid var(--rule)' }}>FEED CARD</div>
            <div style={{ maxWidth: 260 }}>
              <ListingCard
                listing={{
                  id: 'preview', category: category || 'goods',
                  categoryLabel: (CATEGORIES.find((c) => c.id === category) || {}).label || 'Goods',
                  title: title || 'Untitled listing', priceLabel: price ? '$' + price : 'Free',
                  meta: location, photoTone: toneFor(category), photoLabel: 'your photo',
                  photo_urls: photos.map((p) => p.url),
                  photo_focus: photoFocus,
                  seller: { id: store.me?.id ?? '', name: store.me?.display_name ?? 'You', unit: store.me?.school_unit ?? '', year: '' },
                }}
              />
            </div>
          </div>

          {/* Full listing preview */}
          <div style={{ background: '#fff', border: '1px solid var(--rule)', borderRadius: 10, padding: 24, marginBottom: 32, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
            <div className="t-eyebrow" style={{ color: 'var(--muted)', marginBottom: 16, paddingBottom: 14, borderBottom: '1px solid var(--rule)' }}>FULL LISTING</div>
            <WebListingDetail
              store={store}
              preview
              onBack={() => {}}
              onReveal={() => {}}
              listing={{
                id: 'preview',
                category: category || 'goods',
                categoryLabel: (CATEGORIES.find((c) => c.id === category) || {}).label || 'Goods',
                title: title || 'Untitled listing',
                price: price ? Number(price) : undefined,
                priceLabel: price ? '$' + price : 'Free',
                meta: location,
                photoTone: toneFor(category),
                photoLabel: 'your photo',
                photo_urls: photos.map((p) => p.url),
                photo_focus: photoFocus,
                description,
                seller: { id: store.me?.id ?? '', name: store.me?.display_name ?? 'You', unit: store.me?.school_unit ?? '', year: '' },
                postedLabel: 'just now',
              }}
            />
            <div className="t-meta" style={{ fontSize: 11, marginTop: 12, textAlign: 'center', color: 'var(--muted)' }}>
              This is exactly how buyers will see your listing.
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <Button kind="ghost" onClick={() => setStep(2)}>Back to edit</Button>
            <div style={{ flex: 1 }} />
            <Button kind="primary" size="lg" icon="check" onClick={publish}>Publish listing</Button>
          </div>
        </div>
      )}
    </div>
  );
}

function EmptyState({ icon, title, sub }: { icon: string; title: string; sub: string }) {
  return (
    <div style={{ padding: '70px 0', textAlign: 'center' }}>
      <Icon name={icon} size={30} color="var(--rule-strong)" />
      <div className="t-h3" style={{ marginTop: 14, color: 'var(--ink)' }}>{title}</div>
      <div className="t-meta" style={{ fontSize: 12.5, marginTop: 6 }}>{sub}</div>
    </div>
  );
}

// ── Profile (web) ───────────────────────────────────────────────────
export function WebProfile({
  store, onListing, onApprove, onDecline,
}: { store: FlipdStore; onListing: (l: Listing) => void; onApprove: (id: string) => void; onDecline: (id: string) => void }) {
  const [tab, setTab] = React.useState<'listings' | 'past' | 'saved' | 'activity'>('listings');
  const displayName = store.me?.display_name ?? 'Your profile';
  return (
    <div>
      {/* Banner */}
      <div style={{ background: 'var(--cardinal-dark)', color: '#fff', position: 'relative' }}>
        <div style={{ position: 'absolute', top: 0, left: 0, width: 44, height: 4, background: 'var(--gold)' }} />
        <div style={{ maxWidth: 1180, margin: '0 auto', padding: '40px 32px 28px', display: 'flex', alignItems: 'center', gap: 20 }}>
          <Avatar name={displayName} size={76} tone="gold" />
          <div style={{ flex: 1 }}>
            <h1 style={{ fontFamily: 'var(--serif)', fontWeight: 700, fontSize: 28, letterSpacing: '-0.015em', margin: '0 0 4px' }}>
              {displayName}
            </h1>
            <div style={{ fontFamily: 'var(--sans)', fontSize: 13.5, opacity: 0.85 }}>
              {store.me?.school_unit} · joined {formatPostedDate(store.me?.created_at) || 'recently'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 28 }}>
            {[{ v: store.myListings.length, l: 'Listings' }].map((s) => (
              <div key={s.l} style={{ textAlign: 'center' }}>
                <div style={{ fontFamily: 'var(--serif)', fontWeight: 700, fontSize: 26 }}>{s.v}</div>
                <div className="t-meta" style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.6)', marginTop: 2 }}>{s.l}</div>
              </div>
            ))}
          </div>
        </div>
        {/* Tabs */}
        <div style={{ maxWidth: 1180, margin: '0 auto', padding: '0 32px', display: 'flex', gap: 28 }}>
          {([
            { id: 'listings', label: 'My Listings', count: store.myListings.length },
            { id: 'past', label: 'Past Listings', count: store.pastListings.length },
            { id: 'saved', label: 'Saved', count: store.savedListings.length },
            { id: 'activity', label: 'Activity', count: store.pendingCount || null },
          ] as const).map((t) => {
            const active = tab === t.id;
            return (
              <button key={t.id} onClick={() => setTab(t.id)} style={{ background: 'none', border: 0, padding: '14px 2px', fontFamily: 'var(--sans)', fontWeight: 600, fontSize: 13.5, color: active ? '#fff' : 'rgba(255,255,255,0.6)', borderBottom: '2px solid ' + (active ? 'var(--gold)' : 'transparent'), display: 'flex', alignItems: 'center', gap: 6 }}>
                {t.label}
                {t.count ? <span style={{ background: 'rgba(255,255,255,0.18)', borderRadius: 999, fontSize: 10, fontWeight: 700, padding: '1px 7px' }}>{t.count}</span> : null}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 1180, margin: '0 auto', padding: '28px 32px 64px' }}>
        {tab === 'listings' &&
          (store.myListings.length === 0 ? (
            <EmptyState icon="tag" title="No listings yet" sub="Tap Post a listing to put your first item on the feed." />
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 18 }}>
              {store.myListings.map((l) => <ListingCard key={l.id} listing={l} onClick={() => onListing(l)} />)}
            </div>
          ))}
        {tab === 'past' &&
          (store.pastListings.length === 0 ? (
            <EmptyState icon="clock" title="No past listings" sub="Listings you move to past from their detail page show up here." />
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 18 }}>
              {store.pastListings.map((l) => <ListingCard key={l.id} listing={l} onClick={() => onListing(l)} />)}
            </div>
          ))}
        {tab === 'saved' &&
          (store.savedListings.length === 0 ? (
            <EmptyState icon="bookmark" title="Nothing saved" sub="Tap the bookmark on any listing to keep it here." />
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 18 }}>
              {store.savedListings.map((l) => <ListingCard key={l.id} listing={l} onClick={() => onListing(l)} />)}
            </div>
          ))}
        {tab === 'activity' && (
          <div style={{ maxWidth: 640 }}>
            {store.activity.map((a, i) => (
              <ActivityRow key={a.id} a={a} onApprove={onApprove} onDecline={onDecline} last={i === store.activity.length - 1} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Reveal modal + approved ─────────────────────────────────────────
function ModalScrim({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(26,26,26,0.4)', backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 24 }}>
      <div onClick={(e) => e.stopPropagation()}>{children}</div>
    </div>
  );
}

export function RevealModal({ listing, onClose, onContinue }: { listing: Listing; onClose: () => void; onContinue: () => void }) {
  const handleShare = async () => {
    const confetti = (await import('canvas-confetti')).default;
    confetti({
      particleCount: 120,
      spread: 80,
      origin: { y: 0.55 },
      colors: ['#990000', '#FFCC00', '#ffffff'],
    });
    onContinue();
  };
  return (
    <ModalScrim onClose={onClose}>
      <div style={{ background: '#fff', borderRadius: 8, padding: 0, width: 460, overflow: 'hidden', boxShadow: '0 24px 60px rgba(0,0,0,0.18)', fontFamily: 'var(--sans)' }}>
        <div style={{ background: 'var(--cardinal-dark)', color: '#fff', padding: '28px 28px', display: 'flex', alignItems: 'center', gap: 14, position: 'relative' }}>
          <div style={{ position: 'absolute', top: 0, left: 0, width: 28, height: 4, background: 'var(--gold)' }} />
          <Icon name="shield" size={26} color="var(--gold)" />
          <div className="t-eyebrow" style={{ color: 'var(--gold)', fontSize: 14, letterSpacing: '0.2em' }}>REVEAL CONTACT</div>
        </div>
        <div style={{ padding: '24px 28px' }}>
          <h2 style={{ fontFamily: 'var(--serif)', fontWeight: 700, fontSize: 24, lineHeight: 1.2, letterSpacing: '-0.01em', margin: '0 0 10px' }}>
            Share your info with <em style={{ color: 'var(--cardinal)' }}>{listing.seller.name.split(' ')[0]}</em>?
          </h2>
          <p className="t-body" style={{ fontSize: 13.5, margin: '0 0 20px' }}>
            We&apos;ll share your <strong>name</strong> and <strong>@usc.edu email</strong> with this seller. They have 72 hours to approve. If they do, you&apos;ll see their preferred contact method.
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button kind="ghost" onClick={onClose} style={{ flex: 1 }}>Cancel</Button>
            <Button kind="primary" onClick={handleShare} style={{ flex: 1 }} icon="arrowRight">Share</Button>
          </div>
        </div>
      </div>
    </ModalScrim>
  );
}

// ── Root ─────────────────────────────────────────────────────────────
export function WebApp({ onExit }: { onExit?: () => void }) {
  const store = useFlipdStore();
  const [view, setView] = React.useState<'feed' | 'detail' | 'create' | 'profile'>('feed');
  const [activeCat, setActiveCat] = React.useState('all');
  const [selected, setSelected] = React.useState<Listing | null>(null);
  const [modal, setModal] = React.useState<'reveal' | null>(null);
  const [query, setQuery] = React.useState('');
  const [sort, setSort] = React.useState('recent');
  const [priceFilter, setPriceFilter] = React.useState('any');
  const [notifOpen, setNotifOpen] = React.useState(false);

  const goFeed = () => { setView('feed'); setSelected(null); };
  const goDetail = (l: Listing) => { setSelected(l); setView('detail'); };
  const onSearch = (q: string) => { setQuery(q); if (view !== 'feed') setView('feed'); };
  const approve = (id: string) => store.respondReveal(id, 'approve');
  const decline = (id: string) => store.respondReveal(id, 'decline');

  return (
    <div style={{ background: '#fff', minHeight: '100%', fontFamily: 'var(--sans)', position: 'relative' }}>
      <WebAppHeader
        onLogo={onExit || goFeed}
        query={query}
        setQuery={onSearch}
        onPost={() => setView('create')}
        onProfile={() => setView('profile')}
        onBell={() => setNotifOpen(true)}
        pendingCount={store.pendingCount}
      />

      {view === 'feed' && store.listingsLoading && (
        <div style={{ padding: '80px 0', textAlign: 'center', color: 'var(--muted)', fontFamily: 'var(--sans)', fontSize: 13 }}>
          Loading listings…
        </div>
      )}
      {view === 'feed' && !store.listingsLoading && (
        <WebAppFeed
          store={store} activeCat={activeCat} setActiveCat={setActiveCat}
          onListing={goDetail} query={query} sort={sort} setSort={setSort}
          priceFilter={priceFilter} setPriceFilter={setPriceFilter}
        />
      )}
      {view === 'detail' && selected && (
        <WebListingDetail store={store} listing={selected} onBack={goFeed} onReveal={() => setModal('reveal')} />
      )}
      {view === 'create' && (
        <WebCreate
          store={store}
          onCancel={goFeed}
          onPublish={async (fd) => {
            try {
              const created = await store.addListing(fd);
              if (!created) throw new Error('Publish failed — no listing returned.');
              setView('feed'); setActiveCat('all'); setSort('recent');
            } catch (err) {
              const msg = err instanceof Error ? err.message : 'Publish failed.';
              console.error('[publish] failed:', err);
              alert('Could not publish your listing:\n\n' + msg);
            }
          }}
        />
      )}
      {view === 'profile' && <WebProfile store={store} onListing={goDetail} onApprove={approve} onDecline={decline} />}

      {modal === 'reveal' && selected && (
        <RevealModal listing={selected} onClose={() => setModal(null)} onContinue={() => { store.requestReveal(selected.id); setModal(null); }} />
      )}

      {notifOpen && <WebNotifications activity={store.activity} onClose={() => setNotifOpen(false)} onApprove={approve} onDecline={decline} />}
    </div>
  );
}
