'use client';

// Flipd — marketing page. P1 "pure Apple": frosted sticky nav, centered hero,
// app visual rising into view, scroll-revealed sections, real magic-link CTA.
import React from 'react';
import { Icon } from './Icon';
import { Wordmark } from './ui';

// Scroll-reveal wrapper: fades content up the first time it enters the viewport.
function Reveal({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [shown, setShown] = React.useState(false);
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setShown(true); obs.disconnect(); } },
      { threshold: 0.15 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return (
    <div
      ref={ref}
      style={{
        opacity: shown ? 1 : 0,
        transform: shown ? 'translateY(0)' : 'translateY(24px)',
        transition: `opacity 700ms cubic-bezier(.2,.7,.3,1) ${delay}ms, transform 700ms cubic-bezier(.2,.7,.3,1) ${delay}ms`,
      }}
    >
      {children}
    </div>
  );
}

const scrollTo = (id: string) =>
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

function Nav() {
  return (
    <header
      style={{
        position: 'sticky', top: 0, zIndex: 20,
        display: 'flex', alignItems: 'center', gap: 28,
        padding: '14px 32px', background: 'rgba(255,255,255,0.8)',
        backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
        borderBottom: '1px solid var(--rule)',
      }}
    >
      <Wordmark size={18} />
      <div style={{ flex: 1 }} />
      {[
        { label: 'How it works', id: 'how' },
        { label: 'Buyers & sellers', id: 'both-sides' },
        { label: 'Categories', id: 'categories' },
        { label: 'Trust', id: 'trust' },
      ].map((l) => (
        <a
          key={l.id}
          href={`#${l.id}`}
          onClick={(e) => { e.preventDefault(); scrollTo(l.id); }}
          style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink-2)', textDecoration: 'none' }}
        >
          {l.label}
        </a>
      ))}
      <button className="btn" onClick={() => scrollTo('join')}
        style={{ background: 'var(--ink)', color: '#fff', padding: '8px 18px', fontSize: 12.5 }}>
        Sign in
      </button>
    </header>
  );
}

// Mini feed mockup used as the hero visual.
function HeroAppVisual() {
  const tiles = [
    { price: '$12', title: 'Sourdough loaves', img: 'https://picsum.photos/seed/flipd-bread/400/400' },
    { price: '$35', title: 'Press-on nails', img: 'https://picsum.photos/seed/flipd-nails/400/400' },
    { price: '$90', title: 'IKEA Markus chair', img: 'https://picsum.photos/seed/flipd-chair/400/400' },
    { price: '$7', title: 'Matcha drinks', img: 'https://picsum.photos/seed/flipd-matcha/400/400' },
  ];
  const floatCard = (t: typeof tiles[number], dur: string) => (
    <div className="card" style={{ width: 168, animation: `drift ${dur} ease-in-out infinite`, boxShadow: 'var(--shadow-strong)' }}>
      <img src={t.img} alt="" style={{ width: '100%', height: 96, objectFit: 'cover', display: 'block' }} />
      <div style={{ padding: '8px 12px 12px' }}>
        <div style={{ fontWeight: 800, fontSize: 14 }}>{t.price}</div>
        <div style={{ fontSize: 12, color: 'var(--ink-2)' }}>{t.title}</div>
      </div>
    </div>
  );
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 28, padding: '56px 24px 0', animation: 'riseIn 1s cubic-bezier(.2,.7,.3,1) both 500ms' }}>
      <div style={{ display: 'none' }} className="hide-sm" />
      {floatCard(tiles[2], '5.4s')}
      <div className="card" style={{ width: 300, boxShadow: 'var(--shadow-strong)' }}>
        <div style={{ padding: '14px 16px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Wordmark size={17} />
          <Icon name="search" size={15} color="var(--ink)" />
        </div>
        <div style={{ display: 'flex', gap: 6, padding: '0 16px 12px' }}>
          {['All', 'Food', 'Services'].map((c, i) => (
            <span key={c} style={{ fontSize: 11, fontWeight: 600, padding: '5px 12px', borderRadius: 999, background: i === 0 ? 'var(--ink)' : 'var(--surface)', color: i === 0 ? '#fff' : 'var(--ink-2)' }}>{c}</span>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, padding: '0 16px 18px' }}>
          {tiles.slice(0, 2).map((t) => (
            <div key={t.title}>
              <img src={t.img} alt="" style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 10, display: 'block' }} />
              <div style={{ fontWeight: 800, fontSize: 13, marginTop: 6 }}>{t.price}</div>
              <div style={{ fontSize: 11.5, color: 'var(--ink-2)' }}>{t.title}</div>
            </div>
          ))}
        </div>
      </div>
      {floatCard(tiles[3], '6.1s')}
    </div>
  );
}

