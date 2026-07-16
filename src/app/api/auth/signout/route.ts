import { NextResponse } from 'next/server';
import { createSessionClient } from '@/lib/supabase/server';

export async function POST() {
  const supabase = createSessionClient();
  await supabase.auth.signOut();
  return NextResponse.json({ ok: true });
}
