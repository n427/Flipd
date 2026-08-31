import { describe, expect, it } from 'vitest';
import { wantedFeedEmptyState } from './wanted-feed-presentation';

describe('wantedFeedEmptyState', () => {
  it('invites someone to create the first request when the public feed is empty', () => {
    expect(wantedFeedEmptyState({ mine: false, hasFilters: false })).toEqual({
      title: 'Be the first to ask',
      body: 'Post what you need and let verified Trojans come to you.',
      action: 'Post what you need',
      actionHref: '/wanted/post',
    });
  });

  it('offers to clear filters when filters hide every request', () => {
    expect(wantedFeedEmptyState({ mine: false, hasFilters: true })).toEqual({
      title: 'No requests match',
      body: 'Try another search or clear your filters.',
      action: 'Clear filters',
      actionHref: null,
    });
  });

  it('directs an empty personal feed to create a request', () => {
    expect(wantedFeedEmptyState({ mine: true, hasFilters: false })).toEqual({
      title: 'You haven’t posted a request yet',
      body: 'Tell campus what you’re looking for and track offers here.',
      action: 'Post a request',
      actionHref: '/wanted/post',
    });
  });
});
