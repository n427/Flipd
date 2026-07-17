import { NextRequest, NextResponse } from 'next/server';
import { admin } from '@/lib/supabase/admin';
import { getSessionUser } from '@/lib/supabase/server';
import { effectiveRevealStatus, type RevealStatus } from '@/lib/validation';

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { action, mark_sold } = await req.json().catch(() => ({}));
  if (action !== 'approve' && action !== 'decline') {
    return NextResponse.json({ error: "action must be 'approve' or 'decline'" }, { status: 400 });
  }

  const { data: existing } = await admin
    .from('reveal_requests')
    .select('id, listing_id, seller_id, status, expires_at')
    .eq('id', params.id)
    .single();
  if (!existing) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (existing.seller_id !== user.id) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const status = effectiveRevealStatus(existing.status as RevealStatus, existing.expires_at);
  if (status !== 'pending') {
    return NextResponse.json({ error: `request is already ${status}` }, { status: 409 });
  }

  const { data, error } = await admin
    .from('reveal_requests')
    .update({
      status: action === 'approve' ? 'approved' : 'declined',
      resolved_at: new Date().toISOString(),
    })
    .eq('id', params.id)
    .select('id, status')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Approve + mark sold: archive the listing and close its other pending
  // requests. (If notifications/email ever ship, the approval send hooks here.)
  if (action === 'approve' && mark_sold === true) {
    await admin.from('listings').update({ archived: true }).eq('id', existing.listing_id);
    await admin
      .from('reveal_requests')
      .update({ status: 'declined', resolved_at: new Date().toISOString() })
      .eq('listing_id', existing.listing_id)
      .eq('status', 'pending')
      .neq('id', params.id);
  }

  return NextResponse.json({ reveal: data });
}
