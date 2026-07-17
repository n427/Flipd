import { NextRequest, NextResponse } from 'next/server';
import { admin as supabase } from '@/lib/supabase/admin';
import { getSessionUser } from '@/lib/supabase/server';

const SELLER_JOIN = '*, seller:profiles!listings_seller_id_fkey(id, display_name, handle, school_unit, class_year, is_demo)';

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { data, error } = await supabase
    .from('listings')
    .select(SELLER_JOIN)
    .eq('id', params.id)
    .single();

  if (error || !data) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (data.archived && data.seller_id !== user.id) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  return NextResponse.json({ listing: data });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  if (typeof body.archived !== 'boolean') {
    return NextResponse.json({ error: 'archived (boolean) required' }, { status: 400 });
  }

  const { data: existing } = await supabase
    .from('listings')
    .select('seller_id')
    .eq('id', params.id)
    .single();
  if (!existing) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (existing.seller_id !== user.id) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const { data, error } = await supabase
    .from('listings')
    .update({ archived: body.archived })
    .eq('id', params.id)
    .select(SELLER_JOIN)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message || 'not found' }, { status: 404 });
  }
  return NextResponse.json({ listing: data });
}
