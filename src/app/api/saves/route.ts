import { NextRequest, NextResponse } from 'next/server';
import { admin as supabase } from '@/lib/supabase/admin';

export async function GET() {
  const { data, error } = await supabase.from('saves').select('listing_id');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ids: data.map((r) => r.listing_id) });
}

export async function POST(req: NextRequest) {
  const { listing_id } = await req.json().catch(() => ({}));
  if (!listing_id) return NextResponse.json({ error: 'listing_id required' }, { status: 400 });
  const { error } = await supabase.from('saves').upsert({ listing_id });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const { listing_id } = await req.json().catch(() => ({}));
  if (!listing_id) return NextResponse.json({ error: 'listing_id required' }, { status: 400 });
  const { error } = await supabase.from('saves').delete().eq('listing_id', listing_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
