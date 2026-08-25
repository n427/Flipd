export type ReportTarget =
  | { kind: 'listing'; id: string }
  | { kind: 'user'; id: string }
  | { kind: 'thread'; id: string }
  | { kind: 'wanted_post'; id: string }
  | { kind: 'wanted_offer'; id: string };

export function parseReportTarget(body: Record<string, unknown>): ReportTarget | null {
  const candidates: ReportTarget[] = [];
  if (typeof body.listing_id === 'string' && body.listing_id) {
    candidates.push({ kind: 'listing', id: body.listing_id });
  }
  if (typeof body.user_id === 'string' && body.user_id) {
    candidates.push({ kind: 'user', id: body.user_id });
  }
  if (typeof body.thread_id === 'string' && body.thread_id) {
    candidates.push({ kind: 'thread', id: body.thread_id });
  }
  if (typeof body.wanted_post_id === 'string' && body.wanted_post_id) {
    candidates.push({ kind: 'wanted_post', id: body.wanted_post_id });
  }
  if (typeof body.wanted_offer_id === 'string' && body.wanted_offer_id) {
    candidates.push({ kind: 'wanted_offer', id: body.wanted_offer_id });
  }
  return candidates.length === 1 ? candidates[0] : null;
}
