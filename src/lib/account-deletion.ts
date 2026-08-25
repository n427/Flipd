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
