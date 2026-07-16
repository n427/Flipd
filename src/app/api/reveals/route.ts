import { NextRequest, NextResponse } from 'next/server';
import { admin } from '@/lib/supabase/admin';
import { getSessionUser } from '@/lib/supabase/server';
import { effectiveRevealStatus, type RevealStatus } from '@/lib/validation';

type RevealRow = {
  id: string;
  listing_id: string;
  buyer_id: string;
  seller_id: string;
  status: RevealStatus;
  created_at: string;
  expires_at: string;
  listing: { title: string; contact: string[] } | null;
  buyer: ProfileRef | null;
  seller: ProfileRef | null;
};
type ProfileRef = {
  id: string;
  display_name: string | null;
  school_unit: string | null;
  class_year: string | null;
  contact_instagram: string | null;
  contact_phone: string | null;
  contact_email: string | null;
};

const SELECT = `id, listing_id, buyer_id, seller_id, status, created_at, expires_at,
  listing:listings(title, contact),
  buyer:profiles!reveal_requests_buyer_id_fkey(id, display_name, school_unit, class_year, contact_instagram, contact_phone, contact_email),
  seller:profiles!reveal_requests_seller_id_fkey(id, display_name, school_unit, class_year, contact_instagram, contact_phone, contact_email)`;

function toDto(row: RevealRow, viewerId: string) {
  const status = effectiveRevealStatus(row.status, row.expires_at);
  const isBuyer = row.buyer_id === viewerId;
  const counterpartRaw = isBuyer ? row.seller : row.buyer;
  const counterpart = counterpartRaw && {
    id: counterpartRaw.id,
    display_name: counterpartRaw.display_name,
    school_unit: counterpartRaw.school_unit,
    class_year: counterpartRaw.class_year,
  };
  const dto: Record<string, unknown> = {
    id: row.id,
    listing_id: row.listing_id,
    listing_title: row.listing?.title ?? '',
    status,
    created_at: row.created_at,
    expires_at: row.expires_at,
    counterpart,
  };
  // Contact info is only ever exposed to the buyer, only once approved,
  // and only for the methods the seller offered on the listing.
  if (isBuyer && status === 'approved' && row.seller) {
    const offered = row.listing?.contact ?? [];
    dto.contact = {
      ...(offered.includes('instagram') && row.seller.contact_instagram
        ? { instagram: row.seller.contact_instagram } : {}),
      ...(offered.includes('phone') && row.seller.contact_phone
        ? { phone: row.seller.contact_phone } : {}),
      ...(offered.includes('email') && row.seller.contact_email
        ? { email: row.seller.contact_email } : {}),
    };
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
  return NextResponse.json({
    incoming: rows.filter((r) => r.seller_id === user.id).map((r) => toDto(r, user.id)),
    outgoing: rows.filter((r) => r.buyer_id === user.id).map((r) => toDto(r, user.id)),
  });
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { listing_id } = await req.json().catch(() => ({}));
  if (!listing_id) return NextResponse.json({ error: 'listing_id required' }, { status: 400 });

  const { data: listing } = await admin
    .from('listings')
    .select('id, seller_id, archived')
    .eq('id', listing_id)
    .single();
  if (!listing || listing.archived) {
    return NextResponse.json({ error: 'listing not found' }, { status: 404 });
  }
  if (listing.seller_id === user.id) {
    return NextResponse.json({ error: 'cannot request your own listing' }, { status: 400 });
  }

  const { data, error } = await admin
    .from('reveal_requests')
    .insert({ listing_id, buyer_id: user.id, seller_id: listing.seller_id })
    .select(SELECT)
    .single();
  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'already requested' }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(
    { reveal: toDto(data as unknown as RevealRow, user.id) },
    { status: 201 },
  );
}
