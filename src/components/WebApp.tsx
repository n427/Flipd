'use client';

// Flipd — Web app (ported from screens/web-app.jsx)
// Feed, search/sort/filter, listing detail, reveal flow, create-listing,
// profile (my listings / saved / activity), and a notifications panel.
// All wired to the in-memory store.
import React from 'react';
import Link from 'next/link';
import { Icon } from './Icon';
import { LocationPicker } from './LocationPicker';
import { SafetyCard, type SafetyReview } from './SafetyCard';
import { Avatar, Button, Callout, CategoryChip, ImageWithFallback, ListingCard, Pill, Placeholder, Wordmark } from './ui';
import { CATEGORIES } from '@/lib/data';
import { classYearLabel, filterListings, formatPostedDate, photoCropStyle, useFlipdStore, type FlipdStore } from '@/lib/store';
import { timeLeftLabel, parseEventWindow, formatEventWindow, shouldHintZoom, fillZoom, findContactInfo, CONTACT_BLOCKED_MESSAGE } from '@/lib/validation';
import type { ActivityItem, ActivityStatus, FeedRange, Listing, PhotoTone, Profile, RatingSummary } from '@/lib/types';

const TITLE_MAX = 80;

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
// A plain left-click runs the fast in-app view switch (spa); modifier and
// middle clicks fall through to the browser so the href opens in a new tab.
function spaClick(spa: () => void) {
  return (e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button === 1) return;
    e.preventDefault();
    spa();
  };
}

