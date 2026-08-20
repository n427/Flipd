import { NextRequest, NextResponse } from 'next/server';
import { deleteAccount, type AccountDeletionAdmin } from '@/lib/account-deletion';
import { getRequestUser } from '@/lib/supabase/authAny';
import { admin } from '@/lib/supabase/admin';

const STORAGE_BUCKETS = ['avatars', 'listing-photos', 'message-attachments'] as const;

async function listStoragePaths(bucket: string, prefix: string): Promise<string[]> {
  const { data, error } = await admin.storage.from(bucket).list(prefix, { limit: 1000 });
  if (error) throw error;

  const paths: string[] = [];
  for (const entry of data ?? []) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.id) paths.push(path);
    else paths.push(...(await listStoragePaths(bucket, path)));
  }
  return paths;
}

async function removeFolder(bucket: string, prefix: string): Promise<void> {
  const paths = await listStoragePaths(bucket, prefix);
  if (paths.length === 0) return;
  const { error } = await admin.storage.from(bucket).remove(paths);
  if (error) throw error;
}

function createDeletionAdapter(): AccountDeletionAdmin {
  return {
    async deleteStorage(userId) {
      const { data: listings, error } = await admin
        .from('listings')
        .select('id')
        .eq('seller_id', userId);
      if (error) throw error;

      // Native uploads use the user prefix. Web listing uploads use listing ID
      // prefixes, so both must be removed before their rows disappear.
      await Promise.all(STORAGE_BUCKETS.map((bucket) => removeFolder(bucket, userId)));
      await Promise.all(
        (listings ?? []).map((listing) => removeFolder('listing-photos', listing.id)),
      );
    },

    async cleanupDatabase(userId) {
      const { error } = await admin.rpc('cleanup_deleted_account', {
        target_user_id: userId,
      });
      if (error) throw error;
    },

    async deleteAuthUser(userId) {
      const { error } = await admin.auth.admin.deleteUser(userId);
      if (error && error.code !== 'user_not_found') throw error;
    },
  };
}

export async function DELETE(req: NextRequest) {
  const user = await getRequestUser(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  try {
    await deleteAccount(createDeletionAdapter(), user.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[account-deletion] failed', {
      userId: user.id,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: 'Account deletion could not be completed. Please try again.' },
      { status: 500 },
    );
  }
}
