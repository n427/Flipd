import { admin } from '@/lib/supabase/admin';
import { parseTransactionSource } from '@/lib/wanted-transition';

// Shared helpers for the thread/message routes.

export const ATTACHMENT_BUCKET = 'message-attachments';
// Long enough to read a thread without refetching, short enough that a leaked
// URL stops working quickly. Clients re-fetch on focus and on playback error.
export const SIGNED_URL_TTL_SECONDS = 60 * 60;

export type ThreadRow = {
  id: string;
  request_id: string | null;
  wanted_offer_id: string | null;
  listing_id: string | null;
  listing_title: string | null;
  buyer_id: string;
  seller_id: string;
  created_at: string;
  last_message_at: string | null;
  buyer_seen_at: string | null;
  seller_seen_at: string | null;
};

// Confirms the caller is a participant. Every read and write in the messaging
// routes goes through this: the service-role client bypasses RLS, so the
// database will not stop a route that forgets to check.
export async function loadThreadForUser(
  threadId: string,
  userId: string,
): Promise<ThreadRow | null> {
  const { data } = await admin
    .from('message_threads')
    .select('id, request_id, wanted_offer_id, listing_id, listing_title, buyer_id, seller_id, created_at, last_message_at, buyer_seen_at, seller_seen_at')
    .eq('id', threadId)
    .single();
  if (!data) return null;
  const row = data as ThreadRow;
  if (row.buyer_id !== userId && row.seller_id !== userId) return null;
  if (!parseTransactionSource(row)) {
    throw new Error('message thread must have exactly one transaction source');
  }
  return row;
}

export type AttachmentRow = {
  id: string;
  message_id: string;
  storage_path: string;
  kind: 'image' | 'video';
  mime_type: string;
  size_bytes: number;
  width: number | null;
  height: number | null;
  duration_seconds: number | null;
};

// Mints short-lived signed URLs for attachments. The bucket is private, so a
// stored path is useless without one of these — which is the point: an
// attachment is only reachable after the caller has been confirmed to be in the
// thread. Signing happens per request and is never persisted.
export async function signAttachments(rows: AttachmentRow[]) {
  if (rows.length === 0) return [];
  const { data: signed } = await admin.storage
    .from(ATTACHMENT_BUCKET)
    .createSignedUrls(rows.map((r) => r.storage_path), SIGNED_URL_TTL_SECONDS);
  const byPath = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));
  return rows.map((r) => ({
    id: r.id,
    message_id: r.message_id,
    kind: r.kind,
    mime_type: r.mime_type,
    size_bytes: r.size_bytes,
    width: r.width,
    height: r.height,
    duration_seconds: r.duration_seconds,
    url: byPath.get(r.storage_path) ?? null,
  }));
}

// Marks the caller's side of the thread read. Which column depends on who is
// looking, so unread state is per-participant.
export async function markThreadSeen(thread: ThreadRow, userId: string) {
  const column = thread.buyer_id === userId ? 'buyer_seen_at' : 'seller_seen_at';
  await admin
    .from('message_threads')
    .update({ [column]: new Date().toISOString() })
    .eq('id', thread.id);
}
