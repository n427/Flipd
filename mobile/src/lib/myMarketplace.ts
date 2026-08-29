export function wantedHistoryBucket(
  post: { status: string; needed_by: string },
  now = new Date(),
): 'active' | 'past' {
  return post.status === 'active' && new Date(post.needed_by) > now ? 'active' : 'past';
}
