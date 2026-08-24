import { describe, expect, it } from 'vitest';
import { deleteConversationForRequest } from './conversation-deletion';

describe('deleteConversationForRequest', () => {
  it('removes the thread linked to a declined request', async () => {
    const deletedRequestIds: string[] = [];
    const database = {
      from(table: string) {
        expect(table).toBe('message_threads');
        return {
          delete() {
            return {
              async eq(column: string, value: string) {
                expect(column).toBe('request_id');
                deletedRequestIds.push(value);
                return { error: null };
              },
            };
          },
        };
      },
    };

    await deleteConversationForRequest(database, 'request-123');

    expect(deletedRequestIds).toEqual(['request-123']);
  });

  it('does not hide a database deletion failure', async () => {
    const database = {
      from() {
        return {
          delete() {
            return {
              async eq() {
                return { error: { message: 'database unavailable' } };
              },
            };
          },
        };
      },
    };

    await expect(deleteConversationForRequest(database, 'request-123')).rejects.toThrow(
      'database unavailable',
    );
  });
});
