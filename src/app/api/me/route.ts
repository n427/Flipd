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

export async function PATCH(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({}));

  const update: Record<string, string | null> = {};
  for (const key of EDITABLE) {
    if (typeof body[key] === 'string') update[key] = body[key].trim() || null;
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'nothing to update' }, { status: 400 });
  }
  if (update.contact_method && !CONTACT_METHODS.includes(update.contact_method)) {
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
