'use client';

// Shared chrome for all in-app routes (feed, listing, post, profile).
// Holds the store provider, the sticky header, and the notifications drawer so
// they persist across client-side navigation.
import React from 'react';
import { useRouter } from 'next/navigation';
import { StoreProvider, useStore } from '@/lib/store-context';
import { WebAppHeader, WebNotifications } from '@/components/WebApp';

function AppChrome({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const store = useStore();
  const [query, setQuery] = React.useState('');
  const [notifOpen, setNotifOpen] = React.useState(false);

  const onSearch = (q: string) => {
    setQuery(q);
    router.push(q ? `/feed?q=${encodeURIComponent(q)}` : '/feed');
  };
  const approve = (id: string) => store.respondReveal(id, 'approve');
  const decline = (id: string) => store.respondReveal(id, 'decline');

  return (
    <div style={{ background: '#fff', minHeight: '100%', fontFamily: 'var(--sans)', position: 'relative' }}>
      <WebAppHeader
        onLogo={() => router.push('/feed')}
        query={query}
        setQuery={onSearch}
        onPost={() => router.push('/post')}
        onProfile={() => router.push('/profile')}
        onBell={() => setNotifOpen(true)}
        pendingCount={store.pendingCount}
      />
      {children}
      {notifOpen && (
        <WebNotifications activity={store.activity} onClose={() => setNotifOpen(false)} onApprove={approve} onDecline={decline} />
      )}
    </div>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <StoreProvider>
      <AppChrome>{children}</AppChrome>
    </StoreProvider>
  );
}
