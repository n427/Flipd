import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/supabase/authAny';
import { admin } from '@/lib/supabase/admin';
import { blockedUserIdsFromLookup } from '@/lib/wanted';
import {
  canonicalizeWantedOfferId,
  hasWantedOfferPhotoPrefix,
  parseWantedOfferInput,
  signWantedOfferPhotos,
  toParticipantWantedOffer,
  wantedOfferSubmitRpcErrorStatus,
  type WantedOfferRow,
} from '@/lib/wanted-offers';
import { effectiveWantedStatus } from '@/lib/wanted-contract';
import { wantedPermissions } from '@/lib/wanted-authorization';

const OFFER_SELECT = 'id,wanted_post_id,buyer_id,seller_id,price,description,message,photo_paths,status,created_at,updated_at,resolved_at,completed_at';

async function usersAreBlocked(userId: string, otherUserId: string) {
  const { data, error } = await admin
    .from('blocks')
    .select('blocker_id,blocked_id')
    .or(`and(blocker_id.eq.${userId},blocked_id.eq.${otherUserId}),and(blocker_id.eq.${otherUserId},blocked_id.eq.${userId})`)
    .limit(1);
  const lookup = blockedUserIdsFromLookup(userId, { data, error });
  if (!lookup.ok) return lookup;
  return { ok: true as const, value: lookup.value.has(otherUserId) };
}

