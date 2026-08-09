import { NextRequest, NextResponse } from 'next/server';
import { admin } from '@/lib/supabase/admin';
import { getRequestUser } from '@/lib/supabase/authAny';

// Grant or revoke consent to be texted. Separate from verification on purpose:
// proving you own a number is not agreeing to receive messages at it.
export async function POST(req: NextRequest) {
  const user = await getRequestUser(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { consent } = await req.json().catch(() => ({}));
  if (typeof consent !== 'boolean') {
    return NextResponse.json({ error: 'consent must be true or false' }, { status: 400 });
  }

  if (consent) {
    // Consent is meaningless on an unverified number — we would be agreeing on
    // behalf of whoever actually owns it.
    const { data: profile } = await admin
      .from('profiles')
      .select('phone_verified_at')
      .eq('id', user.id)
      .maybeSingle();
    if (!profile?.phone_verified_at) {
      return NextResponse.json({ error: 'Verify your phone number first.' }, { status: 400 });
    }
  }

  const { error } = await admin
    .from('profiles')
    .update({ sms_consent_at: consent ? new Date().toISOString() : null })
    .eq('id', user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, consent });
}
