import { NextRequest, NextResponse } from 'next/server';
import { admin } from '@/lib/supabase/admin';
import { getRequestUser } from '@/lib/supabase/authAny';

export async function GET(req: NextRequest) {
  const user = await getRequestUser(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { data } = await admin.from('profiles').select('*').eq('id', user.id).single();
  return NextResponse.json({ profile: data ?? null });
}

const EDITABLE = [
  'display_name', 'handle', 'school_unit', 'class_year', 'bio', 'avatar_url',
  'contact_method', 'contact_instagram', 'contact_phone', 'contact_email',
  'heard_from', 'heard_from_detail',
] as const;

const CONTACT_METHODS = ['instagram', 'phone', 'email'];
// Must match the CHECK constraint in migration 022_signup_attribution.sql and
// CHANNELS in src/app/onboarding/page.tsx.
const HEARD_FROM = ['instagram', 'friend', 'flyer', 'class_club', 'other'];
// Attribution describes the moment of signup, so it is captured once and never
// revised — see the write-once guard in PATCH below.
const WRITE_ONCE = ['heard_from', 'heard_from_detail'] as const;
const NOTIFY_EVENTS = ['new_request', 'approval', 'reminder', 'expiry', 'new_message'];

export async function PATCH(req: NextRequest) {
  const user = await getRequestUser(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({}));

  const update: Record<string, unknown> = {};
  for (const key of EDITABLE) {
    if (typeof body[key] === 'string') update[key] = body[key].trim() || null;
  }
  if (body.notify_prefs && typeof body.notify_prefs === 'object') {
    const prefs: Record<string, { app?: boolean; email?: boolean; sms?: boolean }> = {};
    for (const ev of NOTIFY_EVENTS) {
      const entry = body.notify_prefs[ev];
      if (entry && typeof entry === 'object') {
        prefs[ev] = {};
        if (typeof entry.app === 'boolean') prefs[ev].app = entry.app;
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
  if (typeof update.heard_from === 'string' && !HEARD_FROM.includes(update.heard_from)) {
    return NextResponse.json({ error: 'invalid attribution channel' }, { status: 400 });
  }

  // Write-once: attribution may be set during onboarding but never changed
  // afterwards. A user who resubmits onboarding did nothing wrong, so the
  // already-answered case drops the field rather than failing the whole PATCH.
  if (WRITE_ONCE.some((k) => k in update)) {
    const { data: existing } = await admin
      .from('profiles')
      .select('heard_from')
      .eq('id', user.id)
      .single();
    // heard_from is the sentinel for the pair: the detail is only ever
    // meaningful alongside the channel it explains.
    if (existing?.heard_from) {
      for (const k of WRITE_ONCE) delete update[k];
    }
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ profile: null, unchanged: true });
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
