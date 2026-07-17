'use client';

import React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { WebAppFeed } from '@/components/WebApp';
import { useStore } from '@/lib/store-context';

function FeedPageInner() {
  const router = useRouter();
  const store = useStore();
  const params = useSearchParams();
  const query = params.get('q') || '';

  const [activeCat, setActiveCat] = React.useState('all');
  const [sort, setSort] = React.useState('recent');
  const [priceFilter, setPriceFilter] = React.useState('any');

  if (store.listingsLoading) {
    return (
      <div style={{ padding: '80px 0', textAlign: 'center', color: 'var(--muted)', fontFamily: 'var(--sans)', fontSize: 13 }}>
        Loading listings…
      </div>
    );
  }

  return (
    <WebAppFeed
      store={store}
      activeCat={activeCat}
      setActiveCat={setActiveCat}
      onListing={(l) => router.push(`/listing/${l.id}`)}
      query={query}
      sort={sort}
      setSort={setSort}
      priceFilter={priceFilter}
      setPriceFilter={setPriceFilter}
    />
  );
}

export default function FeedPage() {
  return (
    <React.Suspense fallback={null}>
      <FeedPageInner />
    </React.Suspense>
  );
}
