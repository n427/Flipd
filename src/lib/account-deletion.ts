export type AccountDeletionAdmin = {
  deleteStorage(userId: string): Promise<void>;
  cleanupDatabase(userId: string): Promise<void>;
  deleteAuthUser(userId: string): Promise<void>;
};

export async function deleteAccount(
  adapter: AccountDeletionAdmin,
  userId: string,
): Promise<void> {
  await adapter.deleteStorage(userId);
  await adapter.cleanupDatabase(userId);
  await adapter.deleteAuthUser(userId);
}
