export type WantedFeedEmptyState = {
  title: string;
  body: string;
  action: string;
  actionHref: string | null;
};

export function wantedFeedEmptyState({
  mine,
  hasFilters,
}: {
  mine: boolean;
  hasFilters: boolean;
}): WantedFeedEmptyState {
  if (hasFilters) {
    return {
      title: 'No requests match',
      body: 'Try another search or clear your filters.',
      action: 'Clear filters',
      actionHref: null,
    };
  }

  if (mine) {
    return {
      title: 'You haven’t posted a request yet',
      body: 'Tell campus what you’re looking for and track offers here.',
      action: 'Post a request',
      actionHref: '/wanted/post',
    };
  }

  return {
    title: 'Be the first to ask',
    body: 'Post what you need and let verified Trojans come to you.',
    action: 'Post what you need',
    actionHref: '/wanted/post',
  };
}
