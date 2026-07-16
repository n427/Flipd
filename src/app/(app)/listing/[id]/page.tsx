'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { WebListingDetail, RevealModal } from '@/components/WebApp';
import { useStore } from '@/lib/store-context';
import type { Listing } from '@/lib/types';

export default function ListingPage({ params }: { params: { id: string } }) {
  const router = useRouter();
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

  if (loading) {
    return (
      <div style={{ padding: '80px 0', textAlign: 'center', color: 'var(--muted)', fontFamily: 'var(--sans)', fontSize: 13 }}>
        Loading…
      </div>
    );
  }

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
        onBack={() => router.push('/feed')}
        onReveal={() => setModal('reveal')}
      />
      {modal === 'reveal' && (
        <RevealModal
          listing={listing}
          onClose={() => setModal(null)}
          onContinue={() => { store.requestReveal(listing.id); setModal(null); }}
        />
      )}
    </>
  );
}
