'use client';

// The conversation sidebar. Shared by /messages (list only) and
// /messages/[id] (list beside the open thread), so the two stay identical
// rather than drifting into two versions of the same component.
import React from 'react';
import Link from 'next/link';
import { Avatar } from '@/components/ui';

export type ThreadRow = {
  id: string;
  listing_id: string | null;
  listing_title: string;
  listing_photo: string | null;
  listing_removed: boolean;
  counterpart: { id: string; display_name: string | null; avatar_url: string | null } | null;
  last_message: string | null;
  last_message_at: string | null;
  unread: boolean;
};

export function timeAgo(iso: string | null) {
  if (!iso) return '';
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

/** Fetches once and returns the caller's threads, newest activity first. */
export function useThreads() {
  const [threads, setThreads] = React.useState<ThreadRow[]>([]);
  const [state, setState] = React.useState<'loading' | 'ready' | 'error'>('loading');

  React.useEffect(() => {
    let alive = true;
    fetch('/api/threads')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!alive) return;
        if (!d) { setState('error'); return; }
        setThreads(d.threads ?? []);
        setState('ready');
      })
      .catch(() => alive && setState('error'));
    return () => { alive = false; };
  }, []);

  return { threads, state };
}

export function ThreadList({
  threads,
  state,
  activeId,
}: {
  threads: ThreadRow[];
  state: 'loading' | 'ready' | 'error';
  activeId?: string;
}) {
  if (state === 'loading') {
    return (
      <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
        Loading…
      </div>
    );
  }

  if (state === 'ready' && threads.length === 0) {
    return (
      <div style={{ padding: '48px 16px', textAlign: 'center' }}>
        <div style={{ fontWeight: 700, fontSize: 14.5, color: 'var(--ink)' }}>No conversations yet</div>
        <div className="t-meta" style={{ fontSize: 12.5, marginTop: 6, lineHeight: 1.5 }}>
          Ask about a listing, and once the seller approves you can talk here.
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {threads.map((t) => {
        const active = t.id === activeId;
        return (
          <Link
            key={t.id}
            href={`/messages/${t.id}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '12px 12px',
              borderRadius: 12,
              textDecoration: 'none',
              color: 'inherit',
              // The open thread stays visibly selected while you read it.
              background: active ? 'var(--surface)' : 'transparent',
            }}
          >
            <Avatar name={t.counterpart?.display_name ?? '?'} src={t.counterpart?.avatar_url ?? undefined} size={40} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span
                  style={{
                    fontWeight: t.unread ? 700 : 600,
                    fontSize: 14,
                    color: 'var(--ink)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {t.counterpart?.display_name ?? 'Flipd member'}
                </span>
                <span className="t-meta" style={{ fontSize: 11.5, marginLeft: 'auto', flexShrink: 0 }}>
                  {timeAgo(t.last_message_at)}
                </span>
              </div>
              <div
                className="t-meta"
                style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              >
                {t.listing_title}
              </div>
              <div
                style={{
                  fontSize: 12.5,
                  color: t.unread ? 'var(--ink)' : 'var(--muted)',
                  fontWeight: t.unread ? 600 : 400,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  marginTop: 2,
                }}
              >
                {t.last_message || 'Start the conversation'}
              </div>
            </div>
            {t.unread && (
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0 }} />
            )}
          </Link>
        );
      })}
    </div>
  );
}
