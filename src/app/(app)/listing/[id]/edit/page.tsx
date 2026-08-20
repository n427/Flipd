'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { WebCreate } from '@/components/WebApp';
import { useStore } from '@/lib/store-context';
import type { Listing } from '@/lib/types';

export default function ListingEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = React.use(params);
  const router = useRouter();
  const store = useStore();
  const [listing, setListing] = React.useState<Listing | null>(null);
  const [loading, setLoading] = React.useState(true);

  // Wait for `me` before loading, so ownership resolves correctly on a direct
  // navigation (the store's `mine` flag is null until /api/me returns).
  React.useEffect(() => {
    if (!store.me) return;
    let alive = true;
    store.getListing(id).then((l) => {
      if (alive) { setListing(l); setLoading(false); }
    });
    return () => { alive = false; };
  }, [id, store.me]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading || !store.me) return null;
  const isOwner = listing != null && listing.seller.id === store.me.id;
  if (!isOwner) {
    return (
      <div style={{ padding: '80px 0', textAlign: 'center', color: 'var(--muted)', fontFamily: 'var(--sans)', fontSize: 13 }}>
        Listing not found.
      </div>
    );
  }

  return (
    <WebCreate
      store={store}
      initial={listing}
      heading="Edit listing"
      submitLabel="Save changes"
      onCancel={() => router.push(`/listing/${id}`)}
      onPublish={async (fd, onProgress) => {
        try {
          await store.updateListing(id, fd, onProgress);
          router.push(`/listing/${id}`);
        } catch (err) {
          alert('Could not save changes:\n\n' + (err instanceof Error ? err.message : 'Unknown error'));
          throw err; // let WebCreate release the button's busy state
        }
      }}
    />
  );
}
