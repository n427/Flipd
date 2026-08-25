import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/supabase/authAny';
import { admin } from '@/lib/supabase/admin';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EVENT_SELECT = 'id,event_key,event_type,wanted_post_id,wanted_offer_id,title,body,created_at,read_at,dismissed_at';

export async function GET(req: NextRequest) {
  const user = await getRequestUser(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { data, error } = await admin
    .from('notification_events')
    .select(EVENT_SELECT)
    .eq('user_id', user.id)
    .is('dismissed_at', null)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) return NextResponse.json({ error: 'unable to load notifications' }, { status: 500 });
  return NextResponse.json({ notification_events: data ?? [] });
}

export async function PATCH(req: NextRequest) {
  const user = await getRequestUser(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'invalid notification action' }, { status: 400 });
  }
  const { ids, action } = body as { ids?: unknown; action?: unknown };
  if (!Array.isArray(ids) || ids.length < 1 || ids.length > 100
      || ids.some((id) => typeof id !== 'string' || !UUID.test(id))
      || (action !== 'read' && action !== 'dismiss')) {
    return NextResponse.json({ error: 'invalid notification action' }, { status: 400 });
  }

  const now = new Date().toISOString();
  const update = action === 'read' ? { read_at: now } : { dismissed_at: now, read_at: now };
  const { data, error } = await admin
    .from('notification_events')
    .update(update)
    .eq('user_id', user.id)
    .in('id', Array.from(new Set(ids)))
    .select(EVENT_SELECT);
  if (error) return NextResponse.json({ error: 'unable to update notifications' }, { status: 500 });
  return NextResponse.json({ notification_events: data ?? [] });
}