function Hero() {
  return (
    <section style={{ textAlign: 'center', padding: '84px 24px 96px', overflow: 'hidden' }}>
      <div style={{ animation: 'fadeUp .8s cubic-bezier(.2,.7,.3,1) both 100ms', fontSize: 14, fontWeight: 600, color: 'var(--accent)' }}>
        The USC Marketplace
      </div>
      <h1 style={{ animation: 'fadeUp .8s cubic-bezier(.2,.7,.3,1) both 250ms', fontSize: 'clamp(40px, 7vw, 68px)', fontWeight: 800, letterSpacing: '-0.045em', lineHeight: 1.02, color: 'var(--ink)', margin: '14px 0 0' }}>
        Buy from trusted<br />students
      </h1>
      <p style={{ animation: 'fadeUp .8s cubic-bezier(.2,.7,.3,1) both 400ms', fontSize: 17, color: 'var(--muted)', fontWeight: 500, margin: '20px auto 0', maxWidth: 480 }}>
        Every buyer and seller verified with @usc.edu. No scams or strangers, only fellow Trojans.
      </p>
      <div style={{ animation: 'fadeUp .8s cubic-bezier(.2,.7,.3,1) both 550ms', marginTop: 28, display: 'flex', gap: 14, justifyContent: 'center', alignItems: 'center' }}>
        <button className="btn btn-primary" style={{ padding: '13px 28px', fontSize: 14 }} onClick={() => scrollTo('join')}>
          Get started
        </button>
        <a href="#how" onClick={(e) => { e.preventDefault(); scrollTo('how'); }}
          style={{ fontSize: 14, fontWeight: 600, color: 'var(--accent)', textDecoration: 'none' }}>
          How it works ›
        </a>
      </div>
      <HeroAppVisual />
    </section>
  );
}

