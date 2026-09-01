'use client';
import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/Icon';
import { Button } from '@/components/ui';
import { Avatar } from '@/components/ui';
import { SafetyCard, type SafetyReview } from '@/components/SafetyCard';
import { WantedOfferForm } from '@/components/WantedOfferForm';
import { WantedDetailSkeleton, WantedOfferSkeleton } from '@/components/WantedSkeletons';
import { wantedClient, type WantedBuyerSummary } from '@/lib/wanted-client';
import { wantedCardCopy } from '@/lib/wanted-presentation';
import type { WantedPostDTO } from '@/lib/types';
import type { WantedOfferDTO } from '@/lib/wanted-offers';
import { repostAvailability } from '@/lib/repost';

export default function WantedDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = React.use(params); const router = useRouter();
  const [post, setPost] = React.useState<WantedPostDTO | null>(null); const [owner, setOwner] = React.useState(false);
  const [buyer, setBuyer] = React.useState<WantedBuyerSummary | null>(null); const [safety, setSafety] = React.useState<SafetyReview | null>(null);
  const [offers, setOffers] = React.useState<WantedOfferDTO[]>([]); const [showOffer, setShowOffer] = React.useState(false);
  const [offerState, setOfferState] = React.useState<'loading' | 'ready' | 'error'>('loading');
  const [loading, setLoading] = React.useState(true); const [error, setError] = React.useState('');
  const [reposting, setReposting] = React.useState(false);
  const [lightbox, setLightbox] = React.useState<number | null>(null);
  React.useEffect(() => { let alive = true; wantedClient.getPost(id).then(async (result) => { if (!alive) return; setPost(result.wanted_post); setOwner(Boolean(result.management)); setBuyer(result.buyer ?? null); if (result.buyer) fetch(`/api/safety?user=${result.buyer.id}&role=buyer`).then((response) => response.ok ? response.json() : null).then((body) => { if (alive) setSafety(body?.review ?? null); }).catch(() => {}); try { const response = await wantedClient.offersForPost(id); if (alive) { setOffers(response.wanted_offers); setOfferState('ready'); } } catch { if (alive) setOfferState('error'); } }).catch((cause) => setError(cause instanceof Error ? cause.message : 'Request not found.')).finally(() => setLoading(false)); return () => { alive = false; }; }, [id]);
  React.useEffect(() => {
    if (lightbox === null || !post) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setLightbox(null);
      if (event.key === 'ArrowRight') setLightbox((current) => current === null ? current : (current + 1) % post.photo_urls.length);
      if (event.key === 'ArrowLeft') setLightbox((current) => current === null ? current : (current - 1 + post.photo_urls.length) % post.photo_urls.length);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [lightbox, post]);
  if (loading) return <WantedDetailSkeleton />;
  if (!post) return <div className="wanted-state"><h2>Request not found</h2><p>{error}</p></div>;
  const copy = wantedCardCopy(post); const myOffer = !owner ? offers[0] : undefined;
  const repost = repostAvailability({ active: post.status === 'active', postedAt: post.created_at });
  return (
    <main className="wanted-detail">
      <Link href="/wanted" className="wanted-back"><Icon name="chevronLeft" size={14} /> Back to Wanted</Link>
      <div className="wanted-detail__layout"><section>
        <div className={`wanted-detail__gallery ${post.photo_urls.length > 1 ? 'has-thumbs' : ''}`}>
          {post.photo_urls[0] ? <button type="button" className="wanted-detail__cover" onClick={() => setLightbox(0)} aria-label={`View photo for ${post.title}`}><img src={post.photo_urls[0]} alt="" /><span>1 / {post.photo_urls.length}</span></button> : <div className="wanted-detail__cover wanted-detail__cover--empty">WANTED</div>}
          {post.photo_urls.length > 1 && <div className="wanted-detail__thumbs">{post.photo_urls.slice(1).map((url, index) => <button type="button" key={url} onClick={() => setLightbox(index + 1)} aria-label={`View reference photo ${index + 2}`}><img src={url} alt="" /></button>)}</div>}
        </div>
        <div className="wanted-detail__meta"><span>{post.category}</span><span>posted {new Date(post.created_at).toLocaleDateString()}</span></div>
        <h1>{post.title}</h1>
        <div className="wanted-detail__location"><Icon name="mapPin" size={15} /> {post.location}</div>
        <div className="wanted-detail__description"><h2>What they need</h2><p>{post.description}</p></div>
        {buyer && <div className="wanted-buyer"><Link href={`/u/${buyer.id}`}><Avatar name={buyer.display_name ?? 'Flipd member'} src={buyer.avatar_url ?? undefined} size={44} /></Link><div><strong><Link href={`/u/${buyer.id}`}>{buyer.display_name ?? 'Flipd member'}</Link> is looking for this</strong>{buyer.handle && <span>@{buyer.handle}</span>}</div></div>}
        {buyer && <SafetyCard review={safety} loading={false} compact />}
      </section><aside>
        <div className="wanted-detail__summary"><strong>{copy.budget}</strong><span>{copy.deadline}</span><span>{copy.offers}</span></div>
        {owner ? <div className="wanted-action-card"><h2>Manage your request</h2><Link href={`/wanted/${id}/edit`} className="btn btn-primary">Edit request</Link><Button kind="outline" disabled={!repost.allowed || reposting} onClick={async () => { setReposting(true); setError(''); try { await wantedClient.repostPost(id); router.push('/wanted'); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not repost.'); } finally { setReposting(false); } }}>{reposting ? 'Reposting…' : 'Repost request'}</Button>{!repost.allowed && repost.availableAt && <p>Available {new Date(repost.availableAt).toLocaleDateString()}</p>}{error && <p role="alert">{error}</p>}<Button kind="outline" onClick={async () => { if (!window.confirm('Delete this Wanted post? Pending offers will be declined.')) return; await wantedClient.deletePost(id); router.push('/wanted'); }}>Delete request</Button><Link href="/requests?tab=wanted&direction=received">Review private offers</Link></div>
          : post.status !== 'active' ? <div className="wanted-action-card"><h2>This request is closed</h2><p>It is no longer accepting offers.</p></div>
            : offerState === 'loading' ? <WantedOfferSkeleton />
              : offerState === 'error' ? <div className="wanted-action-card"><h2>Could not check your offers</h2><p>Refresh before making another offer.</p></div>
            : myOffer && !showOffer ? <div className="wanted-action-card"><h2>Your offer</h2><strong>${myOffer.price.toLocaleString('en-US')}</strong><p>Status: {myOffer.status}</p>{myOffer.status === 'pending' && <><Button onClick={() => setShowOffer(true)}>Edit offer</Button><Button kind="outline" onClick={async () => { const result = await wantedClient.resolveOffer(myOffer.id, 'withdraw'); setOffers([result.wanted_offer]); }}>Withdraw</Button></>}{myOffer.status === 'withdrawn' && <Button onClick={() => setShowOffer(true)}>Send another offer</Button>}</div>
              : showOffer ? <WantedOfferForm postId={id} initial={myOffer} onCancel={() => setShowOffer(false)} onSaved={(offer) => { setOffers([offer]); setShowOffer(false); }} />
                : <div className="wanted-action-card"><h2>Have a match?</h2><p>Your photos and message stay private between you and the buyer.</p><Button onClick={() => setShowOffer(true)}>Make an offer</Button></div>}
      </aside></div>
      {lightbox !== null && post.photo_urls[lightbox] && <div className="wanted-lightbox" onClick={() => setLightbox(null)}>
        <button type="button" className="wanted-lightbox__close" onClick={() => setLightbox(null)} aria-label="Close photos"><Icon name="x" size={16} /></button>
        {post.photo_urls.length > 1 && <button type="button" className="wanted-lightbox__previous" onClick={(event) => { event.stopPropagation(); setLightbox((lightbox - 1 + post.photo_urls.length) % post.photo_urls.length); }} aria-label="Previous photo"><Icon name="chevronLeft" size={20} /></button>}
        <img src={post.photo_urls[lightbox]} alt={post.title} onClick={(event) => event.stopPropagation()} />
        {post.photo_urls.length > 1 && <button type="button" className="wanted-lightbox__next" onClick={(event) => { event.stopPropagation(); setLightbox((lightbox + 1) % post.photo_urls.length); }} aria-label="Next photo"><Icon name="chevronRight" size={20} /></button>}
        <span>{lightbox + 1} / {post.photo_urls.length}</span>
      </div>}
    </main>
  );
}
