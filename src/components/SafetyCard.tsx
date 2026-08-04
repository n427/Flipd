'use client';

import { Icon } from './Icon';

export type SafetyReview = {
  verdict: 'looks_good' | 'mixed' | 'thin';
  summary: string;
  signals: string[];
};

// Verdict styling. Deliberately restrained: 'thin' means we don't know much,
// not that the person is dangerous, so it reads as neutral rather than a
// warning. Only the icon and label differ; no red alarm state.
// Mirrors META in mobile/src/components/SafetyCard.tsx.
const META: Record<SafetyReview['verdict'], { label: string; icon: string; color: string }> = {
  looks_good: { label: 'Established profile', icon: 'shield', color: '#1E6B33' },
  mixed: { label: 'Some gaps', icon: 'info', color: '#8A6D1A' },
  thin: { label: 'New account', icon: 'info', color: 'var(--muted)' },
};

/**
 * AI review of the counterparty, shown before someone commits to a request.
 *
 * Renders nothing when `review` is null — the review is advisory, so a failed
 * fetch quietly disappears rather than blocking or alarming.
 */
export function SafetyCard({ review, loading }: { review: SafetyReview | null; loading?: boolean }) {
  if (loading) {
    return (
      <div style={card}>
        <span style={{ fontSize: 13.5, color: 'var(--muted)' }}>Checking their profile…</span>
      </div>
    );
  }
  if (!review) return null;

  const meta = META[review.verdict] ?? META.thin;
  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
        <Icon name={meta.icon} size={15} color={meta.color} />
        <span style={{ fontWeight: 700, fontSize: 12.5, color: meta.color }}>{meta.label}</span>
        <span style={{ flex: 1 }} />
        <span style={{ fontWeight: 600, fontSize: 10, color: 'var(--muted)', letterSpacing: '0.06em' }}>
          AI REVIEW
        </span>
      </div>

      <p style={{ fontSize: 13.5, color: 'var(--ink)', lineHeight: 1.45, margin: 0 }}>{review.summary}</p>

      {review.signals?.length ? (
        <ul style={{ margin: '10px 0 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 5 }}>
          {review.signals.map((s) => (
            <li key={s} style={{ display: 'flex', gap: 7, fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.4 }}>
              <span aria-hidden="true">•</span>
              <span>{s}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

const card: React.CSSProperties = {
  border: '1px solid var(--rule)',
  borderRadius: 12,
  padding: '12px 14px',
  background: 'var(--surface)',
  marginBottom: 16,
};
