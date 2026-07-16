import { NextRequest, NextResponse } from 'next/server';
import { createSessionClient } from '@/lib/supabase/server';
import { isUscEmail } from '@/lib/validation';

export async function POST(req: NextRequest) {
  const { email } = await req.json().catch(() => ({}));
  if (typeof email !== 'string' || !isUscEmail(email)) {
    return NextResponse.json(
      { error: 'Flipd is USC-only for now — enter your @usc.edu address.' },
      { status: 400 },
    );
  }
  const supabase = createSessionClient();
  const origin = req.nextUrl.origin;
  const { error } = await supabase.auth.signInWithOtp({
    email: email.trim().toLowerCase(),
    options: { emailRedirectTo: `${origin}/auth/callback` },
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
