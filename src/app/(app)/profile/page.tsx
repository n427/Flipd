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
      onApprove={(id) => store.setActivityStatus(id, 'APPROVED')}
      onDecline={(id) => store.setActivityStatus(id, 'DECLINED')}
    />
  );
}
