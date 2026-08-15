'use client';

// One inbox: conversations plus the requests that create them. Splitting these
// across two pages meant an approved request lived in one place and its chat in
// another, which is the same thing at two stages.
import React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Avatar, Button } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { Thread } from '@/components/Thread';
import { RequestTimeline, RatingModal, WebDropdown } from '@/components/WebApp';
import { SafetyCard, type SafetyReview } from '@/components/SafetyCard';
import { RequestQuote } from '@/components/RequestQuote';
import { useStore, } from '@/lib/store-context';
import { rangeSince } from '@/lib/store';
import { timeLeftLabel, swapCountLabel, conversationHref } from '@/lib/validation';
import type { ActivityItem, FeedRange } from '@/lib/types';
import { ListRowsSkeleton } from '@/components/Skeletons';

// Offered when declining. Optional — declining stays a single tap — but a
// reason keeps the loop useful for the buyer without feeling punitive.
const DECLINE_REASONS = [
  { id: 'bad_timing', label: 'Bad timing' },
  { id: 'already_sold', label: 'Already sold' },
  { id: 'not_enough_info', label: 'Not enough info' },
] as const;

// Three tabs rather than a two-column grid. Incoming and outgoing requests are
// different jobs with different actions, and stacking them in one column buried
// whichever came second.
type Tab = 'conversations' | 'incoming' | 'outgoing';

const TABS: { id: Tab; label: string }[] = [
  { id: 'conversations', label: 'Conversations' },
  { id: 'incoming', label: 'Want to talk' },
  { id: 'outgoing', label: 'You sent' },
];

// A request that is over stays readable but does not need to sit above the ones
// still asking for a decision.
const RESOLVED = new Set(['DECLINED', 'EXPIRED']);

// Status as a tinted pill, the way mobile shows it. A bare uppercase word read
// as a system label rather than the state of your deal.
const STATUS_STYLE: Record<string, { label: string; bg: string; fg: string }> = {
  PENDING: { label: 'Pending', bg: '#FFF3D6', fg: '#8A6D1A' },
  APPROVED: { label: 'Approved', bg: '#E4F3E7', fg: '#1E6B33' },
  COMPLETED: { label: 'Completed', bg: '#E4F3E7', fg: '#1E6B33' },
  DECLINED: { label: 'Declined', bg: '#F3E4E4', fg: '#8A2222' },
  EXPIRED: { label: 'Expired', bg: '#EEEDEA', fg: '#7A756C' },
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_STYLE[status] ?? { label: status, bg: 'var(--surface)', fg: 'var(--muted)' };
  return (
    <span style={{
      display: 'inline-block', background: s.bg, color: s.fg,
      borderRadius: 999, padding: '4px 10px', fontSize: 12, fontWeight: 700,
    }}>
      {s.label}
    </span>
  );
}

type ThreadRow = {
  id: string;
  listing_title: string;
  listing_price: number | null;
  listing_photo: string | null;
  counterpart: { id: string; display_name: string | null; avatar_url: string | null } | null;
  last_message: string | null;
  last_message_at: string | null;
  unread: boolean;
};

function timeAgo(iso: string | null) {
  if (!iso) return '';
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function EmptyPanel({ title, body }: { title: string; body: string }) {
  return (
    <div style={{ padding: '48px 24px', textAlign: 'center' }}>
      <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--ink)' }}>{title}</div>
      <div className="t-meta" style={{ fontSize: 13, marginTop: 7, lineHeight: 1.5 }}>{body}</div>
    </div>
  );
}

// Count beside a section title. Tinted rather than bold-red text: it is a
// quantity, not an alarm, but it should still be the thing your eye lands on.
function CountPill({ n }: { n: number }) {
  return (
    <span style={{
      display: 'inline-block', minWidth: 22, textAlign: 'center',
      background: '#f6e7e7', color: 'var(--accent)',
      borderRadius: 999, padding: '2px 7px', fontSize: 12, fontWeight: 800,
    }}>
      {n}
    </span>
  );
}

