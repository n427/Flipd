import type { Metadata } from 'next';
import { LegalPage } from '@/components/LegalPage';
import { PRIVACY } from '@/lib/legal';

export const metadata: Metadata = {
  title: 'Privacy Policy · Flipd',
  description: 'How Flipd collects, uses, and protects your information.',
};

export default function PrivacyPolicyPage() {
  return <LegalPage doc={PRIVACY} />;
}
