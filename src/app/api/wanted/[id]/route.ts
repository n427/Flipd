import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/supabase/authAny';
import { admin as supabase } from '@/lib/supabase/admin';
import { blockedUserIdsFromLookup, toPublicWantedPost, parseWantedPostInput } from '@/lib/wanted';
import { effectiveWantedStatus } from '@/lib/wanted-contract';
import { hasWantedOfferPhotoPrefix, signWantedOfferPhotos, toParticipantWantedOffer, type WantedOfferRow } from '@/lib/wanted-offers';
import { wantedPermissions } from '@/lib/wanted-authorization';

const WANTED_SELECT = 'id,buyer_id,title,category,max_budget,description,location,photo_urls,needed_by,status,created_at,updated_at,resolved_at,offers:wanted_offers(count)';
const EDITABLE_FIELDS = new Set(['title', 'category', 'max_budget', 'description', 'location', 'photo_urls', 'needed_by']);

async function usersAreBlocked(userId: string, otherUserId: string) {
  const { data, error } = await supabase
    .from('blocks')
    .select('blocker_id,blocked_id')
    .or(`and(blocker_id.eq.${userId},blocked_id.eq.${otherUserId}),and(blocker_id.eq.${otherUserId},blocked_id.eq.${userId})`)
    .limit(1);
  const lookup = blockedUserIdsFromLookup(userId, { data, error });
  if (!lookup.ok) return lookup;
  return { ok: true as const, value: lookup.value.has(otherUserId) };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getRequestUser(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await params;

  const { data, error } = await supabase.from('wanted_posts').select(WANTED_SELECT).eq('id', id).single();
  if (error || !data) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const owner = data.buyer_id === user.id;
  const now = new Date();
  const effectiveStatus = effectiveWantedStatus(data.status, data.needed_by, now);
  let acceptedOffer: WantedOfferRow | null = null;
  if (!owner && effectiveStatus !== 'active') {
    const { data: offer } = await supabase.from('wanted_offers')
      .select('id,wanted_post_id,buyer_id,seller_id,price,description,message,photo_paths,status,created_at,updated_at,resolved_at,completed_at')
      .eq('wanted_post_id', id).eq('seller_id', user.id).eq('status', 'accepted').maybeSingle();
    acceptedOffer = offer as WantedOfferRow | null;
  }
  let blocked = false;
  if (!owner) {
    const blockLookup = await usersAreBlocked(user.id, data.buyer_id);
    if (!blockLookup.ok) return NextResponse.json({ error: blockLookup.error }, { status: 500 });
    blocked = blockLookup.value;
  }
  const permissions = wantedPermissions({
    actor: owner ? 'owner' : acceptedOffer ? 'seller' : 'stranger',
    postStatus: effectiveStatus,
    offerStatus: acceptedOffer?.status ?? null,
    blocked,
    offerCompleted: Boolean(acceptedOffer?.completed_at),
    competingAccepted: false,
  });
  if (!permissions.viewPost) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  const response: Record<string, unknown> = { wanted_post: toPublicWantedPost(data, now) };
  const { data: buyer } = await supabase.from('profiles')
    .select('id,display_name,handle,avatar_url')
    .eq('id', data.buyer_id).maybeSingle();
  if (buyer) response.buyer = buyer;
  if (owner) {
    response.management = {
      buyer_id: data.buyer_id,
      updated_at: data.updated_at,
      resolved_at: data.resolved_at,
    };
  }
  if (acceptedOffer) {
    const paths = acceptedOffer.photo_paths ?? [];
    if (!hasWantedOfferPhotoPrefix(paths, acceptedOffer.seller_id, acceptedOffer.id)) {
      return NextResponse.json({ error: 'not found' }, { status: 404 });
    }
    const participantOffer = toParticipantWantedOffer(
      acceptedOffer, user.id, await signWantedOfferPhotos(supabase.storage, paths),
    );
    if (!participantOffer) return NextResponse.json({ error: 'not found' }, { status: 404 });
    const { data: thread } = await supabase.from('message_threads').select('id')
      .eq('wanted_offer_id', acceptedOffer.id).maybeSingle();
    response.participant_offer = participantOffer;
    response.thread_id = thread?.id ?? null;
  }
  return NextResponse.json(response);
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
    return NextResponse.json({ error: 'invalid wanted post' }, { status: 400 });
  }
  const bodyKeys = Object.keys(body);
  if (bodyKeys.length === 0 || bodyKeys.some((key) => !EDITABLE_FIELDS.has(key))) {
    return NextResponse.json({ error: 'only wanted post content fields may be edited' }, { status: 400 });
  }

  const { data: existing, error: existingError } = await supabase
    .from('wanted_posts')
    .select('id,buyer_id,title,category,max_budget,description,location,photo_urls,needed_by,status')
    .eq('id', id)
    .single();
  if (existingError || !existing) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const permissions = wantedPermissions({
    actor: existing.buyer_id === user.id ? 'owner' : 'stranger',
    postStatus: effectiveWantedStatus(existing.status, existing.needed_by),
    offerStatus: null,
    blocked: false,
    offerCompleted: false,
    competingAccepted: false,
  });
  if (existing.buyer_id !== user.id) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (!permissions.editPost) {
    return NextResponse.json({ error: 'only active wanted posts may be edited' }, { status: 409 });
  }

  const parsed = parseWantedPostInput({ ...existing, ...body });
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const { data: savedId, error: updateError } = await supabase.rpc('update_wanted_post_with_uploads', {
    target_post_id: id, actor_id: user.id, post_title: parsed.value.title, post_category: parsed.value.category,
    post_max_budget: parsed.value.max_budget, post_description: parsed.value.description,
    post_location: parsed.value.location, post_photo_urls: parsed.value.photo_urls, post_needed_by: parsed.value.needed_by,
  });
  if (updateError || !savedId) return NextResponse.json({ error: updateError?.message || 'unable to update wanted post' }, { status: 409 });
  const { data, error } = await supabase.from('wanted_posts').select(WANTED_SELECT).eq('id', savedId).single();
  if (error || !data) return NextResponse.json({ error: error?.message || 'unable to update wanted post' }, { status: 409 });
  return NextResponse.json({ wanted_post: toPublicWantedPost(data) });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getRequestUser(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await params;

  const { error } = await supabase.rpc('delete_wanted_post', {
    target_post_id: id,
    actor_id: user.id,
  });
  if (error) {
    if (error.code === 'P0002') return NextResponse.json({ error: 'not found' }, { status: 404 });
    if (error.code === '42501') return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
