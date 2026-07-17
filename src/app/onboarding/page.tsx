'use client';

import React from 'react';
import { useRouter } from 'next/navigation';

const YEARS = ['Freshman', 'Sophomore', 'Junior', 'Senior', 'Grad'];
const UNITS = ['Marshall', 'Annenberg', 'Viterbi', 'Dornsife', 'SCA', 'Roski', 'Thornton', 'Price', 'Other'];
const METHODS = [
  { id: 'instagram', label: 'Instagram', valueLabel: 'Instagram handle', placeholder: '@you.sc' },
  { id: 'phone', label: 'Text', valueLabel: 'Phone number', placeholder: '(213) 555-0100' },
  { id: 'email', label: 'Email', valueLabel: 'Email', placeholder: 'you@usc.edu' },
] as const;
type MethodId = (typeof METHODS)[number]['id'];

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = React.useState<1 | 2>(1);
  const [name, setName] = React.useState('');
  const [year, setYear] = React.useState('');
  const [unit, setUnit] = React.useState('');
  const [photo, setPhoto] = React.useState<{ file: File; url: string } | null>(null);
  const [method, setMethod] = React.useState<MethodId | null>(null);
  const [value, setValue] = React.useState('');
  const [verifiedEmail, setVerifiedEmail] = React.useState('');
  const [error, setError] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);

  // Returning users who already finished onboarding go straight to the feed.
  React.useEffect(() => {
    fetch('/api/me')
      .then((r) => (r.ok ? r.json() : { profile: null }))
      .then(({ profile }) => {
        if (profile?.display_name && profile?.contact_method) {
          router.replace('/feed');
          return;
        }
        if (profile?.contact_email) setVerifiedEmail(profile.contact_email);
        if (profile?.display_name) setName(profile.display_name);
      })
      .catch(() => {});
  }, [router]);

  const pickMethod = (id: MethodId) => {
    setMethod(id);
    setError('');
    setValue(id === 'email' ? verifiedEmail : '');
  };

  const finish = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!method || !value.trim()) { setError('Add a way for buyers to reach you.'); return; }
    setSaving(true);
    setError('');
    try {
      if (photo) {
        const fd = new FormData();
        fd.append('photo', photo.file, photo.file.name);
        const up = await fetch('/api/me/avatar', { method: 'POST', body: fd });
        if (!up.ok) throw new Error('Photo upload failed — try a smaller image.');
      }
      const res = await fetch('/api/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          display_name: name,
          class_year: year,
          school_unit: unit,
          contact_method: method,
          [`contact_${method}`]: value.trim(),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Could not save — try again.');
      }
      router.push('/feed');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save — try again.');
      setSaving(false);
    }
  };

  const next = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setError('Your name is required.'); return; }
    if (!year) { setError('Pick your class year.'); return; }
    setError('');
    setStep(2);
  };

  return (
    <div style={{ maxWidth: 440, margin: '0 auto', padding: '72px 24px' }}>
      <div style={{ fontWeight: 800, fontSize: 22, letterSpacing: '-0.04em', color: 'var(--ink)' }}>
        flipd<span style={{ color: 'var(--accent)' }}>.</span>
      </div>

      {step === 1 ? (
        <>
          <h1 style={{ fontWeight: 800, fontSize: 28, letterSpacing: '-0.03em', color: 'var(--ink)', margin: '28px 0 6px' }}>
            Who are you?
          </h1>
          <p style={{ fontSize: 14, color: 'var(--muted)', margin: '0 0 28px' }}>
            This is what other Trojans see when you buy or sell.
          </p>
          <form onSubmit={next} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) setPhoto({ file: f, url: URL.createObjectURL(f) });
                e.target.value = '';
              }} />
              <button type="button" onClick={() => fileRef.current?.click()} aria-label="Add profile photo" style={{ width: 64, height: 64, borderRadius: '50%', border: photo ? 0 : '1.5px dashed var(--rule-strong)', background: 'var(--surface)', overflow: 'hidden', cursor: 'pointer', padding: 0, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {photo ? (
                  <img src={photo.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <span style={{ fontSize: 22, color: 'var(--muted)', fontWeight: 300 }}>+</span>
                )}
              </button>
              <div style={{ fontSize: 13, color: 'var(--muted)' }}>Photo (optional)</div>
            </div>
            <input className="field" placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} />
            <select className="field" value={year} onChange={(e) => setYear(e.target.value)}>
              <option value="">Class year</option>
              {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
            <select className="field" value={unit} onChange={(e) => setUnit(e.target.value)}>
              <option value="">School / major (optional)</option>
              {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
            {error && <div style={{ fontSize: 13, color: 'var(--accent)' }}>{error}</div>}
            <button type="submit" className="btn btn-primary" style={{ padding: '13px 22px' }}>Continue</button>
          </form>
        </>
      ) : (
        <>
          <h1 style={{ fontWeight: 800, fontSize: 28, letterSpacing: '-0.03em', color: 'var(--ink)', margin: '28px 0 6px' }}>
            How do buyers reach you?
          </h1>
          <p style={{ fontSize: 14, color: 'var(--muted)', margin: '0 0 28px' }}>
            Shared only after you approve a request. You set this once.
          </p>
          <form onSubmit={finish} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              {METHODS.map((m) => (
                <button key={m.id} type="button" onClick={() => pickMethod(m.id)} style={{ background: method === m.id ? 'var(--ink)' : '#fff', color: method === m.id ? '#fff' : 'var(--ink-2)', border: '1px solid ' + (method === m.id ? 'var(--ink)' : 'var(--rule)'), borderRadius: 999, padding: '9px 18px', fontWeight: 600, fontSize: 13.5, cursor: 'pointer' }}>
                  {m.label}
                </button>
              ))}
            </div>
            {method && (
              <div>
                <label className="field-label">{METHODS.find((m) => m.id === method)!.valueLabel}</label>
                <input
                  className="field"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder={METHODS.find((m) => m.id === method)!.placeholder}
                  inputMode={method === 'phone' ? 'tel' : undefined}
                />
              </div>
            )}
            {error && <div style={{ fontSize: 13, color: 'var(--accent)' }}>{error}</div>}
            <div style={{ display: 'flex', gap: 10 }}>
              <button type="button" className="btn btn-ghost" onClick={() => { setStep(1); setError(''); }}>Back</button>
              <button type="submit" className="btn btn-primary" disabled={saving} style={{ flex: 1, padding: '13px 22px' }}>
                {saving ? 'Saving…' : 'Enter Flipd'}
              </button>
            </div>
          </form>
        </>
      )}
    </div>
  );
}