// A panel's header strip: title, optional count, and the date filter it scopes.
function PanelHead({ title, count, filter }: { title: string; count?: number; filter: React.ReactNode }) {
  return (
    <div className="req-head">
      <span style={{ fontWeight: 800, fontSize: 14.5, letterSpacing: '-0.015em', color: 'var(--ink)' }}>{title}</span>
      {count ? <CountPill n={count} /> : null}
      <span style={{ marginLeft: 'auto' }}>{filter}</span>
    </div>
  );
}

// Name, what it's about, and when — the three lines every request row leads
// with, incoming or outgoing.
function RequestIdentity({ a }: { a: ActivityItem }) {
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--ink)' }}>{a.who}</div>
      {/* Wraps rather than truncates: a long listing title would otherwise eat
          the ellipsis and take "asked 2d ago" with it. */}
      <div className="t-meta" style={{ fontSize: 13, marginTop: 2, lineHeight: 1.4 }}>
        <Link
          href={`/listing/${a.listingId}?from=requests`}
          style={{ color: 'var(--muted)', fontWeight: 600, textDecoration: 'none' }}
        >
          {a.listingTitle || 'A listing'}
        </Link>
        {' · asked '}{a.when} ago
      </div>
    </div>
  );
}

// Price and urgency, right-aligned. Pending requests count down; everything
// else states where it landed.
function RequestStatusColumn({ a }: { a: ActivityItem }) {
  return (
    <div style={{ textAlign: 'right', flexShrink: 0 }}>
      {a.offer != null && (
        <div style={{ fontWeight: 800, fontSize: 19, letterSpacing: '-0.02em', color: 'var(--ink)' }}>
          ${a.offer.toLocaleString('en-US')}
        </div>
      )}
      {a.status === 'PENDING' && timeLeftLabel(a.expiresAt) && (
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent)', marginTop: 2 }}>
          {timeLeftLabel(a.expiresAt)}
        </div>
      )}
      {a.status !== 'PENDING' && (
        <div style={{ marginTop: 3 }}><StatusBadge status={a.status} /></div>
      )}
    </div>
  );
}

// Finished business: one line, the outcome, and whatever is still open to you —
// the rating you owe, and the conversation, which outlives the request itself.
function SettledRow({ a, onRate }: { a: ActivityItem; onRate: (a: ActivityItem) => void }) {
  return (
    <div className="req-row" style={{ display: 'flex', alignItems: 'center', gap: 13, flexWrap: 'wrap' }}>
      <Avatar name={a.who} src={a.avatarUrl} size={40} tone="cream" />
      <div style={{ flex: 1, minWidth: 140 }}>
        <div style={{ fontWeight: 700, fontSize: 14.5, color: 'var(--ink)' }}>{a.who}</div>
        <div className="t-meta" style={{ fontSize: 12.5, marginTop: 2, lineHeight: 1.4 }}>
          {a.listingTitle || 'A listing'} · asked {a.when} ago{a.declineReason ? ` · ${a.declineReason}` : ''}
        </div>
      </div>
      <StatusBadge status={a.status} />
      {a.threadId && (
        <Link
          href={conversationHref(a.threadId)}
          style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-2)', textDecoration: 'none', whiteSpace: 'nowrap', flexShrink: 0 }}
        >
          Open chat
        </Link>
      )}
      {a.canRate && (
        <Button kind="outline" size="sm" icon="star" iconColor="var(--star)" onClick={() => onRate(a)} style={{ flexShrink: 0 }}>
          Rate {a.who.split(' ')[0]}
        </Button>
      )}
    </div>
  );
}

