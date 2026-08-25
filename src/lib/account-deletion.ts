export type AccountDeletionAdmin = {
  deleteStorage(userId: string): Promise<void>;
  cleanupDatabase(userId: string): Promise<void>;
  deleteAuthUser(userId: string): Promise<void>;
};

export const ACCOUNT_STORAGE_BUCKETS = [
  'avatars',
  'listing-photos',
  'message-attachments',
  'wanted-reference-photos',
  'wanted-offer-photos',
] as const;

/** Supabase accepts larger deletes, but 100 keeps requests bounded and retryable. */
export async function removeStoragePathsInBatches(
  paths: string[],
  remove: (batch: string[]) => Promise<void>,
  batchSize = 100,
): Promise<void> {
  for (let index = 0; index < paths.length; index += batchSize) {
    await remove(paths.slice(index, index + batchSize));
  }
}

export async function deleteAccount(
  adapter: AccountDeletionAdmin,
  userId: string,
): Promise<void> {
  // Storage must remain first: Wanted cleanup redacts retained private offer
  // paths, so the server needs to enumerate and remove those objects before
  // cleanupDatabase deliberately forgets where they lived.
  await adapter.deleteStorage(userId);
  await adapter.cleanupDatabase(userId);
  await adapter.deleteAuthUser(userId);
}
