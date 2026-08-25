import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/supabase/authAny';
import { admin } from '@/lib/supabase/admin';
import { canonicalizeWantedOfferId, wantedOfferRpcErrorStatus } from '@/lib/wanted-offers';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getRequestUser(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id: rawId } = await params;
  const id = canonicalizeWantedOfferId(rawId);
  if (!id) return NextResponse.json({ error: 'not found' }, { status: 404 });

  // The security-definer RPC locks the post, offer, and both profiles before
  // it rechecks participation, block state, and the effective deadline.
  const { data: threadId, error } = await admin.rpc('accept_wanted_offer', {
    target_offer_id: id,
    actor_id: user.id,
  });
  if (error || !threadId) {
    const status = wantedOfferRpcErrorStatus(error);
    const message = status === 404 ? 'not found'
      : status === 403 ? 'forbidden'
        : status === 409 ? 'wanted offer is no longer available'
          : 'unable to accept wanted offer';
    return NextResponse.json({ error: message }, { status });
  }
  return NextResponse.json({ thread_id: threadId });
}
