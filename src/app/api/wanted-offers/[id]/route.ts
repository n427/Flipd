import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/supabase/authAny';
import { admin } from '@/lib/supabase/admin';
import { blockedUserIdsFromLookup } from '@/lib/wanted';
import { effectiveWantedStatus } from '@/lib/wanted-contract';
import {
  canMutateWantedOffer,
  hasWantedOfferPhotoPrefix,
  parseWantedOfferInput,
  signWantedOfferPhotos,
  toParticipantWantedOffer,
  type WantedOfferRow,
} from '@/lib/wanted-offers';

const OFFER_SELECT = 'id,wanted_post_id,buyer_id,seller_id,price,description,message,photo_paths,status,created_at,updated_at,resolved_at,completed_at';
const EDITABLE_FIELDS = new Set(['price', 'description', 'message', 'photo_paths']);

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

async function loadOfferAndPost(offerId: string) {
  const { data: offer, error: offerError } = await admin
    .from('wanted_offers')
    .select(OFFER_SELECT)
    .eq('id', offerId)
    .single();
  if (offerError || !offer) return { ok: false as const, response: NextResponse.json({ error: 'not found' }, { status: 404 }) };
  const { data: post, error: postError } = await admin
    .from('wanted_posts')
    .select('id,buyer_id,status,needed_by')
    .eq('id', offer.wanted_post_id)
    .single();
  if (postError || !post) return { ok: false as const, response: NextResponse.json({ error: 'not found' }, { status: 404 }) };
  return { ok: true as const, offer: offer as WantedOfferRow, post };
}

async function activeParticipantOffer(offerId: string, userId: string) {
  const loaded = await loadOfferAndPost(offerId);
  if (!loaded.ok) return loaded;
  const { offer, post } = loaded;
  if (offer.buyer_id !== post.buyer_id) {
    return { ok: false as const, response: NextResponse.json({ error: 'wanted offer participants are invalid' }, { status: 409 }) };
  }
  if (userId !== offer.buyer_id && userId !== offer.seller_id) {
    return { ok: false as const, response: NextResponse.json({ error: 'forbidden' }, { status: 403 }) };
  }
  if (effectiveWantedStatus(post.status, post.needed_by) !== 'active') {
    return { ok: false as const, response: NextResponse.json({ error: 'wanted post is no longer active' }, { status: 409 }) };
  }
  const otherUserId = userId === offer.buyer_id ? offer.seller_id : offer.buyer_id;
  const blockLookup = await usersAreBlocked(userId, otherUserId);
  if (!blockLookup.ok) return { ok: false as const, response: NextResponse.json({ error: blockLookup.error }, { status: 500 }) };
  if (blockLookup.value) return { ok: false as const, response: NextResponse.json({ error: 'forbidden' }, { status: 403 }) };
  return { ok: true as const, offer };
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

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getRequestUser(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await params;
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

  const loaded = await activeParticipantOffer(id, user.id);
  if (!loaded.ok) return loaded.response;
  const { offer } = loaded;

  if (record.action === 'edit') {
    if (offer.seller_id !== user.id) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    if (!canMutateWantedOffer(offer.status)) {
      return NextResponse.json({ error: 'wanted offer is no longer pending' }, { status: 409 });
    }
    const parsed = parseWantedOfferInput({ ...offer, ...record });
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
    if (!hasWantedOfferPhotoPrefix(parsed.value.photo_paths, user.id, offer.id)) {
      return NextResponse.json({ error: 'photo_paths must use the seller and offer ID prefix' }, { status: 400 });
    }
    const { data, error } = await admin
      .from('wanted_offers')
      .update(parsed.value)
      .eq('id', offer.id)
      .eq('seller_id', user.id)
      .eq('status', 'pending')
      .select(OFFER_SELECT)
      .maybeSingle();
    if (error || !data) return NextResponse.json({ error: 'wanted offer is no longer pending' }, { status: 409 });
    try {
      return NextResponse.json({ wanted_offer: await offerDto(data as WantedOfferRow, user.id) });
    } catch {
      return NextResponse.json({ error: 'unable to sign wanted offer photos' }, { status: 500 });
    }
  }

  if (offer.buyer_id !== user.id) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  if (!canMutateWantedOffer(offer.status)) {
    return NextResponse.json({ error: 'wanted offer is no longer pending' }, { status: 409 });
  }
  const { data, error } = await admin
    .from('wanted_offers')
    .update({ status: 'declined', resolved_at: new Date().toISOString() })
    .eq('id', offer.id)
    .eq('buyer_id', user.id)
    .eq('status', 'pending')
    .select(OFFER_SELECT)
    .maybeSingle();
  if (error || !data) return NextResponse.json({ error: 'wanted offer is no longer pending' }, { status: 409 });
  try {
    return NextResponse.json({ wanted_offer: await offerDto(data as WantedOfferRow, user.id) });
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
  const { id } = await params;
  const loaded = await activeParticipantOffer(id, user.id);
  if (!loaded.ok) return loaded.response;
  const { offer } = loaded;
  if (offer.seller_id !== user.id) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  if (!canMutateWantedOffer(offer.status)) {
    return NextResponse.json({ error: 'wanted offer is no longer pending' }, { status: 409 });
  }
  const { data, error } = await admin
    .from('wanted_offers')
    .update({ status: 'withdrawn', resolved_at: new Date().toISOString() })
    .eq('id', offer.id)
    .eq('seller_id', user.id)
    .eq('status', 'pending')
    .select(OFFER_SELECT)
    .maybeSingle();
  if (error || !data) return NextResponse.json({ error: 'wanted offer is no longer pending' }, { status: 409 });
  try {
    return NextResponse.json({ wanted_offer: await offerDto(data as WantedOfferRow, user.id) });
  } catch {
    return NextResponse.json({ error: 'unable to sign wanted offer photos' }, { status: 500 });
  }
}
