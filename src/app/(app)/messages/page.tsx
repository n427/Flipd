'use client';

// All conversations, newest activity first.
import React from 'react';
import Link from 'next/link';
import { Avatar, BackLink } from '@/components/ui';

type ThreadRow = {
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

function timeAgo(iso: string | null) {
  if (!iso) return '';
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export default function MessagesPage() {
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

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '36px 24px 80px' }}>
      <BackLink />
      <h1 style={{ fontWeight: 800, fontSize: 26, letterSpacing: '-0.03em', color: 'var(--ink)', margin: '0 0 4px' }}>
        Messages
      </h1>
      <p style={{ fontSize: 14, color: 'var(--muted)', margin: '0 0 28px' }}>
        Conversations open once a seller approves your request.
      </p>

      {state === 'loading' && (
        <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>Loading…</div>
      )}

      {state === 'ready' && threads.length === 0 && (
        <div style={{ padding: '70px 0', textAlign: 'center' }}>
          <div className="t-h3" style={{ color: 'var(--ink)' }}>No conversations yet</div>
          <div className="t-meta" style={{ fontSize: 12.5, marginTop: 6 }}>
            Ask about a listing, and once the seller approves you can talk here.
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {threads.map((t) => (
          <Link
            key={t.id}
            href={`/messages/${t.id}`}
            style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 12px', borderRadius: 12, textDecoration: 'none', color: 'inherit' }}
          >
            <Avatar name={t.counterpart?.display_name ?? '?'} src={t.counterpart?.avatar_url ?? undefined} size={44} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontWeight: t.unread ? 700 : 600, fontSize: 14.5, color: 'var(--ink)' }}>
                  {t.counterpart?.display_name ?? 'Flipd member'}
                </span>
                <span className="t-meta" style={{ fontSize: 12 }}>{timeAgo(t.last_message_at)}</span>
              </div>
              <div className="t-meta" style={{ fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {t.listing_title}
              </div>
              {t.last_message && (
                <div
                  style={{
                    fontSize: 13,
                    color: t.unread ? 'var(--ink)' : 'var(--muted)',
                    fontWeight: t.unread ? 600 : 400,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    marginTop: 2,
                  }}
                >
                  {t.last_message}
                </div>
              )}
            </div>
            {t.unread && <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0 }} />}
          </Link>
        ))}
      </div>
    </div>
  );
}
