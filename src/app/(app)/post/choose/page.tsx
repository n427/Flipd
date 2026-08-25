import Link from 'next/link';

const choices = [
  {
    href: '/post',
    eyebrow: 'Sell something',
    title: 'Post an item for sale',
    description: 'Share what you have and let nearby buyers request a conversation.',
  },
  {
    href: '/wanted/post',
    eyebrow: 'Request something',
    title: 'Post what you need',
    description: 'Set your budget and deadline so nearby sellers can send private offers.',
  },
] as const;

export default function PostChooserPage() {
  return (
    <main style={{ width: 'min(880px, calc(100% - 40px))', margin: '0 auto', padding: '64px 0 88px' }}>
      <p style={{ margin: '0 0 8px', color: 'var(--accent)', fontSize: 12, fontWeight: 800, letterSpacing: '0.09em', textTransform: 'uppercase' }}>
        Create a post
      </p>
      <h1 style={{ margin: 0, color: 'var(--ink)', fontSize: 34, lineHeight: 1.1, letterSpacing: '-0.035em' }}>
        What would you like to do?
      </h1>
      <p style={{ margin: '12px 0 30px', color: 'var(--ink-2)', fontSize: 15, lineHeight: 1.6 }}>
        Sell something you have, or tell the Flipd community what you are looking for.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
        {choices.map((choice) => (
          <Link
            key={choice.href}
            href={choice.href}
            aria-label={`${choice.eyebrow}: ${choice.title}`}
            style={{ display: 'block', minHeight: 210, padding: 26, border: '1px solid var(--rule)', borderRadius: 16, background: '#fff', color: 'inherit', textDecoration: 'none', boxShadow: 'var(--shadow)' }}
          >
            <span style={{ display: 'inline-block', marginBottom: 26, borderRadius: 999, background: choice.href === '/post' ? 'var(--surface)' : '#fff1ee', color: choice.href === '/post' ? 'var(--ink)' : 'var(--accent)', padding: '7px 11px', fontSize: 12, fontWeight: 800 }}>
              {choice.eyebrow}
            </span>
            <h2 style={{ margin: '0 0 9px', color: 'var(--ink)', fontSize: 21, letterSpacing: '-0.02em' }}>{choice.title}</h2>
            <p style={{ margin: 0, color: 'var(--ink-2)', fontSize: 14, lineHeight: 1.55 }}>{choice.description}</p>
          </Link>
        ))}
      </div>
    </main>
  );
}