function HowItWorks() {
  const steps = [
    { n: '1', title: 'Verify with your USC email', body: '6 digit code emailed straight to your @usc.edu. No password needed!' },
    { n: '2', title: 'Browse the campus feed', body: 'Services, popups, sublets, and goods: every listing from a real USC student.' },
    { n: '3', title: 'Request Contact', body: 'The seller reviews your profile & reviews and has 72 hours to approve. Then you connect and meet up.' },
  ];
  return (
    <section id="how" style={{ padding: '96px 24px', background: 'var(--surface)', scrollMarginTop: 60 }}>
      <div style={{ maxWidth: 980, margin: '0 auto' }}>
        <Reveal>
          <h2 style={{ fontSize: 34, fontWeight: 800, letterSpacing: '-0.035em', textAlign: 'center', margin: '0 0 48px' }}>
            Three simple steps
          </h2>
        </Reveal>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
          {steps.map((s, i) => (
            <Reveal key={s.n} delay={i * 120}>
              <div style={{ background: '#fff', borderRadius: 16, padding: 28, height: '100%' }}>
                <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--ink)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14 }}>{s.n}</div>
                <h3 style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em', margin: '16px 0 8px' }}>{s.title}</h3>
                <p style={{ fontSize: 14, lineHeight: 1.55, color: 'var(--ink-2)', margin: 0 }}>{s.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

// Two-column breakdown of a single request, from each side. HowItWorks covers
// the happy path in three steps; this answers the question that follows — what
// actually happens when I tap request, and what does the other person see?
function BothSides() {
  const sides = [
    {
      role: 'Buyers',
      lead: 'You ask. Nothing is shared until they say yes.',
      points: [
        { t: 'Read the AI review first', b: 'Before you send, the safety layer summarises the seller: profile completeness, rating history, and anything worth a second look.' },
        { t: 'Send one message', b: 'Optional, and capped at one. Say what you want and when you can meet. No inbox to ignore, no back-and-forth before anyone has agreed.' },
        { t: 'Wait for approval', b: 'Your contact details stay private until the seller approves. If they decline or the 72 hours lapse, they never see them.' },
      ],
    },
    {
      role: 'Sellers',
      lead: 'You decide who reaches you, with context.',
      points: [
        { t: 'See who is asking', b: 'Their name, school, and year arrive with the request, alongside the same AI evaluation scored on profile completeness and past reviews.' },
        { t: 'Read their message', b: 'One message, if they wrote one. Enough to judge whether it is worth your time before you commit to a conversation.' },
        { t: 'Approve within 72 hours', b: 'Approve and the chat opens for both of you. Decline, or let it expire, and nothing is exchanged.' },
      ],
    },
  ];
  return (
    <section id="both-sides" style={{ padding: '96px 24px', scrollMarginTop: 60 }}>
      <div style={{ maxWidth: 980, margin: '0 auto' }}>
        <Reveal>
          <h2 style={{ fontSize: 34, fontWeight: 800, letterSpacing: '-0.035em', textAlign: 'center', margin: '0 0 12px' }}>
            One request, both sides
          </h2>
          <p style={{ fontSize: 15, color: 'var(--muted)', textAlign: 'center', maxWidth: 560, margin: '0 auto 48px', lineHeight: 1.6 }}>
            Every connection on Flipd starts the same way, and both people get the
            same amount of information before anyone commits.
          </p>
        </Reveal>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
          {sides.map((s, i) => (
            <Reveal key={s.role} delay={i * 120}>
              <div style={{ border: '1px solid var(--rule)', borderRadius: 16, padding: 28, height: '100%', background: 'var(--surface)' }}>
                <div className="t-eyebrow" style={{ fontSize: 12, letterSpacing: '0.16em', color: 'var(--accent)' }}>
                  {s.role.toUpperCase()}
                </div>
                <h3 style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em', margin: '10px 0 22px', lineHeight: 1.3 }}>
                  {s.lead}
                </h3>
                <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 18 }}>
                  {s.points.map((p, n) => (
                    <li key={p.t} style={{ display: 'flex', gap: 12 }}>
                      <div
                        aria-hidden
                        style={{
                          flexShrink: 0, width: 22, height: 22, borderRadius: '50%',
                          border: '1px solid var(--rule-strong)', color: 'var(--ink-2)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 11, fontWeight: 700, marginTop: 1,
                        }}
                      >
                        {n + 1}
                      </div>
                      <div>
                        <div style={{ fontSize: 14.5, fontWeight: 700, letterSpacing: '-0.01em', marginBottom: 3 }}>{p.t}</div>
                        <div style={{ fontSize: 13.5, lineHeight: 1.55, color: 'var(--ink-2)' }}>{p.b}</div>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function Categories() {
  const cats = [
    { icon: 'services', label: 'Services', sub: 'nails · hair · tutoring · photo' },
    { icon: 'event', label: 'Popups', sub: 'events · fundraisers' },
    { icon: 'goods', label: 'Goods', sub: 'furniture · books · tech' },
    { icon: 'housing', label: 'Housing', sub: 'sublets · roommates' },
  ];
  return (
    <section id="categories" style={{ padding: '96px 24px', scrollMarginTop: 60 }}>
      <div style={{ maxWidth: 980, margin: '0 auto' }}>
        <Reveal>
          <h2 style={{ fontSize: 34, fontWeight: 800, letterSpacing: '-0.035em', textAlign: 'center', margin: '0 0 48px' }}>
            Whatever campus is selling.
          </h2>
        </Reveal>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
          {cats.map((c, i) => (
            <Reveal key={c.label} delay={i * 80}>
              <div style={{ border: '1px solid var(--rule)', borderRadius: 16, padding: '24px 18px', minHeight: 140, display: 'flex', flexDirection: 'column' }}>
                <Icon name={c.icon} size={24} stroke={1.6} color="var(--ink)" />
                <div style={{ marginTop: 'auto' }}>
                  <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 3px', letterSpacing: '-0.01em' }}>{c.label}</h3>
                  <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>{c.sub}</div>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function Trust() {
  const stats = [
    { stat: '100%', label: 'verified @usc.edu accounts' },
    { stat: '0', label: 'anonymous interactions' },
    { stat: '72h', label: 'seller approval window' },
  ];
  return (
    <section id="trust" style={{ padding: '96px 24px', background: 'var(--ink)', color: '#fff', scrollMarginTop: 60 }}>
      <div style={{ maxWidth: 900, margin: '0 auto', textAlign: 'center' }}>
        <Reveal>
          <h2 style={{ fontSize: 34, fontWeight: 800, letterSpacing: '-0.035em', margin: '0 0 16px' }}>
            Trust &amp; safety is our<br />whole product
          </h2>
          <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.65)', maxWidth: 520, margin: '0 auto 48px', lineHeight: 1.6 }}>
            When you receive or make a request on Flipd, the AI safety layer scans the other person&apos;s profile and advises you before you proceed.
          </p>
        </Reveal>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
          {stats.map((s, i) => (
            <Reveal key={s.label} delay={i * 100}>
              <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 16, padding: '28px 20px' }}>
                <div style={{ fontSize: 40, fontWeight: 800, letterSpacing: '-0.03em' }}>{s.stat}</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 6 }}>{s.label}</div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function JoinCTA() {
  const [email, setEmail] = React.useState('');
  const [code, setCode] = React.useState('');
  const [state, setState] = React.useState<'idle' | 'sending' | 'sent' | 'verifying'>('idle');
  const [error, setError] = React.useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setState('sending');
    setError('');
    const res = await fetch('/api/auth/signin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    }).catch(() => null);
    if (res?.ok) { setState('sent'); setCode(''); return; }
    const body = await res?.json().catch(() => ({}));
    setError(body?.error || 'Something went wrong — try again.');
    setState('idle');
  };

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    setState('verifying');
    setError('');
    const res = await fetch('/api/auth/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, code }),
    }).catch(() => null);
    if (res?.ok) {
      const body = await res.json().catch(() => ({ onboarded: false }));
      window.location.href = body.onboarded ? '/feed' : '/onboarding';
      return;
    }
    const body = await res?.json().catch(() => ({}));
    setError(body?.error || 'Something went wrong — try again.');
    setState('sent');
  };

  return (
    <section id="join" style={{ padding: '110px 24px', textAlign: 'center', scrollMarginTop: 60 }}>
      <Reveal>
        <h2 style={{ fontSize: 'clamp(30px, 5vw, 44px)', fontWeight: 800, letterSpacing: '-0.04em', margin: '0 0 12px' }}>
          Got an @usc.edu email?<br />You're already in.
        </h2>
        <p style={{ fontSize: 15, color: 'var(--muted)', fontWeight: 500, margin: '0 0 30px' }}>
          Enter it below and we'll email you a 6-digit sign-in code. That's the whole sign-up.
        </p>
        {state === 'sent' || state === 'verifying' ? (
          <div style={{ maxWidth: 420, margin: '0 auto', background: 'var(--surface)', borderRadius: 14, padding: '22px 26px', textAlign: 'left' }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>Check your email</div>
            <div style={{ fontSize: 13.5, color: 'var(--ink-2)', marginBottom: 16 }}>
              We sent a 6-digit code to <strong>{email.trim().toLowerCase()}</strong>. Enter it below to sign in.
            </div>
            <form onSubmit={verify} style={{ display: 'flex', gap: 8 }}>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 8))}
                placeholder="123456"
                inputMode="numeric"
                autoComplete="one-time-code"
                aria-label="6-digit sign-in code"
                className="field"
                style={{ flex: 1, borderRadius: 10, background: '#fff', letterSpacing: '0.2em', fontWeight: 700, fontSize: 16 }}
              />
              <button type="submit" className="btn btn-primary" disabled={state === 'verifying' || code.length < 6} style={{ padding: '13px 22px' }}>
                {state === 'verifying' ? 'Verifying…' : 'Sign in'}
              </button>
            </form>
            <button
              onClick={() => { setState('idle'); setError(''); }}
              style={{ background: 'none', border: 0, padding: 0, marginTop: 12, fontSize: 12, color: 'var(--muted)', cursor: 'pointer', textDecoration: 'underline' }}
            >
              Use a different email or resend
            </button>
          </div>
        ) : (
          <form onSubmit={submit} style={{ display: 'flex', gap: 8, maxWidth: 440, margin: '0 auto' }}>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@usc.edu"
              aria-label="USC email address"
              className="field"
              style={{ flex: 1, borderRadius: 10, padding: '13px 22px' }}
            />
            <button type="submit" className="btn btn-primary" disabled={state === 'sending'} style={{ padding: '13px 24px' }}>
              {state === 'sending' ? 'Sending…' : 'Send my link'}
            </button>
          </form>
        )}
        <div style={{ fontSize: 12, marginTop: 14, color: error ? 'var(--accent)' : 'var(--muted)' }}>
          {error || 'USC-only. No passwords, no phone numbers.'}
        </div>
        {state === 'idle' && (
          <button
            onClick={() => { if (email.trim()) { setState('sent'); setError(''); } else { setError('Enter your @usc.edu email first, then use your code.'); } }}
            style={{ background: 'none', border: 0, padding: 0, marginTop: 10, fontSize: 12, color: 'var(--muted)', cursor: 'pointer', textDecoration: 'underline' }}
          >
            Already have a code?
          </button>
        )}
      </Reveal>
    </section>
  );
}

function Footer() {
  return (
    <footer style={{ padding: '28px 32px', borderTop: '1px solid var(--rule)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, fontSize: 12, color: 'var(--muted)' }}>
      <Wordmark size={15} />
      <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
        <a href="/terms" style={{ color: 'var(--muted)', textDecoration: 'none' }}>Terms</a>
        <a href="/privacy" style={{ color: 'var(--muted)', textDecoration: 'none' }}>Privacy</a>
        <a href="/support" style={{ color: 'var(--muted)', textDecoration: 'none' }}>Support</a>
        <span>© 2026 · made in University Park</span>
      </div>
    </footer>
  );
}

export function Landing() {
  return (
    <div style={{ background: '#fff', minHeight: '100%' }}>
      <Nav />
      <Hero />
      <HowItWorks />
      <BothSides />
      <Categories />
      <Trust />
      <JoinCTA />
      <Footer />
    </div>
  );
}
