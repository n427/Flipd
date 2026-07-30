import { NextRequest, NextResponse } from 'next/server';
import { admin } from '@/lib/supabase/admin';
import { getRequestUser } from '@/lib/supabase/authAny';

export async function GET(req: NextRequest) {
  // Web cookie session OR mobile Bearer token.
  const user = await getRequestUser(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { data, error } = await admin
    .from('blocks')
    .select('blocked_id')
    .eq('blocker_id', user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ids: data.map((r) => r.blocked_id) });
}

export async function POST(req: NextRequest) {
  const user = await getRequestUser(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { user_id } = await req.json().catch(() => ({}));
  if (!user_id || user_id === user.id) {
    return NextResponse.json({ error: 'user_id required' }, { status: 400 });
  }
  const { error } = await admin
    .from('blocks')
    .upsert({ blocker_id: user.id, blocked_id: user_id });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const user = await getRequestUser(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { user_id } = await req.json().catch(() => ({}));
  if (!user_id) return NextResponse.json({ error: 'user_id required' }, { status: 400 });
  const { error } = await admin
    .from('blocks')
    .delete()
    .eq('blocker_id', user.id)
    .eq('blocked_id', user_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
