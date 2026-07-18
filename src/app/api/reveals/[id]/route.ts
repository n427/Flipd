import { NextRequest, NextResponse } from 'next/server';
import { admin } from '@/lib/supabase/admin';
import { getSessionUser } from '@/lib/supabase/server';
import { effectiveRevealStatus, resolveSharedContact, type RevealStatus } from '@/lib/validation';
import { sharedContactEmail, sendEmail, verifiedEmailFor, wantsEmail } from '@/lib/notify';

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { action, mark_sold } = await req.json().catch(() => ({}));
  if (action !== 'approve' && action !== 'decline' && action !== 'complete') {
    return NextResponse.json({ error: "action must be 'approve', 'decline', or 'complete'" }, { status: 400 });
  }

  const { data: existing } = await admin
    .from('reveal_requests')
    .select('id, listing_id, buyer_id, seller_id, status, expires_at, buyer_contact, listing:listings(title)')
    .eq('id', params.id)
    .single();
  if (!existing) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (existing.seller_id !== user.id) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const status = effectiveRevealStatus(existing.status as RevealStatus, existing.expires_at);
  if (action === 'complete') {
    if (status !== 'approved') {
      return NextResponse.json({ error: `only approved requests can be completed (this one is ${status})` }, { status: 409 });
    }
  } else if (status !== 'pending') {
    return NextResponse.json({ error: `request is already ${status}` }, { status: 409 });
  }

  const { data, error } = await admin
    .from('reveal_requests')
    .update({
      status: action === 'approve' ? 'approved' : action === 'complete' ? 'completed' : 'declined',
      resolved_at: new Date().toISOString(),
    })
    .eq('id', params.id)
    .select('id, status')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Event 2: the approval payload — email both parties the contact info
  // they're each owed (mutual reveal).
  if (action === 'approve') {
    const [{ data: buyerProfile }, { data: sellerProfile }, { data: listingRow }] = await Promise.all([
      admin.from('profiles').select('display_name, notify_prefs, contact_instagram, contact_phone, contact_email').eq('id', existing.buyer_id).single(),
      admin.from('profiles').select('display_name, notify_prefs, contact_instagram, contact_phone, contact_email').eq('id', existing.seller_id).single(),
      admin.from('listings').select('title, contact').eq('id', existing.listing_id).single(),
    ]);
    const listingTitle = listingRow?.title ?? 'a listing';

    // Buyer gets the seller's offered contact (all offered methods).
    const sellerShared = resolveSharedContact(listingRow?.contact ?? [], {
      instagram: sellerProfile?.contact_instagram ?? null,
      phone: sellerProfile?.contact_phone ?? null,
      email: sellerProfile?.contact_email ?? null,
    });
    if (Object.keys(sellerShared).length && wantsEmail(buyerProfile?.notify_prefs, 'approval')) {
      const to = await verifiedEmailFor(existing.buyer_id);
      if (to) {
        const { subject, html } = sharedContactEmail(sellerProfile?.display_name ?? 'The seller', listingTitle, sellerShared);
        void sendEmail(to, subject, html);
      }
    }

    // Seller gets the buyer's chosen contact (mutual — the new half).
    const buyerShared = resolveSharedContact((existing as unknown as { buyer_contact: string[] | null }).buyer_contact ?? [], {
      instagram: buyerProfile?.contact_instagram ?? null,
      phone: buyerProfile?.contact_phone ?? null,
      email: buyerProfile?.contact_email ?? null,
    });
    if (Object.keys(buyerShared).length && wantsEmail(sellerProfile?.notify_prefs, 'approval')) {
      const to = await verifiedEmailFor(existing.seller_id);
      if (to) {
        const { subject, html } = sharedContactEmail(buyerProfile?.display_name ?? 'The buyer', listingTitle, buyerShared);
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
