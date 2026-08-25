import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/supabase/authAny';
import { admin } from '@/lib/supabase/admin';
import { canonicalizeWantedOfferId, wantedOfferRpcErrorStatus } from '@/lib/wanted-offers';
import { persistWantedNotificationSafely, wantedNotificationKey } from '@/lib/notify';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getRequestUser(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id: rawId } = await params;
  const id = canonicalizeWantedOfferId(rawId);
  if (!id) return NextResponse.json({ error: 'not found' }, { status: 404 });

  // Capture the pending competitors before the serialized RPC closes them.
  // We only use this snapshot after the RPC proves the caller is the buyer.
  const { data: pendingOffer } = await admin
    .from('wanted_offers')
    .select('wanted_post_id,seller_id')
    .eq('id', id)
    .maybeSingle();
  const { data: pendingCompetitors } = pendingOffer
    ? await admin
      .from('wanted_offers')
      .select('id,seller_id')
      .eq('wanted_post_id', pendingOffer.wanted_post_id)
      .eq('status', 'pending')
      .neq('id', id)
    : { data: null };

  // The security-definer RPC locks the post, offer, and both profiles before
  // it rechecks participation, block state, and the effective deadline.
  const { data: threadId, error } = await admin.rpc('accept_wanted_offer', {
    target_offer_id: id,
    actor_id: user.id,
  });
  if (error || !threadId) {
    const status = wantedOfferRpcErrorStatus(error);
    const message = status === 404 ? 'not found'
      : status === 403 ? 'forbidden'
        : status === 409 ? 'wanted offer is no longer available'
          : 'unable to accept wanted offer';
    return NextResponse.json({ error: message }, { status });
  }

  const { data: accepted, error: acceptedLoadError } = await admin
    .from('wanted_offers')
    .select('id,wanted_post_id,seller_id,resolved_at')
    .eq('id', id)
    .eq('status', 'accepted')
    .single();
  if (acceptedLoadError) console.error('[notify] unable to reload accepted wanted offer', acceptedLoadError);
  const notificationOffer = accepted ?? (pendingOffer ? {
    id,
    wanted_post_id: pendingOffer.wanted_post_id,
    seller_id: pendingOffer.seller_id,
    resolved_at: null,
  } : null);
  if (notificationOffer) {
    const competitorIds = (pendingCompetitors ?? []).map((offer) => offer.id);
    const [{ data: post }, { data: closedCompetitors }] = await Promise.all([
      admin.from('wanted_posts').select('title').eq('id', notificationOffer.wanted_post_id).single(),
      competitorIds.length > 0 ? admin.from('wanted_offers')
        .select('id,seller_id')
        .eq('wanted_post_id', notificationOffer.wanted_post_id)
        .eq('status', 'declined')
        .in('id', competitorIds) : Promise.resolve({ data: [] }),
    ]);
    const title = post?.title ?? 'a wanted request';
    await persistWantedNotificationSafely({
      eventKey: wantedNotificationKey('accepted', notificationOffer.id),
      userId: notificationOffer.seller_id,
      eventType: 'accepted',
      wantedPostId: notificationOffer.wanted_post_id,
      wantedOfferId: notificationOffer.id,
      title: 'Offer accepted',
      body: `Your offer for “${title}” was accepted. Your chat is ready.`,
    });
    await Promise.all((closedCompetitors ?? []).map((offer) => persistWantedNotificationSafely({
      eventKey: wantedNotificationKey('declined', offer.id),
      userId: offer.seller_id,
      eventType: 'declined',
      wantedPostId: notificationOffer.wanted_post_id,
      wantedOfferId: offer.id,
      title: 'Offer closed',
      body: `Another offer for “${title}” was accepted.`,
    })));
  }
  return NextResponse.json({ thread_id: threadId });
}
