'use client';

import React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { WebAppFeed, FeedSkeleton } from '@/components/WebApp';
import { useStore } from '@/lib/store-context';
import type { FeedRange } from '@/lib/types';

function FeedPageInner() {
  const router = useRouter();
  const store = useStore();
  const params = useSearchParams();
  const query = params.get('q') || '';

  const [activeCat, setActiveCat] = React.useState('all');
  const [sort, setSort] = React.useState('recent');
  // Matches the app's default: the feed is for what's currently for sale.
  const [range, setRange] = React.useState<FeedRange>('month');
  const [priceMin, setPriceMin] = React.useState('');
  const [priceMax, setPriceMax] = React.useState('');

  if (store.listingsLoading) return <FeedSkeleton />;

  return (
    <WebAppFeed
      store={store}
      activeCat={activeCat}
      setActiveCat={setActiveCat}
      onListing={(l) => router.push(`/listing/${l.id}`)}
      query={query}
      sort={sort}
      setSort={setSort}
      range={range}
      setRange={setRange}
      priceMin={priceMin}
      setPriceMin={setPriceMin}
      priceMax={priceMax}
      setPriceMax={setPriceMax}
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
