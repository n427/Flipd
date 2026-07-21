import { NextRequest, NextResponse } from 'next/server';
import { admin } from '@/lib/supabase/admin';
import { getSessionUser } from '@/lib/supabase/server';
import { effectiveRevealStatus, resolveSharedContact, type RevealStatus } from '@/lib/validation';
import { newRequestEmail, sendEmail, verifiedEmailFor, wantsEmail } from '@/lib/notify';

type RevealRow = {
  id: string;
  listing_id: string;
  buyer_id: string;
  seller_id: string;
  status: RevealStatus;
  created_at: string;
  expires_at: string;
  offer: number | null;
  buyer_contact: string[] | null;
  resolved_at: string | null;
  seller_seen_at: string | null;
  buyer_seen_at: string | null;
  seller_dismissed_at: string | null;
  buyer_dismissed_at: string | null;
  listing: { title: string; contact: string[]; archived: boolean } | null;
  listing_title: string | null;
  buyer: ProfileRef | null;
  seller: ProfileRef | null;
};
type ProfileRef = {
  id: string;
  display_name: string | null;
  school_unit: string | null;
  class_year: string | null;
  avatar_url: string | null;
  contact_instagram: string | null;
  contact_phone: string | null;
  contact_email: string | null;
};

const SELECT = `id, listing_id, listing_title, buyer_id, seller_id, status, created_at, expires_at, offer, buyer_contact, resolved_at, seller_seen_at, buyer_seen_at, seller_dismissed_at, buyer_dismissed_at,
  listing:listings(title, contact, archived),
  buyer:profiles!reveal_requests_buyer_id_fkey(id, display_name, school_unit, class_year, avatar_url, contact_instagram, contact_phone, contact_email),
  seller:profiles!reveal_requests_seller_id_fkey(id, display_name, school_unit, class_year, avatar_url, contact_instagram, contact_phone, contact_email)`;

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
  };
  // Both parties see the other's chosen contact once approved/completed.
  // Only attach `contact` when at least one method resolves, so surfaces
  // never render an empty "CONTACT" block for an approved-but-empty reveal.
  if (status === 'approved' || status === 'completed') {
    let shared: Partial<Record<'instagram' | 'phone' | 'email', string>> = {};
    if (isBuyer && row.seller) {
      shared = resolveSharedContact(row.listing?.contact ?? [], {
        instagram: row.seller.contact_instagram,
        phone: row.seller.contact_phone,
        email: row.seller.contact_email,
      });
    } else if (!isBuyer && row.buyer) {
      shared = resolveSharedContact(row.buyer_contact ?? [], {
        instagram: row.buyer.contact_instagram,
        phone: row.buyer.contact_phone,
        email: row.buyer.contact_email,
      });
    }
    if (Object.keys(shared).length > 0) dto.contact = shared;
  }
  return dto;
}

export async function GET() {
  const user = await getSessionUser();
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
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { listing_id, offer, buyer_contact } = await req.json().catch(() => ({}));
  if (!listing_id) return NextResponse.json({ error: 'listing_id required' }, { status: 400 });
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

  // Validate the buyer's chosen methods against their stored profile values —
  // never trust the client. Empty/absent list falls back to all stored methods.
  const { data: buyerProfile } = await admin
    .from('profiles')
    .select('contact_instagram, contact_phone, contact_email')
    .eq('id', user.id)
    .single();
  const buyerValues = {
    instagram: buyerProfile?.contact_instagram ?? null,
    phone: buyerProfile?.contact_phone ?? null,
    email: buyerProfile?.contact_email ?? null,
  };
  // Only share what the buyer explicitly picked. If the client sent no
  // selection (e.g. a stale tab from before the picker existed), share
  // nothing rather than auto-exposing every stored method.
  const requested: string[] = Array.isArray(buyer_contact) ? buyer_contact : [];
  const buyerContact = Object.keys(resolveSharedContact(requested, buyerValues));

  const { data, error } = await admin
    .from('reveal_requests')
    .insert({ listing_id, buyer_id: user.id, seller_id: listing.seller_id, offer: offerAmount, buyer_contact: buyerContact })
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
  if (wantsEmail(sellerProfile?.notify_prefs, 'new_request')) {
    const to = await verifiedEmailFor(listing.seller_id);
    if (to) {
      const { subject, html } = newRequestEmail(
        buyerNameProfile?.display_name ?? 'A Trojan',
        row.listing?.title ?? 'your listing',
      );
      void sendEmail(to, subject, html);
    }
  }

  return NextResponse.json(
    { reveal: toDto(row, user.id) },
    { status: 201 },
  );
}
