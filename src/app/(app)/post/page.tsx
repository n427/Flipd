'use client';

import { useRouter } from 'next/navigation';
import { WebCreate } from '@/components/WebApp';
import { useStore } from '@/lib/store-context';

export default function PostPage() {
  const router = useRouter();
  const store = useStore();

  return (
    <WebCreate
      store={store}
      onCancel={() => router.push('/feed')}
      onPublish={async (fd) => {
        // Throw on failure so WebCreate stays on the preview; on success it
        // shows its own confirmation (whose button routes back to the feed).
        const created = await store.addListing(fd);
        if (!created) throw new Error('Publish failed — no listing returned.');
      }}
    />
  );
}
