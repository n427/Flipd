import { NextRequest, NextResponse } from 'next/server';
import { admin } from '@/lib/supabase/admin';
import { getRequestUser } from '@/lib/supabase/authAny';
import { effectiveRevealStatus, type RevealStatus } from '@/lib/validation';
import { approvedEmail, sendEmail, sendPush, verifiedEmailFor, wantsEmail, wantsPush } from '@/lib/notify';
import { deleteConversationForRequest } from '@/lib/conversation-deletion';

const DECLINE_REASONS = ['bad_timing', 'already_sold', 'not_enough_info'];

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  // Web cookie session OR mobile Bearer token.
  const user = await getRequestUser(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { action, mark_sold, decline_reason } = await req.json().catch(() => ({}));
  if (action !== 'approve' && action !== 'decline') {
    return NextResponse.json({ error: "action must be 'approve' or 'decline'" }, { status: 400 });
  }
  // Optional: declining without a reason stays a single tap.
  if (decline_reason != null && !DECLINE_REASONS.includes(decline_reason)) {
    return NextResponse.json({ error: 'unknown decline_reason' }, { status: 400 });
  }

  const { data: existing } = await admin
    .from('reveal_requests')
    .select('id, listing_id, listing_title, buyer_id, seller_id, status, expires_at')
    .eq('id', id)
    .single();
  if (!existing) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (existing.seller_id !== user.id) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const status = effectiveRevealStatus(existing.status as RevealStatus, existing.expires_at);
  if (action === 'decline') {
    // Decline stays available after approval: talking to someone is not a
    // commitment, and without this a seller who changed their mind had no way
    // to close the request. Any conversation opened by the approval is removed
    // below so the request and conversation cannot disagree about being open.
    if (status !== 'pending' && status !== 'approved') {
      return NextResponse.json({ error: `request is already ${status}` }, { status: 409 });
    }
  } else if (status !== 'pending') {
    return NextResponse.json({ error: `request is already ${status}` }, { status: 409 });
  }

  const { data, error } = await admin
    .from('reveal_requests')
    .update({
      status: action === 'approve' ? 'approved' : 'declined',
      resolved_at: new Date().toISOString(),
      ...(action === 'decline' && decline_reason ? { decline_reason } : {}),
    })
    .eq('id', id)
    .select('id, status')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // A declined request is closed everywhere. message_threads owns messages
  // and attachment metadata through cascading foreign keys, so removing the
  // linked thread also removes the conversation history.
  if (action === 'decline') {
    try {
      await deleteConversationForRequest(admin, existing.id);
    } catch (threadError) {
      return NextResponse.json(
        { error: threadError instanceof Error ? threadError.message : 'Could not delete conversation' },
        { status: 500 },
      );
    }
  }

  // Event 2: approval opens a thread. No contact details change hands — the
  // conversation happens in Flipd, and the notification points at it.
  let threadId: string | null = null;
  if (action === 'approve') {
    const [{ data: buyerProfile }, { data: sellerProfile }, { data: listingRow }] = await Promise.all([
      admin.from('profiles').select('display_name, notify_prefs').eq('id', existing.buyer_id).single(),
      admin.from('profiles').select('display_name, notify_prefs').eq('id', existing.seller_id).single(),
      admin.from('listings').select('title').eq('id', existing.listing_id).single(),
    ]);
    const listingTitle = listingRow?.title ?? existing.listing_title ?? 'a listing';

    // request_id is unique, so a double-approve returns the existing thread
    // rather than creating a second one.
    const { data: thread, error: threadError } = await admin
      .from('message_threads')
      .upsert(
        {
          request_id: existing.id,
          listing_id: existing.listing_id,
          listing_title: listingTitle,
          buyer_id: existing.buyer_id,
          seller_id: existing.seller_id,
        },
        { onConflict: 'request_id' },
      )
      .select('id')
      .single();
    if (threadError) return NextResponse.json({ error: threadError.message }, { status: 500 });
    threadId = thread?.id ?? null;

    if (wantsEmail(buyerProfile?.notify_prefs, 'approval')) {
      const to = await verifiedEmailFor(existing.buyer_id);
      if (to) {
        const { subject, html } = approvedEmail(sellerProfile?.display_name ?? 'The seller', listingTitle);
        void sendEmail(to, subject, html);
      }
    }

    // Push: the buyer was waiting on this outcome — tell them it's approved.
    if (wantsPush(buyerProfile?.notify_prefs, 'approval'))
      void sendPush(existing.buyer_id, 'Request approved', `${sellerProfile?.display_name ?? 'The seller'} approved your request for “${listingTitle}”. You can message them now.`, {
        type: 'approval',
        reveal_id: existing.id,
        thread_id: threadId,
      });
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
      .neq('id', id);
  }

  // thread_id lets the client navigate straight into the conversation instead
  // of making the seller go find it.
  return NextResponse.json({ reveal: data, thread_id: threadId });
}
