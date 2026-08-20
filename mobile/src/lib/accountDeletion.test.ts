import { describe, expect, it, vi } from 'vitest';
import { canConfirmDeletion, requestAccountDeletion } from './accountDeletion';

describe('account deletion', () => {
  it('requires the exact confirmation phrase after trimming whitespace', () => {
    expect(canConfirmDeletion('DELETE')).toBe(true);
    expect(canConfirmDeletion('  DELETE  ')).toBe(true);
    expect(canConfirmDeletion('delete')).toBe(false);
    expect(canConfirmDeletion('DELETE account')).toBe(false);
  });

  it('rejects before sending when there is no active session', async () => {
    const fetcher = vi.fn();

    await expect(
      requestAccountDeletion({
        getAccessToken: async () => null,
        fetcher,
        apiBase: 'https://example.test',
      }),
    ).rejects.toThrow('Sign in again');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('surfaces the server error when deletion is not confirmed', async () => {
    await expect(
      requestAccountDeletion({
        getAccessToken: async () => 'token',
        fetcher: async () =>
          new Response(JSON.stringify({ error: 'Deletion failed safely.' }), {
            status: 500,
            headers: { 'content-type': 'application/json' },
          }),
        apiBase: 'https://example.test',
      }),
    ).rejects.toThrow('Deletion failed safely.');
  });
});
