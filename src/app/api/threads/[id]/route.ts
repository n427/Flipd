import { NextRequest, NextResponse } from 'next/server';
import { admin } from '@/lib/supabase/admin';
import { getRequestUser } from '@/lib/supabase/authAny';
import { loadThreadForUser, signAttachments, markThreadSeen, type AttachmentRow } from '@/lib/messaging';
import { loadTransaction } from '@/lib/transaction';
import { signWantedOfferPhotos } from '@/lib/wanted-offers';
import { parseTransactionSource } from '@/lib/wanted-transition';

// A single thread with its messages. Attachments come back as freshly signed
// URLs, which is why this cannot be a plain client-side Supabase read.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  // Web cookie session OR mobile Bearer token.
  const user = await getRequestUser(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  // 404 rather than 403 for a non-participant: whether a thread exists is
  // itself information a stranger shouldn't get.
  const thread = await loadThreadForUser(id, user.id);
  if (!thread) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const source = parseTransactionSource(thread);
  if (!source) throw new Error('message thread must have exactly one transaction source');

  const [{ data: messages }, { data: origin }, { data: listing }, { data: counterpart }, transaction] = await Promise.all([
    admin
      .from('messages')
      .select('id, sender_id, body, created_at')
      .eq('thread_id', thread.id)
      .order('created_at', { ascending: true }),
    // The intro message and approval date keep either transaction origin visible.
    source.kind === 'sale'
      ? admin
          .from('reveal_requests')
          .select('intro_message, created_at, resolved_at, offer')
          .eq('id', source.id)
          .single()
      : admin
          .from('wanted_offers')
          .select('message, created_at, resolved_at, photo_paths')
          .eq('id', source.id)
          .single(),
    source.kind === 'sale' && thread.listing_id
      ? admin
          .from('listings')
          .select('id, title, price, photo_urls, archived, category')
          .eq('id', thread.listing_id)
          .single()
      : Promise.resolve({ data: null }),
    admin
      .from('profiles')
      .select('id, display_name, avatar_url, school_unit, class_year')
      .eq('id', thread.buyer_id === user.id ? thread.seller_id : thread.buyer_id)
      .single(),
    loadTransaction(source),
  ]);
  if (!transaction) return NextResponse.json({ error: 'transaction not found' }, { status: 404 });

  const saleOrigin = source.kind === 'sale'
    ? origin as { intro_message: string | null; created_at: string; resolved_at: string | null; offer: number | null } | null
    : null;
  const wantedOrigin = source.kind === 'wanted'
    ? origin as { message: string; created_at: string; resolved_at: string | null; photo_paths: string[] | null } | null
    : null;
  let wantedPhoto: string | null = null;
  const wantedPhotoPath = wantedOrigin?.photo_paths?.[0];
  if (wantedPhotoPath) {
    try {
      [wantedPhoto] = await signWantedOfferPhotos(admin.storage, [wantedPhotoPath]);
    } catch (signingError) {
      return NextResponse.json(
        { error: signingError instanceof Error ? signingError.message : 'unable to sign wanted offer photos' },
        { status: 500 },
      );
    }
  }

  const rows = messages ?? [];
  const { data: attachmentRows } = rows.length
    ? await admin
        .from('message_attachments')
        .select('id, message_id, storage_path, kind, mime_type, size_bytes, width, height, duration_seconds')
        .in('message_id', rows.map((m) => m.id))
    : { data: [] };

  const signed = await signAttachments((attachmentRows ?? []) as AttachmentRow[]);
  const byMessage = new Map<string, typeof signed>();
  for (const a of signed) {
    byMessage.set(a.message_id, [...(byMessage.get(a.message_id) ?? []), a]);
  }

  // Opening the thread is the read receipt.
  await markThreadSeen(thread, user.id);

  return NextResponse.json({
    thread: {
      id: thread.id,
      request_id: thread.request_id,
      wanted_offer_id: thread.wanted_offer_id,
      source_type: source.kind,
      listing_id: thread.listing_id,
      listing_title: source.kind === 'wanted'
        ? transaction.title
        : listing?.title ?? thread.listing_title ?? '',
      listing_price: source.kind === 'wanted' ? transaction.price : listing?.price ?? null,
      listing_photo: source.kind === 'wanted' ? wantedPhoto : listing?.photo_urls?.[0] ?? null,
      listing_archived: source.kind === 'wanted' ? false : listing?.archived ?? false,
      listing_removed: source.kind === 'wanted' ? false : !listing,
      counterpart,
      intro_message: source.kind === 'wanted' ? wantedOrigin?.message ?? null : saleOrigin?.intro_message ?? null,
      offer: source.kind === 'sale' ? saleOrigin?.offer ?? null : null,
      approved_at: source.kind === 'wanted' ? wantedOrigin?.resolved_at ?? null : saleOrigin?.resolved_at ?? null,
      created_at: thread.created_at,
      // Who wrote the intro message, and when. The requester is always the
      // buyer, so the viewer's side is enough to attribute it without guessing.
      i_am_buyer: thread.buyer_id === user.id,
      requested_at: source.kind === 'wanted' ? wantedOrigin?.created_at ?? null : saleOrigin?.created_at ?? null,
    },
    messages: rows.map((m) => ({
      id: m.id,
      sender_id: m.sender_id,
      body: m.body,
      created_at: m.created_at,
      mine: m.sender_id === user.id,
      attachments: byMessage.get(m.id) ?? [],
    })),
  });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await getRequestUser(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  // loadThreadForUser deliberately returns null for both missing threads and
  // non-participants, avoiding a thread-existence leak.
  const thread = await loadThreadForUser(id, user.id);
  if (!thread) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const { error } = await admin.from('message_threads').delete().eq('id', thread.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return new NextResponse(null, { status: 204 });
}