// Conversation index for the left pane. Selecting a row swaps the right pane
// rather than navigating, so the list stays put the way it does in Messenger.
function ConversationList({
  threads, selectedId, onSelect, hiddenByRange,
}: {
  threads: ThreadRow[] | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
  // True when the date filter is what emptied the list, so "none yet" and
  // "none in this window" do not read as the same thing.
  hiddenByRange?: boolean;
}) {
  if (threads === null) return <ListRowsSkeleton count={4} />;
  if (threads.length === 0) {
    return (
      <div style={{ padding: '40px 22px', textAlign: 'center' }}>
        <div style={{ fontWeight: 700, fontSize: 14.5, color: 'var(--ink)' }}>
          {hiddenByRange ? 'Nothing in this window' : 'No conversations yet'}
        </div>
        <div className="t-meta" style={{ fontSize: 12.5, marginTop: 6, lineHeight: 1.5 }}>
          {hiddenByRange
            ? 'Widen the date filter to see older conversations.'
            : 'Ask about a listing, and once the seller approves you can talk here.'}
        </div>
      </div>
    );
  }
  return (
    <div>
      {threads.map((t, i) => {
        const active = t.id === selectedId;
        return (
          <button
            key={t.id}
            onClick={() => onSelect(t.id)}
            style={{
              width: '100%', textAlign: 'left', background: active ? 'var(--surface)' : 'transparent',
              border: 0, borderTop: i > 0 ? '1px solid var(--rule)' : 0,
              // The bar is always there, transparent when idle, so selecting a
              // row marks it without shifting the avatar three pixels right.
              borderLeft: `3px solid ${active ? 'var(--accent)' : 'transparent'}`,
              padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12,
            }}
          >
            <Avatar name={t.counterpart?.display_name ?? '?'} src={t.counterpart?.avatar_url ?? undefined} size={44} tone="cream" />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{
                  fontWeight: t.unread ? 800 : 600, fontSize: 14.5, color: 'var(--ink)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {t.counterpart?.display_name ?? 'Flipd member'}
                </span>
                {/* Time and the unread dot ride together on the right. The dot
                    used to be a flex sibling of the whole row, which floated it
                    below the timestamp instead of beside it. */}
                <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                  <span className="t-meta" style={{ fontSize: 11.5 }}>{timeAgo(t.last_message_at)}</span>
                  {t.unread && <span aria-label="Unread" style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--accent)' }} />}
                </span>
              </div>
              {/* Title and price together: on a list of similar-sounding
                  posts the number is often what tells them apart. */}
              <div className="t-meta" style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {t.listing_title}
                {t.listing_price != null && ` · ${t.listing_price > 0 ? `$${t.listing_price.toLocaleString('en-US')}` : 'Free'}`}
              </div>
              {t.last_message && (
                <div style={{
                  fontSize: 13, marginTop: 2,
                  color: t.unread ? 'var(--ink)' : 'var(--muted)',
                  fontWeight: t.unread ? 600 : 400,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {t.last_message}
                </div>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}

// The counterparty on an incoming request is the buyer. Swap counts used to sit
// on the name row; they belong here, in the one block that answers "should I
// trust this person" rather than competing with the name for attention.
function BuyerReview({ userId }: { userId: string }) {
  const [review, setReview] = React.useState<SafetyReview | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [swaps, setSwaps] = React.useState<{ asBuyer: number; asSeller: number } | null>(null);

  React.useEffect(() => {
    let alive = true;
    fetch(`/api/safety?user=${userId}&role=buyer`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive) { setReview(d?.review ?? null); setLoading(false); } })
      .catch(() => { if (alive) { setReview(null); setLoading(false); } });
    fetch(`/api/users/${userId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive && d) setSwaps(d.swaps ?? { asBuyer: 0, asSeller: 0 }); })
      .catch(() => {});
    return () => { alive = false; };
  }, [userId]);

  const extra = swaps ? [swapCountLabel(swaps.asBuyer, swaps.asSeller)] : [];
  return (
    <div style={{ marginTop: 12 }}>
      <SafetyCard review={review} loading={loading} extraSignals={extra} compact />
    </div>
  );
}

function RequestsInner() {
  const router = useRouter();
  const params = useSearchParams();
  const store = useStore();
  // Deep links decide where you land: "review" on a listing goes to the
  // incoming tab, and "Open chat" anywhere in the app opens that conversation
  // in place rather than on its own page.
  const wantedTab = params.get('tab');
  const wantedThread = params.get('thread');
  const [tab, setTab] = React.useState<Tab>(
    wantedThread ? 'conversations'
      : wantedTab === 'incoming' || wantedTab === 'outgoing' || wantedTab === 'conversations'
        ? wantedTab
        : 'conversations',
  );
  // Requests pile up and old ones are rarely what you came for, so the list
  // opens on the last week. Same options and helper as the feed's Posted filter.
  const [range, setRange] = React.useState<FeedRange>('month');
  const [threads, setThreads] = React.useState<ThreadRow[] | null>(null);
  const [openThread, setOpenThread] = React.useState<string | null>(wantedThread);
  const [confirmSold, setConfirmSold] = React.useState<ActivityItem | null>(null);
  const [declining, setDeclining] = React.useState<ActivityItem | null>(null);
  const [rating, setRating] = React.useState<ActivityItem | null>(null);

  React.useEffect(() => {
    let alive = true;
    fetch('/api/threads')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive) setThreads(d?.threads ?? []); })
      .catch(() => { if (alive) setThreads([]); });
    return () => { alive = false; };
  }, []);

  // GET /api/threads/<id> records the read receipt server-side, but the list
  // was fetched before that and would keep showing the dot until a reload.
  // Clearing it here keeps the two in step.
  const openConversation = React.useCallback((id: string) => {
    setOpenThread(id);
    setThreads((prev) => prev?.map((t) => (t.id === id ? { ...t, unread: false } : t)) ?? prev);
  }, []);

  // "Open chat" from the other two tabs is a link back to this same page, which
  // Next resolves as a soft navigation — the component never remounts, so the
  // state seeded from searchParams above would keep showing whatever tab you
  // were already on. This is what makes those links actually land somewhere.
  React.useEffect(() => {
    if (wantedThread) {
      setTab('conversations');
      openConversation(wantedThread);
    } else if (wantedTab === 'incoming' || wantedTab === 'outgoing' || wantedTab === 'conversations') {
      setTab(wantedTab);
    }
  }, [wantedThread, wantedTab, openConversation]);

  const since = rangeSince(range);
  const inWindow = (a: ActivityItem) => {
    if (since == null || !a.createdAt) return true;
    const t = new Date(a.createdAt).getTime();
    return !Number.isFinite(t) || t >= since;
  };
  // Conversations are bounded by their last message, so the same control means
  // the same thing on every tab.
  const visibleThreads = threads == null || since == null
    ? threads
    : threads.filter((t) => {
      if (!t.last_message_at) return true;
      const ms = new Date(t.last_message_at).getTime();
      return !Number.isFinite(ms) || ms >= since;
    });
  const threadsHiddenByRange = (threads?.length ?? 0) > (visibleThreads?.length ?? 0);

  const incoming = store.activity.filter((a) => a.dir === 'in' && inWindow(a));
  // Requests you sent. Mobile shows these in a second section; on web they had
  // nowhere to live, so a buyer could not see what they had asked for.
  const outgoing = store.activity.filter((a) => a.dir === 'out' && inWindow(a));
  // Two buckets per tab rather than one card per listing. Grouping by listing
  // put the one person still waiting behind a header for a post you already
  // know about, and split a single decision across as many cards as you had
  // listings. What separates these rows is whether they still need you.
  const openWork = (a: ActivityItem) => !RESOLVED.has(a.status) && a.status !== 'COMPLETED';
  const liveIncoming = incoming.filter(openWork);
  const settledIncoming = incoming.filter((a) => !openWork(a));
  const liveOutgoing = outgoing.filter(openWork);
  const settledOutgoing = outgoing.filter((a) => !openWork(a));
  const pendingIncoming = incoming.filter((a) => a.status === 'PENDING').length;

  // One control, reused in each panel's header so the tabs stay interchangeable.
  const rangeFilter = (
    <WebDropdown
      plain label="From" value={range} onChange={(r) => setRange(r as FeedRange)}
      options={[
        { id: 'day', label: 'Past 24 hours' },
        { id: 'week', label: 'Past week' },
        { id: 'month', label: 'Past month' },
        { id: 'all', label: 'All time' },
      ]}
    />
  );

  const approve = async (a: ActivityItem) => {
    const listing = store.listings.find((l) => l.id === a.listingId);
    const singleItem = listing?.category === 'goods';
    await store.respondReveal(a.id, 'approve');
    if (singleItem) setConfirmSold(a);
  };

  // Actions for one incoming request. Sized to their labels rather than split
  // across the row: half-width buttons made Decline look like the equal of
  // Approve, and left no room for the timeline beside them.
  const incomingActions = (a: ActivityItem) => {
    if (a.status === 'PENDING') {
      return (
        <>
          <Button kind="primary" onClick={() => approve(a)}>Approve</Button>
          <Button kind="outline" onClick={() => setDeclining(a)}>Decline</Button>
        </>
      );
    }
    if (a.status === 'APPROVED') {
      return (
        <>
          {/* Open chat leads: once a request is approved, talking is the thing
              you actually came here to do. Completing and declining are both
              endings, and they belong after it. */}
          {a.threadId && (
            <Link href={conversationHref(a.threadId)} className="btn btn-outline" style={{ gap: 7 }}>
              <Icon name="chat" size={15} /> Open chat
            </Link>
          )}
          <Button kind="outline" onClick={() => store.respondReveal(a.id, 'complete')}>
            Mark completed
          </Button>
          {/* Agreeing to talk is not agreeing to sell. Without this an approved
              request could only be completed, so a seller who changed their
              mind had no way to close it. The conversation is left alone. */}
          <Button kind="outline" onClick={() => setDeclining(a)}>Decline</Button>
        </>
      );
    }
    if (a.canRate) {
      return (
        <Button kind="outline" icon="star" iconColor="var(--star)" onClick={() => setRating(a)}>
          Rate {a.who.split(' ')[0]}
        </Button>
      );
    }
    return null;
  };

  return (
    <div style={{ maxWidth: 1120, margin: '0 auto', padding: '32px 32px 96px' }}>
      {/* Title and destinations share a row, and the row's bottom edge is the
          line everything below hangs off. Full-width tabs under the subtitle
          spent a band of vertical space the conversation list wanted. */}
      <div className="req-topbar">
        <div className="req-topbar-title">
          <h1 style={{ fontWeight: 800, fontSize: 27, letterSpacing: '-0.03em', color: 'var(--ink)', margin: '0 0 5px' }}>
            Requests &amp; Messages
          </h1>
          <p style={{ fontSize: 14.5, color: 'var(--muted)', margin: 0 }}>
            Your conversations, and the requests waiting on a reply.
          </p>
        </div>

        <div className="seg" role="tablist" aria-label="Requests sections">
          {TABS.map((t) => {
            const count = t.id === 'incoming' ? pendingIncoming : t.id === 'outgoing' ? outgoing.length : 0;
            return (
              <button
                key={t.id}
                className="seg-tab"
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
              >
                <span className="tab-label" data-label={t.label}><span>{t.label}</span></span>
                {count > 0 && (
                  <span className={t.id === 'incoming' ? 'seg-count' : 'seg-count seg-count--quiet'}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {tab === 'conversations' && (
        <div className="chat-shell" data-selected={openThread ? 'yes' : 'no'}>
          {/* The filter lives on the list it scopes, in the same header band
              the open thread's listing sits in. */}
          <div className="chat-list-head">
            <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--ink)' }}>
              {visibleThreads == null
                ? 'Conversations'
                : `${visibleThreads.length} conversation${visibleThreads.length === 1 ? '' : 's'}`}
            </span>
            <span style={{ marginLeft: 'auto' }}>{rangeFilter}</span>
          </div>
          <div className="chat-list">
            <ConversationList
              threads={visibleThreads}
              selectedId={openThread}
              onSelect={openConversation}
              hiddenByRange={threadsHiddenByRange}
            />
          </div>
          <div className="chat-thread">
            {openThread ? (
              <>
                <button
                  className="chat-back"
                  onClick={() => setOpenThread(null)}
                  style={{
                    alignItems: 'center', gap: 6, background: 'none', border: 0,
                    borderBottom: '1px solid var(--rule)', padding: '12px 16px',
                    fontSize: 13, color: 'var(--muted)', width: '100%',
                  }}
                >
                  <Icon name="chevronLeft" size={14} /> All conversations
                </button>
                <Thread key={openThread} threadId={openThread} embedded />
              </>
            ) : (
              <div style={{ margin: 'auto', textAlign: 'center', padding: 32 }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--ink)' }}>Pick a conversation</div>
                <div className="t-meta" style={{ fontSize: 13, marginTop: 6, lineHeight: 1.5 }}>
                  Choose someone on the left and the messages open here.
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'incoming' && (
        <div className="req-panel">
          <PanelHead title="Waiting on you" count={liveIncoming.length} filter={rangeFilter} />

          {liveIncoming.length === 0 && (
            <EmptyPanel
              title={incoming.length === 0 ? 'No one has asked yet' : 'Nothing waiting on you'}
              body={incoming.length === 0
                ? 'When someone requests one of your listings, it shows up here with an AI review before you decide.'
                : 'Every request in this window has been settled.'}
            />
          )}

          {liveIncoming.map((a) => (
            <div key={a.id} className="req-row">
              {/* Centered, not top-aligned: the identity column is two lines
                  against a 44px avatar, which flex-start left stranded high. */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
                <Avatar name={a.who} src={a.avatarUrl} size={44} tone="cream" />
                <RequestIdentity a={a} />
                <RequestStatusColumn a={a} />
              </div>

              {a.introMessage && <RequestQuote text={a.introMessage} style={{ marginTop: 13 }} />}

              {/* AI review of the buyer, at the moment of deciding.
                  Advisory: it renders nothing if the fetch fails. */}
              {a.status === 'PENDING' && a.counterpartId && <BuyerReview userId={a.counterpartId} />}

              <div className="req-actions">
                {incomingActions(a)}
                <RequestTimeline status={a.status} compact />
              </div>
            </div>
          ))}

          {/* Declined, expired and finished requests are history. They stay
              readable, below the ones still asking for a decision. */}
          {settledIncoming.length > 0 && (
            <>
              <div className="req-band">Settled</div>
              {settledIncoming.map((a) => (
                <SettledRow key={a.id} a={a} onRate={setRating} />
              ))}
            </>
          )}
        </div>
      )}

      {tab === 'outgoing' && (
        <div className="req-panel">
          <PanelHead title="Waiting on them" count={liveOutgoing.length} filter={rangeFilter} />

          {liveOutgoing.length === 0 && (
            <EmptyPanel
              title={outgoing.length === 0 ? 'No requests sent' : 'Nothing outstanding'}
              body={outgoing.length === 0
                ? 'Ask about a listing, and you can track it here until the seller replies.'
                : 'Every request you sent in this window has been settled.'}
            />
          )}

          {liveOutgoing.map((a) => (
            <div key={a.id} className="req-row">
              <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
                <Avatar name={a.who} src={a.avatarUrl} size={44} tone="cream" />
                <RequestIdentity a={a} />
                <RequestStatusColumn a={a} />
              </div>

              {/* Your own words on this tab, so the eyebrow says so. */}
              {a.introMessage && (
                <RequestQuote text={a.introMessage} label="YOU ASKED" style={{ marginTop: 13 }} />
              )}

              <div className="req-actions">
                {a.status === 'APPROVED' && a.threadId && (
                  <Link href={conversationHref(a.threadId)} className="btn btn-outline" style={{ gap: 7 }}>
                    <Icon name="chat" size={15} /> Open chat
                  </Link>
                )}
                <RequestTimeline status={a.status} compact />
              </div>
            </div>
          ))}

          {settledOutgoing.length > 0 && (
            <>
              <div className="req-band">Settled</div>
              {settledOutgoing.map((a) => (
                <SettledRow key={a.id} a={a} onRate={setRating} />
              ))}
            </>
          )}
        </div>
      )}

      {confirmSold && (
        <div onClick={() => setConfirmSold(null)} style={{ position: 'fixed', inset: 0, zIndex: 55, background: 'rgba(17,17,17,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, padding: 28, width: 400, boxShadow: 'var(--shadow-strong)' }}>
            <h2 style={{ fontWeight: 800, fontSize: 19, letterSpacing: '-0.02em', color: 'var(--ink)', margin: '0 0 8px' }}>
              Mark as sold?
            </h2>
            <p style={{ fontFamily: 'var(--sans)', fontSize: 13.5, lineHeight: 1.55, color: 'var(--ink-2)', margin: '0 0 20px' }}>
              You approved {confirmSold.who.split(' ')[0]}. If this item is spoken for, we&rsquo;ll move the listing to your past listings and let other pending requesters know it&rsquo;s no longer available.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <Button kind="ghost" onClick={() => setConfirmSold(null)} style={{ flex: 1 }}>Keep it listed</Button>
              <Button
                kind="primary"
                style={{ flex: 1 }}
                onClick={async () => {
                  await store.respondReveal(confirmSold.id, 'approve', { markSold: true });
                  setConfirmSold(null);
                  router.refresh();
                }}
              >
                Mark as sold
              </Button>
            </div>
          </div>
        </div>
      )}

      {declining && (
        <div onClick={() => setDeclining(null)} style={{ position: 'fixed', inset: 0, zIndex: 55, background: 'rgba(17,17,17,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, padding: 28, width: 400, boxShadow: 'var(--shadow-strong)' }}>
            <h2 style={{ fontWeight: 800, fontSize: 19, letterSpacing: '-0.02em', color: 'var(--ink)', margin: '0 0 8px' }}>
              Decline {declining.who.split(' ')[0]}?
            </h2>
            <p style={{ fontSize: 13.5, lineHeight: 1.55, color: 'var(--ink-2)', margin: '0 0 18px' }}>
              Adding a reason is optional, and it helps them know whether to try again.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18 }}>
              {DECLINE_REASONS.map((r) => (
                <button
                  key={r.id}
                  onClick={async () => {
                    await store.respondReveal(declining.id, 'decline', { declineReason: r.id });
                    setDeclining(null);
                  }}
                  style={{ textAlign: 'left', border: '1.5px solid var(--rule)', borderRadius: 12, padding: '12px 14px', background: '#fff', fontSize: 14, fontWeight: 600, color: 'var(--ink)', cursor: 'pointer' }}
                >
                  {r.label}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <Button kind="ghost" onClick={() => setDeclining(null)} style={{ flex: 1 }}>Cancel</Button>
              <Button
                kind="secondary"
                style={{ flex: 1 }}
                onClick={async () => {
                  await store.respondReveal(declining.id, 'decline');
                  setDeclining(null);
                }}
              >
                Decline without a reason
              </Button>
            </div>
          </div>
        </div>
      )}

      {rating && (
        <RatingModal
          whom={rating.who.split(' ')[0]}
          onClose={() => setRating(null)}
          onSubmit={(score, text) => store.rateTransaction(rating.id, score, text)}
        />
      )}
    </div>
  );
}

// useSearchParams bails out of prerendering, which `next build` rejects unless
// the boundary is explicit.
export default function RequestsPage() {
  return (
    <React.Suspense fallback={<ListRowsSkeleton />}>
      <RequestsInner />
    </React.Suspense>
  );
}
