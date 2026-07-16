'use client';

import React from 'react';
import { useRouter } from 'next/navigation';

const UNITS = ['Marshall', 'Annenberg', 'Viterbi', 'Dornsife', 'SCA', 'Roski', 'Thornton', 'Price', 'Other'];

export default function OnboardingPage() {
  const router = useRouter();
  const [name, setName] = React.useState('');
  const [handle, setHandle] = React.useState('');
  const [unit, setUnit] = React.useState('');
  const [year, setYear] = React.useState('');
  const [instagram, setInstagram] = React.useState('');
  const [phone, setPhone] = React.useState('');
  const [error, setError] = React.useState('');
  const [saving, setSaving] = React.useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setError('Your name is required.'); return; }
    setSaving(true);
    setError('');
    const res = await fetch('/api/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        display_name: name, handle, school_unit: unit, class_year: year,
        contact_instagram: instagram, contact_phone: phone,
      }),
    });
    if (res.ok) { router.push('/feed'); return; }
    const body = await res.json().catch(() => ({}));
    setError(body.error || 'Could not save — try again.');
    setSaving(false);
  };

  return (
    <div style={{ maxWidth: 440, margin: '0 auto', padding: '72px 24px' }}>
      <div style={{ fontWeight: 800, fontSize: 22, letterSpacing: '-0.04em', color: 'var(--ink)' }}>
        flipd<span style={{ color: 'var(--cardinal)' }}>.</span>
      </div>
      <h1 style={{ fontWeight: 800, fontSize: 28, letterSpacing: '-0.03em', color: 'var(--ink)', margin: '28px 0 6px' }}>
        Set up your profile
      </h1>
      <p style={{ fontSize: 14, color: 'var(--muted)', margin: '0 0 28px' }}>
        This is what buyers and sellers see when you connect.
      </p>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <input className="field" placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} />
        <input className="field" placeholder="Handle (optional, e.g. alex.sc)" value={handle} onChange={(e) => setHandle(e.target.value)} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <select className="field" value={unit} onChange={(e) => setUnit(e.target.value)}>
            <option value="">School</option>
            {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
          <input className="field" placeholder="Class year (e.g. 2027)" value={year} onChange={(e) => setYear(e.target.value)} />
        </div>
        <input className="field" placeholder="Instagram (optional, e.g. @alex.sc)" value={instagram} onChange={(e) => setInstagram(e.target.value)} />
        <input className="field" placeholder="Phone (optional)" value={phone} onChange={(e) => setPhone(e.target.value)} />
        {error && <div style={{ fontSize: 13, color: 'var(--cardinal)' }}>{error}</div>}
        <button type="submit" className="btn btn-primary" disabled={saving} style={{ padding: '13px 22px' }}>
          {saving ? 'Saving…' : 'Enter Flipd'}
        </button>
      </form>
    </div>
  );
}
