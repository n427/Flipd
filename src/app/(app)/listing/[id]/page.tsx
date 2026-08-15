'use client';

import React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { WebListingDetail, RevealModal } from '@/components/WebApp';
import { useStore } from '@/lib/store-context';
import type { Listing } from '@/lib/types';
import { ListingDetailSkeleton } from '@/components/Skeletons';

// Where "back" goes, keyed by the ?from= param the linking surface sets. Using
// an explicit origin rather than router.back() means a directly-opened or
// refreshed link still has a sane destination instead of leaving the app.
const ORIGINS: Record<string, { href: string; label: string }> = {
  activity: { href: '/requests', label: 'Back to activity' },
  requests: { href: '/requests', label: 'Back to requests' },
  profile: { href: '/profile', label: 'Back to profile' },
  saved: { href: '/profile', label: 'Back to profile' },
  listings: { href: '/profile/listings', label: 'Back to my listings' },
};

export default function ListingPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const origin = ORIGINS[searchParams.get('from') ?? ''] ?? { href: '/feed', label: 'Back to feed' };
  const store = useStore();
  const [listing, setListing] = React.useState<Listing | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [modal, setModal] = React.useState<'reveal' | null>(null);

  React.useEffect(() => {
    let alive = true;
    store.getListing(params.id).then((l) => {
      if (alive) { setListing(l); setLoading(false); }
    });
    return () => { alive = false; };
    // Re-run when the loaded set changes (e.g. archive/restore updates state).
  }, [params.id, store.listings]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <ListingDetailSkeleton />;

  if (!listing) {
    return (
      <div style={{ padding: '80px 0', textAlign: 'center', color: 'var(--muted)', fontFamily: 'var(--sans)', fontSize: 13 }}>
        Listing not found.
      </div>
    );
  }

  return (
    <>
      <WebListingDetail
        store={store}
        listing={listing}
        onBack={() => router.push(origin.href)}
        backLabel={origin.label}
        onReveal={() => setModal('reveal')}
      />
      {modal === 'reveal' && (
        <RevealModal
          listing={listing}
          me={store.me}
          onClose={() => setModal(null)}
          onContinue={async (offer, introMessage) => {
            const r = await store.requestReveal(listing.id, offer, introMessage);
            if (!r.ok && r.error) alert(r.error);
            setModal(null);
          }}
        />
      )}
    </>
  );
}
