import { NextRequest, NextResponse } from 'next/server';
import { admin } from '@/lib/supabase/admin';
import { getSessionUser } from '@/lib/supabase/server';
import { effectiveRevealStatus, type RevealStatus } from '@/lib/validation';
import { approvalEmail, sendEmail, verifiedEmailFor, wantsEmail } from '@/lib/notify';

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
    .select('id, listing_id, buyer_id, seller_id, status, expires_at, listing:listings(title)')
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

  // Event 2: the approval payload — email the buyer the revealed contact
  // method + value immediately.
  if (action === 'approve') {
    const [{ data: buyerProfile }, { data: sellerProfile }] = await Promise.all([
      admin.from('profiles').select('notify_prefs').eq('id', existing.buyer_id).single(),
      admin.from('profiles').select('display_name, contact_method, contact_instagram, contact_phone, contact_email').eq('id', existing.seller_id).single(),
    ]);
    const method = sellerProfile?.contact_method;
    const value = method
      ? ({ instagram: sellerProfile?.contact_instagram, phone: sellerProfile?.contact_phone, email: sellerProfile?.contact_email } as Record<string, string | null>)[method]
      : null;
    if (method && value && wantsEmail(buyerProfile?.notify_prefs, 'approval')) {
      const to = await verifiedEmailFor(existing.buyer_id);
      if (to) {
        const listingTitle = (existing as unknown as { listing: { title: string } | null }).listing?.title ?? 'a listing';
        const { subject, html } = approvalEmail(
          sellerProfile?.display_name ?? 'The seller',
          listingTitle,
          method,
          value,
        );
        void sendEmail(to, subject, html);
      }
    }
  }

  // Approve + mark sold: archive the listing and close its other pending
  // requests.
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
