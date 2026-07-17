import { NextRequest, NextResponse } from 'next/server';
import { admin } from '@/lib/supabase/admin';
import { getSessionUser } from '@/lib/supabase/server';

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { data } = await admin.from('profiles').select('*').eq('id', user.id).single();
  return NextResponse.json({ profile: data ?? null });
}

const EDITABLE = [
  'display_name', 'handle', 'school_unit', 'class_year', 'bio', 'avatar_url',
  'contact_method', 'contact_instagram', 'contact_phone', 'contact_email',
] as const;

const CONTACT_METHODS = ['instagram', 'phone', 'email'];
const NOTIFY_EVENTS = ['new_request', 'approval', 'reminder', 'expiry'];

export async function PATCH(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({}));

  const update: Record<string, unknown> = {};
  for (const key of EDITABLE) {
    if (typeof body[key] === 'string') update[key] = body[key].trim() || null;
  }
  if (body.notify_prefs && typeof body.notify_prefs === 'object') {
    const prefs: Record<string, { email?: boolean; sms?: boolean }> = {};
    for (const ev of NOTIFY_EVENTS) {
      const entry = body.notify_prefs[ev];
      if (entry && typeof entry === 'object') {
        prefs[ev] = {};
        if (typeof entry.email === 'boolean') prefs[ev].email = entry.email;
        if (typeof entry.sms === 'boolean') prefs[ev].sms = entry.sms;
      }
    }
    update.notify_prefs = prefs;
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'nothing to update' }, { status: 400 });
  }
  if (typeof update.contact_method === 'string' && !CONTACT_METHODS.includes(update.contact_method)) {
    return NextResponse.json({ error: 'invalid contact method' }, { status: 400 });
  }
  const { data, error } = await admin
    .from('profiles')
    .update(update)
    .eq('id', user.id)
    .select()
    .single();
  if (error) {
    const msg = error.code === '23505' ? 'That handle is taken.' : error.message;
    return NextResponse.json({ error: msg }, { status: 400 });
  }
  return NextResponse.json({ profile: data });
}
