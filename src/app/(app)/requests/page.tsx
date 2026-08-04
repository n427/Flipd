'use client';

// Seller inbox: incoming reveal requests grouped by listing. Approve reveals
// your stored contact method to that buyer; decline closes just their request.
import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Avatar, Button, BackLink } from '@/components/ui';
import { RequestTimeline, RatingModal } from '@/components/WebApp';
import { SafetyCard, type SafetyReview } from '@/components/SafetyCard';
import { useStore } from '@/lib/store-context';
import { timeLeftLabel, swapCountLabel } from '@/lib/validation';
import type { ActivityItem } from '@/lib/types';

// Offered when declining. Optional — declining stays a single tap — but a
// reason keeps the loop useful for the buyer without feeling punitive.
const DECLINE_REASONS = [
  { id: 'bad_timing', label: 'Bad timing' },
  { id: 'already_sold', label: 'Already sold' },
  { id: 'not_enough_info', label: 'Not enough info' },
] as const;

// Trust signals for the seller's decision. Swap counts read more honestly than
// a star average early on, so the rating never appears on its own.
function TrustLine({ userId }: { userId: string }) {
  const [swaps, setSwaps] = React.useState<{ asBuyer: number; asSeller: number } | null>(null);
  const [rating, setRating] = React.useState<{ average: number | null; count: number } | null>(null);
  React.useEffect(() => {
    let alive = true;
    fetch(`/api/users/${userId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!alive || !d) return;
        setSwaps(d.swaps ?? { asBuyer: 0, asSeller: 0 });
        setRating(d.ratings ?? null);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [userId]);
  if (!swaps) return null;
  const label = swapCountLabel(swaps.asBuyer, swaps.asSeller);
  const isNew = swaps.asBuyer + swaps.asSeller === 0;
  return (
    <div className="t-meta" style={{ fontSize: 12.5, marginTop: 3, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <span style={{ fontWeight: 600, color: isNew ? 'var(--muted)' : 'var(--ink)' }}>{label}</span>
      {rating && rating.count > 0 && rating.average != null && (
        <span>· {rating.average.toFixed(1)} from {rating.count} rating{rating.count === 1 ? '' : 's'}</span>
      )}
    </div>
  );
}

// The counterparty on an incoming request is the buyer.
function BuyerReview({ userId }: { userId: string }) {
  const [review, setReview] = React.useState<SafetyReview | null>(null);
  const [loading, setLoading] = React.useState(true);
  React.useEffect(() => {
    let alive = true;
    fetch(`/api/safety?user=${userId}&role=buyer`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive) { setReview(d?.review ?? null); setLoading(false); } })
      .catch(() => { if (alive) { setReview(null); setLoading(false); } });
    return () => { alive = false; };
  }, [userId]);
  return <div style={{ marginTop: 8 }}><SafetyCard review={review} loading={loading} /></div>;
}

export default function RequestsPage() {
  const router = useRouter();
  const store = useStore();
  const [confirmSold, setConfirmSold] = React.useState<ActivityItem | null>(null);
  const [declining, setDeclining] = React.useState<ActivityItem | null>(null);
  const [rating, setRating] = React.useState<ActivityItem | null>(null);

  const incoming = store.activity.filter((a) => a.dir === 'in');
  // Requests you sent. Mobile shows these in a second section; on web they had
  // nowhere to live, so a buyer could not see what they had asked for.
  const outgoing = store.activity.filter((a) => a.dir === 'out');
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
      <BackLink />
      <h1 style={{ fontWeight: 800, fontSize: 26, letterSpacing: '-0.03em', color: 'var(--ink)', margin: '0 0 4px' }}>
        Requests
      </h1>
      <p style={{ fontSize: 14, color: 'var(--muted)', margin: '0 0 28px' }}>
        Requests you have received and sent. Approving opens a chat here in Flipd.
      </p>

      {byListing.size > 0 && (
        <h2 style={{ fontWeight: 800, fontSize: 16, letterSpacing: '-0.02em', color: 'var(--ink)', margin: '0 0 14px' }}>
          People who want to talk
        </h2>
      )}

      {byListing.size === 0 && outgoing.length === 0 && (
        <div style={{ padding: '70px 0', textAlign: 'center' }}>
          <div className="t-h3" style={{ color: 'var(--ink)' }}>No requests yet</div>
          <div className="t-meta" style={{ fontSize: 12.5, marginTop: 6 }}>
            When you request contact on a listing, or someone requests yours, it shows up here.
          </div>
        </div>
      )}

      {[...byListing.entries()].map(([listingId, requests]) => (
        <div key={listingId} style={{ marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 10 }}>
            <Link href={`/listing/${listingId}?from=requests`} style={{ fontWeight: 700, fontSize: 15.5, color: 'var(--ink)', textDecoration: 'none', letterSpacing: '-0.01em' }}>
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
                  <TrustLine userId={a.counterpartId ?? ''} />
                  {/* AI review of the buyer, at the moment of deciding.
                      Advisory: it renders nothing if the fetch fails. */}
                  {a.status === 'PENDING' && a.counterpartId && (
                    <BuyerReview userId={a.counterpartId} />
                  )}
                  {/* The buyer's own words: the single biggest input to this
                      decision, and for services the only way to know what is
                      actually being asked for. */}
                  {a.introMessage && (
                    <div style={{ marginTop: 8, padding: '10px 12px', background: 'var(--surface)', borderRadius: 10, fontSize: 13.5, lineHeight: 1.5, color: 'var(--ink-2)' }}>
                      {a.introMessage}
                    </div>
                  )}
                  <RequestTimeline status={a.status} />
                  {(a.status === 'APPROVED' || a.status === 'COMPLETED') && a.threadId && (
                    <div style={{ marginTop: 8 }}>
                      <Link
                        href={`/messages/${a.threadId}`}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--surface)', borderRadius: 6, padding: '6px 10px', fontWeight: 600, fontSize: 12.5, color: 'var(--ink)', textDecoration: 'none' }}
                      >
                        Open chat
                      </Link>
                    </div>
                  )}
                </div>
                {a.status === 'PENDING' ? (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Button kind="primary" size="sm" onClick={() => approve(a)}>Approve</Button>
                    <Button kind="ghost" size="sm" onClick={() => setDeclining(a)}>Decline</Button>
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

      {outgoing.length > 0 && (
        <div style={{ marginTop: byListing.size > 0 ? 36 : 0 }}>
          <h2 style={{ fontWeight: 800, fontSize: 16, letterSpacing: '-0.02em', color: 'var(--ink)', margin: '0 0 14px' }}>
            Requests you sent
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {outgoing.map((a) => (
              <div
                key={a.id}
                style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 18px', border: '1px solid var(--rule)', borderRadius: 14, background: '#fff' }}
              >
                <Avatar name={a.who} src={a.avatarUrl} size={44} tone="cream" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Link
                    href={`/listing/${a.listingId}?from=requests`}
                    style={{ fontWeight: 600, fontSize: 14.5, color: 'var(--ink)', textDecoration: 'none' }}
                  >
                    {a.listingTitle || 'A listing'}
                  </Link>
                  <div className="t-meta" style={{ fontSize: 12.5, marginTop: 1 }}>
                    {a.who} · asked {a.when} ago
                    {a.offer != null && ` · offered $${a.offer.toLocaleString('en-US')}`}
                  </div>
                  <RequestTimeline status={a.status} />
                  {a.declineReason && (
                    <div className="t-meta" style={{ fontSize: 12.5, marginTop: 6 }}>
                      Reason: {a.declineReason}
                    </div>
                  )}
                  {(a.status === 'APPROVED' || a.status === 'COMPLETED') && a.threadId && (
                    <div style={{ marginTop: 8 }}>
                      <Link
                        href={`/messages/${a.threadId}`}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--surface)', borderRadius: 6, padding: '6px 10px', fontWeight: 600, fontSize: 12.5, color: 'var(--ink)', textDecoration: 'none' }}
                      >
                        Open chat
                      </Link>
                    </div>
                  )}
                </div>
                {a.status === 'COMPLETED' && a.canRate ? (
                  <Button kind="secondary" size="sm" onClick={() => setRating(a)}>
                    Rate {a.who.split(' ')[0]}
                  </Button>
                ) : (
                  <span style={{ fontFamily: 'var(--sans)', fontWeight: 700, fontSize: 10.5, letterSpacing: '0.07em', color: a.status === 'COMPLETED' ? 'var(--ink)' : 'var(--muted)' }}>
                    {a.status}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

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

      {declining && (
        <div onClick={() => setDeclining(null)} style={{ position: 'fixed', inset: 0, zIndex: 55, background: 'rgba(17,17,17,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, padding: 28, width: 400, boxShadow: 'var(--shadow-strong)' }}>
            <h2 style={{ fontWeight: 800, fontSize: 19, letterSpacing: '-0.02em', color: 'var(--ink)', margin: '0 0 8px' }}>
              Decline {declining.who.split(' ')[0]}?
            </h2>
            <p style={{ fontSize: 13.5, lineHeight: 1.55, color: 'var(--ink-2)', margin: '0 0 18px' }}>
              Adding a reason is optional, and it helps them know whether to try again.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18 }}>
              {DECLINE_REASONS.map((r) => (
                <button
                  key={r.id}
                  onClick={async () => {
                    await store.respondReveal(declining.id, 'decline', { declineReason: r.id });
                    setDeclining(null);
                  }}
                  style={{ textAlign: 'left', border: '1.5px solid var(--rule)', borderRadius: 12, padding: '12px 14px', background: '#fff', fontSize: 14, fontWeight: 600, color: 'var(--ink)', cursor: 'pointer' }}
                >
                  {r.label}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <Button kind="ghost" onClick={() => setDeclining(null)} style={{ flex: 1 }}>Cancel</Button>
              <Button
                kind="secondary"
                style={{ flex: 1 }}
                onClick={async () => {
                  await store.respondReveal(declining.id, 'decline');
                  setDeclining(null);
                }}
              >
                Decline without a reason
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
