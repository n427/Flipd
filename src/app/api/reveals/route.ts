import { NextRequest, NextResponse } from 'next/server';
import { admin } from '@/lib/supabase/admin';
import { getRequestUser } from '@/lib/supabase/authAny';
import {
  effectiveRevealStatus,
  containsContactInfo,
  CONTACT_BLOCKED_MESSAGE,
  type RevealStatus,
} from '@/lib/validation';
import { newRequestEmail, sendEmail, sendPush, verifiedEmailFor, wantsEmail, wantsPush } from '@/lib/notify';

type RevealRow = {
  id: string;
  listing_id: string;
  buyer_id: string;
  seller_id: string;
  status: RevealStatus;
  created_at: string;
  expires_at: string;
  offer: number | null;
  intro_message: string | null;
  decline_reason: string | null;
  resolved_at: string | null;
  seller_seen_at: string | null;
  buyer_seen_at: string | null;
  seller_dismissed_at: string | null;
  buyer_dismissed_at: string | null;
  listing: { title: string; archived: boolean } | null;
  listing_title: string | null;
  buyer: ProfileRef | null;
  seller: ProfileRef | null;
  // message_threads.request_id is UNIQUE, so PostgREST embeds this as a single
  // object, not an array. Typing it as an array made `thread[0]` compile while
  // always evaluating to undefined, so thread_id was silently null on every
  // request and no Open chat link ever appeared.
  thread: { id: string } | { id: string }[] | null;
};
// Contact columns are deliberately absent: contact details are never shared
// between users now that conversations happen in-app. Email is a notification
// destination only.
type ProfileRef = {
  id: string;
  display_name: string | null;
  school_unit: string | null;
  class_year: string | null;
  avatar_url: string | null;
};

const SELECT = `id, listing_id, listing_title, buyer_id, seller_id, status, created_at, expires_at, offer, intro_message, decline_reason, resolved_at, seller_seen_at, buyer_seen_at, seller_dismissed_at, buyer_dismissed_at,
  listing:listings(title, archived),
  buyer:profiles!reveal_requests_buyer_id_fkey(id, display_name, school_unit, class_year, avatar_url),
  seller:profiles!reveal_requests_seller_id_fkey(id, display_name, school_unit, class_year, avatar_url),
  thread:message_threads(id)`;

function toDto(row: RevealRow, viewerId: string, ratedRequestIds: Set<string> = new Set()) {
  const status = effectiveRevealStatus(row.status, row.expires_at);
  const isBuyer = row.buyer_id === viewerId;
  const counterpartRaw = isBuyer ? row.seller : row.buyer;
  const counterpart = counterpartRaw && {
    id: counterpartRaw.id,
    display_name: counterpartRaw.display_name,
    school_unit: counterpartRaw.school_unit,
    class_year: counterpartRaw.class_year,
    avatar_url: counterpartRaw.avatar_url,
  };
  const dto: Record<string, unknown> = {
    id: row.id,
    listing_id: row.listing_id,
    listing_title: row.listing?.title ?? row.listing_title ?? '',
    listing_archived: row.listing?.archived ?? false,
    listing_removed: !row.listing,
    status,
    created_at: row.created_at,
    expires_at: row.expires_at,
    offer: row.offer,
    counterpart,
    // Unread: sellers haven't seen the request; buyers haven't seen the resolution.
    unread: isBuyer
      ? Boolean(row.resolved_at) && (!row.buyer_seen_at || row.buyer_seen_at < row.resolved_at!)
      : !row.seller_seen_at,
    dismissed: Boolean(isBuyer ? row.buyer_dismissed_at : row.seller_dismissed_at),
    // Either party may rate a completed transaction once.
    can_rate: status === 'completed' && !ratedRequestIds.has(row.id),
    // What the buyer wrote when asking. This is what the seller approves on —
    // a name and class year alone doesn't say whether they want the item.
    intro_message: row.intro_message,
    // Why a decline happened, when the seller picked a reason.
    decline_reason: row.decline_reason,
    // Present once approved: where the conversation lives. Replaces the
    // contact payload this endpoint used to return.
    thread_id: (Array.isArray(row.thread) ? row.thread[0]?.id : row.thread?.id) ?? null,
  };
  return dto;
}

