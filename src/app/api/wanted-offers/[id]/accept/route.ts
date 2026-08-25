import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/supabase/authAny';
import { admin } from '@/lib/supabase/admin';
import { blockedUserIdsFromLookup } from '@/lib/wanted';

function rpcErrorStatus(error: { code?: string } | null): number {
  if (error?.code === 'P0002') return 404;
  if (error?.code === '42501') return 403;
  if (error?.code === 'P0001' || error?.code === '23514' || error?.code === '40001') return 409;
  return 500;
}

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

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getRequestUser(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await params;

  // Check participation before calling the service-only RPC. This makes the
  // privilege boundary explicit even though the database function rechecks it.
  const { data: offer, error: offerError } = await admin
    .from('wanted_offers')
    .select('id,buyer_id,seller_id')
    .eq('id', id)
    .single();
  if (!offer) {
    return NextResponse.json({ error: offerError?.code === 'PGRST116' ? 'not found' : 'unable to load wanted offer' }, {
      status: offerError?.code === 'PGRST116' ? 404 : 500,
    });
  }
  if (offer.buyer_id !== user.id) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const blockLookup = await usersAreBlocked(user.id, offer.seller_id);
  if (!blockLookup.ok) return NextResponse.json({ error: blockLookup.error }, { status: 500 });
  if (blockLookup.value) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const { data: threadId, error } = await admin.rpc('accept_wanted_offer', {
    target_offer_id: id,
    actor_id: user.id,
  });
  if (error || !threadId) {
    const status = rpcErrorStatus(error);
    const message = status === 404 ? 'not found'
      : status === 403 ? 'forbidden'
        : status === 409 ? 'wanted offer is no longer available'
          : 'unable to accept wanted offer';
    return NextResponse.json({ error: message }, { status });
  }
  return NextResponse.json({ thread_id: threadId });
}
