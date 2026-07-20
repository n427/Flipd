// Outbound notification layer (server only). Email via Resend's REST API —
// key comes from RESEND_API_KEY in the environment; with no key set, sends
// are logged instead so development works without a provider. SMS is a
// deferred opt-in: prefs carry the shape, nothing sends yet.
import { admin } from './supabase/admin';

export type NotifyEvent = 'new_request' | 'approval' | 'reminder' | 'expiry';

type NotifyPrefs = Partial<Record<NotifyEvent, { email?: boolean; sms?: boolean }>>;

// Email defaults ON for every event; a stored `false` turns it off.
export function wantsEmail(prefs: unknown, event: NotifyEvent): boolean {
  const p = (prefs ?? {}) as NotifyPrefs;
  return p[event]?.email !== false;
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

const wrap = (body: string) =>
  `<div style="font-family:sans-serif;font-size:15px;line-height:1.6;color:#111;max-width:480px">
    <p style="font-weight:800;font-size:18px;margin:0 0 16px">flipd<span style="color:#990000">.</span></p>
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

// Event 2 — approved. Mutual-aware: lists every shared method, not just one. `contact` is the
// output of resolveSharedContact (method -> value).
export function sharedContactEmail(actorName: string, listingTitle: string, contact: Partial<Record<string, string>>) {
  const labels: Record<string, string> = { instagram: 'Instagram', phone: 'Text', email: 'Email' };
  const lines = Object.entries(contact)
    .map(([m, v]) => `<p style="font-size:17px"><strong>${esc(labels[m] || m)}:</strong> ${esc(v as string)}</p>`)
    .join('');
  return {
    subject: `${actorName} — you're connected on "${listingTitle}"`,
    html: wrap(`<p>You're connected on <strong>${esc(listingTitle)}</strong>. Here's how to reach <strong>${esc(actorName)}</strong>:</p>${lines}<p>Reach out — they're expecting you.</p>`),
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
