const DEFAULT_API_BASE = 'https://www.flipdcampus.com';
const COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

type Dependencies = {
  getAccessToken?: () => Promise<string>;
  fetcher?: typeof fetch;
  apiBase?: string;
};

async function token(): Promise<string> {
  const { requireToken } = await import('./listings');
  return requireToken();
}

async function repost(path: string, overrides: Dependencies = {}): Promise<string> {
  const accessToken = await (overrides.getAccessToken ?? token)();
  const response = await (overrides.fetcher ?? fetch)(`${(overrides.apiBase ?? DEFAULT_API_BASE).replace(/\/$/, '')}${path}`, {
    method: 'POST', headers: { Authorization: `Bearer ${accessToken}` },
  });
  const body = await response.json().catch(() => ({})) as { posted_at?: string; error?: string };
  if (!response.ok || !body.posted_at) throw new Error(body.error || `Repost failed (${response.status})`);
  return body.posted_at;
}

export function repostListing(id: string, overrides?: Dependencies) {
  return repost(`/api/listings/${id}/repost`, overrides);
}

export function repostWantedPost(id: string, overrides?: Dependencies) {
  return repost(`/api/wanted/${id}/repost`, overrides);
}

export function repostAvailability(active: boolean, postedAt: string, now = new Date()) {
  if (!active) return { allowed: false as const, availableAt: null };
  const availableAt = new Date(new Date(postedAt).getTime() + COOLDOWN_MS).toISOString();
  return { allowed: new Date(availableAt).getTime() <= now.getTime(), availableAt };
}
