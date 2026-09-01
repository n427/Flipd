'use client';

import React from 'react';
import Link from 'next/link';
import { Icon } from '@/components/Icon';
import { WantedCard } from '@/components/WantedCard';
import { Button } from '@/components/ui';
import { wantedClient, type WantedFeedFilters } from '@/lib/wanted-client';
import type { WantedPostDTO, WantedPostInput } from '@/lib/types';
import { wantedFeedEmptyState } from '@/lib/wanted-feed-presentation';
import { losAngelesEndOfDayUtc } from '@/lib/wanted-presentation';

export default function WantedPage() {
  const [search, setSearch] = React.useState('');
  const [debounced, setDebounced] = React.useState('');
  const [category, setCategory] = React.useState<WantedPostInput['category'] | 'all'>('all');
  const [budget, setBudget] = React.useState('');
  const [location, setLocation] = React.useState('');
  const [deadline, setDeadline] = React.useState('');
  const [mine, setMine] = React.useState(false);
  const [filtersOpen, setFiltersOpen] = React.useState(false);
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

  const hasFilters = Boolean(search || category !== 'all' || budget || location || deadline);
  const emptyState = wantedFeedEmptyState({ mine, hasFilters });
  const clearFilters = () => {
    setSearch('');
    setCategory('all');
    setBudget('');
    setLocation('');
    setDeadline('');
  };

  return (
    <main className="wanted-page">
      <header className="wanted-feed-head">
        <div>
          <h1>What campus needs<span>.</span></h1>
        </div>
        <Link href="/wanted/post" className="btn btn-primary"><Icon name="plus" size={16} /> Post a request</Link>
      </header>

      <section className="wanted-discovery" aria-label="Browse wanted requests">
        <div className="wanted-search">
          <Icon name="search" size={17} color="var(--muted)" />
          <input aria-label="Search Wanted posts" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search requests" />
          {search && <button type="button" aria-label="Clear search" onClick={() => setSearch('')}><Icon name="x" size={14} /></button>}
        </div>
        <button type="button" className={`wanted-filter-toggle ${filtersOpen ? 'is-active' : ''}`} aria-expanded={filtersOpen} onClick={() => setFiltersOpen((value) => !value)}>
          <Icon name="filter" size={15} /> Filters {hasFilters && <span aria-label="Filters active" />}
        </button>
        <button type="button" className={`wanted-mine ${mine ? 'is-active' : ''}`} aria-pressed={mine} onClick={() => setMine((value) => !value)}>My requests</button>
      </section>

      <div className="wanted-category-row" aria-label="Wanted categories">
        {([
          ['all', 'All requests'],
          ['goods', 'Goods'],
          ['services', 'Services'],
          ['housing', 'Housing'],
        ] as const).map(([value, label]) => (
          <button key={value} type="button" className={category === value ? 'is-active' : ''} aria-pressed={category === value} onClick={() => setCategory(value)}>{label}</button>
        ))}
        {!loading && <span className="wanted-count">{posts.length} request{posts.length === 1 ? '' : 's'}</span>}
      </div>

      {filtersOpen && (
        <div className="wanted-advanced-filters">
          <label>Budget up to<input className="field" aria-label="Maximum budget" type="number" min="1" value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="Any amount" /></label>
          <label>Meetup area<input className="field" aria-label="Meetup area" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Anywhere near campus" /></label>
          <label>Needed before<input className="field" aria-label="Needed before" type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} /></label>
          {hasFilters && <button type="button" className="wanted-clear" onClick={clearFilters}>Clear all</button>}
        </div>
      )}
      {error && <div className="wanted-error" role="alert">{error} <button onClick={() => load()}>Try again</button></div>}
      {loading ? (
        <div className="wanted-grid" aria-label="Loading Wanted posts">{[0, 1, 2, 3].map((item) => <div key={item} className="wanted-skeleton"><span /><i /><i /></div>)}</div>
      ) : posts.length === 0 ? (
        <div className="wanted-state">
          <div className="wanted-state__mark" aria-hidden="true"><Icon name="search" size={23} /></div>
          <h2>{emptyState.title}</h2>
          <p>{emptyState.body}</p>
          {emptyState.actionHref
            ? <Link className="btn btn-primary" href={emptyState.actionHref}>{emptyState.action}</Link>
            : <button type="button" className="btn btn-outline" onClick={clearFilters}>{emptyState.action}</button>}
        </div>
      ) : <div className="wanted-grid">{posts.map((post) => <WantedCard key={post.id} post={post} />)}</div>}
      {cursor && <div className="wanted-more"><Button kind="outline" disabled={more} onClick={() => load(cursor)}>{more ? 'Loading…' : 'Load more'}</Button></div>}
    </main>
  );
}
