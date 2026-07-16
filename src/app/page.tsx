'use client';

// Flipd — landing page route ('/'). "Get the app" / "Sign in" enter the web app.
import { useRouter } from 'next/navigation';
import { Landing } from '@/components/Landing';

export default function HomePage() {
  const router = useRouter();
  return <Landing heroVariant="editorial" onEnter={() => router.push('/feed')} />;
}
