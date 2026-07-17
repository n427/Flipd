// Flipd — shared components (ported from components.jsx)
import React from 'react';
import Link from 'next/link';
import { Icon } from './Icon';
import type { Listing, PhotoTone } from '@/lib/types';

// ── Brand mark ───────────────────────────────────────────────────────
export function Wordmark({ size = 22, onDark = false }: { size?: number; onDark?: boolean }) {
  return (
    <span
      className={`wordmark ${onDark ? 'wordmark-on-dark' : ''}`}
      style={{ fontSize: size, lineHeight: 1, display: 'inline-flex', alignItems: 'baseline' }}
    >
      flipd<span className="dot">.</span>
    </span>
  );
}

// ── Pill ─────────────────────────────────────────────────────────────
export function Pill({
  kind = 'category', children, style = {},
}: { kind?: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return <span className={`pill pill-${kind}`} style={style}>{children}</span>;
}

// ── Avatar (initials, neutral palette) ──────────────────────────────
export function Avatar({
  name = '?', size = 28, tone = 'cream', src,
}: { name?: string; size?: number; tone?: PhotoTone; src?: string }) {
  const initials = name.split(' ').map((s) => s[0]).slice(0, 2).join('').toUpperCase();
  const dark = tone === 'cardinal' || tone === 'ink';
  return (
    <div
      style={{
        width: size, height: size, borderRadius: '50%',
        background: dark ? 'var(--ink)' : 'var(--surface-2)',
        color: dark ? '#fff' : 'var(--ink)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontWeight: 600, fontSize: size * 0.4, letterSpacing: '0.02em', flexShrink: 0,
        overflow: 'hidden',
      }}
    >
      {src ? <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initials}
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

// ── Listing card (A1: photo tile, price-first text block) ──────────
export function ListingCard({
  listing, onClick, href, compact = false,
}: { listing: Listing; onClick?: () => void; href?: string; compact?: boolean }) {
  const inner = (
    <>
      <div className="listing-photo" style={{ position: 'relative', aspectRatio: '1 / 1', borderRadius: 'var(--r-img)', overflow: 'hidden', background: 'var(--surface)' }}>
        {listing.photo_urls?.[0] ? (
          <img
            src={listing.photo_urls[0]}
            alt={listing.title}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: listing.photo_focus?.[0] || '50% 50%' }}
          />
        ) : (
          <Placeholder label={listing.photoLabel} tone={listing.photoTone} height="100%" radius={0} style={{ position: 'absolute', inset: 0 }} />
        )}
        {listing.eventPill ? (
          <div style={{ position: 'absolute', top: 8, left: 8 }}>
            <Pill kind="event">{listing.eventPill}</Pill>
          </div>
        ) : listing.spokenFor ? (
          <span style={{ position: 'absolute', top: 8, left: 8, background: 'rgba(255,255,255,0.92)', borderRadius: 999, padding: '4px 10px', fontFamily: 'var(--sans)', fontWeight: 600, fontSize: 11, color: 'var(--ink-2)' }}>
            Spoken for
          </span>
        ) : null}
      </div>
      <div style={{ padding: compact ? '9px 2px 0' : '11px 2px 0', display: 'flex', flexDirection: 'column', gap: 3 }}>
        <div style={{ fontWeight: 700, fontSize: 14.5, color: 'var(--ink)', letterSpacing: '-0.01em', lineHeight: 1.3, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
          {listing.title}
        </div>
        <div className="t-meta" style={{ fontSize: 13, fontWeight: 400, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {listing.meta.split(' · ')[0]}
        </div>
        <div className="t-meta" style={{ fontSize: 12, fontWeight: 400, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {[listing.seller.name.split(' ')[0], listing.seller.unit, listing.seller.year].filter(Boolean).join(' · ')}
        </div>
        <div style={{ fontWeight: 700, fontSize: 15, letterSpacing: '-0.01em', color: listing.priceLabel === 'Free' ? 'var(--accent)' : 'var(--ink)' }}>
          {listing.priceLabel}
        </div>
      </div>
    </>
  );
  if (href) {
    return (
      <Link href={href} className="listing-card" style={{ display: 'flex', flexDirection: 'column', textDecoration: 'none', color: 'inherit' }}>
        {inner}
      </Link>
    );
  }
  return (
    <div className="listing-card" onClick={onClick} style={{ cursor: onClick ? 'pointer' : 'default', display: 'flex', flexDirection: 'column' }}>
      {inner}
    </div>
  );
}

// ── Category chip (text-only pill, active = near-black fill) ────────
export function CategoryChip({
  category, active, onClick,
}: { category: { id: string; label: string; icon: string }; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center',
        padding: '8px 16px', borderRadius: 'var(--r-pill)',
        border: '1px solid ' + (active ? 'var(--ink)' : 'var(--rule)'),
        background: active ? 'var(--ink)' : '#fff',
        color: active ? '#fff' : 'var(--ink-2)',
        fontWeight: 600, fontSize: 13,
        transition: 'all 160ms ease-out', whiteSpace: 'nowrap', flexShrink: 0,
      }}
    >
      {category.label}
    </button>
  );
}
