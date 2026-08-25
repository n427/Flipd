// Outbound notification layer (server only). Email via Resend's REST API —
// key comes from RESEND_API_KEY in the environment; with no key set, sends
// are logged instead so development works without a provider. Push goes out
// through Expo. Those two are the whole channel list.
import { admin } from './supabase/admin';

export type NotifyEvent = 'new_request' | 'approval' | 'reminder' | 'expiry' | 'new_message' | 'popup_reminder' | 'listing_match';

export type WantedNotificationKind =
  | 'new-offer'
  | 'accepted'
  | 'declined'
  | 'edit'
  | 'reminder'
  | 'expired';

export function wantedNotificationKey(
  kind: WantedNotificationKind,
  sourceId: string,
  version?: string,
): string {
  return `wanted:${kind}:${sourceId}${version === undefined ? '' : `:${version}`}`;
}

export type WantedNotification = {
  eventKey: string;
  userId: string;
  eventType: WantedNotificationKind;
  wantedPostId: string;
  wantedOfferId?: string;
  title: string;
  body: string;
};

// The unique (event_key, user_id) constraint turns route retries into a no-op.
// Callers deliberately invoke this only after their business transaction has
// committed; a notification failure must never roll back an offer or edit.
export async function persistWantedNotification(event: WantedNotification): Promise<void> {
  const { error } = await admin.from('notification_events').upsert({
    event_key: event.eventKey,
    user_id: event.userId,
    event_type: event.eventType,
    wanted_post_id: event.wantedPostId,
    wanted_offer_id: event.wantedOfferId ?? null,
    title: event.title,
    body: event.body,
  }, { onConflict: 'event_key,user_id', ignoreDuplicates: true });
  if (error) throw new Error(error.message);
}

export async function persistWantedNotificationSafely(event: WantedNotification): Promise<void> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      await persistWantedNotification(event);
      return;
    } catch (error) {
      console.error(`[notify] wanted event ${event.eventKey} failed (attempt ${attempt})`, error);
    }
  }
}

// A digest match, as produced by src/lib/digest/match.ts. Duplicated here
// rather than imported so notify stays the lower layer with no dependency on
// the digest feature — see the same rationale on popupReminderEmail's stage
// union below.
type DigestMatch = { id: string; reason: string };
// photo_urls is deliberately absent from the matcher's Candidate type: the
// model ranks on title, price and category, and image URLs would spend prompt
// tokens on something it cannot look at. The email is the only consumer.
type DigestListing = {
  id: string;
  title: string;
  price: number;
  category: string;
  photo_urls?: string[] | null;
};

// `app` is what the preference UI writes for push. `push` is the older key
// from before in-app notifications had a name in the UI; it is still honoured
// so existing rows keep working rather than silently flipping back on.
type NotifyPrefs = Partial<Record<NotifyEvent, { app?: boolean; email?: boolean; push?: boolean }>>;

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

// Capitalise the first letter of each word, but only when it is already
// lowercase. Titles are typed by students and arrive in every casing there is;
// a plain toLowerCase-then-capitalise would turn "GMAT tutoring" into "Gmat
// tutoring", which reads as a typo rather than a fix. Display only — the
// stored title is never rewritten.
export function titleCase(s: string): string {
  return s.replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

// Buyer, opt-in: today's picks from what they saved, messaged about, and
// searched.
//
// Split from the sender below so the markup is testable: every other email in
// this file is a pure `{ subject, html }` builder, and this one was the lone
// exception that sent itself, which left its HTML impossible to assert on.
export function digestEmailBody(
  matches: DigestMatch[],
  pool: DigestListing[],
): { subject: string; html: string } {
  const byId = new Map(pool.map((l) => [l.id, l]));
  const rows = matches
    .map((m) => {
      const listing = byId.get(m.id);
      // Defensive only: matchListings/parseMatches already validate every id
      // against this same pool, so this should never be hit.
      if (!listing) return '';
      const name = titleCase(listing.title);
      const href = SITE_URL ? `${SITE_URL}/listing/${listing.id}` : null;
      const title = href
        ? `<a href="${href}" style="color:#111;text-decoration:underline">${esc(name)}</a>`
        : `<strong>${esc(name)}</strong>`;
      const photo = listing.photo_urls?.[0];
      // A table, not flex or grid: Outlook renders neither, and this is the
      // one layout primitive every mail client still agrees on. Images are
      // blocked by default in many clients, so the text cell has to stand on
      // its own — hence alt text and no dependence on the image for meaning.
      const thumb = photo
        ? `<td width="96" style="padding:0 12px 0 0;vertical-align:top">
             <img src="${esc(photo)}" alt="${esc(name)}" width="96" height="96"
                  style="width:96px;height:96px;object-fit:cover;border-radius:10px;display:block;border:0" />
           </td>`
        : '';
      return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px;width:100%">
        <tr>
          ${thumb}
          <td style="vertical-align:top">
            ${title}<br/>
            <span style="color:#5a6169">${priceLabel(listing.price)}</span>
          </td>
        </tr>
      </table>`;
    })
    .filter(Boolean)
    .join('');

  const subject = `${matches.length} listing${matches.length === 1 ? '' : 's'} you might want`;
  const html = wrap(
    `<p>Based on what you've saved, messaged about, and searched for:</p>
     ${rows}`,
  );
  return { subject, html };
}

// The digest producer already knows its recipient, so this sends rather than
// handing a pair back to a caller that has nothing left to do with it.
export async function digestEmail(
  email: string,
  matches: DigestMatch[],
  pool: DigestListing[],
): Promise<void> {
  const { subject, html } = digestEmailBody(matches, pool);
  await sendEmail(email, subject, html);
}
