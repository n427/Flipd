export default function SupportPage() {
  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '72px 24px', fontFamily: 'var(--sans)' }}>
      <a href="/" style={{ fontSize: 13, color: 'var(--muted)', textDecoration: 'none' }}>&larr; Back</a>
      <h1 style={{ fontWeight: 800, fontSize: 28, letterSpacing: '-0.03em', color: 'var(--ink)', margin: '20px 0 12px' }}>Support</h1>
      <p style={{ fontSize: 14.5, lineHeight: 1.6, color: 'var(--ink-2)', margin: '0 0 16px' }}>
        Need a hand or want to report a problem? Email us and we&rsquo;ll get back to you.
      </p>
      <a href="mailto:support@flipd.app" className="btn btn-primary" style={{ padding: '12px 22px', textDecoration: 'none' }}>
        Email support
      </a>
    </div>
  );
}
