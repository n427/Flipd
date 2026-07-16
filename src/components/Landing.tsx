'use client';

// Flipd — Marketing landing page (ported from screens/landing.jsx)
// Full marketing page, paper-dominant. Auth buttons enter the web app.
import React from 'react';
import { Icon } from './Icon';
import { Avatar, Button, ListingCard, USCBadge, Wordmark } from './ui';
import { MOCK_LISTINGS } from '@/lib/data';

type HeroVariant = 'editorial' | 'centered' | 'split-dark';

const scrollTo = (id: string) => {
  if (typeof document === 'undefined') return;
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

function LandingHero({ variant = 'editorial', onEnter }: { variant?: HeroVariant; onEnter: () => void }) {
  if (variant === 'editorial') {
    return (
      <section style={{ padding: '88px 64px 72px', background: '#fff', borderBottom: '1px solid var(--rule)' }}>
        <div style={{ maxWidth: 1180, margin: '0 auto', display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: 64, alignItems: 'center' }}>
          <div>
            <div className="t-eyebrow" style={{ color: 'var(--cardinal)', marginBottom: 20 }}>
              An edu-verified marketplace · USC <span style={{ color: 'var(--gold)' }}>✶</span>
            </div>
            <h1 style={{ fontFamily: 'var(--serif)', fontWeight: 700, fontSize: 64, lineHeight: 1.02, letterSpacing: '-0.02em', color: 'var(--ink)', margin: 0 }}>
              The person you&apos;re buying from is the same person who&nbsp;
              <em style={{ color: 'var(--cardinal)', fontStyle: 'italic' }}>shows up</em>.
            </h1>
            <p style={{ fontFamily: 'var(--sans)', fontSize: 17, lineHeight: 1.55, color: 'var(--ink-2)', maxWidth: 480, marginTop: 24, marginBottom: 32 }}>
              Flipd is a marketplace only for verified{' '}
              <span className="t-mono" style={{ background: 'var(--cream)', padding: '2px 6px', borderRadius: 3, fontSize: 13 }}>@usc.edu</span> students.
              Buy and sell on campus - services, food, popups, sublets, stuff - without the scams.
            </p>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <Button kind="primary" size="lg" onClick={onEnter}>Get the app</Button>
              <Button kind="ghost" size="lg" icon="arrowRight" onClick={() => scrollTo('how-it-works')}>How it works</Button>
            </div>
            <div style={{ marginTop: 36, display: 'flex', alignItems: 'center', gap: 18 }}>
              <div style={{ display: 'flex' }}>
                {['Maya M', 'Jada P', 'Aaron L', 'Sofia R'].map((n, i) => (
                  <div key={n} style={{ marginLeft: i === 0 ? 0 : -8 }}>
                    <Avatar name={n} size={28} tone={(['cream', 'cardinal', 'gold', 'ink'] as const)[i]} />
                  </div>
                ))}
              </div>
              <div className="t-meta" style={{ fontSize: 12 }}>
                <span style={{ color: 'var(--ink)', fontWeight: 700 }}>1,240</span> Trojans on the founding list
              </div>
            </div>
          </div>

          {/* Right: floating listing card preview */}
          <div style={{ position: 'relative', height: 540 }}>
            <div style={{ position: 'absolute', top: 0, right: 0, width: 290, transform: 'rotate(2deg)' }}>
              <ListingCard listing={MOCK_LISTINGS[0]} onClick={onEnter} />
            </div>
            <div style={{ position: 'absolute', top: 180, left: 0, width: 290, transform: 'rotate(-3deg)' }}>
              <ListingCard listing={MOCK_LISTINGS[2]} onClick={onEnter} />
            </div>
            <div style={{ position: 'absolute', bottom: 0, right: 30, width: 290, transform: 'rotate(1.5deg)' }}>
              <ListingCard listing={MOCK_LISTINGS[1]} onClick={onEnter} />
            </div>
          </div>
        </div>
      </section>
    );
  }
  return null;
}

function HowItWorks() {
  const steps = [
    { n: '01', title: 'Verify with your USC email', body: 'Magic-link sign-in. No passwords, no phone numbers. You’re tied to your @usc.edu the whole way through.' },
    { n: '02', title: 'Browse the campus feed', body: 'Five categories: services, food, popups, sublets, goods. Every listing comes from a real, signed-in USC student - no bots, no strangers.' },
    { n: '03', title: 'Tap Reveal Contact', body: 'The seller gets a push: your name, your school, your year. They have 72 hours to approve. If they do, you trade contact info and meet up.' },
  ];
  return (
    <section id="how-it-works" style={{ padding: '88px 64px', background: 'var(--cream)', scrollMarginTop: 80 }}>
      <div style={{ maxWidth: 1180, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 48 }}>
          <div>
            <div className="t-eyebrow" style={{ color: 'var(--cardinal)', marginBottom: 12 }}>HOW IT WORKS</div>
            <h2 style={{ fontFamily: 'var(--serif)', fontWeight: 700, fontSize: 42, lineHeight: 1.05, letterSpacing: '-0.02em', color: 'var(--ink)', margin: 0, maxWidth: 520 }}>
              Three steps, no DMs from strangers.
            </h2>
          </div>
          <div className="t-meta" style={{ fontSize: 12, color: 'var(--muted)' }}>The core mechanic</div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24 }}>
          {steps.map((step) => (
            <div key={step.n} style={{ background: '#fff', borderRadius: 6, border: '1px solid var(--rule)', padding: 28, display: 'flex', flexDirection: 'column', gap: 14, position: 'relative' }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 500, color: 'var(--cardinal)', letterSpacing: '0.15em' }}>{step.n} / 03</div>
              <h3 style={{ fontFamily: 'var(--serif)', fontWeight: 700, fontSize: 22, lineHeight: 1.15, letterSpacing: '-0.01em', color: 'var(--ink)', margin: '4px 0 4px' }}>{step.title}</h3>
              <p style={{ fontFamily: 'var(--sans)', fontSize: 14, lineHeight: 1.55, color: 'var(--ink-2)', margin: 0 }}>{step.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Categories() {
  const cats = [
    { icon: 'services', label: 'Services', sub: 'nails · hair · tutoring · photo' },
    { icon: 'food', label: 'Food', sub: 'bakers · meal prep · drinks' },
    { icon: 'event', label: 'Popups', sub: 'Trousdale events · fundraisers' },
    { icon: 'housing', label: 'Housing', sub: 'sublets · takeovers · roommates' },
    { icon: 'goods', label: 'Goods', sub: 'furniture · books · electronics' },
  ];
  return (
    <section id="categories" style={{ padding: '88px 64px', background: '#fff', scrollMarginTop: 80 }}>
      <div style={{ maxWidth: 1180, margin: '0 auto' }}>
        <div style={{ marginBottom: 40 }}>
          <div className="t-eyebrow" style={{ color: 'var(--cardinal)', marginBottom: 12 }}>WHAT&apos;S ON TASSEL</div>
          <h2 style={{ fontFamily: 'var(--serif)', fontWeight: 700, fontSize: 42, letterSpacing: '-0.02em', color: 'var(--ink)', margin: 0 }}>
            Five categories. <em style={{ color: 'var(--cardinal)' }}>One Trojan family.</em>
          </h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
          {cats.map((c, i) => (
            <div key={c.label} style={{ background: i === 0 ? 'var(--cardinal)' : 'var(--cream)', color: i === 0 ? '#fff' : 'var(--ink)', padding: '24px 18px 22px', borderRadius: 6, border: i === 0 ? 'none' : '1px solid var(--rule)', display: 'flex', flexDirection: 'column', gap: 12, minHeight: 160 }}>
              <Icon name={c.icon} size={28} stroke={1.5} color={i === 0 ? 'var(--gold)' : 'var(--cardinal)'} />
              <div style={{ marginTop: 'auto' }}>
                <h3 style={{ fontFamily: 'var(--serif)', fontWeight: 700, fontSize: 19, margin: '0 0 4px', letterSpacing: '-0.01em' }}>{c.label}</h3>
                <div className="t-meta" style={{ fontSize: 10.5, color: i === 0 ? 'rgba(255,255,255,0.7)' : 'var(--muted)' }}>{c.sub}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function ProofQuote() {
  return (
    <section style={{ padding: '64px 64px 88px', background: '#fff' }}>
      <div style={{ maxWidth: 980, margin: '0 auto' }}>
        <div style={{ background: 'var(--cardinal-dark)', color: '#fff', padding: '52px 60px', borderRadius: 6, position: 'relative' }}>
          <div style={{ position: 'absolute', top: 24, left: 24, width: 22, height: 4, background: 'var(--gold)' }} />
          <div className="t-eyebrow" style={{ color: 'var(--gold)', marginBottom: 20 }}>FROM A FOUNDING SELLER</div>
          <p style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: 30, lineHeight: 1.3, letterSpacing: '-0.01em', margin: '0 0 28px' }}>
            &quot;I sold sourdough on{' '}
            <span style={{ background: 'linear-gradient(180deg, transparent 65%, rgba(255,224,102,0.4) 65%)' }}>three different apps</span>{' '}
            before Flipd. This is the first one where every single buyer actually showed up.&quot;
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <Avatar name="Maya Mendoza" size={40} tone="gold" />
            <div>
              <div style={{ fontFamily: 'var(--sans)', fontWeight: 700, fontSize: 14 }}>Maya M. · Marshall &apos;26</div>
              <div className="t-meta" style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>47 sales · Marshall &apos;26</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function TrustBlock() {
  const stats = [
    { stat: '100%', label: 'verified @usc.edu accounts' },
    { stat: '72h', label: 'reveal request window' },
    { stat: '0', label: 'anonymous interactions' },
    { stat: '1', label: 'school in v1 - USC' },
  ];
  return (
    <section id="trust" style={{ padding: '88px 64px', background: 'var(--cream)', borderTop: '1px solid var(--rule)', scrollMarginTop: 80 }}>
      <div style={{ maxWidth: 1180, margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: 80, alignItems: 'center' }}>
        <div>
          <div className="t-eyebrow" style={{ color: 'var(--cardinal)', marginBottom: 12 }}>WHY IT WORKS</div>
          <h2 style={{ fontFamily: 'var(--serif)', fontWeight: 700, fontSize: 38, lineHeight: 1.1, letterSpacing: '-0.02em', color: 'var(--ink)', margin: '0 0 20px' }}>
            Verification isn&apos;t a feature.<br />
            <em style={{ color: 'var(--cardinal)' }}>It&apos;s the whole product.</em>
          </h2>
          <p style={{ fontFamily: 'var(--sans)', fontSize: 15, lineHeight: 1.6, color: 'var(--ink-2)', margin: 0 }}>
            When you reveal contact on Flipd, both sides know exactly who&apos;s on the other end - first name, school, year. Accountability is built in. Ghosting has consequences.
          </p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
          {stats.map((s) => (
            <div key={s.label} style={{ background: '#fff', padding: '24px 22px', borderRadius: 6, border: '1px solid var(--rule)' }}>
              <div style={{ fontFamily: 'var(--serif)', fontWeight: 700, fontSize: 42, color: 'var(--cardinal)', letterSpacing: '-0.02em', lineHeight: 1 }}>{s.stat}</div>
              <div className="t-meta" style={{ fontSize: 11, marginTop: 8, color: 'var(--muted)' }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function CTABlock() {
  const [email, setEmail] = React.useState('');
  const [sent, setSent] = React.useState(false);
  const [error, setError] = React.useState('');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const value = email.trim().toLowerCase();
    if (!value.endsWith('@usc.edu') || value.length <= '@usc.edu'.length) {
      setError('Please enter a valid @usc.edu email.');
      setSent(false);
      return;
    }
    setError('');
    setSent(true);
  };

  return (
    <section id="get-app" style={{ padding: '96px 64px', background: '#fff', textAlign: 'center', scrollMarginTop: 80 }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <div className="t-eyebrow" style={{ color: 'var(--cardinal)', marginBottom: 20 }}>
          <Icon name="sparkle" size={10} stroke={2.2} style={{ verticalAlign: 'middle', marginRight: 4 }} />
          JOIN THE FOUNDING CLASS
        </div>
        <h2 style={{ fontFamily: 'var(--serif)', fontWeight: 700, fontSize: 48, lineHeight: 1.05, letterSpacing: '-0.02em', color: 'var(--ink)', margin: '0 0 18px' }}>
          Got an @usc.edu email?<br />
          <em style={{ color: 'var(--cardinal)' }}>You&apos;re already in.</em>
        </h2>
        <p style={{ fontSize: 16, lineHeight: 1.55, color: 'var(--ink-2)', margin: '0 0 32px' }}>
          We&apos;re rolling out in waves through finals. Drop your USC address and we&apos;ll send your invite when your school unit comes up.
        </p>
        {sent ? (
          <div className="callout" style={{ maxWidth: 480, margin: '0 auto', textAlign: 'left' }}>
            <div className="t-eyebrow" style={{ color: 'var(--cardinal)', marginBottom: 6 }}>YOU&apos;RE ON THE LIST</div>
            <div className="t-body" style={{ fontSize: 13.5 }}>
              Thanks — we&apos;ll email <strong>{email.trim().toLowerCase()}</strong> a sign-in link as soon as your wave opens.
            </div>
          </div>
        ) : (
          <form onSubmit={submit} style={{ display: 'flex', gap: 8, maxWidth: 480, margin: '0 auto' }}>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="firstname@usc.edu"
              aria-label="USC email address"
              className="field"
              style={{ flex: 1, borderRadius: 'var(--r-pill)', padding: '14px 22px' }}
            />
            <Button kind="primary" size="lg" type="submit">Send my invite</Button>
          </form>
        )}
        <div className="t-meta" style={{ fontSize: 11, marginTop: 14, color: error ? 'var(--cardinal)' : 'var(--muted)' }}>
          {error || 'Verified by domain. No passwords, no phone numbers required.'}
        </div>
      </div>
    </section>
  );
}

function LandingFooter() {
  return (
    <footer style={{ padding: '40px 64px', background: 'var(--ink)', color: 'rgba(255,255,255,0.7)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontFamily: 'var(--sans)', fontSize: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
        <Wordmark size={20} onDark />
        <span style={{ color: 'rgba(255,255,255,0.4)' }}>© 2026 · made in University Park</span>
      </div>
      <div style={{ display: 'flex', gap: 24 }}>
        <a style={{ color: 'inherit', textDecoration: 'none' }} href="#" onClick={(e) => e.preventDefault()}>Terms</a>
        <a style={{ color: 'inherit', textDecoration: 'none' }} href="#" onClick={(e) => e.preventDefault()}>Privacy</a>
        <a style={{ color: 'inherit', textDecoration: 'none' }} href="#" onClick={(e) => e.preventDefault()}>Contact</a>
        <a style={{ color: 'var(--gold)', textDecoration: 'none' }} href="#" onClick={(e) => e.preventDefault()}>Apply to expand to your school →</a>
      </div>
    </footer>
  );
}

function LandingNav({ onEnter }: { onEnter: () => void }) {
  const links: { label: string; target: string }[] = [
    { label: 'How it works', target: 'how-it-works' },
    { label: 'Categories', target: 'categories' },
    { label: 'Trust', target: 'trust' },
    { label: 'For sellers', target: 'get-app' },
  ];
  return (
    <header style={{ padding: '20px 64px', background: '#fff', borderBottom: '1px solid var(--rule)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, zIndex: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <USCBadge size={26} />
        <Wordmark size={22} />
      </div>
      <nav style={{ display: 'flex', gap: 32, alignItems: 'center' }}>
        {links.map((item) => (
          <a
            key={item.label}
            href={`#${item.target}`}
            onClick={(e) => { e.preventDefault(); scrollTo(item.target); }}
            style={{ fontFamily: 'var(--sans)', fontSize: 13.5, fontWeight: 500, color: 'var(--ink-2)', textDecoration: 'none' }}
          >
            {item.label}
          </a>
        ))}
        <Button kind="secondary" size="sm" onClick={onEnter}>Sign in</Button>
        <Button kind="primary" size="sm" onClick={onEnter}>Get the app</Button>
      </nav>
    </header>
  );
}

export function Landing({ heroVariant = 'editorial', onEnter }: { heroVariant?: HeroVariant; onEnter: () => void }) {
  return (
    <div style={{ background: '#fff', minHeight: '100%', fontFamily: 'var(--sans)' }}>
      <LandingNav onEnter={onEnter} />
      <LandingHero variant={heroVariant} onEnter={onEnter} />
      <HowItWorks />
      <Categories />
      <ProofQuote />
      <TrustBlock />
      <CTABlock />
      <LandingFooter />
    </div>
  );
}
