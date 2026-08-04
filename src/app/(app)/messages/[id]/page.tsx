'use client';

import { Thread } from '@/components/Thread';

export default function ThreadPage({ params }: { params: { id: string } }) {
  return <Thread threadId={params.id} />;
}
