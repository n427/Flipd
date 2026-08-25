import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/supabase/authAny';
import { admin } from '@/lib/supabase/admin';
import { blockedUserIdsFromLookup } from '@/lib/wanted';
import { hasWantedOfferPhotoPrefix, signWantedOfferPhotos, toParticipantWantedOffer, type WantedOfferRow } from '@/lib/wanted-offers';
import { parseWantedOfferRole, wantedOfferParticipantColumn } from '@/lib/wanted-offer-list';

const OFFER_SELECT = 'id,wanted_post_id,buyer_id,seller_id,price,description,message,photo_paths,status,created_at,updated_at,resolved_at,completed_at,wanted_post:wanted_posts(id,title,max_budget,location,needed_by,status)';

type OfferWithPost = WantedOfferRow & {
  wanted_post?: { id: string; title: string; max_budget: number; location: string; needed_by: string; status: string } | { id: string; title: string; max_budget: number; location: string; needed_by: string; status: string }[] | null;
};

export async function GET(req: NextRequest) {
  const user = await getRequestUser(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const role = parseWantedOfferRole(new URL(req.url).searchParams.get('role'));
  if (!role) return NextResponse.json({ error: 'role must be buyer or seller' }, { status: 400 });

  // Scope at the database boundary before loading or signing private content.
  const { data, error } = await admin.from('wanted_offers').select(OFFER_SELECT)
    .eq(wantedOfferParticipantColumn(role), user.id).order('created_at', { ascending: false }).limit(100);
  if (error) return NextResponse.json({ error: 'unable to load wanted offers' }, { status: 500 });

  const { data: blocks, error: blockError } = await admin.from('blocks').select('blocker_id,blocked_id')
    .or(`blocker_id.eq.${user.id},blocked_id.eq.${user.id}`);
  const blockLookup = blockedUserIdsFromLookup(user.id, { data: blocks, error: blockError });
  if (!blockLookup.ok) return NextResponse.json({ error: blockLookup.error }, { status: 500 });

  try {
    const wantedOffers = await Promise.all(((data ?? []) as unknown as OfferWithPost[])
      .filter((row) => !blockLookup.value.has(role === 'buyer' ? row.seller_id : row.buyer_id))
      .map(async (row) => {
        const paths = row.photo_paths ?? [];
        if (!hasWantedOfferPhotoPrefix(paths, row.seller_id, row.id)) throw new Error('invalid private path');
        const dto = toParticipantWantedOffer(row, user.id, await signWantedOfferPhotos(admin.storage, paths));
        if (!dto) throw new Error('participant authorization lost');
        const post = Array.isArray(row.wanted_post) ? row.wanted_post[0] : row.wanted_post;
        return post ? { ...dto, wanted_post: post } : dto;
      }));
    return NextResponse.json({ wanted_offers: wantedOffers });
  } catch {
    return NextResponse.json({ error: 'unable to load wanted offers' }, { status: 500 });
  }
}
