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
        try {
          const created = await store.addListing(fd);
          if (!created) throw new Error('Publish failed — no listing returned.');
          router.push('/feed');
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Publish failed.';
          console.error('[publish] failed:', err);
          alert('Could not publish your listing:\n\n' + msg);
        }
      }}
    />
  );
}
