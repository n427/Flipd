'use client';

import { Thread } from '@/components/Thread';
import { BackLink } from '@/components/ui';
import { ThreadList, useThreads } from '@/components/ThreadList';

export default function ThreadPage({ params }: { params: { id: string } }) {
  const { threads, state } = useThreads();

  return (
    <div style={{ maxWidth: 1280, margin: '0 auto', padding: '32px 32px 64px' }}>
      <BackLink />
      <h1 style={{ fontWeight: 800, fontSize: 26, letterSpacing: '-0.03em', color: 'var(--ink)', margin: '0 0 24px' }}>
        Messages
      </h1>

      <div className="messages-split">
        {/* The list stays put while you read, so switching threads is one
            click rather than a round trip through the index. */}
        <aside className="messages-sidebar">
          <ThreadList threads={threads} state={state} activeId={params.id} />
        </aside>

        <section className="messages-pane">
          <Thread threadId={params.id} />
        </section>
      </div>
    </div>
  );
}
