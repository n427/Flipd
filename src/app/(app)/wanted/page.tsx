'use client';

import React from 'react';
import Link from 'next/link';
import { WantedCard } from '@/components/WantedCard';
import { Button } from '@/components/ui';
import { wantedClient, type WantedFeedFilters } from '@/lib/wanted-client';
import type { WantedPostDTO, WantedPostInput } from '@/lib/types';
import { losAngelesEndOfDayUtc } from '@/lib/wanted-presentation';

export default function WantedPage() {
  const [search, setSearch] = React.useState('');
  const [debounced, setDebounced] = React.useState('');
  const [category, setCategory] = React.useState<WantedPostInput['category'] | 'all'>('all');
  const [budget, setBudget] = React.useState('');
  const [location, setLocation] = React.useState('');
  const [deadline, setDeadline] = React.useState('');
  const [mine, setMine] = React.useState(false);
  const [posts, setPosts] = React.useState<WantedPostDTO[]>([]);
  const [cursor, setCursor] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [more, setMore] = React.useState(false);
  const [error, setError] = React.useState('');
  React.useEffect(() => { const timer = window.setTimeout(() => setDebounced(search), 300); return () => clearTimeout(timer); }, [search]);

  const filters = React.useMemo<WantedFeedFilters>(() => ({
    q: debounced, category, budget: Number(budget) > 0 ? Number(budget) : undefined,
    location, neededBefore: deadline ? losAngelesEndOfDayUtc(deadline) ?? undefined : undefined, mine,
  }), [debounced, category, budget, location, deadline, mine]);

  const load = React.useCallback(async (next?: string) => {
    if (next) setMore(true); else setLoading(true);
    setError('');
    try {
      const result = await wantedClient.feed({ ...filters, cursor: next, limit: 18 });
      setPosts((current) => next ? [...current, ...result.wanted_posts] : result.wanted_posts);
      setCursor(result.next_cursor);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load Wanted posts.'); }
    finally { setLoading(false); setMore(false); }
  }, [filters]);
  React.useEffect(() => { void load(); }, [load]);

  return (
    <main className="wanted-page">
      <header className="wanted-hero"><div><span className="t-eyebrow">FLIP THE MARKET</span><h1>Wanted</h1><p>Post what you need. Let nearby sellers come to you.</p></div><Link href="/wanted/post" className="btn btn-primary">Post a request</Link></header>
      <div className="wanted-filters">
        <input className="field" aria-label="Search Wanted posts" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search what people need" />
        <select className="field" aria-label="Category" value={category} onChange={(e) => setCategory(e.target.value as typeof category)}><option value="all">All categories</option><option value="goods">Goods</option><option value="services">Services</option><option value="housing">Housing</option></select>
        <input className="field" aria-label="Maximum budget" type="number" min="1" value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="Budget up to" />
        <input className="field" aria-label="Meetup area" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Meetup area" />
        <input className="field" aria-label="Needed before" type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
        <button type="button" className={`wanted-mine ${mine ? 'is-active' : ''}`} aria-pressed={mine} onClick={() => setMine((value) => !value)}>My Wanted posts</button>
      </div>
      {error && <div className="wanted-error" role="alert">{error} <button onClick={() => load()}>Try again</button></div>}
      {loading ? <div className="wanted-state">Loading Wanted posts…</div> : posts.length === 0 ? <div className="wanted-state"><h2>{mine ? 'No Wanted posts yet' : 'Nothing matches yet'}</h2><p>{mine ? 'Post what you need and track it here.' : 'Try clearing a filter or be the first to post.'}</p></div> : <div className="wanted-grid">{posts.map((post) => <WantedCard key={post.id} post={post} />)}</div>}
      {cursor && <div className="wanted-more"><Button kind="outline" disabled={more} onClick={() => load(cursor)}>{more ? 'Loading…' : 'Load more'}</Button></div>}
    </main>
  );
}
