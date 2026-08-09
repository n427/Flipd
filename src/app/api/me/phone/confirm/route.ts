import { NextRequest, NextResponse } from 'next/server';
import { admin } from '@/lib/supabase/admin';
import { getRequestUser } from '@/lib/supabase/authAny';
import { hashCode, MAX_ATTEMPTS } from '@/lib/sms/verification';

// Check a code and, on success, mark the number verified. Consent is NOT
// granted here — agreeing to be texted is a separate act, so this only proves
// ownership.
export async function POST(req: NextRequest) {
  const user = await getRequestUser(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { code } = await req.json().catch(() => ({}));
  if (typeof code !== 'string' || !/^\d{6}$/.test(code.trim())) {
    return NextResponse.json({ error: 'Enter the 6-digit code.' }, { status: 400 });
  }

  const { data: row } = await admin
    .from('phone_verifications')
    .select('phone, code_hash, expires_at, attempts')
    .eq('user_id', user.id)
    .maybeSingle();
  if (!row) return NextResponse.json({ error: 'Request a code first.' }, { status: 400 });

  if (new Date(row.expires_at).getTime() < Date.now()) {
    await admin.from('phone_verifications').delete().eq('user_id', user.id);
    return NextResponse.json({ error: 'That code expired. Request a new one.' }, { status: 400 });
  }

  if (row.attempts >= MAX_ATTEMPTS) {
    await admin.from('phone_verifications').delete().eq('user_id', user.id);
    return NextResponse.json({ error: 'Too many attempts. Request a new code.' }, { status: 429 });
  }

  if (hashCode(code.trim(), user.id) !== row.code_hash) {
    // Count the failure before answering, so a burst of guesses cannot outrun
    // the increment.
    await admin
      .from('phone_verifications')
      .update({ attempts: row.attempts + 1 })
      .eq('user_id', user.id);
    return NextResponse.json({ error: 'That code is not right.' }, { status: 400 });
  }

  // TWO statements, in this order, and it must stay that way. The before-update
  // trigger assigns new.phone_verified_at := null whenever contact_phone
  // differs from the old value — it would clobber the timestamp if both were
  // set in a single update. So: write the number first and let the trigger
  // clear (it is clearing values that are already null or stale), then set the
  // timestamp in a second update that leaves contact_phone untouched, which
  // the trigger ignores.
  const { error: phoneError } = await admin
    .from('profiles')
    .update({ contact_phone: row.phone })
    .eq('id', user.id);
  if (phoneError) return NextResponse.json({ error: phoneError.message }, { status: 500 });

  const { error: stampError } = await admin
    .from('profiles')
    .update({ phone_verified_at: new Date().toISOString() })
    .eq('id', user.id);
  if (stampError) return NextResponse.json({ error: stampError.message }, { status: 500 });

  await admin.from('phone_verifications').delete().eq('user_id', user.id);
  return NextResponse.json({ ok: true, phone: row.phone });
}
