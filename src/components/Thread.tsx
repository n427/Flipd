'use client';

// One conversation. Opened from an approved request, from the listing it's
// about, or from the messages list — every route into it is bidirectional, so
// the post and the chat always link to each other.
import React from 'react';
import Link from 'next/link';
import { Icon } from './Icon';
import { Button } from './ui';
import { RequestQuote } from './RequestQuote';
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
  source_type: 'sale' | 'wanted';
  wanted_offer_id: string | null;
  listing_id: string | null;
  listing_title: string;
  listing_price: number | null;
  listing_photo: string | null;
  listing_archived: boolean;
  listing_removed: boolean;
  counterpart: { id: string; display_name: string | null; avatar_url: string | null } | null;
  intro_message: string | null;
  offer: number | null;
  i_am_buyer: boolean;
  requested_at: string | null;
};

function timeLabel(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

const MEDIA_MAX = 240;

// Reserves an attachment's box before its bytes arrive. Falls back to a plain
// max-width for rows that predate stored dimensions — which is what the onLoad
// re-pin is still there to cover.
function mediaBox(a: Attachment): React.CSSProperties {
  const base: React.CSSProperties = { maxWidth: MEDIA_MAX, borderRadius: 12, display: 'block' };
  if (!a.width || !a.height) return base;
  return {
    ...base,
    width: Math.min(MEDIA_MAX, a.width),
    aspectRatio: `${a.width} / ${a.height}`,
    background: 'var(--surface)',
  };
}

// Coarse relative age for the request's attribution line. Matches the list's
// labels, so "2d" beside a conversation and "2d ago" inside it agree.
function ageLabel(iso: string | null) {
  if (!iso) return '';
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

// `embedded` renders the thread as the right pane of the conversations view:
// it fills its container instead of centering itself, and drops the back link
// that only makes sense on the standalone /messages/<id> route.
export function Thread({ threadId, embedded = false }: { threadId: string; embedded?: boolean }) {
  const [head, setHead] = React.useState<ThreadHead | null>(null);
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [state, setState] = React.useState<'loading' | 'ready' | 'error'>('loading');
  const [draft, setDraft] = React.useState('');
  const [files, setFiles] = React.useState<File[]>([]);
  const [sending, setSending] = React.useState(false);
  const [error, setError] = React.useState('');
  const fileRef = React.useRef<HTMLInputElement>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const contentRef = React.useRef<HTMLDivElement>(null);

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

  // Scroll the message pane, not the element. scrollIntoView walks up and
  // scrolls every scrollable ancestor including the document, so opening a
  // conversation used to drag the whole page down past the header.
  const pinToBottom = React.useCallback(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  // Layout effect, so a thread never paints at the top and then jumps. Keyed on
  // `state` as well as the count: the pane doesn't exist while loading, so the
  // run that matters is the one right after it becomes ready.
  React.useLayoutEffect(() => { pinToBottom(); }, [messages.length, state, pinToBottom]);

  // Pinning once is not enough. The pane is laid out before attachments,
  // emoji fallbacks and the web font have settled, so "the bottom" keeps
  // moving for a few frames after the first paint — which read as a jump from
  // the top. Re-pin on every content resize, but only while the reader is
  // already at the bottom, so this never yanks someone out of the backlog.
  const stickToBottom = React.useRef(true);
  React.useEffect(() => {
    const el = scrollRef.current;
    const content = contentRef.current;
    if (!el || !content || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => { if (stickToBottom.current) pinToBottom(); });
    ro.observe(content);
    return () => ro.disconnect();
  }, [state, pinToBottom]);

  const onPaneScroll = React.useCallback(() => {
    const el = scrollRef.current;
    if (el) stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  }, []);

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
  // Horizontal inset for every band in the pane. Embedded, the pane *is* the
  // panel column, so the header rule has to run edge to edge and the padding
  // belongs to each band rather than to the container.
  const pad = embedded ? 20 : 24;
  const price = head.listing_removed
    ? 'Listing removed'
    : head.listing_archived
      ? 'No longer available'
      : head.listing_price != null && head.listing_price > 0
        ? `$${head.listing_price.toLocaleString('en-US')}`
        : 'Free';

  return (
    <div style={{
      maxWidth: embedded ? 'none' : 720,
      margin: embedded ? 0 : '0 auto',
      display: 'flex', flexDirection: 'column',
      height: embedded ? '100%' : 'calc(100vh - 140px)',
      minHeight: 0,
    }}>
      {!embedded && (
        <Link href="/messages" style={{ fontSize: 13, color: 'var(--muted)', textDecoration: 'none', padding: `20px ${pad}px 12px`, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Icon name="chevronLeft" size={14} /> All messages
        </Link>
      )}

      {/* Pinned listing header. The subject of the conversation is never
          ambiguous, and it's the way back to the post. Flush against the pane
          edges so it lines up with the conversation list's header beside it. */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        minHeight: 57, padding: `10px ${pad}px`, flexShrink: 0,
        borderBottom: '1px solid var(--rule)',
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14.5, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            <span style={{ fontWeight: 800, letterSpacing: '-0.015em' }}>{head.listing_title}</span>
            <span style={{ color: 'var(--muted)', fontWeight: 500 }}> · {price}</span>
            {head.offer != null && (
              <span style={{ color: 'var(--muted)', fontWeight: 500 }}> · offered ${head.offer.toLocaleString('en-US')}</span>
            )}
          </div>
          <div className="t-meta" style={{ fontSize: 12.5, marginTop: 1 }}>with {name}</div>
        </div>
        {/* A removed listing has nowhere to link, so the title stands alone. */}
        {head.listing_id && !head.listing_removed && (
          <Link href={`/listing/${head.listing_id}`} style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)', textDecoration: 'none', whiteSpace: 'nowrap' }}>
            View post
          </Link>
        )}
      </div>

      <div ref={scrollRef} onScroll={onPaneScroll} style={{ flex: 1, overflowY: 'auto', padding: `16px ${pad}px 0` }}>
        {/* The observed box. Padding lives on the scroller, so this wrapper
            measures exactly the content whose growth should re-pin the view. */}
        <div ref={contentRef}>
        {/* Where it started. Keeps the request's context visible in the thread,
            in the same cream quote the seller approved it from. */}
        {head.intro_message && (
          <RequestQuote
            text={head.intro_message}
            label={head.i_am_buyer ? 'YOU ASKED' : 'THE REQUEST'}
            by={[head.i_am_buyer ? null : name, ageLabel(head.requested_at)].filter(Boolean).join(' · ')}
            style={{ marginBottom: 18 }}
          />
        )}

        {messages.map((m) => (
          <div key={m.id} style={{ display: 'flex', justifyContent: m.mine ? 'flex-end' : 'flex-start', marginBottom: 10 }}>
            <div style={{ maxWidth: '76%' }}>
              {m.attachments.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: m.body ? 6 : 0, justifyContent: m.mine ? 'flex-end' : 'flex-start' }}>
                  {/* The stored dimensions become an aspect-ratio, so every
                      attachment occupies its final height on the very first
                      layout. Without this the pane measures itself short,
                      "the bottom" is the top, and the thread visibly falls
                      into place as each image arrives. */}
                  {m.attachments.map((a) =>
                    a.url == null ? null : a.kind === 'image' ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={a.id} src={a.url} alt="" onLoad={pinToBottom} style={mediaBox(a)} />
                    ) : (
                      <video key={a.id} src={a.url} controls playsInline onLoadedMetadata={pinToBottom} style={mediaBox(a)} />
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
              {/* Name as well as time. With the counterpart's avatar gone from
                  the top of the pane, the caption is what says who is talking. */}
              <div className="t-meta" style={{ fontSize: 11, marginTop: 4, textAlign: m.mine ? 'right' : 'left' }}>
                {m.mine ? 'You' : name} · {timeLabel(m.created_at)}
              </div>
            </div>
          </div>
        ))}
        </div>
      </div>

      <div style={{ borderTop: '1px solid var(--rule)', padding: `14px ${pad}px`, flexShrink: 0 }}>
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
        {/* One height for all three. The field carries .field's 13px padding,
            the attach button was a hard-coded 40, and .btn sizes itself from
            its own padding, so the row used to sit on three different
            baselines. */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
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
            style={{ border: '1.5px solid var(--rule)', background: '#fff', borderRadius: 12, width: 46, height: 46, cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
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
            style={{ resize: 'none', flex: 1, height: 46, minHeight: 46, padding: '12px 16px', lineHeight: '20px' }}
          />
          <Button
            kind={draft.trim() || files.length ? 'primary' : 'disabled'}
            disabled={sending || (!draft.trim() && files.length === 0)}
            onClick={send}
            style={{ flexShrink: 0, height: 46, borderRadius: 12, padding: '0 24px' }}
          >
            {sending ? 'Sending…' : 'Send'}
          </Button>
        </div>
      </div>
    </div>
  );
}
