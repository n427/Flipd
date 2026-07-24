'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { Avatar, ListingCard, Pill } from '@/components/ui';
import { Stars } from '@/components/WebApp';
import { formatPostedDate, mapDbListing } from '@/lib/store';
import type { Listing } from '@/lib/types';

type PublicProfile = {
  id: string;
  display_name: string | null;
  handle: string | null;
  school_unit: string | null;
  class_year: string | null;
  bio: string | null;
  avatar_url: string | null;
  is_demo: boolean;
  created_at: string;
};
// Ratings are anonymous — the rater is deliberately not carried here.
type Review = { score: number; text: string | null; created_at: string };

export default function PublicProfilePage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [tab, setTab] = React.useState<'listings' | 'reviews'>('listings');
  const [data, setData] = React.useState<{
    profile: PublicProfile;
    listings: Listing[];
    ratings: { average: number | null; count: number; reviews: Review[] };
  } | null>(null);
  const [notFound, setNotFound] = React.useState(false);

  React.useEffect(() => {
    fetch(`/api/users/${params.id}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('not found'))))
      // The API returns raw DB rows; ListingCard needs mapped Listings.
      .then((d) => setData({ ...d, listings: (d.listings ?? []).map((r: never) => mapDbListing(r, null)) }))
      .catch(() => setNotFound(true));
  }, [params.id]);

  if (notFound) {
    return (
      <div style={{ maxWidth: 1040, margin: '0 auto', padding: '40px 24px' }}>
        <div style={{ fontFamily: 'var(--sans)', fontSize: 15, color: 'var(--muted)' }}>This profile isn’t available.</div>
      </div>
    );
  }
  if (!data) return <div style={{ maxWidth: 1040, margin: '0 auto', padding: '40px 24px' }} />;

  const { profile, listings, ratings } = data;
  const name = profile.display_name ?? 'Flipd member';
  const meta = [profile.school_unit, profile.class_year].filter(Boolean).join(' · ');

  return (
    <div style={{ maxWidth: 1040, margin: '0 auto', padding: '40px 24px' }}>
      <button
        onClick={() => router.back()}
        style={{ background: 'none', border: 0, padding: 0, marginBottom: 28, fontFamily: 'var(--sans)', fontSize: 14, color: 'var(--muted)', cursor: 'pointer' }}
      >
        ‹ Back
      </button>

      <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
        <Avatar name={name} src={profile.avatar_url ?? undefined} size={76} tone="ink" />
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h1 style={{ fontWeight: 800, fontSize: 28, letterSpacing: '-0.03em', color: 'var(--ink)', margin: 0 }}>{name}</h1>
            {profile.is_demo && <Pill kind="verified">FLIPD TEAM</Pill>}
          </div>
          <div className="t-meta" style={{ fontSize: 13.5, marginTop: 4 }}>
            {[meta, `joined ${formatPostedDate(profile.created_at)}`].filter(Boolean).join(' · ')}
          </div>
          {ratings.count > 0 && ratings.average != null && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 6 }}>
              <Stars score={ratings.average} size={14} />
              <span style={{ fontFamily: 'var(--sans)', fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{ratings.average.toFixed(1)}</span>
              <span className="t-meta" style={{ fontSize: 12.5 }}>· {ratings.count} rating{ratings.count === 1 ? '' : 's'}</span>
            </div>
          )}
        </div>
      </div>

      {profile.bio && (
        <p style={{ fontFamily: 'var(--sans)', fontSize: 14, lineHeight: 1.55, color: 'var(--ink-2)', maxWidth: 640, margin: '18px 0 0' }}>
          {profile.bio}
        </p>
      )}

      <div style={{ display: 'flex', gap: 26, borderBottom: '1px solid var(--rule)', margin: '28px 0 24px' }}>
        {([
          { id: 'listings', label: 'Listings', count: listings.length || null },
          { id: 'reviews', label: 'Reviews', count: ratings.count || null },
        ] as const).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              background: 'none', border: 0, padding: '0 0 12px', cursor: 'pointer',
              fontFamily: 'var(--sans)', fontSize: 14.5,
              fontWeight: tab === t.id ? 700 : 500,
              color: tab === t.id ? 'var(--ink)' : 'var(--muted)',
              borderBottom: '2px solid ' + (tab === t.id ? 'var(--ink)' : 'transparent'),
              marginBottom: -1, display: 'flex', alignItems: 'center', gap: 7,
            }}
          >
            {t.label}
            {t.count != null && (
              <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--muted)', background: 'var(--surface)', borderRadius: 999, padding: '2px 7px' }}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === 'listings' && (
        listings.length === 0 ? (
          <div style={{ fontFamily: 'var(--sans)', fontSize: 14, color: 'var(--muted)', padding: '32px 0' }}>
            No active listings right now.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 22 }}>
            {listings.map((l) => (
              <ListingCard key={l.id} listing={l} href={`/listing/${l.id}`} />
            ))}
          </div>
        )
      )}

      {tab === 'reviews' && (
        ratings.reviews.length === 0 ? (
          <div style={{ fontFamily: 'var(--sans)', fontSize: 14, color: 'var(--muted)', padding: '32px 0' }}>
            No reviews yet.
          </div>
        ) : (
          <div style={{ maxWidth: 640, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {ratings.reviews.map((rev, i) => (
              <div key={i} style={{ border: '1px solid var(--rule)', borderRadius: 14, padding: '16px 18px', background: '#fff' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Stars score={rev.score} size={14} />
                  <span className="t-meta" style={{ fontSize: 12 }}>{formatPostedDate(rev.created_at)}</span>
                </div>
                {rev.text && (
                  <div style={{ fontFamily: 'var(--sans)', fontSize: 13.5, color: 'var(--ink-2)', marginTop: 8, lineHeight: 1.5 }}>{rev.text}</div>
                )}
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}
