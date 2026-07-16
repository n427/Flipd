import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/supabase/server';
import { Landing } from '@/components/Landing';

export default async function HomePage() {
  const user = await getSessionUser();
  if (user) redirect('/feed');
  return <Landing />;
}
