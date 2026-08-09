import { NextRequest, NextResponse } from 'next/server';
import { admin } from '@/lib/supabase/admin';
import { isStopKeyword, normalizePhone } from '@/lib/sms/verification';

// Inbound SMS from the provider. Honoring STOP is a carrier requirement, not a
// feature — a sender that ignores it gets filtered regardless of what the law
// says.
//
// Shared-secret auth rather than a provider signature, because the provider is
// not chosen yet and signature schemes are provider-specific. Without this an
// anonymous caller could unsubscribe any number they can guess. Swap in real
// signature verification when the provider is picked.
export async function POST(req: NextRequest) {
  const secret = process.env.SMS_WEBHOOK_SECRET;
  const auth = req.headers.get('authorization');
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { from, body } = await req.json().catch(() => ({}));
  const e164 = typeof from === 'string' ? normalizePhone(from) : null;
  if (!e164 || typeof body !== 'string') {
    return NextResponse.json({ error: 'from and body required' }, { status: 400 });
  }

  if (!isStopKeyword(body)) {
    // Not an opt-out. Acknowledge so the provider does not retry; there is no
    // inbound-message feature to route it to.
    return NextResponse.json({ ok: true, action: 'ignored' });
  }

  // Revoke consent, leaving verification intact — they still own the number,
  // they just do not want texts. Matching on contact_phone is why the trigger
  // matters: a stale number here would revoke the wrong person's consent.
  const { error } = await admin
    .from('profiles')
    .update({ sms_consent_at: null })
    .eq('contact_phone', e164);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, action: 'stopped' });
}
