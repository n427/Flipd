import { LegalScreen } from '@/components/LegalScreen';
import { COMMUNITY_GUIDELINES } from '@/lib/legal';

export default function CommunityGuidelines() {
  return <LegalScreen doc={COMMUNITY_GUIDELINES} />;
}
