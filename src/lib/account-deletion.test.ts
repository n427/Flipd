import { describe, expect, it } from 'vitest';
import { ACCOUNT_STORAGE_BUCKETS, deleteAccount, type AccountDeletionAdmin } from './account-deletion';

function recordingAdmin(calls: string[]): AccountDeletionAdmin {
  return {
    async deleteStorage(userId) {
      calls.push(`delete-storage:${userId}`);
    },
    async cleanupDatabase(userId) {
      calls.push(`cleanup-database:${userId}`);
    },
    async deleteAuthUser(userId) {
      calls.push(`delete-auth-user:${userId}`);
    },
  };
}

describe('deleteAccount', () => {
  it('enumerates both Wanted media buckets as required cleanup', () => {
    expect(ACCOUNT_STORAGE_BUCKETS).toContain('wanted-reference-photos');
    expect(ACCOUNT_STORAGE_BUCKETS).toContain('wanted-offer-photos');
  });
  it('removes files and public identity before revoking auth access', async () => {
    const calls: string[] = [];

    await deleteAccount(recordingAdmin(calls), 'user-1');

    expect(calls).toEqual([
      'delete-storage:user-1',
      'cleanup-database:user-1',
      'delete-auth-user:user-1',
    ]);
  });

  it('does not revoke auth access after cleanup fails', async () => {
    const calls: string[] = [];
    const adapter = recordingAdmin(calls);
    adapter.cleanupDatabase = async () => {
      calls.push('cleanup-database:user-1');
      throw new Error('cleanup failed');
    };

    await expect(deleteAccount(adapter, 'user-1')).rejects.toThrow('cleanup failed');
    expect(calls).toEqual(['delete-storage:user-1', 'cleanup-database:user-1']);
  });

  it('does not clean database or revoke auth when required storage cleanup fails', async () => {
    const calls: string[] = [];
    const adapter = recordingAdmin(calls);
    adapter.deleteStorage = async () => {
      calls.push('delete-storage:user-1');
      throw new Error('wanted storage failed');
    };

    await expect(deleteAccount(adapter, 'user-1')).rejects.toThrow('wanted storage failed');
    expect(calls).toEqual(['delete-storage:user-1']);
  });
});