export async function GET(req: NextRequest) {
  // Web cookie session OR mobile Bearer token.
  const user = await getRequestUser(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  // Persist read-time expiry so the unique "live request" index frees up.
  await admin
    .from('reveal_requests')
    .update({ status: 'expired', resolved_at: new Date().toISOString() })
    .eq('status', 'pending')
    .lt('expires_at', new Date().toISOString())
    .or(`buyer_id.eq.${user.id},seller_id.eq.${user.id}`);

  const { data, error } = await admin
    .from('reveal_requests')
    .select(SELECT)
    .or(`buyer_id.eq.${user.id},seller_id.eq.${user.id}`)
    .order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []) as unknown as RevealRow[];
  const { data: myRatings } = await admin
    .from('ratings')
    .select('request_id')
    .eq('rater_id', user.id);
  const ratedIds = new Set((myRatings ?? []).map((r) => r.request_id));
  return NextResponse.json({
    incoming: rows.filter((r) => r.seller_id === user.id).map((r) => toDto(r, user.id, ratedIds)),
    outgoing: rows.filter((r) => r.buyer_id === user.id).map((r) => toDto(r, user.id, ratedIds)),
  });
}

export async function POST(req: NextRequest) {
  const user = await getRequestUser(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { listing_id, offer, intro_message } = await req.json().catch(() => ({}));
  if (!listing_id) return NextResponse.json({ error: 'listing_id required' }, { status: 400 });

  // The intro message is required: it's the whole basis for the seller's
  // decision, and for services/food it's the only way they know what's being
  // asked for.
  const intro = typeof intro_message === 'string' ? intro_message.trim() : '';
  if (!intro) {
    return NextResponse.json({ error: 'Add a short message so the seller knows what you need.' }, { status: 400 });
  }
  if (intro.length > 600) {
    return NextResponse.json({ error: 'Keep your message under 600 characters.' }, { status: 400 });
  }
  // Blocked, not redacted: silently stripping a buyer's message would leave
  // them thinking the seller received something they didn't. Server-side is the
  // source of truth here — the client runs the same check only for fast
  // feedback, and a crafted request must not bypass it.
  if (containsContactInfo(intro)) {
    return NextResponse.json({ error: CONTACT_BLOCKED_MESSAGE }, { status: 422 });
  }
  // Offers are optional; anything non-positive or non-numeric is simply no-offer.
  const parsedOffer = Number.isFinite(Number(offer)) && Number(offer) > 0 ? Math.round(Number(offer)) : null;

  const { data: listing } = await admin
    .from('listings')
    .select('id, seller_id, archived, negotiable')
    .eq('id', listing_id)
    .single();
  if (!listing || listing.archived) {
    return NextResponse.json({ error: 'listing not found' }, { status: 404 });
  }
  if (listing.seller_id === user.id) {
    return NextResponse.json({ error: 'cannot request your own listing' }, { status: 400 });
  }
  // The seller opted out of negotiation — drop any offer rather than reject the
  // whole request, so a stale tab still sends a valid reveal.
  const offerAmount = listing.negotiable ? parsedOffer : null;

  // Blocks are mutual for requests: neither party can request the other.
  const { data: blockRows } = await admin
    .from('blocks')
    .select('blocker_id')
    .or(`and(blocker_id.eq.${user.id},blocked_id.eq.${listing.seller_id}),and(blocker_id.eq.${listing.seller_id},blocked_id.eq.${user.id})`);
  if ((blockRows ?? []).length > 0) {
    return NextResponse.json({ error: 'You can’t send a request for this listing.' }, { status: 403 });
  }

  const { data, error } = await admin
    .from('reveal_requests')
    .insert({
      listing_id,
      buyer_id: user.id,
      seller_id: listing.seller_id,
      offer: offerAmount,
      intro_message: intro,
    })
    .select(SELECT)
    .single();
  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'already requested' }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  // Event 1: tell the seller someone asked (no contact info in this email).
  const row = data as unknown as RevealRow;
  const [{ data: sellerProfile }, { data: buyerNameProfile }] = await Promise.all([
    admin.from('profiles').select('notify_prefs').eq('id', listing.seller_id).single(),
    admin.from('profiles').select('display_name').eq('id', user.id).single(),
  ]);
  const buyerName = buyerNameProfile?.display_name ?? 'A Trojan';
  const listingTitle = row.listing?.title ?? 'your listing';
  if (wantsEmail(sellerProfile?.notify_prefs, 'new_request')) {
    const to = await verifiedEmailFor(listing.seller_id);
    if (to) {
      const { subject, html } = newRequestEmail(buyerName, listingTitle);
      void sendEmail(to, subject, html);
    }
  }
  // Push: same event, straight to the seller's device (respects the pref).
  if (wantsPush(sellerProfile?.notify_prefs, 'new_request'))
    void sendPush(listing.seller_id, 'New request', `${buyerName} wants to talk about “${listingTitle}”.`, {
    type: 'new_request',
    reveal_id: row.id,
  });

  return NextResponse.json(
    { reveal: toDto(row, user.id) },
    { status: 201 },
  );
}
