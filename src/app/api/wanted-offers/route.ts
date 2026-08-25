import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/supabase/authAny';
import { admin } from '@/lib/supabase/admin';
import { blockedUserIdsFromLookup } from '@/lib/wanted';
import { hasWantedOfferPhotoPrefix, signWantedOfferPhotos, toParticipantWantedOffer, type WantedOfferRow } from '@/lib/wanted-offers';
import { parseWantedOfferCursor, parseWantedOfferRole, serializeWantedOfferCursor, wantedOfferCursorFilter, wantedOfferParticipantColumn, type WantedOfferCursor } from '@/lib/wanted-offer-list';

const OFFER_SELECT = 'id,wanted_post_id,buyer_id,seller_id,price,description,message,photo_paths,status,created_at,updated_at,resolved_at,completed_at,wanted_post:wanted_posts(id,title,max_budget,location,needed_by,status)';

type OfferWithPost = WantedOfferRow & {
  wanted_post?: { id: string; title: string; max_budget: number; location: string; needed_by: string; status: string } | { id: string; title: string; max_budget: number; location: string; needed_by: string; status: string }[] | null;
};

export async function GET(req: NextRequest) {
  const user = await getRequestUser(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const role = parseWantedOfferRole(new URL(req.url).searchParams.get('role'));
  if (!role) return NextResponse.json({ error: 'role must be buyer or seller' }, { status: 400 });
  const url = new URL(req.url);
  const cursor = parseWantedOfferCursor(url.searchParams.get('cursor'));
  const limitRaw = url.searchParams.get('limit');
  const limit = limitRaw === null ? 20 : /^\d+$/.test(limitRaw) ? Number(limitRaw) : 0;
  if (cursor === null || !Number.isSafeInteger(limit) || limit < 1 || limit > 50) {
    return NextResponse.json({ error: 'invalid pagination' }, { status: 400 });
  }

  const { data: blocks, error: blockError } = await admin.from('blocks').select('blocker_id,blocked_id')
    .or(`blocker_id.eq.${user.id},blocked_id.eq.${user.id}`);
  const blockLookup = blockedUserIdsFromLookup(user.id, { data: blocks, error: blockError });
  if (!blockLookup.ok) return NextResponse.json({ error: blockLookup.error }, { status: 500 });

  // Scan through blocked rows until a full visible page is assembled. The
  // cursor records the last consumed row, so tied timestamps cannot skip or
  // repeat UUIDs and a blocked-heavy batch cannot crowd out visible offers.
  const rows: OfferWithPost[] = [];
  let scanCursor: WantedOfferCursor | undefined = cursor;
  let lastConsumed: WantedOfferCursor | null = null;
  let exhausted = false;
  for (let batch = 0; batch < 20 && rows.length < limit && !exhausted; batch += 1) {
    let query = admin.from('wanted_offers').select(OFFER_SELECT)
      .eq(wantedOfferParticipantColumn(role), user.id)
      .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(50);
    if (scanCursor) query = query.or(wantedOfferCursorFilter(scanCursor));
    const { data, error } = await query;
    if (error) return NextResponse.json({ error: 'unable to load wanted offers' }, { status: 500 });
    const batchRows = (data ?? []) as unknown as OfferWithPost[];
    exhausted = batchRows.length < 50;
    for (const row of batchRows) {
      lastConsumed = { created_at: row.created_at, id: row.id };
      if (!blockLookup.value.has(role === 'buyer' ? row.seller_id : row.buyer_id)) rows.push(row);
      if (rows.length === limit) break;
    }
    if (lastConsumed) scanCursor = lastConsumed;
  }

  try {
    const wantedOffers = await Promise.all(rows.map(async (row) => {
        const paths = row.photo_paths ?? [];
        if (!hasWantedOfferPhotoPrefix(paths, row.seller_id, row.id)) throw new Error('invalid private path');
        const dto = toParticipantWantedOffer(row, user.id, await signWantedOfferPhotos(admin.storage, paths));
        if (!dto) throw new Error('participant authorization lost');
        const post = Array.isArray(row.wanted_post) ? row.wanted_post[0] : row.wanted_post;
        return post ? { ...dto, wanted_post: post } : dto;
      }));
    return NextResponse.json({
      wanted_offers: wantedOffers,
      next_cursor: lastConsumed && (!exhausted || rows.length === limit) ? serializeWantedOfferCursor(lastConsumed) : null,
    });
  } catch {
    return NextResponse.json({ error: 'unable to load wanted offers' }, { status: 500 });
  }
}
