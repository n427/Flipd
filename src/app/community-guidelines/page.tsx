import type { Metadata } from 'next';
import { LegalPage } from '@/components/LegalPage';
import { COMMUNITY_GUIDELINES } from '@/lib/legal';

export const metadata: Metadata = {
  title: 'Community Guidelines · Flipd',
  description: 'The marketplace, safety, reporting, and conduct rules for the Flipd community.',
};

export default function CommunityGuidelinesPage() {
  return <LegalPage doc={COMMUNITY_GUIDELINES} />;
}
