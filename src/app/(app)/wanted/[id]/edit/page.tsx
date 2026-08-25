'use client';
import React from 'react';
import { useRouter } from 'next/navigation';
import { WantedPostForm } from '@/components/WantedPostForm';
import { wantedClient } from '@/lib/wanted-client';
import type { WantedPostDTO } from '@/lib/types';

export default function WantedEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = React.use(params); const router = useRouter();
  const [post, setPost] = React.useState<WantedPostDTO | null>(null); const [allowed, setAllowed] = React.useState<boolean | null>(null);
  React.useEffect(() => { wantedClient.getPost(id).then((result) => { setPost(result.wanted_post); setAllowed(Boolean(result.management)); }).catch(() => setAllowed(false)); }, [id]);
  if (allowed === null) return <div className="wanted-state">Loading request…</div>;
  if (!allowed || !post) return <div className="wanted-state">Request not found.</div>;
  return <main className="wanted-editor"><WantedPostForm initial={post} submitLabel="Save changes" onCancel={() => router.push(`/wanted/${id}`)} onSubmit={async (input) => { await wantedClient.updatePost(id, input); router.push(`/wanted/${id}`); }} /></main>;
}
