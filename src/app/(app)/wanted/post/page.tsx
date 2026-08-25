'use client';
import { useRouter } from 'next/navigation';
import { WantedPostForm } from '@/components/WantedPostForm';
import { wantedClient } from '@/lib/wanted-client';

export default function WantedPostPage() {
  const router = useRouter();
  return <main className="wanted-editor"><WantedPostForm onCancel={() => router.push('/wanted')} onSubmit={async (input) => { const result = await wantedClient.createPost(input); router.push(`/wanted/${result.wanted_post.id}`); }} /></main>;
}