export function WebAppHeader({
  onLogo, query, setQuery, onPost, onProfile, onBell, onRequests, pendingCount, unreadCount, meName, meAvatarUrl,
}: {
  onLogo: () => void; query: string; setQuery: (q: string) => void;
  onPost: () => void; onProfile: () => void; onBell: () => void; onRequests: () => void; pendingCount: number; unreadCount: number;
  meName: string; meAvatarUrl?: string;
}) {
  return (
    <header style={{ padding: '14px 32px', background: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(12px)', borderBottom: '1px solid var(--rule)', display: 'flex', alignItems: 'center', gap: 28, position: 'sticky', top: 0, zIndex: 30 }}>
      <a href="/feed" onClick={spaClick(onLogo)} style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 10 }} aria-label="Go to feed">
        <Wordmark size={24} />
      </a>
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
      <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginLeft: 'auto' }}>
        <a href="/requests" onClick={spaClick(onRequests)} style={{ textDecoration: 'none', background: 'none', border: 0, padding: 0, position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: 'var(--sans)', fontWeight: 600, fontSize: 13.5, color: 'var(--ink)', cursor: 'pointer' }}>
          Requests
          {pendingCount > 0 && (
            <span style={{ minWidth: 17, height: 17, padding: '0 4px', borderRadius: 999, background: 'var(--accent)', color: '#fff', fontSize: 10, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{pendingCount}</span>
          )}
        </a>
        <button onClick={onBell} aria-label="Notifications" style={{ background: 'none', border: 0, padding: 0, position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
          <Icon name="bell" size={18} color="var(--ink)" />
          {unreadCount > 0 && (
            <span style={{ position: 'absolute', top: -5, right: -5, minWidth: 15, height: 15, padding: '0 3px', borderRadius: 999, background: 'var(--accent)', color: '#fff', fontSize: 9, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1.5px solid #fff' }}>{unreadCount}</span>
          )}
        </button>
        <Button kind="primary" size="sm" icon="plus" onClick={onPost}>Post a listing</Button>
        <a href="/profile" onClick={spaClick(onProfile)} aria-label="Your profile" style={{ display: 'inline-flex', padding: 0 }}>
          <Avatar name={meName} src={meAvatarUrl} size={30} tone="ink" />
        </a>
      </div>
    </header>
  );
}

// ── Ratings ─────────────────────────────────────────────────────────
export function Stars({ score, size = 15 }: { score: number; size?: number }) {
  const full = Math.round(score);
  return (
    <span style={{ display: 'inline-flex', gap: 1, lineHeight: 1 }} aria-label={`${score} out of 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <svg key={i} width={size} height={size} viewBox="0 0 24 24" fill={i <= full ? 'var(--accent)' : 'var(--rule-strong)'}>
          <path d="M12 2l2.9 6.3 6.9.7-5.1 4.6 1.4 6.8L12 17.8 5.9 20.4l1.4-6.8L2.2 9l6.9-.7z" />
        </svg>
      ))}
    </span>
  );
}

export function RatingModal({ whom, onClose, onSubmit }: { whom: string; onClose: () => void; onSubmit: (score: number, text: string) => Promise<{ ok: boolean; error?: string }> }) {
  const [score, setScore] = React.useState(0);
  const [hover, setHover] = React.useState(0);
  const [text, setText] = React.useState('');
  const [error, setError] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const shown = hover || score;
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 55, background: 'rgba(17,17,17,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, padding: 28, width: 400, boxShadow: 'var(--shadow-strong)' }}>
        <h2 style={{ fontWeight: 800, fontSize: 19, letterSpacing: '-0.02em', color: 'var(--ink)', margin: '0 0 4px' }}>Rate {whom}</h2>
        <p style={{ fontFamily: 'var(--sans)', fontSize: 13.5, color: 'var(--ink-2)', margin: '0 0 16px' }}>How did the handoff go?</p>
        <div style={{ display: 'flex', gap: 4, marginBottom: 16 }} onMouseLeave={() => setHover(0)}>
          {[1, 2, 3, 4, 5].map((i) => (
            <button key={i} type="button" onMouseEnter={() => setHover(i)} onClick={() => setScore(i)} aria-label={`${i} stars`} style={{ background: 'none', border: 0, padding: 2, cursor: 'pointer', lineHeight: 0 }}>
              <svg width={30} height={30} viewBox="0 0 24 24" fill={i <= shown ? 'var(--accent)' : 'var(--rule-strong)'}>
                <path d="M12 2l2.9 6.3 6.9.7-5.1 4.6 1.4 6.8L12 17.8 5.9 20.4l1.4-6.8L2.2 9l6.9-.7z" />
              </svg>
            </button>
          ))}
        </div>
        <textarea className="field" rows={3} value={text} onChange={(e) => setText(e.target.value.slice(0, 500))} placeholder="Add a few words (optional)" style={{ marginBottom: 14, resize: 'vertical' }} />
        {error && <div style={{ fontSize: 13, color: 'var(--accent)', marginBottom: 12 }}>{error}</div>}
        <div style={{ display: 'flex', gap: 10 }}>
          <Button kind="ghost" onClick={onClose} style={{ flex: 1 }}>Cancel</Button>
          <Button kind="primary" style={{ flex: 1 }} disabled={saving || score === 0} onClick={async () => {
            if (score === 0) { setError('Pick a star rating.'); return; }
            setSaving(true); setError('');
            const r = await onSubmit(score, text);
            if (r.ok) onClose();
            else { setError(r.error || 'Could not submit — try again.'); setSaving(false); }
          }}>
            {saving ? 'Submitting…' : 'Submit'}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Request status timeline ──────────────────────────────────────────
// Requested -> Approved -> Contact shared -> Completed, with Declined /
// Expired as terminal branches. Approval and contact-sharing are one
// transition in the model, so approval lights both stages.
export function RequestTimeline({ status }: { status: ActivityStatus }) {
  if (status === 'DECLINED' || status === 'EXPIRED') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--ink)' }} />
        <span style={{ fontFamily: 'var(--sans)', fontSize: 11.5, color: 'var(--muted)' }}>Requested</span>
        <span style={{ width: 14, height: 1, background: 'var(--rule-strong)' }} />
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--muted-2)' }} />
        <span style={{ fontFamily: 'var(--sans)', fontSize: 11.5, color: 'var(--muted)' }}>
          {status === 'DECLINED' ? 'Declined' : 'Expired'}
        </span>
      </div>
    );
  }
  const stages = ['Requested', 'Approved', 'Contact shared', 'Completed'];
  const reached = status === 'PENDING' ? 0 : status === 'APPROVED' ? 2 : 3;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
      {stages.map((label, i) => (
        <React.Fragment key={label}>
          {i > 0 && <span style={{ width: 14, height: 1, background: i <= reached ? 'var(--ink)' : 'var(--rule-strong)' }} />}
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: i <= reached ? 'var(--ink)' : 'var(--rule-strong)' }} />
          <span style={{ fontFamily: 'var(--sans)', fontSize: 11.5, fontWeight: i === reached ? 700 : 400, color: i <= reached ? 'var(--ink)' : 'var(--muted)' }}>
            {label}
          </span>
        </React.Fragment>
      ))}
    </div>
  );
}

// ── Activity row (shared by notifications + profile) ────────────────
function ActivityRow({
  a, onApprove, onDecline, onRate, last, compact, dismissable,
}: { a: ActivityItem; onApprove?: (id: string) => void; onDecline?: (id: string) => void; onRate?: (a: ActivityItem) => void; last?: boolean; compact?: boolean; dismissable?: boolean }) {
  const statusFg = ({
    APPROVED: 'var(--ink)',
    COMPLETED: 'var(--ink)',
    EXPIRED: 'var(--muted)',
    DECLINED: 'var(--muted)',
    PENDING: 'var(--accent)',
  } as Record<string, string>)[a.status] || 'var(--muted)';
  return (
    <div style={compact ? { display: 'flex', alignItems: 'flex-start', gap: 12, padding: '14px 18px', borderBottom: last ? 0 : '1px solid var(--rule)', minHeight: dismissable ? 76 : undefined } : { display: 'flex', alignItems: 'flex-start', gap: 14, padding: '18px 20px', border: '1px solid var(--rule)', borderRadius: 14, marginBottom: 10, background: '#fff' }}>
      <Avatar name={a.who} size={36} tone={a.dir === 'in' ? 'ink' : 'cream'} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: 'var(--sans)', fontSize: 13.5, color: 'var(--ink)', lineHeight: 1.4 }}>
          <strong style={{ fontWeight: 700 }}>{a.who}</strong>{' '}
          {a.dir === 'in' ? 'wants to connect about' : a.status === 'APPROVED' ? 'approved your request for' : 'on'}{' '}
          <span style={{ color: 'var(--ink-2)' }}>&quot;{a.listingTitle}&quot;</span>
        </div>
        <div className="t-meta" style={{ fontSize: 11, marginTop: 3 }}>
          {a.school} · {a.when} ago
          {a.status === 'PENDING' && timeLeftLabel(a.expiresAt) && (
            <span style={{ color: 'var(--accent)', fontWeight: 600 }}> · {timeLeftLabel(a.expiresAt)}</span>
          )}
        </div>
        {a.dir === 'out' && a.status === 'DECLINED' && (
          <div style={{ fontFamily: 'var(--sans)', fontSize: 12.5, color: 'var(--ink-2)', marginTop: 6 }}>
            {a.listingRemoved ? 'This listing was removed.' : a.listingArchived ? 'This item is no longer available.' : 'The seller went a different direction this time.'}
          </div>
        )}
        {a.dir === 'out' && a.status === 'EXPIRED' && (
          <div style={{ fontFamily: 'var(--sans)', fontSize: 12.5, color: 'var(--ink-2)', marginTop: 6 }}>
            This request expired after 72 hours.
          </div>
        )}
        {a.dir === 'out' && !compact && <RequestTimeline status={a.status} />}

        {a.status === 'APPROVED' && a.threadId && (
          <div style={{ marginTop: 8 }}>
            <Link
              href="/requests"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--surface)', borderRadius: 6, padding: '6px 10px', fontFamily: 'var(--sans)', fontWeight: 600, fontSize: 12.5, color: 'var(--ink)', textDecoration: 'none' }}
            >
              <Icon name="chat" size={13} /> Open chat
            </Link>
          </div>
        )}

        {a.dir === 'in' && a.status === 'PENDING' && (
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <Button kind="primary" size="sm" onClick={() => onApprove && onApprove(a.id)} style={{ padding: '6px 16px' }}>Approve</Button>
            <Button kind="ghost" size="sm" onClick={() => onDecline && onDecline(a.id)} style={{ padding: '6px 14px' }}>Decline</Button>
          </div>
        )}
        {a.status === 'COMPLETED' && a.canRate && onRate && (
          <div style={{ marginTop: 10 }}>
            <Button kind="secondary" size="sm" onClick={() => onRate(a)} style={{ padding: '6px 16px' }}>Rate {a.who.split(' ')[0]}</Button>
          </div>
        )}
      </div>
      {!(a.dir === 'in' && a.status === 'PENDING') && (
        // In the notifications panel a dismiss × is pinned top-right, so drop the
        // status label to the bottom of the row to clear it instead of overlapping.
        <span style={{ fontFamily: 'var(--sans)', fontWeight: 700, fontSize: 10.5, letterSpacing: '0.07em', color: statusFg, whiteSpace: 'nowrap', alignSelf: dismissable ? 'flex-end' : 'center' }}>{a.status}</span>
      )}
    </div>
  );
}

// ── Notifications panel (slides from bell) ──────────────────────────
export function WebNotifications({
  activity, onClose, onApprove, onDecline, onNavigate, onDismiss, onMarkAllRead,
}: {
  activity: ActivityItem[]; onClose: () => void; onApprove: (id: string) => void; onDecline: (id: string) => void;
  onNavigate: (a: ActivityItem) => void; onDismiss: (id: string) => void; onMarkAllRead: () => void;
}) {
  const visible = activity.filter((a) => !a.dismissed);
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 45 }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(26,26,26,0.18)' }} />
      <div style={{ position: 'absolute', top: 64, right: 32, width: 400, background: '#fff', borderRadius: 10, border: '1px solid var(--rule)', boxShadow: 'var(--shadow-strong)', overflow: 'hidden', animation: 'flipdReveal 200ms ease-out' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--rule)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 className="t-h3" style={{ margin: 0, fontSize: 15 }}>Notifications</h3>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 14 }}>
            {visible.length > 0 && (
              <button onClick={onMarkAllRead} style={{ background: 'none', border: 0, padding: 0, fontFamily: 'var(--sans)', fontSize: 12, fontWeight: 600, color: 'var(--muted)', cursor: 'pointer' }}>
                Mark all read
              </button>
            )}
            <button onClick={onClose} aria-label="Close notifications" style={{ background: 'none', border: 0, padding: 2 }}>
              <Icon name="x" size={16} color="var(--muted)" />
            </button>
          </span>
        </div>
        <div style={{ maxHeight: 420, overflow: 'auto' }}>
          {visible.length === 0 ? (
            <EmptyState icon="bell" title="No activity yet" sub="Reveal requests you send and receive show up here." />
          ) : (
            visible.map((a, i) => (
              <div
                key={a.id}
                role="button"
                tabIndex={0}
                aria-label={`${a.who}, ${a.listingTitle}${a.unread ? ', unread' : ''}`}
                style={{ position: 'relative', cursor: 'pointer' }}
                onClick={() => { onNavigate(a); onClose(); }}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onNavigate(a); onClose(); } }}
              >
                {a.unread && (
                  <span style={{ position: 'absolute', left: 7, top: 22, width: 7, height: 7, borderRadius: '50%', background: 'var(--accent)' }} />
                )}
                <ActivityRow a={a} compact dismissable onApprove={onApprove} onDecline={onDecline} last={i === visible.length - 1} />
                <button
                  onClick={(e) => { e.stopPropagation(); onDismiss(a.id); }}
                  aria-label="Dismiss notification"
                  style={{ position: 'absolute', top: 10, right: 10, width: 20, height: 20, borderRadius: '50%', border: 0, background: 'var(--surface)', color: 'var(--muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0 }}
                >
                  <Icon name="x" size={10} />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ── Feed ─────────────────────────────────────────────────────────────
// ── Loading skeletons ────────────────────────────────────────────────
function CardSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ aspectRatio: '1 / 1', borderRadius: 'var(--r-img)', background: 'var(--surface)', animation: 'flipdPulse 1.4s ease-in-out infinite' }} />
      <div style={{ height: 13, width: '80%', borderRadius: 5, background: 'var(--surface)', animation: 'flipdPulse 1.4s ease-in-out infinite' }} />
      <div style={{ height: 12, width: '45%', borderRadius: 5, background: 'var(--surface)', animation: 'flipdPulse 1.4s ease-in-out infinite' }} />
    </div>
  );
}

export function FeedSkeleton() {
  return (
    <div style={{ padding: '32px 32px 64px', maxWidth: 1280, margin: '0 auto' }}>
      <div style={{ height: 30, width: 260, borderRadius: 8, background: 'var(--surface)', animation: 'flipdPulse 1.4s ease-in-out infinite', marginBottom: 28 }} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 20 }}>
        {Array.from({ length: 10 }).map((_, i) => <CardSkeleton key={i} />)}
      </div>
    </div>
  );
}

export function WebAppFeed({
  store, activeCat, setActiveCat, onListing, query, sort, setSort, range, setRange, priceMin, setPriceMin, priceMax, setPriceMax,
}: {
  store: FlipdStore; activeCat: string; setActiveCat: (c: string) => void;
  onListing: (l: Listing) => void; query: string;
  sort: string; setSort: (s: string) => void;
  range: FeedRange; setRange: (r: FeedRange) => void;
  priceMin: string; setPriceMin: (p: string) => void;
  priceMax: string; setPriceMax: (p: string) => void;
}) {
  const items = filterListings(store.listings, {
    activeCat, query, sort: sort as never, range,
    priceMin: priceMin ? Number(priceMin) : null,
    priceMax: priceMax ? Number(priceMax) : null,
  });
  return (
    <div style={{ padding: '32px 32px 64px', maxWidth: 1280, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontWeight: 800, fontSize: 26, letterSpacing: '-0.03em', color: 'var(--ink)', margin: 0 }}>
            {query ? <>Results for <em style={{ color: 'var(--accent)', fontStyle: 'normal' }}>&quot;{query}&quot;</em></> : 'Fresh finds near campus'}
          </h1>
        </div>
        <div className="t-meta" style={{ fontSize: 12 }}>{items.length} listing{items.length === 1 ? '' : 's'}</div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 24, alignItems: 'center', flexWrap: 'wrap' }}>
        {CATEGORIES.map((c) => (
          <CategoryChip key={c.id} category={c} active={activeCat === c.id} onClick={() => setActiveCat(c.id)} />
        ))}
        <div style={{ flex: 1 }} />
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: '1px solid var(--rule)', borderRadius: 'var(--r-pill)', padding: '4px 10px 4px 12px', background: '#fff' }}>
          <span style={{ fontFamily: 'var(--sans)', fontSize: 12.5, color: 'var(--muted)' }}>$</span>
          <input
            value={priceMin}
            onChange={(e) => setPriceMin(e.target.value.replace(/\D/g, '').slice(0, 6))}
            inputMode="numeric"
            placeholder="Min"
            aria-label="Minimum price"
            style={{ width: 48, border: 0, outline: 0, background: 'transparent', fontFamily: 'var(--sans)', fontSize: 12.5, color: 'var(--ink)' }}
          />
          <span style={{ color: 'var(--rule-strong)' }}>–</span>
          <input
            value={priceMax}
            onChange={(e) => setPriceMax(e.target.value.replace(/\D/g, '').slice(0, 6))}
            inputMode="numeric"
            placeholder="Max"
            aria-label="Maximum price"
            style={{ width: 48, border: 0, outline: 0, background: 'transparent', fontFamily: 'var(--sans)', fontSize: 12.5, color: 'var(--ink)' }}
          />
        </div>
        <WebDropdown
          label="Posted" value={range} onChange={(r) => setRange(r as FeedRange)}
          options={[
            { id: 'day', label: 'Past 24 hours' },
            { id: 'week', label: 'Past week' },
            { id: 'month', label: 'Past month' },
            { id: 'all', label: 'All time' },
          ]}
        />
        <WebDropdown
          label="Sort" value={sort} onChange={setSort}
          options={[
            { id: 'recent', label: 'Newest' },
            { id: 'low', label: 'Price ↑' },
            { id: 'high', label: 'Price ↓' },
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
              <ListingCard listing={l} href={`/listing/${l.id}`} />
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
  store, listing, onBack, onReveal, preview = false, backLabel = 'Back to feed',
}: { store: FlipdStore; listing: Listing; onBack: () => void; onReveal: () => void; preview?: boolean; backLabel?: string }) {
  const saved = preview ? false : store.isSaved(listing.id);
  const reveal = preview ? undefined : store.myRevealFor(listing.id);
  const latestReveal = preview ? undefined : store.latestRevealFor(listing.id);
  const photos = listing.photo_urls ?? [];
  const [lightbox, setLightbox] = React.useState<number | null>(null);
  const [deleteConfirm, setDeleteConfirm] = React.useState(false);
  const [reportOpen, setReportOpen] = React.useState<null | { listingId?: string; userId?: string; label: string }>(null);
  const [reportReason, setReportReason] = React.useState('scam');
  const [reportNote, setReportNote] = React.useState('');
  const [reportSent, setReportSent] = React.useState(false);
  const [blockConfirm, setBlockConfirm] = React.useState(false);
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

  // Mosaic tile. Corner rounding is group-level: 16px on outer corners, 4px inside.
  const tile = (idx: number, radius: string, opts: { span2?: boolean; pill?: boolean; more?: number } = {}) => (
    <div
      key={idx}
      role="button"
      tabIndex={0}
      aria-label={`View photo ${idx + 1} of ${n} for ${listing.title}`}
      onClick={() => setLightbox(idx)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setLightbox(idx); } }}
      style={{ position: 'relative', overflow: 'hidden', cursor: 'pointer', background: 'var(--surface)', borderRadius: radius, ...(opts.span2 ? { gridRow: 'span 2' } : {}) }}
    >
      <ImageWithFallback src={photos[idx]} alt="" imgStyle={{ position: 'absolute', inset: 0, width: '100%', height: '100%', ...photoCropStyle(listing.photo_focus?.[idx], listing.photo_zoom?.[idx]) }} fallbackLabel={listing.photoLabel} fallbackTone="cream" />
      {opts.pill && (
        <span style={{ position: 'absolute', left: 14, bottom: 14, background: 'rgba(255,255,255,0.92)', borderRadius: 8, padding: '5px 10px', fontFamily: 'var(--sans)', fontWeight: 600, fontSize: 12, color: 'var(--ink)' }}>
          1 / {n}
        </span>
      )}
      {(opts.more ?? 0) > 0 && (
        <>
          <span style={{ position: 'absolute', inset: 0, background: 'rgba(17,17,17,0.35)', borderRadius: radius }} />
          <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--sans)', fontWeight: 600, fontSize: 14, color: '#fff' }}>
            +{opts.more} more
          </span>
        </>
      )}
    </div>
  );

  const priceLine = (size: number) => (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 14 }}>
      {listing.eventStart && listing.eventEnd ? (
        <span style={{ fontWeight: 700, fontSize: Math.round(size * 0.7), letterSpacing: '-0.01em', color: 'var(--ink)' }}>
          {formatEventWindow(listing.eventStart, listing.eventEnd)}
        </span>
      ) : (
        <>
          <span style={{ fontWeight: 700, fontSize: size, letterSpacing: '-0.02em', color: 'var(--ink)' }}>{listing.priceLabel}</span>
          {listing.negotiable && <span style={{ fontFamily: 'var(--sans)', fontSize: 13.5, color: 'var(--muted)' }}>open to offers</span>}
        </>
      )}
    </div>
  );

  // Action stack: owner archive/restore, approved contact, or reveal/save.
  const actions = (full: boolean) => (
    !preview && listing.mine ? (
      listing.archived ? (
        <>
          <Button kind="primary" full={full} size="lg" onClick={async () => { await store.setArchived(listing.id, false); onBack(); }}>
            Restore to feed
          </Button>
          <div className="t-meta" style={{ fontSize: 11.5, marginTop: 12, color: 'var(--muted)' }}>
            This listing is in your past listings.
          </div>
        </>
      ) : (
        <>
          {(store.pendingByListing[listing.id] ?? 0) > 0 && (
            <a href="/requests" style={{ display: 'block', background: 'var(--surface)', borderRadius: 10, padding: '12px 14px', marginBottom: 12, fontFamily: 'var(--sans)', fontWeight: 600, fontSize: 13.5, color: 'var(--ink)', textDecoration: 'none' }}>
              {store.pendingByListing[listing.id]} pending request{store.pendingByListing[listing.id] === 1 ? '' : 's'} — review →
            </a>
          )}
          <div style={{ display: 'flex', gap: 10 }}>
            <Button kind="primary" size="lg" onClick={() => { if (typeof window !== 'undefined') window.location.href = `/listing/${listing.id}/edit`; }}>
              Edit listing
            </Button>
            <Button kind="secondary" size="lg" onClick={async () => { await store.setArchived(listing.id, true); onBack(); }}>
              Move to past listings
            </Button>
          </div>
          <div className="t-meta" style={{ fontSize: 11.5, marginTop: 12, color: 'var(--muted)' }}>
            Removes it from the feed. You can restore it anytime.
          </div>
          <button
            onClick={() => setDeleteConfirm(true)}
            style={{ background: 'none', border: 0, padding: 0, marginTop: 14, fontFamily: 'var(--sans)', fontSize: 13, fontWeight: 500, color: 'var(--accent)', cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 3 }}
          >
            Delete listing
          </button>
        </>
      )
    ) : reveal?.status === 'APPROVED' && reveal.threadId ? (
      <div>
        <div className="t-eyebrow" style={{ color: 'var(--muted)', marginBottom: 12 }}>YOUR CHAT</div>
        <Link href="/requests" style={{ textDecoration: 'none' }}>
          <Button kind="primary" full size="lg" icon="chat">Open chat</Button>
        </Link>
      </div>
    ) : (
      latestReveal?.status === 'DECLINED' ? (
      <div style={{ fontFamily: 'var(--sans)', fontSize: 13.5, lineHeight: 1.55, color: 'var(--ink-2)' }}>
        {latestReveal.listingArchived
          ? 'This item is no longer available.'
          : 'The seller went a different direction this time.'}
      </div>
    ) : (
      <>
        {latestReveal?.status === 'EXPIRED' && (
          <div style={{ fontFamily: 'var(--sans)', fontSize: 13, color: 'var(--muted)', marginBottom: 10 }}>
            Your request expired. You can ask again.
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: full ? 'column' : 'row', gap: 10 }}>
          {/* An open conversation outranks the request CTA: someone who
              already has a thread wants to get back into it, not start over. */}
          {reveal?.threadId ? (
            <Link href="/requests" style={{ textDecoration: 'none', display: full ? 'block' : undefined }}>
              <Button kind="primary" full={full} size="lg" icon="chat">Open chat</Button>
            </Link>
          ) : reveal?.status === 'PENDING' ? (
            <Button kind="secondary" full={full} size="lg" disabled>
              {timeLeftLabel(reveal.expiresAt) ? `Requested · ${timeLeftLabel(reveal.expiresAt)}` : 'Requested · waiting on seller'}
            </Button>
          ) : (
            <Button kind="primary" full={full} size="lg" onClick={preview ? () => {} : onReveal} disabled={preview}>Message seller</Button>
          )}
          <Button
            kind={saved ? 'secondary-active' : 'secondary'}
            full={full}
            size="lg"
            icon="bookmark"
            onClick={() => { if (!preview) store.toggleSave(listing.id); }}
            disabled={preview}
            aria-pressed={saved}
          >
            {saved ? 'Saved' : 'Save'}
          </Button>
          {listing.eventStart && (
            <Button
              kind={store.isReminded(listing.id) ? 'primary' : 'secondary'}
              full={full}
              size="lg"
              icon="bell"
              onClick={() => { if (!preview) store.toggleReminder(listing.id); }}
              disabled={preview}
            >
              {store.isReminded(listing.id) ? 'Reminder on' : 'Remind me'}
            </Button>
          )}
        </div>
        <div className="t-meta" style={{ fontSize: 11.5, marginTop: 12, color: 'var(--muted)' }}>
          {listing.seller.name.split(' ')[0]} will see your name, school, and year — everyone here is verified USC.
        </div>
      </>
      )
    )
  );

  const categoryLine = (
    <div style={{ fontFamily: 'var(--sans)', fontWeight: 600, fontSize: 12.5, color: 'var(--accent)', marginBottom: 8 }}>
      {(listing.categoryLabels?.length ? listing.categoryLabels : [listing.categoryLabel]).join(' · ')} · posted {listing.postedLabel || 'recently'}
    </div>
  );
  const titleBlock = (
    <>
      <h1 style={{ fontWeight: 700, fontSize: 26, letterSpacing: '-0.02em', color: 'var(--ink)', margin: '0 0 4px' }}>{listing.title}</h1>
      {listing.lat != null && listing.lng != null ? (
        <div style={{ marginBottom: 16 }}>
          <div style={{ color: 'var(--muted)', fontFamily: 'var(--sans)', fontSize: 14, marginBottom: 8 }}>
            Pickup at {listing.placeName || listing.meta.split(' · ')[0]}
          </div>
          {process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY && (
            <a href={`https://www.google.com/maps/search/?api=1&query=${listing.lat},${listing.lng}`}
              target="_blank" rel="noreferrer"
              style={{ display: 'block', borderRadius: 12, overflow: 'hidden', border: '1px solid var(--rule)' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img alt={`Map showing ${listing.placeName || 'the pickup location'}`}
                src={`https://maps.googleapis.com/maps/api/staticmap?center=${listing.lat},${listing.lng}&zoom=16&size=600x240&scale=2&markers=color:red%7C${listing.lat},${listing.lng}&key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}`}
                style={{ width: '100%', height: 'auto', display: 'block' }}
                onError={(e) => {
                  // Static Maps API not enabled / referrer-blocked: hide the
                  // broken image and its border; the link below still works.
                  const a = e.currentTarget.parentElement;
                  if (a) a.style.display = 'none';
                }} />
            </a>
          )}
          <a href={`https://www.google.com/maps/search/?api=1&query=${listing.lat},${listing.lng}`}
            target="_blank" rel="noreferrer"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 8, color: 'var(--ink)', fontFamily: 'var(--sans)', fontWeight: 600, fontSize: 13, textDecoration: 'none' }}>
            <Icon name="mapPin" size={14} color="var(--ink)" /> Open in Google Maps
          </a>
        </div>
      ) : listing.meta && (
        <div style={{ color: 'var(--muted)', fontFamily: 'var(--sans)', fontSize: 14, marginBottom: 16 }}>
          Pickup at {listing.meta.split(' · ')[0]}
        </div>
      )}
    </>
  );
  const descriptionBlock = listing.description?.trim() ? (
    <p style={{ fontFamily: 'var(--sans)', fontSize: 15, lineHeight: 1.55, color: 'var(--ink-2)', margin: '0 0 20px', whiteSpace: 'pre-wrap' }}>
      {listing.description}
    </p>
  ) : null;
  const isBlockedSeller = !preview && !listing.mine && store.blockedIds.has(listing.seller.id);
  const trustLinkStyle: React.CSSProperties = { background: 'none', border: 0, padding: 0, fontFamily: 'var(--sans)', fontSize: 12, fontWeight: 500, color: 'var(--muted)', cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 3 };
  const sellerRow = (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center', borderTop: '1px solid var(--rule)', marginTop: 22, paddingTop: 18 }}>
      <a href={`/u/${listing.seller.id}`} aria-label={`View ${listing.seller.name}'s profile`} style={{ flexShrink: 0, display: 'block' }}>
        <Avatar name={listing.seller.name} src={listing.seller.avatarUrl} size={40} tone="cream" />
      </a>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ fontFamily: 'var(--sans)', fontWeight: 600, fontSize: 14, color: 'var(--ink)' }}>
            <a href={`/u/${listing.seller.id}`} style={{ color: 'var(--ink)', textDecoration: 'none' }}>{listing.seller.name}</a> listed this
          </div>
          {listing.seller.isDemo && <Pill kind="verified">FLIPD TEAM</Pill>}
        </div>
        {(listing.seller.unit || listing.seller.year) && (
          <div className="t-meta" style={{ fontSize: 13, marginTop: 2 }}>
            {[listing.seller.unit, listing.seller.year].filter(Boolean).join(' · ')}
          </div>
        )}
      </div>
      {!preview && !listing.mine && (
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 14 }}>
          <button style={trustLinkStyle} onClick={() => { setReportSent(false); setReportOpen({ listingId: listing.id, label: 'this listing' }); }}>
            Report listing
          </button>
          <button style={trustLinkStyle} onClick={() => { setReportSent(false); setReportOpen({ userId: listing.seller.id, label: listing.seller.name.split(' ')[0] }); }}>
            Report seller
          </button>
          {isBlockedSeller ? (
            <button style={trustLinkStyle} onClick={() => store.unblockUser(listing.seller.id)}>Unblock</button>
          ) : (
            <button style={trustLinkStyle} onClick={() => setBlockConfirm(true)}>Block</button>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div style={{ padding: '24px 32px 64px', maxWidth: 1100, margin: '0 auto' }}>
      {!preview && (
      <button onClick={onBack} style={{ background: 'none', border: 0, padding: 0, display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--muted)', fontFamily: 'var(--sans)', fontSize: 13, marginBottom: 22 }}>
        <Icon name="chevronLeft" size={14} /> {backLabel}
      </button>
      )}

      {n <= 1 ? (
        /* 4a: one photo — page reflows, info beside the square, no side panel */
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 500px) 1fr', gap: 48, alignItems: 'start' }}>
          <div
            {...(n > 0 ? {
              role: 'button',
              tabIndex: 0,
              'aria-label': `View photo for ${listing.title}`,
              onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setLightbox(0); } },
            } : {})}
            onClick={() => { if (n > 0) setLightbox(0); }}
            style={{ position: 'relative', aspectRatio: '1 / 1', borderRadius: 16, overflow: 'hidden', cursor: n > 0 ? 'pointer' : 'default', background: 'var(--surface)' }}
          >
            {n > 0 ? (
              <ImageWithFallback src={photos[0]} alt="" imgStyle={{ position: 'absolute', inset: 0, width: '100%', height: '100%', ...photoCropStyle(listing.photo_focus?.[0], listing.photo_zoom?.[0]) }} fallbackLabel={listing.photoLabel} fallbackTone="cream" />
            ) : (
              <Placeholder label={listing.photoLabel} tone="cream" height="100%" radius={0} style={{ position: 'absolute', inset: 0 }} />
            )}
            {n === 1 && (
              <span style={{ position: 'absolute', left: 14, bottom: 14, background: 'rgba(255,255,255,0.92)', borderRadius: 8, padding: '5px 10px', fontFamily: 'var(--sans)', fontWeight: 600, fontSize: 12, color: 'var(--ink)' }}>
                1 / 1
              </span>
            )}
          </div>
          <div>
            {categoryLine}
            {titleBlock}
            {priceLine(24)}
            {descriptionBlock}
            {actions(false)}
            {sellerRow}
          </div>
        </div>
      ) : (
        /* 4b/4c/4d: full-width mosaic, then story + price panel */
        <>
          {n === 2 && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, aspectRatio: '2.02 / 1' }}>
              {tile(0, '16px 4px 4px 16px', { pill: true })}
              {tile(1, '4px 16px 16px 4px')}
            </div>
          )}
          {(n === 3 || n === 4) && (
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gridTemplateRows: '1fr 1fr', gap: 10, aspectRatio: '3.03 / 2' }}>
              {tile(0, '16px 4px 4px 16px', { span2: true, pill: true })}
              {tile(1, '4px 16px 4px 4px')}
              {tile(2, '4px 4px 16px 4px', { more: n - 3 })}
            </div>
          )}
          {n >= 5 && (
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gridTemplateRows: '1fr 1fr', gap: 10, aspectRatio: '2.05 / 1' }}>
              {tile(0, '16px 4px 4px 16px', { span2: true, pill: true })}
              {tile(1, '4px')}
              {tile(2, '4px 16px 4px 4px')}
              {tile(3, '4px')}
              {tile(4, '4px 4px 16px 4px', { more: n - 5 })}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 40, marginTop: 26, alignItems: 'start' }}>
            <div>
              {categoryLine}
              {titleBlock}
              {descriptionBlock}
              {sellerRow}
            </div>
            <div style={{ border: '1px solid var(--rule)', borderRadius: 16, background: '#fff', padding: 20, boxShadow: 'var(--shadow)', position: 'sticky', top: 90 }}>
              {priceLine(22)}
              {actions(true)}
            </div>
          </div>
        </>
      )}

      {reportOpen && (
        <div onClick={() => setReportOpen(null)} style={{ position: 'fixed', inset: 0, zIndex: 55, background: 'rgba(17,17,17,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, padding: 28, width: 420, boxShadow: 'var(--shadow-strong)' }}>
            {reportSent ? (
              <>
                <h2 style={{ fontWeight: 800, fontSize: 19, letterSpacing: '-0.02em', color: 'var(--ink)', margin: '0 0 8px' }}>Thanks for the report</h2>
                <p style={{ fontFamily: 'var(--sans)', fontSize: 13.5, lineHeight: 1.55, color: 'var(--ink-2)', margin: '0 0 20px' }}>
                  We&rsquo;ll take a look. You won&rsquo;t hear back unless we need more from you.
                </p>
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <Button kind="primary" onClick={() => setReportOpen(null)}>Done</Button>
                </div>
              </>
            ) : (
              <>
                <h2 style={{ fontWeight: 800, fontSize: 19, letterSpacing: '-0.02em', color: 'var(--ink)', margin: '0 0 14px' }}>Report {reportOpen.label}</h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
                  {([['scam', 'Scam or spam'], ['prohibited', 'Prohibited item or service'], ['harassment', 'Harassment or unsafe behavior'], ['other', 'Something else']] as const).map(([id, label]) => (
                    <label key={id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontFamily: 'var(--sans)', fontSize: 13.5, color: 'var(--ink-2)', cursor: 'pointer' }}>
                      <input type="radio" name="report-reason" checked={reportReason === id} onChange={() => setReportReason(id)} />
                      {label}
                    </label>
                  ))}
                </div>
                <textarea
                  className="field"
                  rows={2}
                  value={reportNote}
                  onChange={(e) => setReportNote(e.target.value.slice(0, 500))}
                  placeholder="Anything we should know? (optional)"
                  style={{ marginBottom: 16, resize: 'vertical' }}
                />
                <div style={{ display: 'flex', gap: 10 }}>
                  <Button kind="ghost" onClick={() => setReportOpen(null)} style={{ flex: 1 }}>Cancel</Button>
                  <Button kind="primary" style={{ flex: 1 }} onClick={async () => {
                    const ok = await store.reportTarget({ listingId: reportOpen.listingId, userId: reportOpen.userId }, reportReason, reportNote);
                    if (ok) setReportSent(true);
                    else alert('Could not send the report — try again.');
                  }}>
                    Send report
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {blockConfirm && (
        <div onClick={() => setBlockConfirm(false)} style={{ position: 'fixed', inset: 0, zIndex: 55, background: 'rgba(17,17,17,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, padding: 28, width: 400, boxShadow: 'var(--shadow-strong)' }}>
            <h2 style={{ fontWeight: 800, fontSize: 19, letterSpacing: '-0.02em', color: 'var(--ink)', margin: '0 0 8px' }}>
              Block {listing.seller.name.split(' ')[0]}?
            </h2>
            <p style={{ fontFamily: 'var(--sans)', fontSize: 13.5, lineHeight: 1.55, color: 'var(--ink-2)', margin: '0 0 20px' }}>
              You won&rsquo;t see their listings anymore, and neither of you can send the other a request. You can undo this anytime from one of their listings.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <Button kind="ghost" onClick={() => setBlockConfirm(false)} style={{ flex: 1 }}>Never mind</Button>
              <Button kind="primary" style={{ flex: 1 }} onClick={async () => {
                await store.blockUser(listing.seller.id);
                setBlockConfirm(false);
              }}>
                Block
              </Button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirm && (
        <div onClick={() => setDeleteConfirm(false)} style={{ position: 'fixed', inset: 0, zIndex: 55, background: 'rgba(17,17,17,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, padding: 28, width: 400, boxShadow: 'var(--shadow-strong)' }}>
            <h2 style={{ fontWeight: 800, fontSize: 19, letterSpacing: '-0.02em', color: 'var(--ink)', margin: '0 0 8px' }}>
              Delete this listing?
            </h2>
            <p style={{ fontFamily: 'var(--sans)', fontSize: 13.5, lineHeight: 1.55, color: 'var(--ink-2)', margin: '0 0 20px' }}>
              This permanently removes &ldquo;{listing.title}&rdquo; and its photos. Anyone with a pending request will see the listing was removed.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <Button kind="ghost" onClick={() => setDeleteConfirm(false)} style={{ flex: 1 }}>Keep it</Button>
              <Button kind="primary" style={{ flex: 1 }} onClick={async () => {
                const ok = await store.removeListing(listing.id);
                setDeleteConfirm(false);
                if (ok) onBack();
                else alert('Could not delete the listing — try again.');
              }}>
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}

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
  onPublish, onCancel, store, initial, submitLabel = 'Publish listing', heading = 'What are you passing on?',
}: { onPublish: (formData: FormData, onProgress?: (fraction: number) => void) => void | Promise<void>; onCancel: () => void; store: FlipdStore; initial?: Listing; submitLabel?: string; heading?: string }) {
  const [attempted, setAttempted] = React.useState(false);
  const [phase, setPhase] = React.useState<'form' | 'preview' | 'success'>('form');
  const [submitting, setSubmitting] = React.useState(false);
  // 0–0.9 tracks real byte upload; held at 0.9 while the server works; 1 on done.
  const [uploadProgress, setUploadProgress] = React.useState(0);
  const [categories, setCategories] = React.useState<string[]>(initial?.categories && initial.categories.length ? [...initial.categories] : initial?.category ? [initial.category] : []);
  const isPopup = categories.includes('event');
  const [eventDate, setEventDate] = React.useState(initial?.eventStart ? initial.eventStart.slice(0, 10) : '');
  const [eventStartTime, setEventStartTime] = React.useState(
    initial?.eventStart ? new Date(initial.eventStart).toTimeString().slice(0, 5) : '',
  );
  const [eventEndTime, setEventEndTime] = React.useState(
    initial?.eventEnd ? new Date(initial.eventEnd).toTimeString().slice(0, 5) : '',
  );
  const [title, setTitle] = React.useState(initial?.title ?? '');
  const [price, setPrice] = React.useState(initial?.price != null && initial.price > 0 ? String(initial.price) : initial ? '0' : '');
  const [neg, setNeg] = React.useState(initial?.negotiable ?? false);
  const [loc, setLoc] = React.useState<{ name: string; lat: number | null; lng: number | null }>(() => ({
    name: initial?.placeName ?? (initial?.meta && initial.meta !== 'USC · pickup' ? initial.meta : ''),
    lat: initial?.lat ?? null,
    lng: initial?.lng ?? null,
  }));
  const [description, setDescription] = React.useState(initial?.description ?? '');
  const [aiLoading, setAiLoading] = React.useState(false);
  const [aiError, setAiError] = React.useState('');
  // `aspect` = naturalWidth/naturalHeight, filled in once the image loads. Used
  // only to hint when a photo is far from square (screenshots, video frames).
  const [photos, setPhotos] = React.useState<{ file?: File; url: string; aspect?: number }[]>(
    () => (initial?.photo_urls ?? []).map((url) => ({ url })),
  );
  const [photoFocus, setPhotoFocus] = React.useState<string[]>(initial?.photo_focus ?? []);
  const [photoZoom, setPhotoZoom] = React.useState<string[]>(initial?.photo_zoom ?? []);
  // Live mirror of photos so async probe callbacks can find a photo's current
  // index even after other uploads have shifted positions.
  const photosRef = React.useRef(photos);
  photosRef.current = photos;
  const availableMethods = (['instagram', 'phone', 'email'] as const)
    .filter((k) => store.me?.[`contact_${k}` as const]);
  const [contactMethods, setContactMethods] = React.useState<string[]>(
    () => initial?.contactMethods && initial.contactMethods.length
      ? initial.contactMethods.filter((m) => availableMethods.includes(m))
      : [...availableMethods],
  );
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
    setPhotoZoom((prev) => [...prev, ...mapped.map(() => '1')]);
    // Measure each photo's aspect off-DOM, then (a) store it for the zoom hint
    // and (b) auto-zoom non-square photos to fill the frame so baked-in
    // letterbox bars are cropped out by default. Matched back by url.
    mapped.forEach(({ url }) => {
      const probe = new Image();
      probe.onload = () => {
        const aspect = probe.naturalWidth / probe.naturalHeight;
        setPhotos((prev) => prev.map((p) => (p.url === url ? { ...p, aspect } : p)));
        const auto = fillZoom(aspect);
        if (auto > 1) {
          setPhotoZoom((prev) => {
            const idx = photosRef.current.findIndex((p) => p.url === url);
            if (idx < 0) return prev;
            const next = [...prev];
            while (next.length <= idx) next.push('1');
            // Don't override a zoom the seller has already touched on this photo.
            if (next[idx] === '1') next[idx] = String(auto);
            return next;
          });
        }
      };
      probe.src = url;
    });
    setCropIndex(photos.length);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) addFiles(e.target.files);
    e.target.value = '';
  };

  const removePhoto = (index: number) => {
    setPhotos((prev) => {
      const next = [...prev];
      if (next[index].file) URL.revokeObjectURL(next[index].url);
      next.splice(index, 1);
      return next;
    });
    setPhotoFocus((prev) => { const next = [...prev]; next.splice(index, 1); return next; });
    setPhotoZoom((prev) => { const next = [...prev]; next.splice(index, 1); return next; });
    setCropIndex((c) => Math.max(0, c >= index ? c - 1 : c));
  };

  const reorderPhotos = (from: number, to: number) => {
    if (from === to) return;
    setPhotos((prev) => moveItem(prev, from, to));
    setPhotoFocus((prev) => moveItem(prev, from, to));
    setPhotoZoom((prev) => moveItem(prev, from, to));
    setCropIndex(to);
  };

  const generateDescription = async () => {
    if (!title.trim() || aiLoading) return;
    setAiLoading(true);
    setAiError('');
    try {
      const res = await fetch('/api/generate-description', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          category: CATEGORIES.find((c) => c.id === categories[0])?.label || categories[0] || 'goods',
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!data.description) throw new Error('empty response');
      setDescription(data.description);
    } catch {
      setAiError('Couldn’t generate - try again.');
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

  // Nudge to zoom when the selected photo is far enough from the crop frame's
  // shape that cover-fitting leaves bars / crops heavily. See shouldHintZoom.
  const showAspectHint = shouldHintZoom(photos[cropIndex]?.aspect, Number(photoZoom[cropIndex]) || 1);

  const missing = [
    categories.length === 0 && 'a category',
    photos.length === 0 && 'a photo',
    !title.trim() && 'a title',
    !description.trim() && 'a description',
    !isPopup && !price.trim() && 'a price',
    isPopup && !eventDate && 'an event date',
    isPopup && !eventStartTime && 'a start time',
    isPopup && !eventEndTime && 'an end time',
    isPopup && eventDate && eventStartTime && eventEndTime &&
      !parseEventWindow(eventDate, eventStartTime, eventEndTime) && 'a valid time range (end after start)',
    !loc.name.trim() && 'a pickup location',
    availableMethods.length === 0 && 'a contact method (set it in your profile)',
    availableMethods.length > 0 && contactMethods.length === 0 && 'at least one contact method',
  ].filter(Boolean) as string[];

  const buildFormData = () => {
    const fd = new FormData();
    fd.append('category', categories[0] || 'goods');
    fd.append('categories', JSON.stringify(categories));
    fd.append('title', title.trim());
    fd.append('description', description);
    if (isPopup) {
      const win = parseEventWindow(eventDate, eventStartTime, eventEndTime);
      if (win) { fd.append('event_start', win.start); fd.append('event_end', win.end); }
    } else {
      fd.append('price', price);
      fd.append('negotiable', String(neg));
    }
    fd.append('location', loc.name);
    fd.append('place_name', loc.name);
    fd.append('contact_methods', JSON.stringify(contactMethods));
    if (loc.lat != null && loc.lng != null) { fd.append('lat', String(loc.lat)); fd.append('lng', String(loc.lng)); }
    // Order-preserving photo manifest: existing photos travel as URLs, new ones as files.
    const manifest = photos.map((p) => (p.file ? '__new__' : p.url));
    fd.append('photo_manifest', JSON.stringify(manifest));
    photos.forEach((p) => { if (p.file) fd.append('photos', p.file, p.file.name); });
    photoFocus.forEach((f) => fd.append('photo_focus', f));
    photoZoom.forEach((z) => fd.append('photo_zoom', z));
    return fd;
  };

  // Edits skip the preview/success gate; new listings preview, then confirm.
  const onSubmitClick = () => {
    if (missing.length > 0) { setAttempted(true); return; }
    if (initial) { void confirmSave(); return; }
    setPhase('preview');
  };

  // Edit save. No preview/success phase (the edit page navigates away on
  // success), so this only drives the button's busy + progress state; the
  // same 0→90% real / hold-till-response model as confirmPublish.
  const confirmSave = async () => {
    if (submitting) return;
    setSubmitting(true);
    setUploadProgress(0);
    try {
      await onPublish(buildFormData(), (fraction) => setUploadProgress(fraction * 0.9));
      setUploadProgress(1);
      // onPublish (edit page) navigates away on success; leave the button in
      // its done state through the unmount rather than flashing back to idle.
    } catch {
      // The edit page surfaces the error; just release the button.
      setSubmitting(false);
      setUploadProgress(0);
    }
  };

  const confirmPublish = async () => {
    setSubmitting(true);
    setUploadProgress(0);
    try {
      // Bytes leaving the browser are only part of the wait — the server still
      // has to push each photo to storage and insert the row, which it can't
      // report on. So real progress drives the bar to 90% and the last 10% is
      // held until the response lands.
      await onPublish(buildFormData(), (fraction) => setUploadProgress(fraction * 0.9));
      setUploadProgress(1);
      setPhase('success');
    } catch {
      setPhase('preview');
    } finally {
      setSubmitting(false);
      setUploadProgress(0);
    }
  };

  const previewListing: Listing = {
    id: 'preview',
    category: categories[0] || 'goods',
    categories: categories.length ? categories : ['goods'],
    categoryLabel: (CATEGORIES.find((c) => c.id === categories[0]) || {}).label || 'Goods',
    categoryLabels: (categories.length ? categories : ['goods']).map((c) => (CATEGORIES.find((x) => x.id === c) || {}).label || 'Goods'),
    title: title.trim() || 'Untitled listing',
    price: isPopup ? undefined : price ? Number(price) : undefined,
    priceLabel: isPopup ? '' : price && Number(price) > 0 ? '$' + Number(price).toLocaleString('en-US') : 'Free',
    negotiable: isPopup ? false : neg,
    eventStart: isPopup ? parseEventWindow(eventDate, eventStartTime, eventEndTime)?.start ?? null : undefined,
    eventEnd: isPopup ? parseEventWindow(eventDate, eventStartTime, eventEndTime)?.end ?? null : undefined,
    meta: loc.name,
    lat: loc.lat,
    lng: loc.lng,
    placeName: loc.name,
    photoTone: 'cream',
    photoLabel: 'your photo',
    photo_urls: photos.map((p) => p.url),
    photo_focus: photoFocus,
    photo_zoom: photoZoom,
    description,
    seller: { id: store.me?.id ?? '', name: store.me?.display_name ?? 'You', unit: store.me?.school_unit ?? '', year: classYearLabel(store.me?.class_year ?? null), avatarUrl: store.me?.avatar_url ?? undefined },
    postedLabel: 'just now',
    eventPill: isPopup
      ? (() => {
          const w = parseEventWindow(eventDate, eventStartTime, eventEndTime);
          return w ? formatEventWindow(w.start, w.end) : undefined;
        })()
      : undefined,
  };

  if (phase === 'success') {
    return (
      <div style={{ maxWidth: 560, margin: '0 auto', padding: '80px 24px', textAlign: 'center' }}>
        <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--accent)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
          <Icon name="check" size={26} color="#fff" />
        </div>
        <h1 style={{ fontWeight: 800, fontSize: 26, letterSpacing: '-0.03em', color: 'var(--ink)', margin: '0 0 8px' }}>You&rsquo;re live</h1>
        <p style={{ fontFamily: 'var(--sans)', fontSize: 14.5, color: 'var(--ink-2)', margin: '0 0 26px' }}>
          &ldquo;{title.trim()}&rdquo; is on the feed. We&rsquo;ll let you know when someone asks about it.
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          <Button kind="secondary" onClick={onCancel}>Back to feed</Button>
        </div>
      </div>
    );
  }

  if (phase === 'preview') {
    return (
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 32px 80px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '10px 0 8px' }}>
          <h1 style={{ fontWeight: 800, fontSize: 26, letterSpacing: '-0.03em', color: 'var(--ink)', margin: 0 }}>Preview</h1>
          <Button kind="secondary" size="sm" onClick={() => setPhase('form')}>Keep editing</Button>
        </div>
        <p style={{ fontFamily: 'var(--sans)', fontSize: 14, color: 'var(--muted)', margin: '0 0 20px' }}>
          This is exactly how buyers will see it.
        </p>

        <label className="field-label" style={{ display: 'block', marginTop: 12 }}>In the feed</label>
        <div style={{ width: 210, margin: '16px 0' }}>
          <ListingCard listing={previewListing} />
        </div>
        <p style={{ fontFamily: 'var(--sans)', fontSize: 12.5, color: 'var(--muted)', margin: '0 0 44px' }}>
          Long titles, locations, and prices get shortened to one line here.
        </p>

        <label className="field-label" style={{ display: 'block' }}>The listing page</label>
        <div style={{ border: '1px solid var(--rule)', borderRadius: 16, overflow: 'hidden', marginTop: 4 }}>
          <WebListingDetail store={store} listing={previewListing} preview onBack={() => {}} onReveal={() => {}} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 24 }}>
          <Button kind="ghost" onClick={() => setPhase('form')}>Back</Button>
          <Button
            kind="primary"
            size="lg"
            disabled={submitting}
            onClick={confirmPublish}
            // Once the bar parks at 90% the percentage can't move, so it
            // switches to a pulse — otherwise a full-looking bar reads as stuck.
            progress={submitting ? (uploadProgress >= 0.9 ? 'indeterminate' : uploadProgress) : undefined}
          >
            {!submitting
              ? 'Publish listing'
              : uploadProgress >= 0.9
                ? 'Almost there…'
                : `Uploading photos… ${Math.round((uploadProgress / 0.9) * 100)}%`}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 32px 80px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '10px 0 32px' }}>
        <h1 style={{ fontWeight: 800, fontSize: 30, letterSpacing: '-0.03em', color: 'var(--ink)', margin: 0 }}>{heading}</h1>
        <Button kind="secondary" size="sm" onClick={onCancel}>Exit</Button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 44, alignItems: 'start' }}>
        {/* Left: photos */}
        <div>
          <label className="field-label">Photos<span style={{ color: 'var(--accent)' }}> *</span></label>
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
              role="img"
              aria-label={`Cover photo — drag to reposition. Photo ${cropIndex + 1} of ${photos.length}.`}
              onPointerDown={onCropPointerDown}
              onPointerMove={onCropPointerMove}
              onPointerUp={onCropPointerUp}
              style={{ width: '100%', aspectRatio: '1.05', borderRadius: 14, overflow: 'hidden', cursor: 'grab', touchAction: 'none', userSelect: 'none', background: 'var(--surface)' }}
            >
              <img
                src={photos[cropIndex].url}
                alt={`Editing photo ${cropIndex + 1} — drag to reposition`}
                draggable={false}
                // Existing (edit-mode) photos have no measured aspect yet — fill
                // it in on load so the hint works for them too.
                onLoad={(e) => {
                  const el = e.currentTarget;
                  if (!el.naturalHeight) return;
                  const a = el.naturalWidth / el.naturalHeight;
                  setPhotos((prev) => prev.map((p, i) =>
                    i === cropIndex && p.aspect === undefined ? { ...p, aspect: a } : p));
                }}
                style={{ width: '100%', height: '100%', display: 'block', pointerEvents: 'none', ...photoCropStyle(photoFocus[cropIndex], photoZoom[cropIndex]) }}
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

          {photos[cropIndex] && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 }}>
              <label htmlFor="photo-zoom" style={{ fontFamily: 'var(--sans)', fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', flexShrink: 0 }}>
                Zoom
              </label>
              <input
                id="photo-zoom"
                type="range"
                min="1"
                max="2.5"
                step="0.05"
                value={Number(photoZoom[cropIndex]) || 1}
                onChange={(e) => setPhotoZoom((prev) => {
                  const next = [...prev];
                  // Pad: a photo added before zoom existed has no entry yet.
                  while (next.length < photos.length) next.push('1');
                  next[cropIndex] = e.target.value;
                  return next;
                })}
                style={{ flex: 1, accentColor: 'var(--accent)', cursor: 'pointer' }}
              />
              {(Number(photoZoom[cropIndex]) || 1) > 1 && (
                <button
                  onClick={() => setPhotoZoom((prev) => {
                    const next = [...prev];
                    while (next.length < photos.length) next.push('1');
                    next[cropIndex] = '1';
                    return next;
                  })}
                  style={{ background: 'none', border: 0, padding: 0, fontFamily: 'var(--sans)', fontSize: 12.5, fontWeight: 500, color: 'var(--muted)', cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 3, flexShrink: 0 }}
                >
                  Reset
                </button>
              )}
            </div>
          )}
          <p style={{ fontFamily: 'var(--sans)', fontSize: 12, lineHeight: 1.5, margin: '6px 0 0', color: showAspectHint ? 'var(--accent)' : 'var(--muted)' }}>
            {showAspectHint
              ? "This photo isn't square — drag Zoom to fill the frame and crop the bars."
              : 'Drag to reposition. Wide photos are zoomed to fill automatically — adjust with the slider.'}
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginTop: 10 }}>
            {Array.from({ length: photos.length > 4 ? 8 : 4 }).map((_, i) => (
              photos[i] ? (
                <div
                  key={i}
                  role="button"
                  tabIndex={0}
                  aria-label={`Select photo ${i + 1}${cropIndex === i ? ' (selected)' : ''}`}
                  aria-pressed={cropIndex === i}
                  draggable
                  onDragStart={() => setDragIndex(i)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => { if (dragIndex !== null) reorderPhotos(dragIndex, i); setDragIndex(null); }}
                  onDragEnd={() => setDragIndex(null)}
                  onClick={() => setCropIndex(i)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setCropIndex(i); } }}
                  style={{ position: 'relative', aspectRatio: '1.4', borderRadius: 10, overflow: 'hidden', cursor: 'grab', opacity: dragIndex === i ? 0.4 : 1, outline: cropIndex === i ? '2px solid var(--ink)' : 'none', outlineOffset: -2 }}
                >
                  <img src={photos[i].url} alt="" style={{ width: '100%', height: '100%', ...photoCropStyle(photoFocus[i], photoZoom[i]) }} />
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
                  style={{ aspectRatio: '1.4', borderRadius: 10, border: '1.5px dashed var(--rule-strong)', background: i === 0 ? 'var(--surface)' : 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  aria-label="Add photo"
                >
                  <Icon name="plus" size={16} color="var(--muted)" />
                </button>
              )
            ))}
          </div>

          <p style={{ fontFamily: 'var(--sans)', fontSize: 12.5, lineHeight: 1.55, color: 'var(--muted)', margin: '14px 0 0' }}>
            Tip: shoot near a window, and include the flaw if there is one. Buyers trust listings that show everything.
          </p>
        </div>

        {/* Right: details */}
        <div>
          <label className="field-label">It’s in the category of…<span style={{ color: 'var(--accent)' }}> *</span><span style={{ fontWeight: 400, color: 'var(--muted)', textTransform: 'none', letterSpacing: 0 }}> — pick one or more</span></label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 22 }}>
            {CATEGORIES.filter((c) => c.id !== 'all').map((c) => (
              <CategoryChip
                key={c.id}
                category={c}
                active={categories.includes(c.id)}
                onClick={() => setCategories((prev) => prev.includes(c.id) ? prev.filter((x) => x !== c.id) : [...prev, c.id])}
              />
            ))}
          </div>

          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <label className="field-label">Give it a title<span style={{ color: 'var(--accent)' }}> *</span></label>
            <span style={{ fontFamily: 'var(--sans)', fontSize: 12, color: title.length >= TITLE_MAX ? 'var(--accent)' : 'var(--muted)' }}>{title.length}/{TITLE_MAX}</span>
          </div>
          <input value={title} onChange={(e) => setTitle(e.target.value.slice(0, TITLE_MAX))} className="field" placeholder="e.g. Mini fridge, two gentle years old" style={{ marginBottom: 22 }} />

          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
            <label className="field-label" style={{ margin: 0 }}>Tell its story<span style={{ color: 'var(--accent)' }}> *</span></label>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
              {aiError && <span style={{ fontFamily: 'var(--sans)', fontSize: 12, color: 'var(--accent)' }}>{aiError}</span>}
              <button
                onClick={generateDescription}
                disabled={!title.trim() || aiLoading}
                title={!title.trim() ? 'Add a title first' : undefined}
                style={{
                  background: 'none', border: 0, padding: 0,
                  fontFamily: 'var(--sans)', fontWeight: 600, fontSize: 12,
                  color: (!title.trim() || aiLoading) ? 'var(--muted-2)' : 'var(--accent)',
                  cursor: (!title.trim() || aiLoading) ? 'default' : 'pointer',
                }}
              >
                {aiLoading ? 'Generating…' : aiError ? 'Retry' : 'Generate with AI'}
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

          {isPopup ? (
            <div style={{ marginBottom: 22 }}>
              <label className="field-label">When<span style={{ color: 'var(--accent)' }}> *</span></label>
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: 12 }}>
                <input type="date" className="field" value={eventDate} onChange={(e) => setEventDate(e.target.value)} aria-label="Event date" />
                <input type="time" className="field" value={eventStartTime} onChange={(e) => setEventStartTime(e.target.value)} aria-label="Start time" />
                <input type="time" className="field" value={eventEndTime} onChange={(e) => setEventEndTime(e.target.value)} aria-label="End time" />
              </div>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: 12, marginBottom: 22, alignItems: 'end' }}>
              <div>
                <label className="field-label">Price<span style={{ color: 'var(--accent)' }}> *</span></label>
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
          )}

          <label className="field-label">Where you&apos;ll meet<span style={{ color: 'var(--accent)' }}> *</span></label>
          <div style={{ marginBottom: 22 }}>
            <LocationPicker value={loc} onChange={setLoc} />
          </div>

          <label className="field-label">How buyers reach you</label>
          {availableMethods.length === 0 ? (
            <div style={{ fontFamily: 'var(--sans)', fontSize: 13.5, color: 'var(--accent)' }}>
              Add a contact method in your profile first.
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {availableMethods.map((k) => {
                const on = contactMethods.includes(k);
                return (
                  <button
                    key={k}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setContactMethods((prev) =>
                      prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k])}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 8,
                      border: `1.5px solid ${on ? 'var(--ink)' : 'var(--rule)'}`,
                      background: on ? 'var(--ink)' : '#fff',
                      color: on ? '#fff' : 'var(--ink)',
                      borderRadius: 999, padding: '8px 14px', cursor: 'pointer',
                      fontFamily: 'var(--sans)', fontWeight: 600, fontSize: 13.5,
                    }}
                  >
                    <Icon name={CONTACT_METHOD_ICONS[k]} size={15} color={on ? '#fff' : 'var(--muted)'} />
                    {CONTACT_METHOD_LABELS[k]}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <hr className="rule" style={{ margin: '36px 0 20px' }} />
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button
          kind="primary"
          size="lg"
          onClick={onSubmitClick}
          disabled={submitting}
          // Progress only applies to the edit-save flow. For a new listing this
          // button just opens the preview — the real upload (and its bar) lives
          // on the Publish button there.
          progress={initial && submitting ? (uploadProgress >= 0.9 ? 'indeterminate' : uploadProgress) : undefined}
        >
          {!initial
            ? 'Preview listing'
            : !submitting
              ? submitLabel
              : uploadProgress >= 0.9
                ? 'Almost there…'
                : `Saving… ${Math.round((uploadProgress / 0.9) * 100)}%`}
        </Button>
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
  store, onListing, onApprove, onDecline, onEdit,
}: { store: FlipdStore; onListing: (l: Listing) => void; onApprove: (id: string) => void; onDecline: (id: string) => void; onEdit: () => void }) {
  const [tab, setTab] = React.useState<'listings' | 'past' | 'saved' | 'activity' | 'reviews'>('listings');
  const displayName = store.me?.display_name ?? 'Your profile';
  const avatarName = store.me?.display_name ?? 'Me';
  const [rating, setRating] = React.useState<ActivityItem | null>(null);
  const [summary, setSummary] = React.useState<RatingSummary>({ average: null, count: 0, reviews: [] });
  const loadSummary = React.useCallback(() => { store.fetchRatings().then(setSummary).catch(() => {}); }, [store]);
  React.useEffect(() => { loadSummary(); }, [loadSummary]);
  return (
    <div>
      {/* Banner */}
      <div style={{ background: '#fff', borderBottom: '1px solid var(--rule)', position: 'relative' }}>
        <div style={{ maxWidth: 1180, margin: '0 auto', padding: '40px 32px 0', display: 'flex', alignItems: 'center', gap: 20 }}>
          <Avatar name={avatarName} src={store.me?.avatar_url ?? undefined} size={76} tone="ink" />
          <div style={{ flex: 1 }}>
            <h1 style={{ fontWeight: 800, fontSize: 26, color: 'var(--ink)', letterSpacing: '-0.03em', margin: '0 0 4px' }}>
              {displayName}
            </h1>
            <div className="t-meta" style={{ fontSize: 13.5 }}>
              {[store.me?.school_unit, store.me?.class_year].filter(Boolean).join(' · ')}{[store.me?.school_unit, store.me?.class_year].some(Boolean) ? ' · ' : ''}joined {formatPostedDate(store.me?.created_at) || 'recently'}
            </div>
            {summary.count > 0 && summary.average != null && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                <Stars score={summary.average} size={14} />
                <span style={{ fontFamily: 'var(--sans)', fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{summary.average.toFixed(1)}</span>
                <span className="t-meta" style={{ fontSize: 12.5 }}>· {summary.count} rating{summary.count === 1 ? '' : 's'}</span>
              </div>
            )}
            {store.me?.bio && (
              <div style={{ fontFamily: 'var(--sans)', fontSize: 13.5, color: 'var(--ink-2)', marginTop: 6, maxWidth: 520 }}>
                {store.me.bio}
              </div>
            )}
          </div>
          <Button kind="secondary" size="sm" onClick={onEdit}>Edit profile</Button>
          <button
            onClick={() => store.signOut()}
            style={{ background: 'none', border: 0, padding: 0, marginLeft: 14, fontFamily: 'var(--sans)', fontSize: 13, fontWeight: 500, color: 'var(--muted)', cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 3 }}
          >
            Sign out
          </button>
        </div>
        {/* Tabs */}
        <div style={{ maxWidth: 1180, margin: '0 auto', padding: '20px 32px 0', display: 'flex', gap: 28 }}>
          {([
            { id: 'listings', label: 'My Listings', count: store.pendingCount || null },
            { id: 'past', label: 'Past Listings', count: store.pastListings.length },
            { id: 'saved', label: 'Saved', count: store.savedListings.length },
            { id: 'activity', label: 'Activity', count: store.pendingCount || null },
            { id: 'reviews', label: 'Reviews', count: summary.count || null },
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
              {store.myListings.map((l) => (
                <div key={l.id} style={{ position: 'relative' }}>
                  <ListingCard listing={l} href={`/listing/${l.id}`} />
                  {(store.pendingByListing[l.id] ?? 0) > 0 && (
                    <span style={{ position: 'absolute', top: 8, left: 8, zIndex: 2, background: 'var(--accent)', color: '#fff', borderRadius: 999, padding: '4px 10px', fontFamily: 'var(--sans)', fontWeight: 700, fontSize: 11 }}>
                      {store.pendingByListing[l.id]} request{store.pendingByListing[l.id] === 1 ? '' : 's'}
                    </span>
                  )}
                </div>
              ))}
            </div>
          ))}
        {tab === 'past' &&
          (store.pastListings.length === 0 ? (
            <EmptyState icon="clock" title="No past listings" sub="Listings you move to past from their detail page show up here." />
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 20 }}>
              {store.pastListings.map((l) => <ListingCard key={l.id} listing={l} href={`/listing/${l.id}`} />)}
            </div>
          ))}
        {tab === 'saved' &&
          (store.savedListings.length === 0 ? (
            <EmptyState icon="bookmark" title="Nothing saved" sub="Tap the bookmark on any listing to keep it here." />
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 20 }}>
              {store.savedListings.map((l) => <ListingCard key={l.id} listing={l} href={`/listing/${l.id}`} />)}
            </div>
          ))}
        {tab === 'activity' && (
          store.activity.length === 0 ? (
            <EmptyState icon="bell" title="No activity yet" sub="Reveal requests you send and receive show up here." />
          ) : (
            <div>
              {store.activity.map((a, i) => (
                <ActivityRow key={a.id} a={a} onApprove={onApprove} onDecline={onDecline} onRate={setRating} last={i === store.activity.length - 1} />
              ))}
            </div>
          )
        )}
        {tab === 'reviews' && (
          summary.reviews.length === 0 ? (
            <EmptyState icon="star" title="No reviews yet" sub="After a completed sale, the other party can leave you a rating." />
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(420px, 1fr))', gap: 12, alignItems: 'start' }}>
              {summary.reviews.map((rev, i) => (
                <div key={i} style={{ border: '1px solid var(--rule)', borderRadius: 14, padding: '16px 18px', background: '#fff' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Stars score={rev.score} size={14} />
                    <span className="t-meta" style={{ fontSize: 12 }}>{formatPostedDate(rev.created_at)}</span>
                  </div>
                  {rev.text && <div style={{ fontFamily: 'var(--sans)', fontSize: 13.5, color: 'var(--ink-2)', marginTop: 8, lineHeight: 1.5 }}>{rev.text}</div>}
                </div>
              ))}
            </div>
          )
        )}
      </div>

      {rating && (
        <RatingModal
          whom={rating.who.split(' ')[0]}
          onClose={() => setRating(null)}
          onSubmit={async (score, text) => {
            const r = await store.rateTransaction(rating.id, score, text);
            if (r.ok) loadSummary();
            return r;
          }}
        />
      )}
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

const CONTACT_METHOD_LABELS: Record<'instagram' | 'phone' | 'email', string> = {
  instagram: 'Instagram',
  phone: 'Text',
  email: 'Email',
};
const CONTACT_METHOD_ICONS: Record<'instagram' | 'phone' | 'email', string> = {
  instagram: 'instagram',
  phone: 'phone',
  email: 'mail',
};

export function RevealModal({ listing, me, onClose, onContinue }: { listing: Listing; me: Profile | null; onClose: () => void; onContinue: (offer: number | undefined, introMessage: string) => void }) {
  const [offerText, setOfferText] = React.useState('');
  const [intro, setIntro] = React.useState('');
  const [touched, setTouched] = React.useState(false);
  const [safety, setSafety] = React.useState<SafetyReview | null>(null);
  const [safetyLoading, setSafetyLoading] = React.useState(true);

  // Advisory only: a failed or slow review must never block sending, so this
  // never gates the Send button and a null result renders nothing.
  React.useEffect(() => {
    let alive = true;
    setSafetyLoading(true);
    fetch(`/api/safety?user=${listing.seller.id}&role=seller`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive) { setSafety(d?.review ?? null); setSafetyLoading(false); } })
      .catch(() => { if (alive) { setSafety(null); setSafetyLoading(false); } });
    return () => { alive = false; };
  }, [listing.seller.id]);
  // Only sellers who marked the listing "open to offers" accept them.
  const canOffer = !!listing.negotiable && !listing.eventStart;
  const firstName = listing.seller.name.split(' ')[0];

  // Same check the server runs. Here it exists purely so a buyer finds out
  // before they hit send, not as enforcement — the API rejects independently.
  const hits = findContactInfo(intro);
  const blocked = hits.length > 0;
  const tooLong = intro.length > 600;
  const canSend = intro.trim().length > 0 && !blocked && !tooLong;

  const handleSend = async () => {
    if (!canSend) return;
    const confetti = (await import('canvas-confetti')).default;
    confetti({
      particleCount: 120,
      spread: 80,
      origin: { y: 0.55 },
      colors: ['#990000', '#FFCC00', '#ffffff'],
    });
    const parsed = parseInt(offerText, 10);
    const offer = canOffer && Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
    onContinue(offer, intro.trim());
  };

  return (
    <ModalScrim onClose={onClose}>
      <div style={{ background: '#fff', borderRadius: 16, padding: 0, width: 460, overflow: 'hidden', boxShadow: '0 24px 60px rgba(0,0,0,0.18)', fontFamily: 'var(--sans)' }}>
        <div style={{ padding: '26px 28px 24px' }}>
          <h2 style={{ fontWeight: 800, fontSize: 24, lineHeight: 1.2, letterSpacing: '-0.03em', margin: '0 0 10px' }}>
            Message <em style={{ color: 'var(--accent)', fontStyle: 'normal' }}>{firstName}</em>
          </h2>
          <p className="t-body" style={{ fontSize: 13.5, margin: '0 0 16px' }}>
            {firstName} sees your <strong>name</strong>, <strong>school</strong>, and <strong>year</strong> with your message, and has 72 hours to reply. Approving opens a chat right here in Flipd.
          </p>

          <SafetyCard review={safety} loading={safetyLoading} />

          <label className="field-label">Your message</label>
          <textarea
            className="field"
            rows={4}
            value={intro}
            onChange={(e) => setIntro(e.target.value.slice(0, 700))}
            onBlur={() => setTouched(true)}
            placeholder={
              listing.categoryLabel === 'Services'
                ? 'What do you need, and when works for you?'
                : 'Say what you\u2019re after and when you could meet.'
            }
            style={{ resize: 'vertical', marginBottom: 6 }}
          />
          {/* Blocked rather than silently redacted: a buyer who thinks their
              number went through would wait forever for a text. */}
          {blocked && (touched || intro.length > 12) ? (
            <p style={{ fontSize: 12.5, lineHeight: 1.5, color: 'var(--accent)', margin: '0 0 14px' }}>
              {CONTACT_BLOCKED_MESSAGE}
            </p>
          ) : (
            <p style={{ fontSize: 12, color: tooLong ? 'var(--accent)' : 'var(--muted)', margin: '0 0 14px' }}>
              {tooLong ? 'Keep it under 600 characters.' : `${intro.length}/600`}
            </p>
          )}

          {canOffer && (
            <>
              <label className="field-label">Your offer (optional)</label>
              <div style={{ position: 'relative', marginBottom: 20 }}>
                <span style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', fontWeight: 600 }}>$</span>
                <input
                  value={offerText}
                  onChange={(e) => setOfferText(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  inputMode="numeric"
                  placeholder={listing.price && listing.price > 0 ? String(listing.price) : '0'}
                  className="field"
                  style={{ paddingLeft: 28, fontWeight: 600 }}
                />
              </div>
            </>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <Button kind="ghost" onClick={onClose} style={{ flex: 1 }}>Cancel</Button>
            <Button kind={canSend ? 'primary' : 'disabled'} onClick={handleSend} disabled={!canSend} style={{ flex: 1 }} icon="arrowRight">Send</Button>
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
  // Matches the app's default: the feed is for what's currently for sale.
  const [range, setRange] = React.useState<FeedRange>('week');
  const [priceMin, setPriceMin] = React.useState('');
  const [priceMax, setPriceMax] = React.useState('');
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
        onRequests={() => { if (typeof window !== 'undefined') window.location.href = '/requests'; }}
        unreadCount={store.unreadCount}
        pendingCount={store.pendingCount}
        meName={store.me?.display_name ?? 'Me'}
        meAvatarUrl={store.me?.avatar_url ?? undefined}
      />

      {view === 'feed' && store.listingsLoading && <FeedSkeleton />}
      {view === 'feed' && !store.listingsLoading && (
        <WebAppFeed
          store={store} activeCat={activeCat} setActiveCat={setActiveCat}
          onListing={goDetail} query={query} sort={sort} setSort={setSort}
          range={range} setRange={setRange}
          priceMin={priceMin} setPriceMin={setPriceMin} priceMax={priceMax} setPriceMax={setPriceMax}
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
            const created = await store.addListing(fd);
            if (!created) throw new Error('Publish failed — no listing returned.');
          }}
        />
      )}
      {view === 'profile' && <WebProfile store={store} onListing={goDetail} onApprove={approve} onDecline={decline} onEdit={() => {}} />}

      {modal === 'reveal' && selected && (
        <RevealModal
          listing={selected}
          me={store.me}
          onClose={() => setModal(null)}
          onContinue={async (offer, introMessage) => {
            const r = await store.requestReveal(selected.id, offer, introMessage);
            if (!r.ok && r.error) alert(r.error);
            setModal(null);
          }}
        />
      )}

      {notifOpen && <WebNotifications activity={store.activity} onClose={() => setNotifOpen(false)} onApprove={approve} onDecline={decline} onNavigate={() => setView('profile')} onDismiss={(id) => store.dismissNotification(id)} onMarkAllRead={() => store.markAllSeen()} />}
    </div>
  );
}
