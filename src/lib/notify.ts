// Outbound notification layer (server only). Email via Resend's REST API —
// key comes from RESEND_API_KEY in the environment; with no key set, sends
// are logged instead so development works without a provider. SMS is a
// deferred opt-in: prefs carry the shape, nothing sends yet.
import { admin } from './supabase/admin';

export type NotifyEvent = 'new_request' | 'approval' | 'reminder' | 'expiry' | 'new_message' | 'popup_reminder' | 'listing_match';

// A digest match, as produced by src/lib/digest/match.ts. Duplicated here
// rather than imported so notify stays the lower layer with no dependency on
// the digest feature — see the same rationale on popupReminderEmail's stage
// union below.
type DigestMatch = { id: string; reason: string };
type DigestListing = { id: string; title: string; price: number; category: string };

// `app` is what the preference UI writes for push. `push` is the older key
// from before in-app notifications had a name in the UI; it is still honoured
// so existing rows keep working rather than silently flipping back on.
type NotifyPrefs = Partial<Record<NotifyEvent, { app?: boolean; email?: boolean; sms?: boolean; push?: boolean }>>;

// Email defaults ON for every event; a stored `false` turns it off.
export function wantsEmail(prefs: unknown, event: NotifyEvent): boolean {
  const p = (prefs ?? {}) as NotifyPrefs;
  return p[event]?.email !== false;
}

// Push defaults ON for every event; a stored `false` turns it off. Reads both
// keys so a profile saved under either shape is respected.
export function wantsPush(prefs: unknown, event: NotifyEvent): boolean {
  const p = (prefs ?? {}) as NotifyPrefs;
  return p[event]?.app !== false && p[event]?.push !== false;
}

// SMS defaults OFF — the inverse of email and push. A text nobody asked for is
// the fastest way to get a sender filtered by carriers, and an opt-out default
// would contradict what consent means. Only an explicit `true` enables it.
export function wantsSms(prefs: unknown, event: NotifyEvent): boolean {
  const p = (prefs ?? {}) as NotifyPrefs;
  return p[event]?.sms === true;
}

export type SmsProfile = {
  phone_verified_at: string | null;
  sms_consent_at: string | null;
  notify_prefs: unknown;
};

// Three independent gates, all required. Owning a number is not agreeing to be
// texted, and agreeing to be texted is not agreeing to every event — so these
// can never collapse into one flag. A missing profile fails closed: the caller
// could not prove consent, which is the same as not having it.
export function canSms(profile: SmsProfile | null | undefined, event: NotifyEvent): boolean {
  if (!profile) return false;
  return (
    profile.phone_verified_at != null &&
    profile.sms_consent_at != null &&
    wantsSms(profile.notify_prefs, event)
  );
}

// The delivery address is the auth account's verified USC email — not the
// editable contact_email profile field.
export async function verifiedEmailFor(userId: string): Promise<string | null> {
  try {
    const { data, error } = await admin.auth.admin.getUserById(userId);
    if (error || !data.user?.email) return null;
    return data.user.email;
  } catch {
    return null; // demo profiles have no auth user
  }
}

export async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.log(`[notify] (no RESEND_API_KEY — would send) to=${to} subject="${subject}"`);
    return;
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM || 'Flipd <onboarding@resend.dev>',
        to,
        subject,
        html,
      }),
    });
    if (!res.ok) console.error('[notify] send failed', res.status, await res.text());
  } catch (err) {
    console.error('[notify] send error', err);
  }
}

