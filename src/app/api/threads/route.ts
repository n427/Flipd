import { NextRequest, NextResponse } from 'next/server';
import { admin } from '@/lib/supabase/admin';
import { getRequestUser } from '@/lib/supabase/authAny';

type ProfileRef = { id: string; display_name: string | null; avatar_url: string | null };
type ThreadListRow = {
  id: string;
  request_id: string;
  listing_id: string | null;
  listing_title: string | null;
  buyer_id: string;
  seller_id: string;
  created_at: string;
  last_message_at: string | null;
  buyer_seen_at: string | null;
  seller_seen_at: string | null;
  listing: { title: string; price: number | null; photo_urls: string[] | null; archived: boolean } | null;
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
    .select(`id, request_id, listing_id, listing_title, buyer_id, seller_id, created_at, last_message_at, buyer_seen_at, seller_seen_at,
      listing:listings(title, price, photo_urls, archived),
      buyer:profiles!message_threads_buyer_id_fkey(id, display_name, avatar_url),
      seller:profiles!message_threads_seller_id_fkey(id, display_name, avatar_url)`)
    .or(`buyer_id.eq.${user.id},seller_id.eq.${user.id}`)
    .order('last_message_at', { ascending: false, nullsFirst: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []) as unknown as ThreadListRow[];

  // One query for the newest message across all threads, rather than N+1.
  const ids = rows.map((r) => r.id);
  // Attachments come along because a photo-only message has an empty body:
  // without them the preview falls back to "no messages yet" on a thread that
  // clearly has one.
  const previews = new Map<
    string,
    { body: string; created_at: string; sender_id: string; attachments: { kind: string }[] }
  >();
  if (ids.length > 0) {
    const { data: recent } = await admin
      .from('messages')
      .select('thread_id, body, created_at, sender_id, attachments:message_attachments(kind)')
      .in('thread_id', ids)
      .order('created_at', { ascending: false });
    for (const m of (recent ?? []) as unknown as {
      thread_id: string;
      body: string;
      created_at: string;
      sender_id: string;
      attachments: { kind: string }[] | null;
    }[]) {
      if (!previews.has(m.thread_id)) {
        previews.set(m.thread_id, {
          body: m.body,
          created_at: m.created_at,
          sender_id: m.sender_id,
          attachments: m.attachments ?? [],
        });
      }
    }
  }

  /** What to show in a thread list row: the text, or what was sent instead. */
  function previewText(p: { body: string; attachments: { kind: string }[] } | null): string | null {
    if (!p) return null;
    if (p.body?.trim()) return p.body;
    const n = p.attachments.length;
    if (n === 0) return null;
    const allPhotos = p.attachments.every((a) => a.kind === 'image');
    const noun = allPhotos ? 'Photo' : 'Attachment';
    return n === 1 ? noun : `${n} ${allPhotos ? 'photos' : 'attachments'}`;
  }

  return NextResponse.json({
    threads: rows.map((r) => {
      const isBuyer = r.buyer_id === user.id;
      const counterpart = isBuyer ? r.seller : r.buyer;
      const seenAt = isBuyer ? r.buyer_seen_at : r.seller_seen_at;
      const preview = previews.get(r.id) ?? null;
      return {
        id: r.id,
        request_id: r.request_id,
        listing_id: r.listing_id,
        // Falls back to the denormalized title when the listing is gone, the
        // same way reveal_requests.listing_title survives a deletion.
        listing_title: r.listing?.title ?? r.listing_title ?? '',
        listing_price: r.listing?.price ?? null,
        listing_photo: r.listing?.photo_urls?.[0] ?? null,
        listing_archived: r.listing?.archived ?? false,
        listing_removed: !r.listing,
        counterpart,
        last_message_at: r.last_message_at,
        last_message: previewText(preview),
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
