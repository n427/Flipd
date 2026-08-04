// Shared shell for the static content pages (Terms, Privacy, Support). Takes a
// LegalDoc from @/lib/legal and renders it, so the three routes stay identical
// in layout and only differ in copy.
import type { LegalDoc } from '@/lib/legal';

export function LegalPage({ doc, children }: { doc: LegalDoc; children?: React.ReactNode }) {
  return (
    <main
      style={{
        maxWidth: 680,
        margin: '0 auto',
        padding: '72px 24px 96px',
        fontFamily: 'var(--sans)',
      }}
    >
      <a href="/" style={{ fontSize: 13, color: 'var(--muted)', textDecoration: 'none' }}>
        &larr; Back
      </a>

      <h1
        style={{
          fontWeight: 800,
          fontSize: 32,
          letterSpacing: '-0.03em',
          color: 'var(--ink)',
          margin: '20px 0 8px',
        }}
      >
        {doc.title}
      </h1>

      {doc.updated ? (
        <p style={{ fontSize: 13, color: 'var(--muted)', margin: '0 0 28px' }}>
          Last updated: {doc.updated}
        </p>
      ) : (
        <div style={{ height: 20 }} />
      )}

      {doc.intro ? (
        <p style={{ fontSize: 15.5, lineHeight: 1.7, color: 'var(--ink-2)', margin: '0 0 8px' }}>
          {doc.intro}
        </p>
      ) : null}

      {doc.sections.map((s) => (
        <section key={s.heading}>
          <h2
            style={{
              fontWeight: 700,
              fontSize: 17,
              letterSpacing: '-0.01em',
              color: 'var(--ink)',
              margin: '32px 0 10px',
            }}
          >
            {s.heading}
          </h2>
          {s.body.map((p, i) => (
            <p
              key={i}
              style={{ fontSize: 15, lineHeight: 1.7, color: 'var(--ink-2)', margin: '0 0 12px' }}
            >
              {p}
            </p>
          ))}
        </section>
      ))}

      {children}
    </main>
  );
}