// SMS, provider-agnostic. Deliberately shaped like sendEmail: with nothing
// configured the send is logged instead, so the whole notification path is
// testable before a provider account exists.
//
// The endpoint is an env var, not a constant, so choosing a provider in Step 3
// of the spec is a configuration change rather than a code change — and there
// is no fake URL sitting in the source pretending to be wired up.
//
// Callers must gate on wantsSms() AND the profile's verified/consent
// timestamps. This function does not check consent; it only delivers.
export async function sendSms(to: string, body: string): Promise<void> {
  const key = process.env.SMS_API_KEY;
  const url = process.env.SMS_API_URL;
  // Never log `body` — unlike sendEmail's subject, an SMS body can carry a
  // one-time verification code, and with no provider configured in any
  // environment right now this line runs on every send. The log should record
  // that a message went out, not what it said, so only the length is here.
  if (!key) {
    console.log(`[notify] (no SMS_API_KEY — would send) to=${to} bodyLength=${body.length}`);
    return;
  }
  if (!url) {
    console.log(`[notify] (no SMS provider configured — would send) to=${to} bodyLength=${body.length}`);
    return;
  }
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: process.env.SMS_FROM || '', to, body }),
    });
    if (!res.ok) console.error('[notify] sms failed', res.status, await res.text());
  } catch (err) {
    console.error('[notify] sms error', err);
  }
}

// Push via Expo's push service. Best-effort: no tokens (or the table not yet
// migrated) means a quiet no-op — never blocks the request. Expo dedupes and
// routes to APNs/FCM for us, so we just POST the messages.
export async function sendPush(
  userId: string,
  title: string,
  body: string,
  data?: Record<string, unknown>,
): Promise<void> {
  let tokens: string[] = [];
  try {
    const { data: rows, error } = await admin
      .from('push_tokens')
      .select('token')
      .eq('user_id', userId);
    if (error) return; // table missing or unreadable — skip silently
    tokens = (rows ?? []).map((r) => r.token as string);
  } catch {
    return;
  }
  if (tokens.length === 0) return;

  const messages = tokens.map((to) => ({ to, title, body, sound: 'default', data: data ?? {} }));
  try {
    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(messages),
    });
    if (!res.ok) {
      console.error('[notify] push failed', res.status, await res.text());
      return;
    }
    // Prune tokens Expo reports as unregistered so they stop being retried.
    const json = (await res.json().catch(() => null)) as { data?: { status: string; details?: { error?: string } }[] } | null;
    const dead: string[] = [];
    json?.data?.forEach((r, i) => {
      if (r.status === 'error' && r.details?.error === 'DeviceNotRegistered') dead.push(tokens[i]);
    });
    if (dead.length) {
      await admin.from('push_tokens').delete().in('token', dead);
    }
  } catch (err) {
    console.error('[notify] push error', err);
  }
}

const wrap = (body: string) =>
  `<div style="font-family:sans-serif;font-size:15px;line-height:1.6;color:#111;max-width:480px">
    <p style="font-weight:800;font-size:18px;margin:0 0 16px">Flipd<span style="color:#990000">.</span></p>
    ${body}
    <p style="font-size:12px;color:#98a0a8;margin-top:24px">You can change notification settings in your Flipd profile.</p>
  </div>`;

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Event 1 — seller: someone asked. No contact info in this email.
export function newRequestEmail(buyerName: string, listingTitle: string) {
  return {
    subject: `${buyerName} wants to connect about "${listingTitle}"`,
    html: wrap(
      `<p><strong>${esc(buyerName)}</strong> tapped Reveal Contact on <strong>${esc(listingTitle)}</strong>.</p>
       <p>You have 72 hours to approve or decline in your Requests inbox.</p>`,
    ),
  };
}

// Event 2 — approved. Carries no contact details: the conversation lives in
// Flipd now, so this email's job is to send the buyer back to the app.
export function approvedEmail(actorName: string, listingTitle: string) {
  return {
    subject: `${actorName} approved your request for "${listingTitle}"`,
    html: wrap(
      `<p><strong>${esc(actorName)}</strong> approved your request on <strong>${esc(listingTitle)}</strong>.</p>
       <p>Your conversation is open in Flipd. Head to your requests to pick up where you left off.</p>`,
    ),
  };
}

// A message arrived in an open thread.
export function newMessageEmail(senderName: string, listingTitle: string) {
  return {
    subject: `${senderName} sent you a message about "${listingTitle}"`,
    html: wrap(
      `<p><strong>${esc(senderName)}</strong> messaged you about <strong>${esc(listingTitle)}</strong>.</p>
       <p>Open Flipd to read it and reply.</p>`,
    ),
  };
}

