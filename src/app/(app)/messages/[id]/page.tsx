'use client';

import React from 'react';
import { Thread } from '@/components/Thread';

export default function ThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = React.use(params);
  return <Thread threadId={id} />;
}
