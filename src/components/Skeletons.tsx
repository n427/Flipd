'use client';

import React from 'react';

/**
 * Content-shaped loading states for the web app, mirroring the mobile set.
 *
 * A spinner or a "Loading…" line says something is happening; these say what is
 * about to be there, positioned where it will land, so nothing shifts on
 * arrival. They ride on the existing `flipdPulse` keyframes rather than
 * introducing a second animation.
 *
 * Use for page loads. Action feedback — an upload's progress, a form saving —
 * keeps its own affordance, because there is no incoming content for a
 * placeholder to stand in for.
 */

const PULSE = 'flipdPulse 1.4s ease-in-out infinite';

export function Bar({
  w,
  h,
  r = 6,
  style,
}: {
  w?: number | string;
  h: number;
  r?: number | string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={{
        width: w ?? '100%',
        height: h,
        borderRadius: r,
        background: 'var(--surface)',
        animation: PULSE,
        ...style,
      }}
    />
  );
}

export function CardSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <Bar h={0} r="var(--r-img)" style={{ aspectRatio: '1 / 1', height: 'auto' }} />
      <Bar w="80%" h={13} r={5} />
      <Bar w="45%" h={12} r={5} />
    </div>
  );
}

export function FeedSkeleton() {
  return (
    <div style={{ padding: '32px 32px 64px', maxWidth: 1280, margin: '0 auto' }}>
      <Bar w={260} h={30} r={8} style={{ marginBottom: 28 }} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 20 }}>
        {Array.from({ length: 10 }).map((_, i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

/** Photo beside the details, matching the listing page's two-column layout. */
export function ListingDetailSkeleton() {
  return (
    <div style={{ maxWidth: 1040, margin: '0 auto', padding: '40px 24px' }}>
      <Bar w={90} h={14} style={{ marginBottom: 28 }} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 32 }}>
        <Bar h={0} r="var(--r-img)" style={{ aspectRatio: '1 / 1', height: 'auto' }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Bar w="75%" h={28} />
          <Bar w="30%" h={22} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginTop: 10 }}>
            <Bar h={12} />
            <Bar w="92%" h={12} />
            <Bar w="60%" h={12} />
          </div>
          <Bar h={46} r={12} style={{ marginTop: 18 }} />
        </div>
      </div>
    </div>
  );
}

/** Avatar, name, meta, then the listings grid — the public profile shape. */
export function ProfileSkeleton() {
  return (
    <div style={{ maxWidth: 1040, margin: '0 auto', padding: '40px 24px' }}>
      <Bar w={90} h={14} style={{ marginBottom: 28 }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginBottom: 32 }}>
        <Bar w={72} h={72} r="50%" />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
          <Bar w={200} h={20} />
          <Bar w={130} h={13} />
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 20 }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

/** Alternating bubbles, so a thread reads as a conversation before it loads. */
export function ConversationSkeleton() {
  const rows: { mine: boolean; w: string; h: number }[] = [
    { mine: false, w: '46%', h: 38 },
    { mine: true, w: '34%', h: 38 },
    { mine: false, w: '54%', h: 56 },
    { mine: true, w: '40%', h: 38 },
    { mine: false, w: '30%', h: 38 },
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '28px 24px' }}>
      {rows.map((r, i) => (
        <div key={i} style={{ display: 'flex', justifyContent: r.mine ? 'flex-end' : 'flex-start' }}>
          <Bar w={r.w} h={r.h} r={14} />
        </div>
      ))}
    </div>
  );
}

/** Stacked rows for the list views (requests, message threads). */
export function ListRowsSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div style={{ padding: '28px 24px', display: 'flex', flexDirection: 'column', gap: 18 }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <Bar w={48} h={48} r={10} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
            <Bar w="55%" h={14} />
            <Bar w="32%" h={12} />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Title then labelled field rows, for the edit forms. */
export function FormSkeleton({ fields = 5 }: { fields?: number }) {
  return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: '40px 24px' }}>
      <Bar w={220} h={28} style={{ marginBottom: 32 }} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
        {Array.from({ length: fields }).map((_, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            <Bar w={120} h={12} />
            <Bar h={44} r={10} />
          </div>
        ))}
      </div>
    </div>
  );
}
