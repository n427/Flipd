'use client';

// Seller inbox: incoming reveal requests grouped by listing. Approve reveals
// your stored contact method to that buyer; decline closes just their request.
import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Avatar, Button } from '@/components/ui';
import { RequestTimeline, RatingModal } from '@/components/WebApp';
import { useStore } from '@/lib/store-context';
import { timeLeftLabel } from '@/lib/validation';
import type { ActivityItem } from '@/lib/types';

export default function RequestsPage() {
  const router = useRouter();
  const store = useStore();
  const [confirmSold, setConfirmSold] = React.useState<ActivityItem | null>(null);
  const [rating, setRating] = React.useState<ActivityItem | null>(null);

  const incoming = store.activity.filter((a) => a.dir === 'in');
  const byListing = new Map<string, ActivityItem[]>();
  for (const a of incoming) {
    byListing.set(a.listingId, [...(byListing.get(a.listingId) ?? []), a]);
  }

  const approve = async (a: ActivityItem) => {
    const listing = store.listings.find((l) => l.id === a.listingId);
    const singleItem = listing?.category === 'goods';
    await store.respondReveal(a.id, 'approve');
    if (singleItem) setConfirmSold(a);
  };

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '36px 24px 80px' }}>
      <h1 style={{ fontWeight: 800, fontSize: 26, letterSpacing: '-0.03em', color: 'var(--ink)', margin: '0 0 4px' }}>
        Requests
      </h1>
      <p style={{ fontSize: 14, color: 'var(--muted)', margin: '0 0 28px' }}>
        Buyers who asked for your contact. Approving shares the contact method from your profile with that buyer.
      </p>

      {byListing.size === 0 && (
        <div style={{ padding: '70px 0', textAlign: 'center' }}>
          <div className="t-h3" style={{ color: 'var(--ink)' }}>No requests yet</div>
          <div className="t-meta" style={{ fontSize: 12.5, marginTop: 6 }}>
            When someone taps Reveal Contact on one of your listings, they show up here.
          </div>
        </div>
      )}

      {[...byListing.entries()].map(([listingId, requests]) => (
        <div key={listingId} style={{ marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 10 }}>
            <Link href={`/listing/${listingId}`} style={{ fontWeight: 700, fontSize: 15.5, color: 'var(--ink)', textDecoration: 'none', letterSpacing: '-0.01em' }}>
              {requests[0].listingTitle}
            </Link>
            {requests.some((r) => r.status === 'PENDING') && (
              <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--accent)' }}>
                {requests.filter((r) => r.status === 'PENDING').length} pending
              </span>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {requests.map((a) => (
              <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 18px', border: '1px solid var(--rule)', borderRadius: 14, background: '#fff' }}>
                <Avatar name={a.who} src={a.avatarUrl} size={44} tone="cream" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <span style={{ fontWeight: 600, fontSize: 14.5, color: 'var(--ink)' }}>{a.who}</span>
                    {a.offer != null && (
                      <span style={{ fontFamily: 'var(--sans)', fontWeight: 700, fontSize: 12.5, color: 'var(--accent)' }}>
                        offers ${a.offer.toLocaleString('en-US')}
                      </span>
                    )}
                  </div>
                  <div className="t-meta" style={{ fontSize: 12.5, marginTop: 1 }}>
                    {a.school || 'USC'} · asked {a.when} ago
                    {a.status === 'PENDING' && timeLeftLabel(a.expiresAt) && (
                      <span style={{ color: 'var(--accent)', fontWeight: 600 }}> · {timeLeftLabel(a.expiresAt)}</span>
                    )}
                  </div>
                  <RequestTimeline status={a.status} />
                </div>
                {a.status === 'PENDING' ? (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Button kind="primary" size="sm" onClick={() => approve(a)}>Approve</Button>
                    <Button kind="ghost" size="sm" onClick={() => store.respondReveal(a.id, 'decline')}>Decline</Button>
                  </div>
                ) : a.status === 'APPROVED' ? (
                  <Button kind="secondary" size="sm" onClick={() => store.respondReveal(a.id, 'complete')}>Mark completed</Button>
                ) : a.status === 'COMPLETED' && a.canRate ? (
                  <Button kind="secondary" size="sm" onClick={() => setRating(a)}>Rate {a.who.split(' ')[0]}</Button>
                ) : (
                  <span style={{ fontFamily: 'var(--sans)', fontWeight: 700, fontSize: 10.5, letterSpacing: '0.07em', color: a.status === 'COMPLETED' ? 'var(--ink)' : 'var(--muted)' }}>
                    {a.status}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}

      {confirmSold && (
        <div onClick={() => setConfirmSold(null)} style={{ position: 'fixed', inset: 0, zIndex: 55, background: 'rgba(17,17,17,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, padding: 28, width: 400, boxShadow: 'var(--shadow-strong)' }}>
            <h2 style={{ fontWeight: 800, fontSize: 19, letterSpacing: '-0.02em', color: 'var(--ink)', margin: '0 0 8px' }}>
              Mark as sold?
            </h2>
            <p style={{ fontFamily: 'var(--sans)', fontSize: 13.5, lineHeight: 1.55, color: 'var(--ink-2)', margin: '0 0 20px' }}>
              You approved {confirmSold.who.split(' ')[0]}. If this item is spoken for, we&rsquo;ll move the listing to your past listings and let other pending requesters know it&rsquo;s no longer available.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <Button kind="ghost" onClick={() => setConfirmSold(null)} style={{ flex: 1 }}>Keep it listed</Button>
              <Button
                kind="primary"
                style={{ flex: 1 }}
                onClick={async () => {
                  await store.respondReveal(confirmSold.id, 'approve', { markSold: true });
                  setConfirmSold(null);
                  router.refresh();
                }}
              >
                Mark as sold
              </Button>
            </div>
          </div>
        </div>
      )}

      {rating && (
        <RatingModal
          whom={rating.who.split(' ')[0]}
          onClose={() => setRating(null)}
          onSubmit={(score, text) => store.rateTransaction(rating.id, score, text)}
        />
      )}
    </div>
  );
}
