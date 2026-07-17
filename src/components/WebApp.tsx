'use client';

// Flipd — Web app (ported from screens/web-app.jsx)
// Feed, search/sort/filter, listing detail, reveal flow, create-listing,
// profile (my listings / saved / activity), and a notifications panel.
// All wired to the in-memory store.
import React from 'react';
import { Icon } from './Icon';
import { Avatar, Button, Callout, CategoryChip, ListingCard, Pill, Placeholder, Wordmark } from './ui';
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
          border: '1px solid ' + (open ? 'var(--accent)' : 'var(--rule)'), background: '#fff',
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
                  color: value === o.id ? 'var(--accent)' : 'var(--ink)',
                  fontWeight: value === o.id ? 700 : 500,
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface)')}
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
  onLogo, query, setQuery, onPost, onProfile, onBell, pendingCount, meName,
}: {
  onLogo: () => void; query: string; setQuery: (q: string) => void;
  onPost: () => void; onProfile: () => void; onBell: () => void; pendingCount: number;
  meName: string;
}) {
  return (
    <header style={{ padding: '14px 32px', background: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(12px)', borderBottom: '1px solid var(--rule)', display: 'flex', alignItems: 'center', gap: 28, position: 'sticky', top: 0, zIndex: 30 }}>
      <button onClick={onLogo} style={{ background: 'none', border: 0, padding: 0, display: 'flex', alignItems: 'center', gap: 10 }} aria-label="Go to feed">
        <Wordmark size={24} />
      </button>
      <div style={{ flex: 1, maxWidth: 520, position: 'relative' }}>
        <Icon name="search" size={15} color="var(--muted)" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)' }} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search Flipd"
          aria-label="Search Flipd"
          className="field"
          style={{ background: 'var(--surface)', border: 'none', paddingLeft: 38, fontSize: 13.5, padding: '10px 16px 10px 38px', borderRadius: 999 }}
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
            <span style={{ position: 'absolute', top: 2, right: 2, minWidth: 15, height: 15, padding: '0 3px', borderRadius: 999, background: 'var(--accent)', color: '#fff', fontSize: 9, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1.5px solid #fff' }}>{pendingCount}</span>
          )}
        </button>
        <Button kind="primary" size="sm" icon="plus" onClick={onPost}>Post a listing</Button>
        <button onClick={onProfile} aria-label="Your profile" style={{ background: 'none', border: 0, padding: 0 }}>
          <Avatar name={meName} size={30} tone="ink" />
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
    APPROVED: { bg: 'var(--ink)', fg: '#fff' },
    EXPIRED: { bg: 'var(--surface)', fg: 'var(--muted)' },
    DECLINED: { bg: 'var(--surface)', fg: 'var(--muted)' },
    PENDING: { bg: 'var(--accent)', fg: '#fff' },
  } as Record<string, { bg: string; fg: string }>)[a.status] || { bg: 'var(--surface)', fg: 'var(--muted)' };
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: compact ? '14px 18px' : '16px 0', borderBottom: last ? 0 : '1px solid var(--rule)' }}>
      <Avatar name={a.who} size={36} tone={a.dir === 'in' ? 'ink' : 'cream'} />
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
              <a href={`https://instagram.com/${a.contact.instagram.replace(/^@/, '')}`} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: 'var(--surface)', borderRadius: 6, padding: '6px 10px', fontFamily: 'var(--sans)', fontWeight: 600, fontSize: 12.5, color: 'var(--ink)', textDecoration: 'none' }}>
                <Icon name="instagram" size={13} />
                {a.contact.instagram}
              </a>
            )}
            {a.contact.phone && (
              <a href={`tel:${a.contact.phone}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: 'var(--surface)', borderRadius: 6, padding: '6px 10px', fontFamily: 'var(--sans)', fontWeight: 600, fontSize: 12.5, color: 'var(--ink)', textDecoration: 'none' }}>
                <Icon name="phone" size={13} />
                {a.contact.phone}
              </a>
            )}
            {a.contact.email && (
              <a href={`mailto:${a.contact.email}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: 'var(--surface)', borderRadius: 6, padding: '6px 10px', fontFamily: 'var(--sans)', fontWeight: 600, fontSize: 12.5, color: 'var(--ink)', textDecoration: 'none' }}>
                <Icon name="mail" size={13} />
                {a.contact.email}
              </a>
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
          {activity.length === 0 ? (
            <EmptyState icon="bell" title="No activity yet" sub="Reveal requests you send and receive show up here." />
          ) : (
            activity.map((a, i) => (
              <ActivityRow key={a.id} a={a} compact onApprove={onApprove} onDecline={onDecline} last={i === activity.length - 1} />
            ))
          )}
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
          <h1 style={{ fontWeight: 800, fontSize: 26, letterSpacing: '-0.03em', color: 'var(--ink)', margin: 0 }}>
            {query ? <>Results for <em style={{ color: 'var(--accent)', fontStyle: 'normal' }}>&quot;{query}&quot;</em></> : 'Today on Flipd'}
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 20 }}>
          {items.map((l) => (
            <div key={l.id} style={{ position: 'relative' }}>
              <ListingCard listing={l} onClick={() => onListing(l)} />
              <button
                onClick={(e) => { e.stopPropagation(); store.toggleSave(l.id); }}
                aria-label={store.isSaved(l.id) ? 'Remove from saved' : 'Save listing'}
                style={{ position: 'absolute', top: 8, right: 8, zIndex: 2, width: 30, height: 30, borderRadius: '50%', border: 0, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'var(--shadow)' }}
              >
                <Icon name="bookmark" size={15} color={store.isSaved(l.id) ? 'var(--accent)' : 'var(--muted)'} stroke={store.isSaved(l.id) ? 0 : 1.6} />
                {store.isSaved(l.id) && (
                  <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="var(--accent)"><path d="M6 4h12v17l-6-4-6 4z" /></svg>
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
  const reveal = preview ? undefined : store.myRevealFor(listing.id);
  const photos = listing.photo_urls ?? [];
  const [lightbox, setLightbox] = React.useState<number | null>(null);
  const n = photos.length;

  React.useEffect(() => {
    if (lightbox === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightbox(null);
      if (e.key === 'ArrowRight') setLightbox((i) => (i === null ? i : (i + 1) % n));
      if (e.key === 'ArrowLeft') setLightbox((i) => (i === null ? i : (i - 1 + n) % n));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightbox, n]);

  const tile = (idx: number, style: React.CSSProperties = {}) => (
    <div key={idx} onClick={() => setLightbox(idx)} style={{ position: 'relative', overflow: 'hidden', cursor: 'pointer', background: 'var(--surface)', ...style }}>
      <img src={photos[idx]} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: listing.photo_focus?.[idx] || '50% 50%' }} />
    </div>
  );
  return (
    <div style={{ padding: '24px 32px 64px', maxWidth: 1180, margin: '0 auto' }}>
      {!preview && (
      <button onClick={onBack} style={{ background: 'none', border: 0, padding: 0, display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--muted)', fontFamily: 'var(--sans)', fontSize: 12.5, marginBottom: 18 }}>
        <Icon name="chevronLeft" size={14} /> Back to feed
      </button>
      )}

      {/* Gallery: Airbnb-style adaptive grid; click opens lightbox */}
      <div style={{ position: 'relative', marginBottom: 28 }}>
        {n === 0 && (
          <div style={{ maxWidth: 640, aspectRatio: '2 / 1', borderRadius: 14, overflow: 'hidden' }}>
            <Placeholder label={listing.photoLabel} tone="cream" height="100%" radius={0} />
          </div>
        )}
        {n === 1 && (
          <div onClick={() => setLightbox(0)} style={{ position: 'relative', maxWidth: 640, aspectRatio: '2 / 1', borderRadius: 14, overflow: 'hidden', cursor: 'pointer', background: 'var(--surface)' }}>
            <img
              src={photos[0]}
              alt=""
              aria-hidden
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', filter: 'blur(28px) brightness(1.05)', transform: 'scale(1.15)', opacity: 0.55 }}
            />
            <img
              src={photos[0]}
              alt={listing.title}
              style={{ position: 'absolute', inset: 0, margin: 'auto', maxWidth: '100%', height: '100%', objectFit: 'contain' }}
            />
          </div>
        )}
        {n === 2 && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, borderRadius: 14, overflow: 'hidden', maxWidth: 640, aspectRatio: '2 / 1' }}>
            {tile(0)}
            {tile(1)}
          </div>
        )}
        {(n === 3 || n === 4) && (
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gridTemplateRows: '1fr 1fr', gap: 8, borderRadius: 14, overflow: 'hidden', maxWidth: 660, aspectRatio: '3 / 2' }}>
            {tile(0, { gridRow: 'span 2' })}
            {tile(1)}
            {tile(2)}
          </div>
        )}
        {n >= 5 && (
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gridTemplateRows: '1fr 1fr', gap: 8, borderRadius: 14, overflow: 'hidden', maxWidth: 880, aspectRatio: '2.04 / 1' }}>
            {tile(0, { gridRow: 'span 2' })}
            {tile(1)}
            {tile(2)}
            {tile(3)}
            {tile(4)}
          </div>
        )}
        {n > 1 && (
          <button
            onClick={() => setLightbox(0)}
            style={{ position: 'absolute', right: 14, bottom: 14, background: '#fff', border: '1px solid var(--ink)', borderRadius: 8, padding: '7px 14px', fontFamily: 'var(--sans)', fontWeight: 600, fontSize: 13, color: 'var(--ink)', cursor: 'pointer', boxShadow: 'var(--shadow)' }}
          >
            Show all photos
          </button>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 48, alignItems: 'start' }}>
        {/* Left: the story */}
        <div>
          <div style={{ fontFamily: 'var(--sans)', fontWeight: 600, fontSize: 12.5, color: 'var(--accent)', marginBottom: 8 }}>
            {listing.categoryLabel} · posted {listing.postedLabel || 'recently'}
          </div>
          <h1 style={{ fontWeight: 800, fontSize: 30, letterSpacing: '-0.03em', color: 'var(--ink)', margin: '0 0 6px' }}>{listing.title}</h1>
          {listing.meta && (
            <div style={{ color: 'var(--muted)', fontFamily: 'var(--sans)', fontSize: 13.5, marginBottom: 18 }}>
              Pickup at {listing.meta.split(' · ')[0]}
            </div>
          )}

          {listing.description?.trim() && (
            <p style={{ fontFamily: 'var(--sans)', fontSize: 14.5, lineHeight: 1.65, color: 'var(--ink-2)', margin: '0 0 26px', whiteSpace: 'pre-wrap' }}>
              {listing.description}
            </p>
          )}

          <hr className="rule" style={{ margin: '0 0 20px' }} />

          <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
            <Avatar name={listing.seller.name} size={44} tone="cream" />
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ fontFamily: 'var(--sans)', fontWeight: 700, fontSize: 14.5, color: 'var(--ink)' }}>
                  {listing.seller.name} listed this
                </div>
                {listing.seller.isDemo && <Pill kind="verified">FLIPD TEAM</Pill>}
              </div>
              {(listing.seller.unit || listing.seller.year) && (
                <div className="t-meta" style={{ fontSize: 12.5, marginTop: 2 }}>
                  {[listing.seller.unit, listing.seller.year].filter(Boolean).join(' · ')}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right: price + action panel */}
        <div style={{ background: '#fff', border: '1px solid var(--rule)', borderRadius: 16, padding: 24, boxShadow: 'var(--shadow)' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 18 }}>
            <span style={{ fontWeight: 800, fontSize: 28, letterSpacing: '-0.02em', color: 'var(--ink)' }}>{listing.priceLabel}</span>
            {listing.negotiable && <span className="t-meta" style={{ fontSize: 13 }}>or best offer</span>}
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
          ) : reveal?.status === 'APPROVED' && reveal.contact ? (
            <div>
              <div className="t-eyebrow" style={{ color: 'var(--muted)', marginBottom: 12 }}>CONTACT</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {reveal.contact.instagram && (
                  <a href={`https://instagram.com/${reveal.contact.instagram.replace(/^@/, '')}`} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: 'var(--ink)', fontFamily: 'var(--sans)', fontWeight: 600, fontSize: 13.5, textDecoration: 'none' }}>
                    <Icon name="instagram" size={16} color="var(--ink)" /> {reveal.contact.instagram}
                  </a>
                )}
                {reveal.contact.phone && (
                  <a href={`tel:${reveal.contact.phone}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: 'var(--ink)', fontFamily: 'var(--sans)', fontWeight: 600, fontSize: 13.5, textDecoration: 'none' }}>
                    <Icon name="phone" size={16} color="var(--ink)" /> {reveal.contact.phone}
                  </a>
                )}
                {reveal.contact.email && (
                  <a href={`mailto:${reveal.contact.email}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: 'var(--ink)', fontFamily: 'var(--sans)', fontWeight: 600, fontSize: 13.5, textDecoration: 'none' }}>
                    <Icon name="mail" size={16} color="var(--ink)" /> {reveal.contact.email}
                  </a>
                )}
              </div>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {reveal?.status === 'PENDING' ? (
                  <Button kind="secondary" full size="lg" disabled>Requested — waiting on seller</Button>
                ) : (
                  <Button kind="primary" full size="lg" onClick={preview ? () => {} : onReveal} disabled={preview}>Reveal Contact</Button>
                )}
                <Button kind="secondary" full size="lg" onClick={() => { if (!preview) store.toggleSave(listing.id); }} disabled={preview}>
                  {saved ? 'Saved' : 'Save for later'}
                </Button>
              </div>
              <div className="t-meta" style={{ fontSize: 11.5, marginTop: 14, textAlign: 'center', color: 'var(--muted)' }}>
                {listing.seller.name.split(' ')[0]} will see your name, school, and year — everyone here is verified USC.
              </div>
            </>
          )}
        </div>
      </div>

      {lightbox !== null && photos[lightbox] && (
        <div onClick={() => setLightbox(null)} style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(17,17,17,0.93)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <button onClick={() => setLightbox(null)} aria-label="Close photos" style={{ position: 'absolute', top: 20, right: 24, width: 36, height: 36, borderRadius: '50%', border: 0, background: 'rgba(255,255,255,0.14)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <Icon name="x" size={16} color="#fff" />
          </button>
          {n > 1 && (
            <button onClick={(e) => { e.stopPropagation(); setLightbox((lightbox - 1 + n) % n); }} aria-label="Previous photo" style={{ position: 'absolute', left: 20, top: '50%', transform: 'translateY(-50%)', width: 40, height: 40, borderRadius: '50%', border: 0, background: 'rgba(255,255,255,0.14)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
              <Icon name="chevronLeft" size={18} color="#fff" />
            </button>
          )}
          <img
            src={photos[lightbox]}
            alt={listing.title}
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '86vw', maxHeight: '84vh', objectFit: 'contain', borderRadius: 8 }}
          />
          {n > 1 && (
            <button onClick={(e) => { e.stopPropagation(); setLightbox((lightbox + 1) % n); }} aria-label="Next photo" style={{ position: 'absolute', right: 20, top: '50%', transform: 'translateY(-50%)', width: 40, height: 40, borderRadius: '50%', border: 0, background: 'rgba(255,255,255,0.14)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
              <Icon name="chevronLeft" size={18} color="#fff" style={{ transform: 'rotate(180deg)' }} />
            </button>
          )}
          {n > 1 && (
            <div style={{ position: 'absolute', bottom: 22, left: '50%', transform: 'translateX(-50%)', color: '#fff', fontFamily: 'var(--sans)', fontWeight: 600, fontSize: 13 }}>
              {lightbox + 1} / {n}
            </div>
          )}
        </div>
      )}
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
  const [attempted, setAttempted] = React.useState(false);
  const [category, setCategory] = React.useState<string | null>(null);
  const [title, setTitle] = React.useState('');
  const [price, setPrice] = React.useState('');
  const [neg, setNeg] = React.useState(false);
  const [location, setLocation] = React.useState('');
  const [contact, setContact] = React.useState<ContactMethod[]>([]);
  const [description, setDescription] = React.useState('');
  const [aiLoading, setAiLoading] = React.useState(false);
  const [photos, setPhotos] = React.useState<{ file: File; url: string }[]>([]);
  const [photoFocus, setPhotoFocus] = React.useState<string[]>([]);
  const [cropIndex, setCropIndex] = React.useState(0);
  const [dragIndex, setDragIndex] = React.useState<number | null>(null);
  const dragState = React.useRef<{ startX: number; startY: number; baseX: number; baseY: number; w: number; h: number } | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const addFiles = (files: FileList | File[]) => {
    const incoming = Array.from(files)
      .filter((f) => f.type.startsWith('image/'))
      .slice(0, Math.max(0, 8 - photos.length));
    if (incoming.length === 0) return;
    const mapped = incoming.map((file) => ({ file, url: URL.createObjectURL(file) }));
    setPhotos((prev) => [...prev, ...mapped]);
    setPhotoFocus((prev) => [...prev, ...mapped.map(() => '50% 50%')]);
    setCropIndex(photos.length);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) addFiles(e.target.files);
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
          category: CATEGORIES.find((c) => c.id === category)?.label || category || 'goods',
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

  const missing = [
    !category && 'a category',
    photos.length === 0 && 'a photo',
    !title.trim() && 'a title',
    !description.trim() && 'a description',
    !price.trim() && 'a price',
    !location.trim() && 'a pickup location',
    contact.length === 0 && 'a contact method',
  ].filter(Boolean) as string[];

  const publish = () => {
    if (missing.length > 0) {
      setAttempted(true);
      return;
    }
    const fd = new FormData();
    fd.append('category', category || 'goods');
    fd.append('title', title.trim());
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
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 32px 80px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '10px 0 32px' }}>
        <h1 style={{ fontWeight: 800, fontSize: 30, letterSpacing: '-0.03em', color: 'var(--ink)', margin: 0 }}>What are you passing on?</h1>
        <Button kind="secondary" size="sm" onClick={onCancel}>Exit</Button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 44, alignItems: 'start' }}>
        {/* Left: photos */}
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />
          {photos[cropIndex] ? (
            <div
              onPointerDown={onCropPointerDown}
              onPointerMove={onCropPointerMove}
              onPointerUp={onCropPointerUp}
              style={{ width: '100%', aspectRatio: '1.05', borderRadius: 14, overflow: 'hidden', cursor: 'grab', touchAction: 'none', userSelect: 'none', background: 'var(--surface)' }}
            >
              <img
                src={photos[cropIndex].url}
                alt="cover"
                draggable={false}
                style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: photoFocus[cropIndex] || '50% 50%', display: 'block', pointerEvents: 'none' }}
              />
            </div>
          ) : (
            <button
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files); }}
              style={{
                width: '100%', aspectRatio: '1.05', borderRadius: 14, border: 0,
                background: 'var(--surface)', display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', gap: 10, cursor: 'pointer',
              }}
            >
              <span style={{ width: 44, height: 44, borderRadius: '50%', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'var(--shadow)' }}>
                <Icon name="plus" size={18} color="var(--ink)" />
              </span>
              <span style={{ fontFamily: 'var(--sans)', fontWeight: 600, fontSize: 13.5, color: 'var(--ink)' }}>Add photos</span>
              <span style={{ fontFamily: 'var(--sans)', fontSize: 12.5, color: 'var(--muted)', marginTop: -6 }}>The first one is your cover · up to 8</span>
            </button>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginTop: 10 }}>
            {Array.from({ length: photos.length > 4 ? 8 : 4 }).map((_, i) => (
              photos[i] ? (
                <div
                  key={i}
                  draggable
                  onDragStart={() => setDragIndex(i)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => { if (dragIndex !== null) reorderPhotos(dragIndex, i); setDragIndex(null); }}
                  onDragEnd={() => setDragIndex(null)}
                  onClick={() => setCropIndex(i)}
                  style={{ position: 'relative', aspectRatio: '1.4', borderRadius: 10, overflow: 'hidden', cursor: 'grab', opacity: dragIndex === i ? 0.4 : 1, outline: cropIndex === i ? '2px solid var(--ink)' : 'none', outlineOffset: -2 }}
                >
                  <img src={photos[i].url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: photoFocus[i] || '50% 50%' }} />
                  <button
                    onClick={(e) => { e.stopPropagation(); removePhoto(i); }}
                    aria-label="Remove photo"
                    style={{ position: 'absolute', top: 4, right: 4, width: 18, height: 18, borderRadius: '50%', border: 0, background: 'rgba(0,0,0,0.55)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0 }}
                  >
                    <Icon name="x" size={9} />
                  </button>
                </div>
              ) : (
                <button
                  key={i}
                  onClick={() => fileInputRef.current?.click()}
                  style={{ aspectRatio: '1.4', borderRadius: 10, border: '1.5px dashed var(--rule-strong)', background: i === 0 ? 'var(--surface)' : 'none', cursor: 'pointer' }}
                  aria-label="Add photo"
                />
              )
            ))}
          </div>

          <p style={{ fontFamily: 'var(--sans)', fontSize: 12.5, lineHeight: 1.55, color: 'var(--muted)', margin: '14px 0 0' }}>
            Tip: shoot near a window, and include the flaw if there is one. Buyers trust listings that show everything.
          </p>
        </div>

        {/* Right: details */}
        <div>
          <label className="field-label">It’s in the category of…</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 22 }}>
            {CATEGORIES.filter((c) => c.id !== 'all').map((c) => (
              <CategoryChip key={c.id} category={c} active={category === c.id} onClick={() => setCategory(c.id)} />
            ))}
          </div>

          <label className="field-label">Give it a title</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} className="field" placeholder="e.g. Mini fridge, two gentle years old" style={{ marginBottom: 22 }} />

          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
            <label className="field-label" style={{ margin: 0 }}>Tell its story</label>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
              <button
                onClick={generateDescription}
                disabled={!title.trim() || aiLoading}
                style={{
                  background: 'none', border: 0, padding: 0,
                  fontFamily: 'var(--sans)', fontWeight: 600, fontSize: 12,
                  color: (!title.trim() || aiLoading) ? 'var(--muted-2)' : 'var(--accent)',
                  cursor: (!title.trim() || aiLoading) ? 'default' : 'pointer',
                }}
              >
                {aiLoading ? 'Generating…' : 'Generate with AI'}
              </button>
              <span style={{ fontFamily: 'var(--sans)', fontSize: 12, color: 'var(--muted)' }}>{description.length} / 500</span>
            </span>
          </div>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value.slice(0, 500))}
            className="field"
            rows={4}
            style={{ marginBottom: 22, resize: 'vertical' }}
          />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: 12, marginBottom: 22, alignItems: 'end' }}>
            <div>
              <label className="field-label">Price</label>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', fontWeight: 600 }}>$</span>
                <input value={price} onChange={(e) => setPrice(e.target.value)} type="number" className="field" placeholder="40" style={{ paddingLeft: 28, fontWeight: 600 }} />
              </div>
            </div>
            <button
              onClick={() => setNeg(!neg)}
              role="switch"
              aria-checked={neg}
              style={{ height: 47, display: 'inline-flex', alignItems: 'center', gap: 10, background: '#fff', border: '1.5px solid var(--rule)', borderRadius: 12, padding: '0 14px', fontFamily: 'var(--sans)', fontWeight: 600, fontSize: 13.5, color: 'var(--ink)', cursor: 'pointer' }}
            >
              <span style={{ width: 38, height: 22, borderRadius: 999, background: neg ? 'var(--accent)' : 'var(--rule-strong)', position: 'relative', transition: 'background 160ms ease-out', flexShrink: 0 }}>
                <span style={{ position: 'absolute', top: 2, left: neg ? 18 : 2, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left 160ms ease-out' }} />
              </span>
              Open to offers
            </button>
          </div>

          <label className="field-label">Where you’ll meet</label>
          <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="USC Village" className="field" style={{ marginBottom: 22 }} />

          <label className="field-label">How buyers reach you</label>
          <div style={{ display: 'flex', gap: 8 }}>
            {([{ id: 'instagram', label: 'Instagram' }, { id: 'phone', label: 'Text' }, { id: 'email', label: 'Email' }] as const).map((c) => {
              const active = contact.includes(c.id);
              return (
                <button key={c.id} onClick={() => setContact((prev) => prev.includes(c.id) ? prev.filter((x) => x !== c.id) : [...prev, c.id])} style={{ background: active ? 'var(--ink)' : '#fff', color: active ? '#fff' : 'var(--ink-2)', border: '1px solid ' + (active ? 'var(--ink)' : 'var(--rule)'), borderRadius: 999, padding: '8px 16px', fontFamily: 'var(--sans)', fontWeight: 600, fontSize: 13 }}>
                  {c.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <hr className="rule" style={{ margin: '36px 0 20px' }} />
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button kind="primary" size="lg" onClick={publish}>Publish listing</Button>
      </div>
      {attempted && missing.length > 0 && (
        <div style={{ fontSize: 12.5, marginTop: 10, textAlign: 'right', color: 'var(--accent)' }}>
          Add {missing[0]} to publish.
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
      <div style={{ background: '#fff', borderBottom: '1px solid var(--rule)', position: 'relative' }}>
        <div style={{ maxWidth: 1180, margin: '0 auto', padding: '40px 32px 0', display: 'flex', alignItems: 'center', gap: 20 }}>
          <Avatar name={displayName} size={76} tone="ink" />
          <div style={{ flex: 1 }}>
            <h1 style={{ fontWeight: 800, fontSize: 26, color: 'var(--ink)', letterSpacing: '-0.03em', margin: '0 0 4px' }}>
              {displayName}
            </h1>
            <div className="t-meta" style={{ fontSize: 13.5 }}>
              {[store.me?.school_unit, store.me?.class_year].filter(Boolean).join(' ')} · joined {formatPostedDate(store.me?.created_at) || 'recently'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 28 }}>
            {[{ v: store.myListings.length, l: 'Listings' }].map((s) => (
              <div key={s.l} style={{ textAlign: 'center' }}>
                <div style={{ fontWeight: 800, fontSize: 26, color: 'var(--ink)' }}>{s.v}</div>
                <div className="t-meta" style={{ fontSize: 10.5, marginTop: 2 }}>{s.l}</div>
              </div>
            ))}
          </div>
          <Button kind="ghost" size="sm" onClick={() => store.signOut()}>Sign out</Button>
        </div>
        {/* Tabs */}
        <div style={{ maxWidth: 1180, margin: '0 auto', padding: '20px 32px 0', display: 'flex', gap: 28 }}>
          {([
            { id: 'listings', label: 'My Listings', count: store.myListings.length },
            { id: 'past', label: 'Past Listings', count: store.pastListings.length },
            { id: 'saved', label: 'Saved', count: store.savedListings.length },
            { id: 'activity', label: 'Activity', count: store.pendingCount || null },
          ] as const).map((t) => {
            const active = tab === t.id;
            return (
              <button key={t.id} onClick={() => setTab(t.id)} style={{ background: 'none', border: 0, padding: '14px 2px', fontFamily: 'var(--sans)', fontWeight: 600, fontSize: 13.5, color: active ? 'var(--ink)' : 'var(--muted)', borderBottom: '2px solid ' + (active ? 'var(--ink)' : 'transparent'), display: 'flex', alignItems: 'center', gap: 6 }}>
                {t.label}
                {t.count ? <span style={{ background: 'var(--surface)', color: 'var(--ink)', borderRadius: 999, fontSize: 10, fontWeight: 700, padding: '1px 7px' }}>{t.count}</span> : null}
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
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 20 }}>
              {store.myListings.map((l) => <ListingCard key={l.id} listing={l} onClick={() => onListing(l)} />)}
            </div>
          ))}
        {tab === 'past' &&
          (store.pastListings.length === 0 ? (
            <EmptyState icon="clock" title="No past listings" sub="Listings you move to past from their detail page show up here." />
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 20 }}>
              {store.pastListings.map((l) => <ListingCard key={l.id} listing={l} onClick={() => onListing(l)} />)}
            </div>
          ))}
        {tab === 'saved' &&
          (store.savedListings.length === 0 ? (
            <EmptyState icon="bookmark" title="Nothing saved" sub="Tap the bookmark on any listing to keep it here." />
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 20 }}>
              {store.savedListings.map((l) => <ListingCard key={l.id} listing={l} onClick={() => onListing(l)} />)}
            </div>
          ))}
        {tab === 'activity' && (
          store.activity.length === 0 ? (
            <EmptyState icon="bell" title="No activity yet" sub="Reveal requests you send and receive show up here." />
          ) : (
            <div style={{ maxWidth: 640 }}>
              {store.activity.map((a, i) => (
                <ActivityRow key={a.id} a={a} onApprove={onApprove} onDecline={onDecline} last={i === store.activity.length - 1} />
              ))}
            </div>
          )
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
        <div style={{ background: 'var(--ink)', color: '#fff', padding: '28px 28px', display: 'flex', alignItems: 'center', gap: 14, position: 'relative' }}>
          <Icon name="shield" size={26} color="#fff" />
          <div className="t-eyebrow" style={{ color: '#fff', fontSize: 14, letterSpacing: '0.2em' }}>REVEAL CONTACT</div>
        </div>
        <div style={{ padding: '24px 28px' }}>
          <h2 style={{ fontWeight: 800, fontSize: 24, lineHeight: 1.2, letterSpacing: '-0.03em', margin: '0 0 10px' }}>
            Share your info with <em style={{ color: 'var(--accent)', fontStyle: 'normal' }}>{listing.seller.name.split(' ')[0]}</em>?
          </h2>
          <p className="t-body" style={{ fontSize: 13.5, margin: '0 0 20px' }}>
            We&apos;ll share your <strong>name</strong>, <strong>school</strong>, and <strong>year</strong> with this seller. They have 72 hours to approve. If they do, you&apos;ll see their preferred contact method.
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
        meName={store.me?.display_name ?? 'Me'}
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
        <RevealModal
          listing={selected}
          onClose={() => setModal(null)}
          onContinue={async () => {
            const r = await store.requestReveal(selected.id);
            if (!r.ok && r.error) alert(r.error);
            setModal(null);
          }}
        />
      )}

      {notifOpen && <WebNotifications activity={store.activity} onClose={() => setNotifOpen(false)} onApprove={approve} onDecline={decline} />}
    </div>
  );
}
