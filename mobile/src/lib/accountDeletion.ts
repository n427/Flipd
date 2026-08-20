type DeletionDependencies = {
  getAccessToken: () => Promise<string | null>;
  fetcher: typeof fetch;
  apiBase: string;
};

export function canConfirmDeletion(text: string): boolean {
  return text.trim() === 'DELETE';
}

async function defaultDependencies(): Promise<DeletionDependencies> {
  const [{ supabase }, { API_BASE }] = await Promise.all([
    import('./supabase'),
    import('./listings'),
  ]);
  return {
    getAccessToken: async () => {
      const { data } = await supabase.auth.getSession();
      return data.session?.access_token ?? null;
    },
    fetcher: fetch,
    apiBase: API_BASE,
  };
}

export async function requestAccountDeletion(
  dependencies?: DeletionDependencies,
): Promise<void> {
  const deps = dependencies ?? (await defaultDependencies());
  const token = await deps.getAccessToken();
  if (!token) throw new Error('Sign in again before deleting your account.');

  const response = await deps.fetcher(`${deps.apiBase}/api/me/delete`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (response.ok) return;

  const payload = await response.json().catch(() => ({})) as { error?: string };
  throw new Error(payload.error || 'Account deletion could not be completed. Try again.');
}
