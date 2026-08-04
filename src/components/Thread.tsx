'use client';

// One conversation. Opened from an approved request, from the listing it's
// about, or from the messages list — every route into it is bidirectional, so
// the post and the chat always link to each other.
import React from 'react';
import Link from 'next/link';
import { Icon } from './Icon';
import { Avatar, Button } from './ui';
import { createClient } from '@supabase/supabase-js';
import {
  attachmentError,
  MAX_ATTACHMENTS_PER_MESSAGE,
} from '@/lib/validation';

type Attachment = {
  id: string;
  kind: 'image' | 'video';
  mime_type: string;
  width: number | null;
  height: number | null;
  url: string | null;
};
type Message = {
  id: string;
  sender_id: string;
  body: string;
  created_at: string;
  mine: boolean;
  attachments: Attachment[];
};
type ThreadHead = {
  id: string;
  listing_id: string | null;
  listing_title: string;
  listing_price: number | null;
  listing_photo: string | null;
  listing_archived: boolean;
  listing_removed: boolean;
  counterpart: { id: string; display_name: string | null; avatar_url: string | null } | null;
  intro_message: string | null;
  offer: number | null;
};

function timeLabel(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export function Thread({ threadId }: { threadId: string }) {
  const [head, setHead] = React.useState<ThreadHead | null>(null);
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [state, setState] = React.useState<'loading' | 'ready' | 'error'>('loading');
  const [draft, setDraft] = React.useState('');
  const [files, setFiles] = React.useState<File[]>([]);
  const [sending, setSending] = React.useState(false);
  const [error, setError] = React.useState('');
  const fileRef = React.useRef<HTMLInputElement>(null);
  const bottomRef = React.useRef<HTMLDivElement>(null);

  const load = React.useCallback(async () => {
    const res = await fetch(`/api/threads/${threadId}`).catch(() => null);
    if (!res?.ok) { setState('error'); return; }
    const data = await res.json();
    setHead(data.thread);
    setMessages(data.messages ?? []);
    setState('ready');
  }, [threadId]);

  React.useEffect(() => { load(); }, [load]);

  // Realtime. A dropped socket degrades to the refetch-on-focus below rather
  // than leaving a dead screen, and signed attachment URLs expire, so a
  // refetch is the correct response to a stale view either way.
  React.useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return;
    const supabase = createClient(url, key);
    const channel = supabase
      .channel(`thread:${threadId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `thread_id=eq.${threadId}` },
        () => { load(); },
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [threadId, load]);

  React.useEffect(() => {
    const onFocus = () => load();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [load]);

  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const addFiles = (picked: FileList | null) => {
    if (!picked) return;
    const next = [...files];
    for (const f of Array.from(picked)) {
      if (next.length >= MAX_ATTACHMENTS_PER_MESSAGE) break;
      // Same limits the server enforces, surfaced before the upload starts.
      const err = attachmentError(f.type, f.size);
      if (err) { setError(err); continue; }
      next.push(f);
    }
    setFiles(next);
  };

  const send = async () => {
    if (sending) return;
    if (!draft.trim() && files.length === 0) return;
    setSending(true);
    setError('');
    const form = new FormData();
    form.append('body', draft);
    for (const f of files) form.append('attachments', f);
    const res = await fetch(`/api/threads/${threadId}/messages`, { method: 'POST', body: form }).catch(() => null);
    if (!res?.ok) {
      const body = await res?.json().catch(() => ({}));
      setError(body?.error || 'Could not send. Try again.');
      setSending(false);
      return;
    }
    const { message } = await res.json();
    setMessages((prev) => [...prev, message]);
    setDraft('');
    setFiles([]);
    setSending(false);
  };

  if (state === 'loading') {
    return <div style={{ padding: '80px 0', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>Loading…</div>;
  }
  if (state === 'error' || !head) {
    return <div style={{ padding: '80px 0', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>Conversation not found.</div>;
  }

  const name = head.counterpart?.display_name ?? 'Flipd member';

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 24px 0', display: 'flex', flexDirection: 'column', height: 'calc(100vh - 140px)' }}>
      <Link href="/messages" style={{ fontSize: 13, color: 'var(--muted)', textDecoration: 'none', marginBottom: 14, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <Icon name="chevronLeft" size={14} /> All messages
      </Link>

      {/* Pinned listing header: the subject of the conversation is never
          ambiguous, and it's the way back to the post. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, border: '1px solid var(--rule)', borderRadius: 14, marginBottom: 16 }}>
        {head.listing_photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={head.listing_photo} alt="" style={{ width: 48, height: 48, borderRadius: 10, objectFit: 'cover' }} />
        ) : (
          <div style={{ width: 48, height: 48, borderRadius: 10, background: 'var(--surface)' }} />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14.5, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {head.listing_title}
          </div>
          <div className="t-meta" style={{ fontSize: 12.5 }}>
            {head.listing_removed
              ? 'Listing removed'
              : head.listing_archived
                ? 'No longer available'
                : head.listing_price != null && head.listing_price > 0
                  ? `$${head.listing_price.toLocaleString('en-US')}`
                  : 'Free'}
            {head.offer != null && ` · offered $${head.offer.toLocaleString('en-US')}`}
          </div>
        </div>
        {/* A removed listing has nowhere to link, so the title stands alone. */}
        {head.listing_id && !head.listing_removed && (
          <Link href={`/listing/${head.listing_id}`} style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', textDecoration: 'none', whiteSpace: 'nowrap' }}>
            View post
          </Link>
        )}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', paddingRight: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
          <Avatar name={name} src={head.counterpart?.avatar_url ?? undefined} size={36} />
          <div style={{ fontWeight: 700, fontSize: 15 }}>{name}</div>
        </div>

        {/* Where it started. Keeps the request's context visible in the thread. */}
        {head.intro_message && (
          <div style={{ padding: '12px 14px', background: 'var(--surface)', borderRadius: 12, fontSize: 13.5, lineHeight: 1.55, color: 'var(--ink-2)', marginBottom: 18 }}>
            <div className="t-eyebrow" style={{ color: 'var(--muted)', marginBottom: 6, fontSize: 10.5 }}>THE REQUEST</div>
            {head.intro_message}
          </div>
        )}

        {/* A freshly approved chat opens empty. Say what to do rather than
            leaving a blank panel above the composer. */}
        {messages.length === 0 && (
          <div style={{ textAlign: 'center', padding: '48px 24px' }}>
            <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--ink)' }}>You&rsquo;re connected</div>
            <div className="t-meta" style={{ fontSize: 13, marginTop: 6 }}>
              Say hi and sort out where and when to meet.
            </div>
          </div>
        )}

        {messages.map((m) => (
          <div key={m.id} style={{ display: 'flex', justifyContent: m.mine ? 'flex-end' : 'flex-start', marginBottom: 10 }}>
            <div style={{ maxWidth: '76%' }}>
              {m.attachments.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: m.body ? 6 : 0, justifyContent: m.mine ? 'flex-end' : 'flex-start' }}>
                  {m.attachments.map((a) =>
                    a.url == null ? null : a.kind === 'image' ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={a.id} src={a.url} alt="" style={{ maxWidth: 240, borderRadius: 12, display: 'block' }} />
                    ) : (
                      <video key={a.id} src={a.url} controls playsInline style={{ maxWidth: 240, borderRadius: 12, display: 'block' }} />
                    ),
                  )}
                </div>
              )}
              {m.body && (
                <div
                  style={{
                    background: m.mine ? 'var(--ink)' : 'var(--surface)',
                    color: m.mine ? '#fff' : 'var(--ink)',
                    borderRadius: 14,
                    padding: '9px 13px',
                    fontSize: 14.5,
                    lineHeight: 1.45,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}
                >
                  {m.body}
                </div>
              )}
              <div className="t-meta" style={{ fontSize: 11, marginTop: 3, textAlign: m.mine ? 'right' : 'left' }}>
                {timeLabel(m.created_at)}
              </div>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div style={{ borderTop: '1px solid var(--rule)', padding: '12px 0 20px' }}>
        {files.length > 0 && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
            {files.map((f, i) => (
              <div key={i} style={{ position: 'relative', border: '1px solid var(--rule)', borderRadius: 10, padding: '6px 10px', fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                <button
                  onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                  aria-label={`Remove ${f.name}`}
                  style={{ border: 0, background: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 0, fontSize: 14 }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
        {error && <p style={{ fontSize: 12.5, color: 'var(--accent)', margin: '0 0 8px' }}>{error}</p>}
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <input
            ref={fileRef}
            type="file"
            accept="image/*,video/*"
            multiple
            style={{ display: 'none' }}
            onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }}
          />
          <button
            onClick={() => fileRef.current?.click()}
            aria-label="Add photo or video"
            style={{ border: '1px solid var(--rule)', background: '#fff', borderRadius: 10, width: 40, height: 40, cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <Icon name="camera" size={17} color="var(--muted)" />
          </button>
          <textarea
            className="field"
            rows={1}
            value={draft}
            onChange={(e) => setDraft(e.target.value.slice(0, 2000))}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
            }}
            placeholder="Message"
            style={{ resize: 'none', flex: 1, minHeight: 40 }}
          />
          <Button
            kind={draft.trim() || files.length ? 'primary' : 'disabled'}
            disabled={sending || (!draft.trim() && files.length === 0)}
            onClick={send}
            style={{ flexShrink: 0 }}
          >
            {sending ? 'Sending…' : 'Send'}
          </Button>
        </div>
      </div>
    </div>
  );
}
