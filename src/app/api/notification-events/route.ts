import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/supabase/authAny';
import { admin } from '@/lib/supabase/admin';
import { notificationCursorFilter, parseNotificationCursor, serializeNotificationCursor } from '@/lib/notification-events';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EVENT_SELECT = 'id,event_key,event_type,wanted_post_id,wanted_offer_id,title,body,created_at,read_at,dismissed_at';

export async function GET(req: NextRequest) {
  const user = await getRequestUser(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const cursor = parseNotificationCursor(new URL(req.url).searchParams.get('cursor'));
  if (cursor === null) return NextResponse.json({ error: 'invalid cursor' }, { status: 400 });

  let query = admin
    .from('notification_events')
    .select(EVENT_SELECT)
    .eq('user_id', user.id)
    .is('dismissed_at', null)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(100);
  if (cursor) query = query.or(notificationCursorFilter(cursor));
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: 'unable to load notifications' }, { status: 500 });
  const rows = data ?? [];
  const last = rows[rows.length - 1];
  return NextResponse.json({
    notification_events: rows,
    next_cursor: rows.length === 100 && last
      ? serializeNotificationCursor({ created_at: last.created_at, id: last.id })
      : null,
  });
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