async function offerDto(row: WantedOfferRow, userId: string) {
  const photoPaths = row.photo_paths ?? [];
  if (!hasWantedOfferPhotoPrefix(photoPaths, row.seller_id, row.id)) {
    throw new Error('wanted offer has an invalid private photo path');
  }
  const photoUrls = await signWantedOfferPhotos(admin.storage, photoPaths);
  const dto = toParticipantWantedOffer(row, userId, photoUrls);
  if (!dto) throw new Error('offer participant authorization lost');
  return dto;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getRequestUser(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await params;

  const { data: post, error: postError } = await admin
    .from('wanted_posts')
    .select('id,buyer_id,status,needed_by')
    .eq('id', id)
    .single();
  if (postError || !post) return NextResponse.json({ error: 'not found' }, { status: 404 });

  let rows: WantedOfferRow[];
  if (post.buyer_id === user.id) {
    const { data, error } = await admin
      .from('wanted_offers')
      .select(OFFER_SELECT)
      .eq('wanted_post_id', id)
      .order('created_at', { ascending: false });
    if (error) return NextResponse.json({ error: 'unable to load wanted offers' }, { status: 500 });

    // A block must also prevent a buyer from getting newly signed URLs for a
    // seller's private media. Query failures deliberately fail closed.
    const { data: blocks, error: blockError } = await admin
      .from('blocks')
      .select('blocker_id,blocked_id')
      .or(`blocker_id.eq.${user.id},blocked_id.eq.${user.id}`);
    const blockLookup = blockedUserIdsFromLookup(user.id, { data: blocks, error: blockError });
    if (!blockLookup.ok) return NextResponse.json({ error: blockLookup.error }, { status: 500 });
    rows = ((data ?? []) as WantedOfferRow[]).filter((offer) => wantedPermissions({
      actor: 'owner', postStatus: effectiveWantedStatus(post.status, post.needed_by),
      offerStatus: offer.status, blocked: blockLookup.value.has(offer.seller_id),
      offerCompleted: Boolean(offer.completed_at), competingAccepted: offer.status === 'declined' && post.status === 'fulfilled',
    }).viewOffer);
  } else {
    const blockLookup = await usersAreBlocked(user.id, post.buyer_id);
    if (!blockLookup.ok) return NextResponse.json({ error: blockLookup.error }, { status: 500 });
    if (blockLookup.value) return NextResponse.json({ error: 'not found' }, { status: 404 });

    const { data, error } = await admin
      .from('wanted_offers')
      .select(OFFER_SELECT)
      .eq('wanted_post_id', id)
      .eq('seller_id', user.id)
      .maybeSingle();
    if (error) return NextResponse.json({ error: 'unable to load wanted offers' }, { status: 500 });
    if (!data) return NextResponse.json({ error: 'not found' }, { status: 404 });
    const offer = data as WantedOfferRow;
    const permissions = wantedPermissions({
      actor: 'seller', postStatus: effectiveWantedStatus(post.status, post.needed_by),
      offerStatus: offer.status, blocked: false, offerCompleted: Boolean(offer.completed_at),
      competingAccepted: offer.status === 'declined' && post.status === 'fulfilled',
    });
    if (!permissions.viewOffer) return NextResponse.json({ error: 'not found' }, { status: 404 });
    rows = [offer];
  }

  try {
    return NextResponse.json({ wanted_offers: await Promise.all(rows.map((row) => offerDto(row, user.id))) });
  } catch {
    return NextResponse.json({ error: 'unable to sign wanted offer photos' }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getRequestUser(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id: wantedPostId } = await params;
  const body = await req.json().catch(() => null);
  const parsed = parseWantedOfferInput(body);
  const offerId = body && typeof body === 'object' && !Array.isArray(body)
    ? canonicalizeWantedOfferId(body.id)
    : null;
  if (!parsed.ok || !offerId) {
    return NextResponse.json({ error: parsed.ok ? 'id must be a UUID' : parsed.error }, { status: 400 });
  }
  if (!hasWantedOfferPhotoPrefix(parsed.value.photo_paths, user.id, offerId)) {
    return NextResponse.json({ error: 'photo_paths must use the seller and offer ID prefix' }, { status: 400 });
  }

  const { data: post, error: postError } = await admin.from('wanted_posts')
    .select('buyer_id,status,needed_by').eq('id', wantedPostId).maybeSingle();
  if (postError || !post) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (post.buyer_id === user.id) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const [{ data: existing, error: existingError }, blockLookup] = await Promise.all([
    admin.from('wanted_offers').select('status,completed_at').eq('wanted_post_id', wantedPostId)
      .eq('seller_id', user.id).maybeSingle(),
    usersAreBlocked(user.id, post.buyer_id),
  ]);
  if (existingError || !blockLookup.ok) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (blockLookup.value) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const permissions = wantedPermissions({
    actor: existing ? 'seller' : 'stranger',
    postStatus: effectiveWantedStatus(post.status, post.needed_by),
    offerStatus: existing?.status ?? null,
    blocked: false,
    offerCompleted: Boolean(existing?.completed_at),
    competingAccepted: Boolean(existing?.status === 'declined' && post.status === 'fulfilled'),
  });
  if (!permissions.submit) return NextResponse.json({ error: 'wanted offer is no longer available' }, { status: 409 });

  const { data: savedOfferId, error } = await admin.rpc('submit_wanted_offer', {
    target_post_id: wantedPostId,
    actor_id: user.id,
    client_offer_id: offerId,
    offered_price: parsed.value.price,
    offered_description: parsed.value.description,
    offered_message: parsed.value.message,
    offered_photo_paths: parsed.value.photo_paths,
  });
  if (error || !savedOfferId) {
    const status = wantedOfferSubmitRpcErrorStatus(error);
    const message = status === 404 ? 'not found'
      : status === 403 ? 'forbidden'
        : status === 409 ? 'wanted offer is no longer available'
          : 'unable to save wanted offer';
    return NextResponse.json({ error: message }, { status });
  }
  const { data: saved, error: savedError } = await admin
    .from('wanted_offers')
    .select(OFFER_SELECT)
    .eq('id', savedOfferId)
    .eq('seller_id', user.id)
    .single();
  if (savedError || !saved) return NextResponse.json({ error: 'unable to load wanted offer' }, { status: 500 });

  try {
    return NextResponse.json({ wanted_offer: await offerDto(saved as WantedOfferRow, user.id) }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'unable to sign wanted offer photos' }, { status: 500 });
  }
}
