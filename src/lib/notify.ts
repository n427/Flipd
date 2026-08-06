// Outbound notification layer (server only). Email via Resend's REST API —
// key comes from RESEND_API_KEY in the environment; with no key set, sends
// are logged instead so development works without a provider. SMS is a
// deferred opt-in: prefs carry the shape, nothing sends yet.
import { admin } from './supabase/admin';

export type NotifyEvent = 'new_request' | 'approval' | 'reminder' | 'expiry' | 'new_message' | 'popup_reminder' | 'listing_match';

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

// Buyer opt-in: a popup they asked to be reminded about is tomorrow.
export function popupReminderEmail(listingTitle: string, whenLabel: string) {
  return {
    subject: `Reminder: "${listingTitle}" is coming up`,
    html: wrap(
      `<p><strong>${esc(listingTitle)}</strong> is happening <strong>${esc(whenLabel)}</strong>.</p>
       <p>You asked us to remind you — see you there.</p>`,
    ),
  };
}
