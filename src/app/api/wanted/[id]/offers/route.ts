import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/supabase/authAny';
import { admin } from '@/lib/supabase/admin';
import { blockedUserIdsFromLookup } from '@/lib/wanted';
import { effectiveWantedStatus } from '@/lib/wanted-contract';
import {
  hasWantedOfferPhotoPrefix,
  isWantedOfferId,
  parseWantedOfferInput,
  signWantedOfferPhotos,
  toParticipantWantedOffer,
  type WantedOfferRow,
} from '@/lib/wanted-offers';

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
    .select('id,buyer_id')
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
    rows = ((data ?? []) as WantedOfferRow[]).filter((offer) => !blockLookup.value.has(offer.seller_id));
  } else {
    const blockLookup = await usersAreBlocked(user.id, post.buyer_id);
    if (!blockLookup.ok) return NextResponse.json({ error: blockLookup.error }, { status: 500 });
    if (blockLookup.value) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

    const { data, error } = await admin
      .from('wanted_offers')
      .select(OFFER_SELECT)
      .eq('wanted_post_id', id)
      .eq('seller_id', user.id)
      .maybeSingle();
    if (error) return NextResponse.json({ error: 'unable to load wanted offers' }, { status: 500 });
    if (!data) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    rows = [data as WantedOfferRow];
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
  if (!parsed.ok || !body || typeof body !== 'object' || Array.isArray(body) || !isWantedOfferId(body.id)) {
    return NextResponse.json({ error: parsed.ok ? 'id must be a UUID' : parsed.error }, { status: 400 });
  }
  const offerId = body.id;
  if (!hasWantedOfferPhotoPrefix(parsed.value.photo_paths, user.id, offerId)) {
    return NextResponse.json({ error: 'photo_paths must use the seller and offer ID prefix' }, { status: 400 });
  }

  const { data: post, error: postError } = await admin
    .from('wanted_posts')
    .select('id,buyer_id,status,needed_by')
    .eq('id', wantedPostId)
    .single();
  if (postError || !post) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (post.buyer_id === user.id) return NextResponse.json({ error: 'cannot offer on your own wanted post' }, { status: 403 });
  if (effectiveWantedStatus(post.status, post.needed_by) !== 'active') {
    return NextResponse.json({ error: 'wanted post is no longer active' }, { status: 409 });
  }
  const blockLookup = await usersAreBlocked(user.id, post.buyer_id);
  if (!blockLookup.ok) return NextResponse.json({ error: blockLookup.error }, { status: 500 });
  if (blockLookup.value) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const { data: existing, error: existingError } = await admin
    .from('wanted_offers')
    .select(OFFER_SELECT)
    .eq('wanted_post_id', wantedPostId)
    .eq('seller_id', user.id)
    .maybeSingle();
  if (existingError) return NextResponse.json({ error: 'unable to load wanted offer' }, { status: 500 });

  let saved: WantedOfferRow | null = null;
  let saveError: { code?: string } | null = null;
  if (existing) {
    if (existing.id !== offerId) {
      return NextResponse.json({ error: 'resubmission must reuse the existing offer ID' }, { status: 409 });
    }
    if (existing.status !== 'withdrawn') {
      return NextResponse.json({ error: 'only withdrawn offers may be resubmitted' }, { status: 409 });
    }
    const result = await admin
      .from('wanted_offers')
      .update({ ...parsed.value, status: 'pending', resolved_at: null })
      .eq('id', existing.id)
      .eq('seller_id', user.id)
      .eq('wanted_post_id', wantedPostId)
      .eq('status', 'withdrawn')
      .select(OFFER_SELECT)
      .maybeSingle();
    saved = result.data as WantedOfferRow | null;
    saveError = result.error;
  } else {
    const result = await admin
      .from('wanted_offers')
      .insert({ id: offerId, wanted_post_id: wantedPostId, seller_id: user.id, buyer_id: post.buyer_id, ...parsed.value })
      .select(OFFER_SELECT)
      .single();
    saved = result.data as WantedOfferRow | null;
    saveError = result.error;
  }
  if (saveError || !saved) {
    const status = saveError?.code === '23505' || saveError?.code === '23514' ? 409 : 500;
    return NextResponse.json({ error: status === 409 ? 'wanted offer is no longer available' : 'unable to save wanted offer' }, { status });
  }

  try {
    return NextResponse.json({ wanted_offer: await offerDto(saved, user.id) }, { status: existing ? 200 : 201 });
  } catch {
    return NextResponse.json({ error: 'unable to sign wanted offer photos' }, { status: 500 });
  }
}
