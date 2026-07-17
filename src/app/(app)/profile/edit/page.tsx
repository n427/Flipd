'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '@/lib/store-context';

const YEARS = ['Freshman', 'Sophomore', 'Junior', 'Senior', 'Grad'];
const UNITS = ['Marshall', 'Annenberg', 'Viterbi', 'Dornsife', 'SCA', 'Roski', 'Thornton', 'Price', 'Other'];
const METHODS = [
  { id: 'instagram', label: 'Instagram', valueLabel: 'Instagram handle', placeholder: '@you.sc' },
  { id: 'phone', label: 'Text', valueLabel: 'Phone number', placeholder: '(213) 555-0100' },
  { id: 'email', label: 'Email', valueLabel: 'Email', placeholder: 'you@usc.edu' },
] as const;
type MethodId = (typeof METHODS)[number]['id'];

const NOTIFY_EVENTS = [
  { id: 'new_request', label: 'New request on your listing' },
  { id: 'approval', label: 'Request approved (contact shared with you)' },
  { id: 'reminder', label: 'Reminder before a request expires' },
  { id: 'expiry', label: 'Your request expired' },
] as const;

export default function ProfileEditPage() {
  const router = useRouter();
  const store = useStore();
  const me = store.me;

  const [name, setName] = React.useState('');
  const [year, setYear] = React.useState('');
  const [unit, setUnit] = React.useState('');
  const [bio, setBio] = React.useState('');
  const [method, setMethod] = React.useState<MethodId | null>(null);
  const [value, setValue] = React.useState('');
  const [photo, setPhoto] = React.useState<{ file: File; url: string } | null>(null);
  const [prefs, setPrefs] = React.useState<Record<string, { email?: boolean; sms?: boolean }>>({});
  const [error, setError] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [loaded, setLoaded] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!me || loaded) return;
    setName(me.display_name ?? '');
    setYear(me.class_year ?? '');
    setUnit(me.school_unit ?? '');
    setBio(me.bio ?? '');
    const m = (me.contact_method as MethodId | null) ?? null;
    setMethod(m);
    setValue(m ? (me[`contact_${m}`] ?? '') : '');
    setPrefs(me.notify_prefs ?? {});
    setLoaded(true);
  }, [me, loaded]);

  const pickMethod = (id: MethodId) => {
    setMethod(id);
    setValue(me ? (me[`contact_${id}`] ?? '') : '');
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setError('Your name is required.'); return; }
    if (!method || !value.trim()) { setError('Keep one contact method filled in.'); return; }
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
          bio,
          contact_method: method,
          [`contact_${method}`]: value.trim(),
          notify_prefs: prefs,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Could not save — try again.');
      }
      await store.refreshMe();
      router.push('/profile');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save — try again.');
      setSaving(false);
    }
  };

  const avatarPreview = photo?.url || me?.avatar_url || null;

  return (
    <div style={{ maxWidth: 520, margin: '0 auto', padding: '36px 24px 80px' }}>
      <h1 style={{ fontWeight: 800, fontSize: 26, letterSpacing: '-0.03em', color: 'var(--ink)', margin: '0 0 28px' }}>
        Edit profile
      </h1>
      <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) setPhoto({ file: f, url: URL.createObjectURL(f) });
            e.target.value = '';
          }} />
          <button type="button" onClick={() => fileRef.current?.click()} aria-label="Change profile photo" style={{ width: 72, height: 72, borderRadius: '50%', border: avatarPreview ? 0 : '1.5px dashed var(--rule-strong)', background: 'var(--surface)', overflow: 'hidden', cursor: 'pointer', padding: 0, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {avatarPreview ? (
              <img src={avatarPreview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <span style={{ fontSize: 24, color: 'var(--muted)', fontWeight: 300 }}>+</span>
            )}
          </button>
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>Change photo</div>
        </div>

        <div>
          <label className="field-label">Name</label>
          <input className="field" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label className="field-label">Class year</label>
            <select className="field" value={year} onChange={(e) => setYear(e.target.value)}>
              <option value="">Class year</option>
              {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
              {year && !YEARS.includes(year) && <option value={year}>{year}</option>}
            </select>
          </div>
          <div>
            <label className="field-label">School / major</label>
            <select className="field" value={unit} onChange={(e) => setUnit(e.target.value)}>
              <option value="">None</option>
              {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
              {unit && !UNITS.includes(unit) && <option value={unit}>{unit}</option>}
            </select>
          </div>
        </div>
        <div>
          <label className="field-label">Bio</label>
          <textarea className="field" rows={3} value={bio} onChange={(e) => setBio(e.target.value.slice(0, 300))} placeholder="A line about you" style={{ resize: 'vertical' }} />
        </div>

        <div>
          <label className="field-label">How buyers reach you</label>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            {METHODS.map((m) => (
              <button key={m.id} type="button" onClick={() => pickMethod(m.id)} style={{ background: method === m.id ? 'var(--ink)' : '#fff', color: method === m.id ? '#fff' : 'var(--ink-2)', border: '1px solid ' + (method === m.id ? 'var(--ink)' : 'var(--rule)'), borderRadius: 999, padding: '8px 16px', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
                {m.label}
              </button>
            ))}
          </div>
          {method && (
            <input
              className="field"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={METHODS.find((m) => m.id === method)!.placeholder}
              inputMode={method === 'phone' ? 'tel' : undefined}
              aria-label={METHODS.find((m) => m.id === method)!.valueLabel}
            />
          )}
        </div>

        <div>
          <label className="field-label">Notifications</label>
          <div style={{ border: '1px solid var(--rule)', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 64px 64px', padding: '10px 16px', background: 'var(--surface)', fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>
              <span />
              <span style={{ textAlign: 'center' }}>Email</span>
              <span style={{ textAlign: 'center' }}>Text</span>
            </div>
            {NOTIFY_EVENTS.map((ev, i) => (
              <div key={ev.id} style={{ display: 'grid', gridTemplateColumns: '1fr 64px 64px', alignItems: 'center', padding: '12px 16px', borderTop: i > 0 ? '1px solid var(--rule)' : 0 }}>
                <span style={{ fontSize: 13.5, color: 'var(--ink-2)' }}>{ev.label}</span>
                <span style={{ textAlign: 'center' }}>
                  <input
                    type="checkbox"
                    checked={prefs[ev.id]?.email !== false}
                    onChange={(e2) => setPrefs((p) => ({ ...p, [ev.id]: { ...p[ev.id], email: e2.target.checked } }))}
                    aria-label={`Email for: ${ev.label}`}
                  />
                </span>
                <span style={{ textAlign: 'center', fontSize: 11, color: 'var(--muted-2)' }} title="Text notifications are coming soon">
                  soon
                </span>
              </div>
            ))}
          </div>
        </div>

        {error && <div style={{ fontSize: 13, color: 'var(--accent)' }}>{error}</div>}
        <div style={{ display: 'flex', gap: 10 }}>
          <button type="button" className="btn btn-ghost" onClick={() => router.push('/profile')}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={saving} style={{ flex: 1, padding: '13px 22px' }}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </form>
    </div>
  );
}
