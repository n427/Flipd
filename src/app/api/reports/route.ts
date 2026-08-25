import { NextRequest, NextResponse } from 'next/server';
import { admin } from '@/lib/supabase/admin';
import { getRequestUser } from '@/lib/supabase/authAny';
import { parseReportTarget } from '@/lib/report-target';
import { wantedPermissions } from '@/lib/wanted-authorization';

const REASONS = ['scam', 'prohibited', 'harassment', 'other'];

// Report capture only — no moderation surface reads these yet.
export async function POST(req: NextRequest) {
  // Web cookie session OR mobile Bearer token.
  const user = await getRequestUser(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const target = parseReportTarget(body);
  if (!target) {
    return NextResponse.json({ error: 'exactly one report target is required' }, { status: 400 });
  }
  const { reason, note } = body;
  if (typeof reason !== 'string' || !REASONS.includes(reason)) {
    return NextResponse.json({ error: 'pick a reason' }, { status: 400 });
  }
  const fullReason = typeof note === 'string' && note.trim()
    ? `${reason}: ${note.trim().slice(0, 500)}`
    : reason;

  if (target.kind === 'thread') {
    const { data: thread } = await admin
      .from('message_threads')
      .select('buyer_id, seller_id')
      .eq('id', target.id)
      .maybeSingle();
    if (!thread || (thread.buyer_id !== user.id && thread.seller_id !== user.id)) {
      return NextResponse.json({ error: 'conversation not found' }, { status: 403 });
    }
  }
  if (target.kind === 'wanted_offer') {
    const { data: offer } = await admin
      .from('wanted_offers')
      .select('buyer_id, seller_id, status, completed_at')
      .eq('id', target.id)
      .or(`buyer_id.eq.${user.id},seller_id.eq.${user.id}`)
      .maybeSingle();
    const permitted = offer && wantedPermissions({
      actor: offer.buyer_id === user.id ? 'owner' : 'seller',
      postStatus: offer.status === 'accepted' ? 'fulfilled' : 'active',
      offerStatus: offer.status,
      blocked: false,
      offerCompleted: Boolean(offer.completed_at),
      competingAccepted: false,
    }).reportOffer;
    if (!permitted) {
      // A private offer's existence and participants are not public metadata.
      return NextResponse.json({ error: 'wanted offer not found' }, { status: 404 });
    }
  }

  const { error } = await admin.from('reports').insert({
    reporter_id: user.id,
    target_listing_id: target.kind === 'listing' ? target.id : null,
    target_user_id: target.kind === 'user' ? target.id : null,
    target_thread_id: target.kind === 'thread' ? target.id : null,
    target_wanted_post_id: target.kind === 'wanted_post' ? target.id : null,
    target_wanted_offer_id: target.kind === 'wanted_offer' ? target.id : null,
    reason: fullReason,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
