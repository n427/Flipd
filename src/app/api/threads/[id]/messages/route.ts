import { NextRequest, NextResponse } from 'next/server';
import { admin } from '@/lib/supabase/admin';
import { getRequestUser } from '@/lib/supabase/authAny';
import {
  loadThreadForUser,
  signAttachments,
  ATTACHMENT_BUCKET,
  type AttachmentRow,
} from '@/lib/messaging';
import {
  attachmentError,
  attachmentKind,
  isSendableMessage,
  MAX_ATTACHMENTS_PER_MESSAGE,
} from '@/lib/validation';
import { newMessageEmail, sendEmail, sendPush, verifiedEmailFor, wantsEmail, wantsPush } from '@/lib/notify';

// Send a message, with optional photo/video attachments.
//
// multipart/form-data: `body` plus zero or more `attachments` files. Uploads go
// through the server rather than direct-to-storage so the size and type limits
// cannot be bypassed by a client that skips its own checks.
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  // Web cookie session OR mobile Bearer token.
  const user = await getRequestUser(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const thread = await loadThreadForUser(params.id, user.id);
  if (!thread) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const contentType = req.headers.get('content-type') ?? '';
  let body = '';
  let files: File[] = [];
  if (contentType.includes('multipart/form-data')) {
    const form = await req.formData();
    body = String(form.get('body') ?? '');
    files = form.getAll('attachments').filter((f): f is File => f instanceof File);
  } else {
    const json = await req.json().catch(() => ({}));
    body = typeof json.body === 'string' ? json.body : '';
  }

  if (files.length > MAX_ATTACHMENTS_PER_MESSAGE) {
    return NextResponse.json(
      { error: `Up to ${MAX_ATTACHMENTS_PER_MESSAGE} attachments per message.` },
      { status: 400 },
    );
  }
  // Enforced here rather than by a check constraint: the rule spans messages
  // and message_attachments, and Postgres forbids subqueries in checks.
  if (!isSendableMessage(body, files.length)) {
    return NextResponse.json({ error: 'Write something or attach a photo.' }, { status: 400 });
  }
  if (body.length > 2000) {
    return NextResponse.json({ error: 'Messages are limited to 2000 characters.' }, { status: 400 });
  }

  // Validate every file BEFORE writing anything, so a bad third file doesn't
  // leave the first two orphaned in storage.
  for (const f of files) {
    const err = attachmentError(f.type, f.size);
    if (err) return NextResponse.json({ error: err }, { status: 400 });
  }

  const { data: message, error: messageError } = await admin
    .from('messages')
    .insert({ thread_id: thread.id, sender_id: user.id, body: body.trim() })
    .select('id, sender_id, body, created_at')
    .single();
  if (messageError) return NextResponse.json({ error: messageError.message }, { status: 500 });

  const uploadedPaths: string[] = [];
  const attachmentIds: string[] = [];
  try {
    for (const f of files) {
      const kind = attachmentKind(f.type)!;
      const ext = (f.name.split('.').pop() || (kind === 'image' ? 'jpg' : 'mp4')).toLowerCase();
      // {uid}/ prefix matches the storage RLS in migration 026.
      const path = `${user.id}/${thread.id}/${crypto.randomUUID()}.${ext}`;
      const buffer = Buffer.from(await f.arrayBuffer());
      const { error: uploadError } = await admin.storage
        .from(ATTACHMENT_BUCKET)
        .upload(path, buffer, { contentType: f.type, upsert: false });
      if (uploadError) throw new Error(uploadError.message);
      uploadedPaths.push(path);

      const { data: row, error: rowError } = await admin
        .from('message_attachments')
        .insert({
          message_id: message.id,
          storage_path: path,
          kind,
          mime_type: f.type,
          size_bytes: f.size,
        })
        .select('id')
        .single();
      if (rowError) throw new Error(rowError.message);
      attachmentIds.push(row.id);
    }
  } catch (err) {
    // Roll back by hand: there is no transaction spanning storage and the
    // database, so a partial upload has to be cleaned up explicitly or it
    // becomes an orphaned object nobody can see or delete.
    if (uploadedPaths.length) {
      await admin.storage.from(ATTACHMENT_BUCKET).remove(uploadedPaths).catch(() => {});
    }
    await admin.from('messages').delete().eq('id', message.id);
    const reason = err instanceof Error ? err.message : 'upload failed';
    return NextResponse.json({ error: reason }, { status: 500 });
  }

  const { data: attachmentRows } = attachmentIds.length
    ? await admin
        .from('message_attachments')
        .select('id, message_id, storage_path, kind, mime_type, size_bytes, width, height, duration_seconds')
        .in('id', attachmentIds)
    : { data: [] };
  const signed = await signAttachments((attachmentRows ?? []) as AttachmentRow[]);

  // Notify the other party. Fire-and-forget: a notification failure must not
  // fail the send.
  const recipientId = thread.buyer_id === user.id ? thread.seller_id : thread.buyer_id;
  void (async () => {
    const [{ data: recipient }, { data: sender }] = await Promise.all([
      admin.from('profiles').select('notify_prefs').eq('id', recipientId).single(),
      admin.from('profiles').select('display_name').eq('id', user.id).single(),
    ]);
    const senderName = sender?.display_name ?? 'Someone';
    const title = thread.listing_title ?? 'your listing';
    if (wantsPush(recipient?.notify_prefs, 'new_message')) {
      void sendPush(recipientId, senderName, body.trim() || 'Sent an attachment', {
        type: 'new_message',
        thread_id: thread.id,
      });
    }
    if (wantsEmail(recipient?.notify_prefs, 'new_message')) {
      const to = await verifiedEmailFor(recipientId);
      if (to) {
        const { subject, html } = newMessageEmail(senderName, title);
        void sendEmail(to, subject, html);
      }
    }
  })();

  return NextResponse.json(
    {
      message: {
        id: message.id,
        sender_id: message.sender_id,
        body: message.body,
        created_at: message.created_at,
        mine: true,
        attachments: signed,
      },
    },
    { status: 201 },
  );
}
