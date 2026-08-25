import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/supabase/authAny';
import { admin } from '@/lib/supabase/admin';
import {
  canonicalizeWantedOfferId,
  hasWantedOfferPhotoPrefix,
  parseWantedOfferInput,
  signWantedOfferPhotos,
  toParticipantWantedOffer,
  wantedOfferRpcErrorStatus,
  type WantedOfferRow,
} from '@/lib/wanted-offers';
import { effectiveWantedStatus } from '@/lib/wanted-contract';
import { wantedPermissions, type WantedPermissions } from '@/lib/wanted-authorization';
import { blockedUserIdsFromLookup } from '@/lib/wanted';

const OFFER_SELECT = 'id,wanted_post_id,buyer_id,seller_id,price,description,message,photo_paths,status,created_at,updated_at,resolved_at,completed_at';
const EDITABLE_FIELDS = new Set(['price', 'description', 'message', 'photo_paths']);

async function loadOfferForUser(offerId: string, userId: string) {
  const { data, error } = await admin
    .from('wanted_offers')
    .select(OFFER_SELECT)
    .eq('id', offerId)
    .or(`buyer_id.eq.${userId},seller_id.eq.${userId}`)
    .maybeSingle();
  if (error || !data) return { ok: false as const, response: NextResponse.json({ error: 'not found' }, { status: 404 }) };
  const offer = data as WantedOfferRow;
  return { ok: true as const, offer };
}

async function permissionsForOffer(offer: WantedOfferRow, userId: string): Promise<WantedPermissions | null> {
  const counterpart = offer.buyer_id === userId ? offer.seller_id : offer.buyer_id;
  const [{ data: post, error: postError }, { data: blocks, error: blockError }] = await Promise.all([
    admin.from('wanted_posts').select('status,needed_by').eq('id', offer.wanted_post_id).maybeSingle(),
    admin.from('blocks').select('blocker_id,blocked_id')
      .or(`and(blocker_id.eq.${userId},blocked_id.eq.${counterpart}),and(blocker_id.eq.${counterpart},blocked_id.eq.${userId})`),
  ]);
  const blockLookup = blockedUserIdsFromLookup(userId, { data: blocks, error: blockError });
  if (postError || !post || !blockLookup.ok) return null;
  return wantedPermissions({
    actor: offer.buyer_id === userId ? 'owner' : 'seller',
    postStatus: effectiveWantedStatus(post.status, post.needed_by),
    offerStatus: offer.status,
    blocked: blockLookup.value.has(counterpart),
    offerCompleted: Boolean(offer.completed_at),
    competingAccepted: offer.status === 'declined' && post.status === 'fulfilled',
  });
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

async function mutate(
  offerId: string,
  userId: string,
  mutation: 'edit' | 'decline' | 'withdraw',
  input?: { price: number; description: string; message: string; photo_paths: string[] },
) {
  const { data: savedOfferId, error } = await admin.rpc('mutate_wanted_offer', {
    target_offer_id: offerId,
    actor_id: userId,
    mutation,
    offered_price: input?.price ?? null,
    offered_description: input?.description ?? null,
    offered_message: input?.message ?? null,
    offered_photo_paths: input?.photo_paths ?? null,
  });
  if (error || !savedOfferId) {
    const status = wantedOfferRpcErrorStatus(error);
    const message = status === 404 ? 'not found'
      : status === 403 ? 'forbidden'
        : status === 409 ? 'wanted offer is no longer available'
          : 'unable to update wanted offer';
    return { ok: false as const, response: NextResponse.json({ error: message }, { status }) };
  }
  const { data, error: loadError } = await admin
    .from('wanted_offers')
    .select(OFFER_SELECT)
    .eq('id', savedOfferId)
    .single();
  if (loadError || !data) {
    return { ok: false as const, response: NextResponse.json({ error: 'unable to load wanted offer' }, { status: 500 }) };
  }
  return { ok: true as const, offer: data as WantedOfferRow };
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getRequestUser(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id: rawId } = await params;
  const id = canonicalizeWantedOfferId(rawId);
  if (!id) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'invalid wanted offer action' }, { status: 400 });
  }
  const record = body as Record<string, unknown>;
  if (record.action !== 'edit' && record.action !== 'decline') {
    return NextResponse.json({ error: 'invalid wanted offer action' }, { status: 400 });
  }
  if (record.action === 'edit') {
    const keys = Object.keys(record);
    if (keys.length === 1 || keys.some((key) => key !== 'action' && !EDITABLE_FIELDS.has(key))) {
      return NextResponse.json({ error: 'only wanted offer content fields may be edited' }, { status: 400 });
    }
  } else if (Object.keys(record).length !== 1) {
    return NextResponse.json({ error: 'decline accepts no additional fields' }, { status: 400 });
  }

  const loaded = await loadOfferForUser(id, user.id);
  if (!loaded.ok) return loaded.response;
  const { offer } = loaded;
  const permissions = await permissionsForOffer(offer, user.id);
  if (!permissions) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (record.action === 'edit') {
    if (!permissions.editOffer) return NextResponse.json({ error: 'wanted offer is no longer available' }, { status: 409 });
    const parsed = parseWantedOfferInput({ ...offer, ...record });
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
    if (!hasWantedOfferPhotoPrefix(parsed.value.photo_paths, user.id, id)) {
      return NextResponse.json({ error: 'photo_paths must use the seller and offer ID prefix' }, { status: 400 });
    }
    const result = await mutate(id, user.id, 'edit', parsed.value);
    if (!result.ok) return result.response;
    try {
      return NextResponse.json({ wanted_offer: await offerDto(result.offer, user.id) });
    } catch {
      return NextResponse.json({ error: 'unable to sign wanted offer photos' }, { status: 500 });
    }
  }

  if (!permissions.decline) return NextResponse.json({ error: 'wanted offer is no longer available' }, { status: 409 });
  const result = await mutate(id, user.id, 'decline');
  if (!result.ok) return result.response;
  try {
    return NextResponse.json({ wanted_offer: await offerDto(result.offer, user.id) });
  } catch {
    return NextResponse.json({ error: 'unable to sign wanted offer photos' }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getRequestUser(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id: rawId } = await params;
  const id = canonicalizeWantedOfferId(rawId);
  if (!id) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const loaded = await loadOfferForUser(id, user.id);
  if (!loaded.ok) return loaded.response;
  const permissions = await permissionsForOffer(loaded.offer, user.id);
  if (!permissions) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (!permissions.withdraw) return NextResponse.json({ error: 'wanted offer is no longer available' }, { status: 409 });
  const result = await mutate(id, user.id, 'withdraw');
  if (!result.ok) return result.response;
  try {
    return NextResponse.json({ wanted_offer: await offerDto(result.offer, user.id) });
  } catch {
    return NextResponse.json({ error: 'unable to sign wanted offer photos' }, { status: 500 });
  }
}
