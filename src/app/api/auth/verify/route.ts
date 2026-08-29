import { NextRequest, NextResponse } from 'next/server';
import { admin } from '@/lib/supabase/admin';
import { createSessionClient } from '@/lib/supabase/server';
import { isUscEmail } from '@/lib/validation';

// Code-based sign-in: verifies the 6-digit OTP Supabase emails alongside the
// magic link. Needed because university mail scanners prefetch (and consume)
// one-time links before the user can click them — a code can't be spent that way.
export async function POST(req: NextRequest) {
  const { email, code } = await req.json().catch(() => ({}));
  if (typeof email !== 'string' || !isUscEmail(email)) {
    return NextResponse.json({ error: 'Enter your @usc.edu or @alumni.usc.edu address.' }, { status: 400 });
  }
  if (typeof code !== 'string' || !/^\d{6,8}$/.test(code.trim())) {
    return NextResponse.json({ error: 'Enter the sign-in code from your email.' }, { status: 400 });
  }

  const supabase = await createSessionClient();
  const { data, error } = await supabase.auth.verifyOtp({
    email: email.trim().toLowerCase(),
    token: code.trim(),
    type: 'email',
  });
  if (error || !data.user) {
    return NextResponse.json(
      { error: 'That code is invalid or expired — request a new one.' },
      { status: 400 },
    );
  }

  const { data: profile } = await admin
    .from('profiles')
    .select('display_name, contact_method')
    .eq('id', data.user.id)
    .single();

  return NextResponse.json({ ok: true, onboarded: Boolean(profile?.display_name && profile?.contact_method) });
}
