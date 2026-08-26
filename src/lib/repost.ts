export const REPOST_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

export function effectivePostedAt(createdAt: string, repostedAt?: string | null): string {
  return repostedAt ?? createdAt;
}

export type RepostAvailability =
  | { allowed: true; availableAt: string }
  | { allowed: false; availableAt: string | null; reason: 'cooldown' | 'closed' };

export function repostAvailability(
  input: { active: boolean; postedAt: string },
  now = new Date(),
): RepostAvailability {
  if (!input.active) return { allowed: false, availableAt: null, reason: 'closed' };
  const availableAt = new Date(new Date(input.postedAt).getTime() + REPOST_COOLDOWN_MS).toISOString();
  if (new Date(availableAt).getTime() <= now.getTime()) return { allowed: true, availableAt };
  return { allowed: false, availableAt, reason: 'cooldown' };
}

type RepostDatabaseError = { code?: string; message?: string; details?: string | null };
export type RepostErrorResponse = { status: number; error: string; available_at?: string };

export function repostErrorResponse(error: RepostDatabaseError): RepostErrorResponse {
  if (error.code === 'P0002') return { status: 404, error: 'not found' };
  if (error.code === 'P0001') {
    return {
      status: 409,
      error: 'repost cooldown active',
      ...(error.details ? { available_at: error.details } : {}),
    };
  }
  if (error.code === '23514') return { status: 409, error: 'post is closed' };
  return { status: 500, error: 'unable to repost' };
}

export async function repostListingRequest(id: string, fetcher: typeof fetch = fetch): Promise<{ posted_at: string }> {
  const response = await fetcher(`/api/listings/${id}/repost`, { method: 'POST' });
  const body = await response.json().catch(() => ({})) as { posted_at?: string; error?: string };
  if (!response.ok || !body.posted_at) throw new Error(body.error || `Repost failed (${response.status})`);
  return { posted_at: body.posted_at };
}
