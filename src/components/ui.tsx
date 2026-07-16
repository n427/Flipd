// Flipd — shared components (ported from components.jsx)
import React from 'react';
import { Icon } from './Icon';
import type { Listing, PhotoTone } from '@/lib/types';

// ── Brand mark ───────────────────────────────────────────────────────
export function Wordmark({ size = 22, onDark = false }: { size?: number; onDark?: boolean }) {
  return (
    <span
      className={`wordmark ${onDark ? 'wordmark-on-dark' : ''}`}
      style={{ fontSize: size, lineHeight: 1, display: 'inline-flex', alignItems: 'baseline' }}
    >
      Flipd<span className="dot">.</span>
    </span>
  );
}

// ── USC monogram badge (generic SC roundel — cardinal + gold) ────────
export function USCBadge({ size = 26 }: { size?: number }) {
  return (
    <div
      style={{
        width: size, height: size, borderRadius: '50%',
        background: 'var(--cardinal)', color: 'var(--gold)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'var(--sans)', fontWeight: 800,
        fontSize: size * 0.42, letterSpacing: '0.02em',
        flexShrink: 0, lineHeight: 1,
      }}
    >
      SC
    </div>
  );
}

// ── Pill ─────────────────────────────────────────────────────────────
export function Pill({
  kind = 'category', children, style = {},
}: { kind?: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return <span className={`pill pill-${kind}`} style={style}>{children}</span>;
}

// ── Avatar (initials, cream bg, ink text) ────────────────────────────
export function Avatar({
  name = '?', size = 28, tone = 'cream',
}: { name?: string; size?: number; tone?: PhotoTone }) {
  const initials = name.split(' ').map((s) => s[0]).slice(0, 2).join('').toUpperCase();
  const bgs: Record<string, string> = {
    cream: 'var(--cream-2)',
    cardinal: 'var(--cardinal)',
    gold: 'var(--gold)',
    ink: 'var(--ink)',
  };
  const fg = tone === 'cardinal' || tone === 'ink' ? '#fff' : 'var(--ink)';
  return (
    <div
      style={{
        width: size, height: size, borderRadius: '50%',
        background: bgs[tone], color: fg,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'var(--sans)', fontWeight: 600,
        fontSize: size * 0.4, letterSpacing: '0.02em',
        flexShrink: 0,
      }}
    >
      {initials}
    </div>
  );
}

// ── Striped placeholder image ────────────────────────────────────────
export function Placeholder({
  label, tone = 'cream', height = 140, width = '100%', radius = 4, style = {}, children,
}: {
  label?: string | null;
  tone?: PhotoTone;
  height?: number | string;
  width?: number | string;
  radius?: number;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}) {
  return (
    <div className="ph" data-tone={tone} style={{ width, height, borderRadius: radius, ...style }}>
      {children || (label && <span className="ph__label">{label}</span>)}
    </div>
  );
}

// ── Callout ──────────────────────────────────────────────────────────
export function Callout({
  eyebrow, children, style = {},
}: { eyebrow?: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div className="callout" style={style}>
      {eyebrow && (
        <div className="t-eyebrow" style={{ color: 'var(--cardinal)', marginBottom: 6 }}>
          {eyebrow}
        </div>
      )}
      <div className="t-body" style={{ fontSize: 13, color: 'var(--ink-2)' }}>{children}</div>
    </div>
  );
}

// ── Button ───────────────────────────────────────────────────────────
type ButtonProps = {
  kind?: 'primary' | 'secondary' | 'ghost' | 'on-dark' | 'disabled';
  children?: React.ReactNode;
  full?: boolean;
  size?: 'sm' | 'md' | 'lg';
  icon?: string;
} & React.ButtonHTMLAttributes<HTMLButtonElement>;

export function Button({
  kind = 'primary', children, onClick, style = {}, full = false, size = 'md', icon, ...rest
}: ButtonProps) {
  const sizes: Record<string, React.CSSProperties> = {
    sm: { padding: '7px 16px', fontSize: 12 },
    md: { padding: '10px 22px', fontSize: 13 },
    lg: { padding: '14px 28px', fontSize: 14 },
  };
  return (
    <button
      className={`btn btn-${kind}`}
      onClick={onClick}
      style={{ ...sizes[size], width: full ? '100%' : undefined, ...style }}
      {...rest}
    >
      {icon && <Icon name={icon} size={14} />}
      {children}
    </button>
  );
}

// ── Listing card (V3 stamp style: price tag, no verified pill / star) ─
export function ListingCard({
  listing, onClick, compact = false,
}: { listing: Listing; onClick?: () => void; compact?: boolean }) {
  return (
    <div
      className="card"
      onClick={onClick}
      style={{ cursor: onClick ? 'pointer' : 'default', display: 'flex', flexDirection: 'column' }}
    >
      <div style={{ position: 'relative', aspectRatio: '1 / 1' }}>
        {listing.photo_urls?.[0] ? (
          <img
            src={listing.photo_urls[0]}
            alt={listing.title}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: listing.photo_focus?.[0] || '50% 50%' }}
          />
        ) : (
          <Placeholder label={listing.photoLabel} tone={listing.photoTone} height="100%" radius={0} style={{ position: 'absolute', inset: 0 }} />
        )}
        {/* Price tag — cardinal pill overlapping bottom-left */}
        <div
          style={{
            position: 'absolute', bottom: -12, left: 14,
            background: 'var(--cardinal)', color: '#fff',
            padding: '6px 12px', borderRadius: 'var(--r-pill)',
            fontFamily: 'var(--sans)', fontWeight: 700, fontSize: 14,
            boxShadow: '0 2px 6px rgba(0,0,0,0.12)',
          }}
        >
          {listing.priceLabel}
        </div>
        {listing.eventPill && (
          <div style={{ position: 'absolute', top: 8, left: 8 }}>
            <Pill kind="event">{listing.eventPill}</Pill>
          </div>
        )}
      </div>
      <div style={{ padding: compact ? '20px 14px 12px' : '22px 16px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <h3 className="t-h3" style={{ margin: 0, fontSize: 14, lineHeight: 1.25 }}>{listing.title}</h3>
        <hr className="rule" style={{ margin: '8px 0 4px' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <Avatar name={listing.seller.name} size={20} />
          <span
            className="t-meta"
            style={{ fontSize: 11, color: 'var(--ink-2)', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
          >
            {listing.seller.name.split(' ')[0]} {listing.seller.name.split(' ')[1]?.[0]}.
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Category chip (filter bar) ───────────────────────────────────────
export function CategoryChip({
  category, active, onClick,
}: { category: { id: string; label: string; icon: string }; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '8px 14px', borderRadius: 'var(--r-pill)',
        border: '1px solid ' + (active ? 'var(--cardinal)' : 'var(--rule)'),
        background: active ? 'var(--cardinal)' : '#fff',
        color: active ? '#fff' : 'var(--ink)',
        fontFamily: 'var(--sans)', fontWeight: 600, fontSize: 12.5,
        letterSpacing: '0.01em', cursor: 'pointer',
        transition: 'all 180ms ease-out', whiteSpace: 'nowrap', flexShrink: 0,
      }}
    >
      <Icon name={category.icon} size={13} stroke={1.8} />
      {category.label}
    </button>
  );
}
