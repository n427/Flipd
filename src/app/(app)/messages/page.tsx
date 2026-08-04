'use client';

// Conversations. Two panes on desktop: the thread list beside the open chat.
// With nothing selected the right pane prompts you to pick one.
import { BackLink } from '@/components/ui';
import { ThreadList, useThreads } from '@/components/ThreadList';

export default function MessagesPage() {
  const { threads, state } = useThreads();

  return (
    <div style={{ maxWidth: 1280, margin: '0 auto', padding: '32px 32px 64px' }}>
      <BackLink />
      <h1 style={{ fontWeight: 800, fontSize: 26, letterSpacing: '-0.03em', color: 'var(--ink)', margin: '0 0 4px' }}>
        Messages
      </h1>
      <p style={{ fontSize: 14, color: 'var(--muted)', margin: '0 0 24px' }}>
        Conversations open once a seller approves your request.
      </p>

      <div className="messages-split">
        <aside className="messages-sidebar">
          <ThreadList threads={threads} state={state} />
        </aside>

        <section className="messages-pane messages-pane-empty">
          <div style={{ textAlign: 'center', padding: '0 24px' }}>
            <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--ink)' }}>Pick a conversation</div>
            <div className="t-meta" style={{ fontSize: 13, marginTop: 6 }}>
              Choose someone on the left to read and reply.
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
