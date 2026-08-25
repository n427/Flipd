'use client';

// Shared chrome for all in-app routes (feed, listing, post, profile).
// Holds the store provider, the sticky header, and the notifications drawer so
// they persist across client-side navigation.
import React from 'react';
import { useRouter } from 'next/navigation';
import { StoreProvider, useStore } from '@/lib/store-context';
import { WebAppHeader, WebNotifications } from '@/components/WebApp';
import { wantedNotificationHref } from '@/lib/wanted-client';

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
    // minHeight:100vh + a flex column, so the white background always reaches
    // the bottom of the viewport and the footer sits below the content. The
    // previous minHeight:100% resolved against a parent with no height, so on
    // short pages (Activity, post preview) the white stopped early and the
    // gray body showed through underneath.
    <div
      style={{
        background: '#fff',
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'var(--sans)',
        position: 'relative',
      }}
    >
      <WebAppHeader
        onLogo={() => router.push('/feed')}
        query={query}
        setQuery={onSearch}
        onPost={() => router.push('/post/choose')}
        onProfile={() => router.push('/profile')}
        onBell={() => { setNotifOpen(true); store.markAllSeen(); }}
        onRequests={() => router.push('/requests')}
        onWanted={() => router.push('/wanted')}
        pendingCount={store.pendingCount}
        unreadCount={store.unreadCount}
        wantedUnreadCount={store.wantedUnreadCount}
        meName={store.me?.display_name ?? 'Me'}
        meAvatarUrl={store.me?.avatar_url ?? undefined}
      />
      <div style={{ flex: 1 }}>{children}</div>
      <footer style={{ borderTop: '1px solid var(--rule)', padding: '22px 32px', display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap', fontFamily: 'var(--sans)', fontSize: 12, color: 'var(--muted)' }}>
        <a href="/terms" style={{ color: 'var(--muted)', textDecoration: 'none' }}>Terms</a>
        <a href="/privacy" style={{ color: 'var(--muted)', textDecoration: 'none' }}>Privacy</a>
        <a href="/support" style={{ color: 'var(--muted)', textDecoration: 'none' }}>Support</a>
        <span style={{ marginLeft: 'auto' }}>© 2026 Flipd</span>
      </footer>
      {notifOpen && (
        <WebNotifications
          activity={store.activity}
          wantedNotifications={store.wantedNotifications}
          onClose={() => setNotifOpen(false)}
          onApprove={approve}
          onDecline={decline}
          onDismiss={(id) => store.dismissNotification(id)}
          onMarkAllRead={() => store.markAllSeen()}
          onNavigateWanted={(event) => {
            router.push(wantedNotificationHref(event));
          }}
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
