'use client';
import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui';
import { Avatar } from '@/components/ui';
import { SafetyCard, type SafetyReview } from '@/components/SafetyCard';
import { WantedOfferForm } from '@/components/WantedOfferForm';
import { wantedClient, type WantedBuyerSummary } from '@/lib/wanted-client';
import { wantedCardCopy } from '@/lib/wanted-presentation';
import type { WantedPostDTO } from '@/lib/types';
import type { WantedOfferDTO } from '@/lib/wanted-offers';

export default function WantedDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = React.use(params); const router = useRouter();
  const [post, setPost] = React.useState<WantedPostDTO | null>(null); const [owner, setOwner] = React.useState(false);
  const [buyer, setBuyer] = React.useState<WantedBuyerSummary | null>(null); const [safety, setSafety] = React.useState<SafetyReview | null>(null);
  const [offers, setOffers] = React.useState<WantedOfferDTO[]>([]); const [showOffer, setShowOffer] = React.useState(false);
  const [loading, setLoading] = React.useState(true); const [error, setError] = React.useState('');
  React.useEffect(() => { let alive = true; wantedClient.getPost(id).then(async (result) => { if (!alive) return; setPost(result.wanted_post); setOwner(Boolean(result.management)); setBuyer(result.buyer ?? null); if (result.buyer) fetch(`/api/safety?user=${result.buyer.id}&role=buyer`).then((response) => response.ok ? response.json() : null).then((body) => { if (alive) setSafety(body?.review ?? null); }).catch(() => {}); try { const response = await wantedClient.offersForPost(id); if (alive) setOffers(response.wanted_offers); } catch {} }).catch((cause) => setError(cause instanceof Error ? cause.message : 'Request not found.')).finally(() => setLoading(false)); return () => { alive = false; }; }, [id]);
  if (loading) return <div className="wanted-state">Loading request…</div>;
  if (!post) return <div className="wanted-state"><h2>Request not found</h2><p>{error}</p></div>;
  const copy = wantedCardCopy(post); const myOffer = !owner ? offers[0] : undefined;
  return (
    <main className="wanted-detail">
      <Link href="/wanted" className="wanted-back">← Back to Wanted</Link>
      <div className="wanted-detail__layout"><section>
        <div className="wanted-detail__meta"><span>{post.category}</span><span>{post.status}</span></div><h1>{post.title}</h1>
        <div className="wanted-detail__facts"><strong>{copy.budget}</strong><span>{post.location}</span><span>{copy.deadline}</span><span>{copy.offers}</span></div>
        {buyer && <div className="wanted-buyer"><Avatar name={buyer.display_name ?? 'Flipd member'} src={buyer.avatar_url ?? undefined} size={44} /><div><strong>{buyer.display_name ?? 'Flipd member'}</strong>{buyer.handle && <Link href={`/u/${buyer.id}`}>@{buyer.handle}</Link>}</div></div>}
        {buyer && <SafetyCard review={safety} loading={false} compact />}
        {post.photo_urls.length > 0 && <div className="wanted-detail__photos">{post.photo_urls.map((url, index) => <img key={url} src={url} alt={`Reference ${index + 1}`} />)}</div>}
        <div className="wanted-detail__description"><h2>What they need</h2><p>{post.description}</p></div>
        <div className="wanted-safety"><strong>Meet safely</strong><p>Keep personal details private until you are ready, meet in a public place, and report anything that feels wrong.</p></div>
      </section><aside>
        {owner ? <div className="wanted-action-card"><h2>Manage your request</h2><Link href={`/wanted/${id}/edit`} className="btn btn-primary">Edit request</Link><Button kind="outline" onClick={async () => { if (!window.confirm('Delete this Wanted post? Pending offers will be declined.')) return; await wantedClient.deletePost(id); router.push('/wanted'); }}>Delete request</Button><Link href="/requests?tab=wanted&direction=received">Review private offers</Link></div>
          : post.status !== 'active' ? <div className="wanted-action-card"><h2>This request is closed</h2><p>It is no longer accepting offers.</p></div>
            : myOffer && !showOffer ? <div className="wanted-action-card"><h2>Your offer</h2><strong>${myOffer.price.toLocaleString('en-US')}</strong><p>Status: {myOffer.status}</p>{myOffer.status === 'pending' && <><Button onClick={() => setShowOffer(true)}>Edit offer</Button><Button kind="outline" onClick={async () => { await wantedClient.resolveOffer(myOffer.id, 'withdraw'); setOffers([{ ...myOffer, status: 'withdrawn' }]); }}>Withdraw</Button></>}</div>
              : showOffer ? <WantedOfferForm postId={id} initial={myOffer} onCancel={() => setShowOffer(false)} onSaved={(offer) => { setOffers([offer]); setShowOffer(false); }} />
                : <div className="wanted-action-card"><h2>Have a match?</h2><p>Your photos and message stay private between you and the buyer.</p><Button onClick={() => setShowOffer(true)}>Make an offer</Button></div>}
      </aside></div>
    </main>
  );
}