// Event 3 — seller: request expiring soon. No contact info.
export function reminderEmail(buyerName: string, listingTitle: string, hoursLeft: number) {
  return {
    subject: `${buyerName}'s request expires in about ${hoursLeft}h`,
    html: wrap(
      `<p><strong>${esc(buyerName)}</strong> is still waiting on <strong>${esc(listingTitle)}</strong>.</p>
       <p>Their request expires in about ${hoursLeft} hours. Approve or decline in your Requests inbox.</p>`,
    ),
  };
}

// Event 4 — buyer: request expired. No contact info.
export function expiryEmail(listingTitle: string) {
  return {
    subject: `Your request for "${listingTitle}" expired`,
    html: wrap(
      `<p>Your reveal request for <strong>${esc(listingTitle)}</strong> wasn't answered within 72 hours, so it expired.</p>
       <p>If the listing is still up, you can ask again.</p>`,
    ),
  };
}

// Buyer opt-in: a popup they asked to be reminded about is coming up. One
// function rather than two near-identical ones, because only the framing
// differs by lead time — "tomorrow" is actively wrong an hour beforehand, and
// "starting soon" is wrong a day out. The stage union is inline rather than
// imported from the sweep: notify is the lower layer and must not depend on it.
export function popupReminderEmail(listingTitle: string, whenLabel: string, stage: '24h' | '1h') {
  const imminent = stage === '1h';
  return {
    subject: imminent
      ? `Starting soon: "${listingTitle}"`
      : `Tomorrow: "${listingTitle}"`,
    html: wrap(
      `<p><strong>${esc(listingTitle)}</strong> ${
        imminent ? 'starts in about an hour' : 'is happening tomorrow'
      } — <strong>${esc(whenLabel)}</strong>.</p>
       <p>You asked us to remind you — see you there.</p>`,
    ),
  };
}

// Optional: no site-URL constant exists anywhere else in this codebase (the
// app has no canonical public web address wired in yet), so a match renders
// as a plain-text title — matching every sibling email above, none of which
// link out either — unless this is set, in which case it becomes a real link.
const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || '').replace(/\/+$/, '');

const priceLabel = (price: number) =>
  price > 0 ? `$${price.toLocaleString('en-US')}` : 'Free';

// Buyer, opt-in: today's picks from what they saved, messaged about, and
// searched. Unlike the single-listing emails above, this one already knows
// its own recipient and sends itself — by the time the digest producer has
// matches in hand there is no `{ subject, html }` pair left for it to do
// anything else with, so — unlike its siblings — this is the one email
// function in this file that calls sendEmail() itself.
export async function digestEmail(
  email: string,
  matches: DigestMatch[],
  pool: DigestListing[],
): Promise<void> {
  const byId = new Map(pool.map((l) => [l.id, l]));
  const rows = matches
    .map((m) => {
      const listing = byId.get(m.id);
      // Defensive only: matchListings/parseMatches already validate every id
      // against this same pool, so this should never be hit.
      if (!listing) return '';
      const href = SITE_URL ? `${SITE_URL}/listing/${listing.id}` : null;
      const title = href
        ? `<a href="${href}" style="color:#111;text-decoration:underline">${esc(listing.title)}</a>`
        : `<strong>${esc(listing.title)}</strong>`;
      return `<p style="margin:0 0 16px">
        ${title} — ${priceLabel(listing.price)}<br/>
        <span style="color:#5a6169">${esc(m.reason)}</span>
      </p>`;
    })
    .filter(Boolean)
    .join('');

  const subject = `${matches.length} listing${matches.length === 1 ? '' : 's'} you might want`;
  const html = wrap(
    `<p>Based on what you've saved, messaged about, and searched for:</p>
     ${rows}`,
  );
  await sendEmail(email, subject, html);
}
