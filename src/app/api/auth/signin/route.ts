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
  if (error) {
    // Supabase's built-in email sender is rate-limited. Surface a clear,
    // actionable message (and the real 429) instead of the raw text — and
    // point people to the code path so they aren't stuck waiting on a new email.
    const rateLimited =
      error.status === 429 ||
      error.code === 'over_email_send_rate_limit' ||
      /rate limit/i.test(error.message);
    if (rateLimited) {
      return NextResponse.json(
        { error: 'Too many emails just now. Wait about a minute, or if you already got a code, tap “Already have a code?” to enter it.' },
        { status: 429 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
