import { NextRequest, NextResponse } from 'next/server';
import { admin } from '@/lib/supabase/admin';
import { getRequestUser } from '@/lib/supabase/authAny';
import { signWantedOfferPhotos } from '@/lib/wanted-offers';
import { parseTransactionSource } from '@/lib/wanted-transition';

type ProfileRef = { id: string; display_name: string | null; avatar_url: string | null };
type ThreadListRow = {
  id: string;
  request_id: string | null;
  wanted_offer_id: string | null;
  listing_id: string | null;
  listing_title: string | null;
  buyer_id: string;
  seller_id: string;
  created_at: string;
  last_message_at: string | null;
  buyer_seen_at: string | null;
  seller_seen_at: string | null;
  listing: { title: string; price: number | null; photo_urls: string[] | null; archived: boolean } | null;
  wanted_offer: {
    price: number;
    photo_paths: string[] | null;
    wanted_post: { title: string } | null;
  } | null;
  buyer: ProfileRef | null;
  seller: ProfileRef | null;
};

// The thread list. Ordered by last_message_at, which the insert trigger keeps
// current, so no join or aggregate is needed to sort by activity.
export async function GET(req: NextRequest) {
  // Web cookie session OR mobile Bearer token.
  const user = await getRequestUser(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { data, error } = await admin
    .from('message_threads')
    .select(`id, request_id, wanted_offer_id, listing_id, listing_title, buyer_id, seller_id, created_at, last_message_at, buyer_seen_at, seller_seen_at,
      listing:listings(title, price, photo_urls, archived),
      wanted_offer:wanted_offers(price, photo_paths, wanted_post:wanted_posts(title)),
      buyer:profiles!message_threads_buyer_id_fkey(id, display_name, avatar_url),
      seller:profiles!message_threads_seller_id_fkey(id, display_name, avatar_url)`)
    .or(`buyer_id.eq.${user.id},seller_id.eq.${user.id}`)
    .order('last_message_at', { ascending: false, nullsFirst: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []) as unknown as ThreadListRow[];

  // This route already restricted every row to the caller's conversations.
  // Only after that participant check do private Wanted-offer paths get signed.
  const wantedPhotoRows = rows.flatMap((row) => {
    const source = parseTransactionSource(row);
    const path = source?.kind === 'wanted' ? row.wanted_offer?.photo_paths?.[0] : null;
    return path ? [{ threadId: row.id, path }] : [];
  });
  let wantedPhotoUrls = new Map<string, string>();
  if (wantedPhotoRows.length > 0) {
    try {
      const urls = await signWantedOfferPhotos(
        admin.storage,
        wantedPhotoRows.map(({ path }) => path),
      );
      wantedPhotoUrls = new Map(wantedPhotoRows.map((row, index) => [row.threadId, urls[index]]));
    } catch (signingError) {
      return NextResponse.json(
        { error: signingError instanceof Error ? signingError.message : 'unable to sign wanted offer photos' },
        { status: 500 },
      );
    }
  }

  // One query for the newest message across all threads, rather than N+1.
  const ids = rows.map((r) => r.id);
  const previews = new Map<string, { body: string; created_at: string; sender_id: string }>();
  if (ids.length > 0) {
    const { data: recent } = await admin
      .from('messages')
      .select('thread_id, body, created_at, sender_id')
      .in('thread_id', ids)
      .order('created_at', { ascending: false });
    for (const m of recent ?? []) {
      if (!previews.has(m.thread_id)) {
        previews.set(m.thread_id, { body: m.body, created_at: m.created_at, sender_id: m.sender_id });
      }
    }
  }

  return NextResponse.json({
    threads: rows.map((r) => {
      const source = parseTransactionSource(r);
      if (!source) throw new Error('message thread must have exactly one transaction source');
      const isWanted = source.kind === 'wanted';
      const isBuyer = r.buyer_id === user.id;
      const counterpart = isBuyer ? r.seller : r.buyer;
      const seenAt = isBuyer ? r.buyer_seen_at : r.seller_seen_at;
      const preview = previews.get(r.id) ?? null;
      return {
        id: r.id,
        request_id: r.request_id,
        wanted_offer_id: r.wanted_offer_id,
        source_type: source.kind,
        listing_id: r.listing_id,
        // Falls back to the denormalized title when the listing is gone, the
        // same way reveal_requests.listing_title survives a deletion.
        listing_title: isWanted
          ? r.wanted_offer?.wanted_post?.title ?? r.listing_title ?? ''
          : r.listing?.title ?? r.listing_title ?? '',
        listing_price: isWanted ? r.wanted_offer?.price ?? null : r.listing?.price ?? null,
        listing_photo: isWanted
          ? wantedPhotoUrls.get(r.id) ?? null
          : r.listing?.photo_urls?.[0] ?? null,
        listing_archived: isWanted ? false : r.listing?.archived ?? false,
        listing_removed: isWanted ? false : !r.listing,
        counterpart,
        last_message_at: r.last_message_at,
        last_message: preview?.body ?? null,
        // Unread when the other party sent something after our last look.
        unread: Boolean(
          preview &&
            preview.sender_id !== user.id &&
            (!seenAt || seenAt < preview.created_at),
        ),
      };
    }),
  });
}
