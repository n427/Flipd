import { NextRequest, NextResponse } from 'next/server';
import { ACCOUNT_STORAGE_BUCKETS, deleteAccount, removeStoragePathsInBatches, type AccountDeletionAdmin } from '@/lib/account-deletion';
import { getRequestUser } from '@/lib/supabase/authAny';
import { admin } from '@/lib/supabase/admin';

async function listStoragePaths(bucket: string, prefix: string): Promise<string[]> {
  const paths: string[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await admin.storage.from(bucket).list(prefix, { limit: 1000, offset });
    if (error) throw error;
    const entries = data ?? [];
    for (const entry of entries) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.id) paths.push(path);
      else paths.push(...(await listStoragePaths(bucket, path)));
    }
    if (entries.length < 1000) break;
  }
  return paths;
}

async function removeFolder(bucket: string, prefix: string): Promise<void> {
  const paths = await listStoragePaths(bucket, prefix);
  if (paths.length === 0) return;
  await removeStoragePathsInBatches(paths, async (batch) => {
    const { error } = await admin.storage.from(bucket).remove(batch);
    if (error) throw error;
  });
}

async function listOwnedListingIds(userId: string): Promise<string[]> {
  const ids: string[] = [];
  let after: string | null = null;
  for (;;) {
    let query = admin.from('listings').select('id').eq('seller_id', userId)
      .order('id', { ascending: true }).limit(500);
    if (after) query = query.gt('id', after);
    const { data, error } = await query;
    if (error) throw error;
    const page = data ?? [];
    ids.push(...page.map((listing) => listing.id));
    if (page.length < 500) return ids;
    after = page[page.length - 1].id;
  }
}

function createDeletionAdapter(): AccountDeletionAdmin {
  return {
    async deleteStorage(userId) {
      const listingIds = await listOwnedListingIds(userId);

      // Native uploads use the user prefix. Web listing uploads use listing ID
      // prefixes, so both must be removed before their rows disappear.
      await Promise.all(ACCOUNT_STORAGE_BUCKETS.map((bucket) => removeFolder(bucket, userId)));
      for (const listingId of listingIds) await removeFolder('listing-photos', listingId);
    },

    async cleanupDatabase(userId) {
      const { error: uploadsError } = await admin.from('wanted_uploads').delete().eq('owner_id', userId);
      if (uploadsError) throw uploadsError;
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
