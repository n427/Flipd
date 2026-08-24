export type DeleteThreadDependencies = {
  getAccessToken: () => Promise<string | null>;
  fetcher: typeof fetch;
  apiBase: string;
};

export async function deleteThread(
  threadId: string,
  dependencies?: DeleteThreadDependencies,
): Promise<void> {
  const deps = dependencies ?? (await defaultDependencies());
  const token = await deps.getAccessToken();
  if (!token) throw new Error('Sign in again to delete this conversation.');

  const response = await deps.fetcher(`${deps.apiBase}/api/threads/${threadId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `Could not delete this conversation (${response.status})`);
  }
}

async function defaultDependencies(): Promise<DeleteThreadDependencies> {
  const [{ requireToken, API_BASE }] = await Promise.all([import('./listings')]);
  return {
    getAccessToken: () => requireToken().catch(() => null),
    fetcher: fetch,
    apiBase: API_BASE,
  };
}
