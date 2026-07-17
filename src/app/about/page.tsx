import { Landing } from '@/components/Landing';

// Marketing page, viewable regardless of session ('/' redirects signed-in
// users to /feed, so this is the way to see it while logged in).
export default function AboutPage() {
  return <Landing />;
}
