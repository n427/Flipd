import { requireToken, API_BASE } from './listings';

// In-app messaging client. Everything goes through the token-authed web API
// rather than direct Supabase queries, because attachment URLs have to be
// signed server-side: the message-attachments bucket is private, so a stored
// path is useless without a signature the server mints for participants only.

export type Attachment = {
  id: string;
  kind: 'image' | 'video';
  mime_type: string;
  width: number | null;
  height: number | null;
  duration_seconds: number | null;
  url: string | null;
};

export type Message = {
  id: string;
  sender_id: string;
  body: string;
  created_at: string;
  mine: boolean;
  attachments: Attachment[];
};

export type ThreadSummary = {
  id: string;
  source_type: 'sale' | 'wanted';
  request_id: string | null;
  wanted_offer_id: string | null;
  listing_id: string | null;
  listing_title: string;
  listing_photo: string | null;
  listing_removed: boolean;
  counterpart: { id: string; display_name: string | null; avatar_url: string | null } | null;
  last_message: string | null;
  last_message_at: string | null;
  unread: boolean;
};

export type ThreadHead = {
  id: string;
  source_type: 'sale' | 'wanted';
  request_id: string | null;
  wanted_offer_id: string | null;
  listing_id: string | null;
  listing_title: string;
  listing_price: number | null;
  listing_photo: string | null;
  listing_archived: boolean;
  listing_removed: boolean;
  counterpart: {
    id: string;
    display_name: string | null;
    avatar_url: string | null;
    school_unit: string | null;
    class_year: string | null;
  } | null;
  intro_message: string | null;
  offer: number | null;
  approved_at?: string | null;
  requested_at?: string | null;
  i_am_buyer?: boolean;
};

export async function fetchThreads(): Promise<ThreadSummary[]> {
  const token = await requireToken();
  const res = await fetch(`${API_BASE}/api/threads`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Could not load messages (${res.status})`);
  return (await res.json()).threads ?? [];
}

export async function fetchThread(
  threadId: string,
): Promise<{ thread: ThreadHead; messages: Message[] }> {
  const token = await requireToken();
  const res = await fetch(`${API_BASE}/api/threads/${threadId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Could not load this conversation (${res.status})`);
  const data = await res.json();
  return { thread: data.thread, messages: data.messages ?? [] };
}

export type OutgoingAttachment = { uri: string; name: string; mimeType: string };

// Sends text and/or attachments. Multipart, and deliberately WITHOUT an
// explicit Content-Type: React Native fills in the multipart boundary itself,
// and setting the header by hand omits it and breaks the upload.
export async function sendMessage(
  threadId: string,
  body: string,
  attachments: OutgoingAttachment[] = [],
): Promise<Message> {
  const token = await requireToken();
  const form = new FormData();
  form.append('body', body);
  for (const a of attachments) {
    form.append('attachments', {
      uri: a.uri,
      name: a.name,
      type: a.mimeType,
    } as unknown as Blob);
  }
  const res = await fetch(`${API_BASE}/api/threads/${threadId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Could not send (${res.status})`);
  }
  return (await res.json()).message;
}

// The viewer's thread on a listing, if one exists. Powers the listing-detail
// CTA: someone who already has a conversation wants back into it, not to start
// a second request. Cheap enough to run on detail open — the thread list is
// small and already indexed by participant.
export async function findThreadForListing(listingId: string): Promise<string | null> {
  try {
    const threads = await fetchThreads();
    return threads.find((t) => t.listing_id === listingId)?.id ?? null;
  } catch {
    // A failed lookup just means the CTA stays "Message seller"; never block
    // the detail screen on it.
    return null;
  }
}
