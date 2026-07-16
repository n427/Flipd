import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const { data, error } = await supabase
    .from('listings')
    .select('*')
    .eq('id', params.id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  return NextResponse.json({ listing: data });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const body = await req.json().catch(() => ({}));
  if (typeof body.archived !== 'boolean') {
    return NextResponse.json({ error: 'archived (boolean) required' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('listings')
    .update({ archived: body.archived })
    .eq('id', params.id)
    .select()
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message || 'not found' }, { status: 404 });
  }
  return NextResponse.json({ listing: data });
}
