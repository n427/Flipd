import { NextRequest, NextResponse } from 'next/server';
import { admin } from '@/lib/supabase/admin';
import { getRequestUser } from '@/lib/supabase/authAny';
import { sendSms } from '@/lib/notify';
import { generateCode, hashCode, normalizePhone, CODE_TTL_MS, RESEND_COOLDOWN_MS } from '@/lib/sms/verification';

// Send a verification code to a phone number. Upserts one pending code per
// user, so requesting a new code invalidates the previous one rather than
// leaving several valid at once.
export async function POST(req: NextRequest) {
  const user = await getRequestUser(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { phone } = await req.json().catch(() => ({}));
  const e164 = typeof phone === 'string' ? normalizePhone(phone) : null;
  if (!e164) {
    return NextResponse.json({ error: 'Enter a valid US phone number.' }, { status: 400 });
  }

  // Cooldown before anything is sent. Each code costs money and a tight loop
  // here is both an abuse vector and a way to get a sender flagged.
  const { data: existing } = await admin
    .from('phone_verifications')
    .select('sent_at')
    .eq('user_id', user.id)
    .maybeSingle();
  if (existing?.sent_at && Date.now() - new Date(existing.sent_at).getTime() < RESEND_COOLDOWN_MS) {
    return NextResponse.json({ error: 'Wait a minute before requesting another code.' }, { status: 429 });
  }

  const code = generateCode();
  const { error } = await admin.from('phone_verifications').upsert(
    {
      user_id: user.id,
      phone: e164,
      code_hash: hashCode(code, user.id),
      expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString(),
      attempts: 0,
      sent_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await sendSms(e164, `Your Flipd verification code is ${code}. It expires in 10 minutes.`);
  return NextResponse.json({ ok: true });
}
