'use client';

import { useRouter } from 'next/navigation';
import { WebProfile } from '@/components/WebApp';
import { useStore } from '@/lib/store-context';

export default function ProfilePage() {
  const router = useRouter();
  const store = useStore();

  return (
    <WebProfile
      store={store}
      onListing={(l) => router.push(`/listing/${l.id}`)}
      onApprove={(id) => store.respondReveal(id, 'approve')}
      onDecline={(id) => store.respondReveal(id, 'decline')}
      onEdit={() => router.push('/profile/edit')}
    />
  );
}
