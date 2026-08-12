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
      onPublish={async (fd, onProgress) => {
        // Throw on failure so WebCreate stays on the preview; on success it
        // shows its own confirmation (whose button routes back to the feed).
        // onProgress drives the fill on WebCreate's publish button.
        const created = await store.addListing(fd, onProgress);
        if (!created) throw new Error('Publish failed. No listing was returned.');
      }}
    />
  );
}
