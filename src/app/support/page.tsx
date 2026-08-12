import type { Metadata } from 'next';
import { LegalPage } from '@/components/LegalPage';
import { SUPPORT, SUPPORT_FAQ, SUPPORT_EMAIL } from '@/lib/legal';

export const metadata: Metadata = {
  title: 'Support · Flipd',
  description: 'Help with signing in, buying, selling, and staying safe on Flipd.',
};

export default function SupportPage() {
  return (
    <LegalPage doc={SUPPORT}>
      <h2
        style={{
          fontWeight: 700,
          fontSize: 17,
          letterSpacing: '-0.01em',
          color: 'var(--ink)',
          margin: '32px 0 10px',
        }}
      >
        Common questions
      </h2>
      {SUPPORT_FAQ.map((f) => (
        <div key={f.q} style={{ margin: '0 0 16px' }}>
          <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)', margin: '0 0 4px' }}>
            {f.q}
          </p>
          <p style={{ fontSize: 15, lineHeight: 1.7, color: 'var(--ink-2)', margin: 0 }}>{f.a}</p>
        </div>
      ))}

      <h2
        style={{
          fontWeight: 700,
          fontSize: 17,
          letterSpacing: '-0.01em',
          color: 'var(--ink)',
          margin: '32px 0 10px',
        }}
      >
        Still need help?
      </h2>
      <p style={{ fontSize: 15, lineHeight: 1.7, color: 'var(--ink-2)', margin: '0 0 18px' }}>
        Email us and we&rsquo;ll get back to you.
      </p>
      <a
        href={`mailto:${SUPPORT_EMAIL}`}
        className="btn btn-primary"
        style={{ padding: '12px 22px', textDecoration: 'none', display: 'inline-block' }}
      >
        Email support
      </a>
    </LegalPage>
  );
}
