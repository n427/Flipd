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

  // Onboarding is required: identity + contact method must exist before the app.
  React.useEffect(() => {
    if (store.me && (!store.me.display_name || !store.me.contact_method)) {
      router.replace('/onboarding');
    }
  }, [store.me, router]);

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
        onBell={() => { setNotifOpen(true); store.markAllSeen(); }}
        onRequests={() => router.push('/requests')}
        pendingCount={store.pendingCount}
        unreadCount={store.unreadCount}
        meName={store.me?.display_name ?? 'Me'}
        meAvatarUrl={store.me?.avatar_url ?? undefined}
      />
      <div style={{ minHeight: 'calc(100vh - 200px)' }}>{children}</div>
      <footer style={{ borderTop: '1px solid var(--rule)', padding: '22px 32px', display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap', fontFamily: 'var(--sans)', fontSize: 12, color: 'var(--muted)' }}>
        <a href="/terms" style={{ color: 'var(--muted)', textDecoration: 'none' }}>Terms</a>
        <a href="/privacy" style={{ color: 'var(--muted)', textDecoration: 'none' }}>Privacy</a>
        <a href="/support" style={{ color: 'var(--muted)', textDecoration: 'none' }}>Support</a>
        <span style={{ marginLeft: 'auto' }}>© 2026 Flipd</span>
      </footer>
      {notifOpen && (
        <WebNotifications
          activity={store.activity}
          onClose={() => setNotifOpen(false)}
          onApprove={approve}
          onDecline={decline}
          onDismiss={(id) => store.dismissNotification(id)}
          onMarkAllRead={() => store.markAllSeen()}
          onNavigate={(a) => {
            if (a.dir === 'in') { router.push('/requests'); return; }
            if (a.listingRemoved || a.listingArchived || a.status === 'DECLINED' || a.status === 'EXPIRED') {
              router.push('/profile');
              return;
            }
            router.push(`/listing/${a.listingId}?from=activity`);
          }}
        />
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
