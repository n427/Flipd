import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/supabase/authAny';
import { admin } from '@/lib/supabase/admin';
import { canonicalizeWantedOfferId, wantedOfferRpcErrorStatus } from '@/lib/wanted-offers';
import { blockedUserIdsFromLookup } from '@/lib/wanted';
import { effectiveWantedStatus } from '@/lib/wanted-contract';
import { wantedPermissions } from '@/lib/wanted-authorization';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getRequestUser(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id: rawId } = await params;
  const id = canonicalizeWantedOfferId(rawId);
  if (!id) return NextResponse.json({ error: 'not found' }, { status: 404 });

  // Scope the first read to the buyer so a stranger cannot distinguish an
  // existing private offer from a random UUID.
  const { data: offer, error: offerError } = await admin.from('wanted_offers')
    .select('buyer_id,seller_id,status,completed_at,wanted_post_id')
    .eq('id', id).eq('buyer_id', user.id).maybeSingle();
  if (offerError || !offer) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const [{ data: post, error: postError }, { data: blocks, error: blockError }] = await Promise.all([
    admin.from('wanted_posts').select('status,needed_by').eq('id', offer.wanted_post_id).maybeSingle(),
    admin.from('blocks').select('blocker_id,blocked_id')
      .or(`and(blocker_id.eq.${user.id},blocked_id.eq.${offer.seller_id}),and(blocker_id.eq.${offer.seller_id},blocked_id.eq.${user.id})`),
  ]);
  const blockLookup = blockedUserIdsFromLookup(user.id, { data: blocks, error: blockError });
  if (postError || !post || !blockLookup.ok) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const permissions = wantedPermissions({
    actor: 'owner',
    postStatus: effectiveWantedStatus(post.status, post.needed_by),
    offerStatus: offer.status,
    blocked: blockLookup.value.has(offer.seller_id),
    offerCompleted: Boolean(offer.completed_at),
    competingAccepted: offer.status === 'declined' && post.status === 'fulfilled',
  });
  if (!permissions.accept) return NextResponse.json({ error: 'wanted offer is no longer available' }, { status: 409 });

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
  return NextResponse.json({ thread_id: threadId });
}
