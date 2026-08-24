import { describe, expect, it, vi } from 'vitest';
import { deleteThread } from './conversationDeletion';

describe('deleteThread', () => {
  it('deletes the selected authenticated conversation', async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 204 }));

    await deleteThread('thread-123', {
      getAccessToken: async () => 'access-token',
      fetcher,
      apiBase: 'https://flipd.test',
    });

    expect(fetcher).toHaveBeenCalledWith('https://flipd.test/api/threads/thread-123', {
      method: 'DELETE',
      headers: { Authorization: 'Bearer access-token' },
    });
  });

  it('surfaces the server error without removing the row locally', async () => {
    await expect(
      deleteThread('thread-123', {
        getAccessToken: async () => 'access-token',
        fetcher: async () =>
          new Response(JSON.stringify({ error: 'Could not delete this conversation.' }), {
            status: 500,
            headers: { 'content-type': 'application/json' },
          }),
        apiBase: 'https://flipd.test',
      }),
    ).rejects.toThrow('Could not delete this conversation.');
  });
});
