import type { Metadata } from 'next';
import { LegalPage } from '@/components/LegalPage';
import { TERMS } from '@/lib/legal';

export const metadata: Metadata = {
  title: 'Terms of Service · Flipd',
  description: 'The terms governing your use of Flipd, the USC student marketplace.',
};

export default function TermsOfServicePage() {
  return <LegalPage doc={TERMS} />;
}
