import { NextRequest, NextResponse } from 'next/server';
import { admin } from '@/lib/supabase/admin';
import { getSessionUser } from '@/lib/supabase/server';

const REASONS = ['scam', 'prohibited', 'harassment', 'other'];

// Report capture only — no moderation surface reads these yet.
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { listing_id, user_id, reason, note } = await req.json().catch(() => ({}));
  if (!listing_id && !user_id) {
    return NextResponse.json({ error: 'a listing or user target is required' }, { status: 400 });
  }
  if (typeof reason !== 'string' || !REASONS.includes(reason)) {
    return NextResponse.json({ error: 'pick a reason' }, { status: 400 });
  }
  const fullReason = typeof note === 'string' && note.trim()
    ? `${reason}: ${note.trim().slice(0, 500)}`
    : reason;

  const { error } = await admin.from('reports').insert({
    reporter_id: user.id,
    target_listing_id: listing_id ?? null,
    target_user_id: user_id ?? null,
    reason: fullReason,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
