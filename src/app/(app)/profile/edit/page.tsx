'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '@/lib/store-context';
import { primaryMethod } from '@/lib/validation';
import { Select } from '@/components/Select';

const YEARS = ['Freshman', 'Sophomore', 'Junior', 'Senior', 'Grad'];
const UNITS = ['Marshall', 'Annenberg', 'Viterbi', 'Dornsife', 'SCA', 'Roski', 'Thornton', 'Price', 'Other'];
// Notification destinations, not things other users see. Conversations happen
// in the app.
const METHODS = [
  { id: 'email', valueLabel: 'Email', placeholder: 'you@usc.edu' },
] as const;

const NOTIFY_EVENTS = [
  { id: 'new_request', label: 'New request on your listing' },
  { id: 'approval', label: 'Request approved (your chat is open)' },
  { id: 'new_message', label: 'New message in a conversation' },
  { id: 'reminder', label: 'Reminder before a request expires' },
  { id: 'expiry', label: 'Your request expired' },
  { id: 'popup_reminder', label: 'A popup or event you saved is starting soon' },
] as const;

export default function ProfileEditPage() {
  const router = useRouter();
  const store = useStore();
  const me = store.me;

  const [name, setName] = React.useState('');
  const [year, setYear] = React.useState('');
  const [unit, setUnit] = React.useState('');
  const [bio, setBio] = React.useState('');
  const [contacts, setContacts] = React.useState<{ email: string }>({ email: '' });
  const [photo, setPhoto] = React.useState<{ file: File; url: string } | null>(null);
  const [prefs, setPrefs] = React.useState<Record<string, { app?: boolean; email?: boolean }>>({});
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
    setContacts({ email: me.contact_email ?? '' });
    setPrefs(me.notify_prefs ?? {});
    setLoaded(true);
  }, [me, loaded]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setError('Your name is required.'); return; }
    if (!contacts.email.trim()) { setError('Add an email so we can reach you.'); return; }
    setSaving(true);
    setError('');
    try {
      if (photo) {
        const fd = new FormData();
        fd.append('photo', photo.file, photo.file.name);
        const up = await fetch('/api/me/avatar', { method: 'POST', body: fd });
        if (!up.ok) throw new Error('Photo upload failed. Try a smaller image.');
      }
      const res = await fetch('/api/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          display_name: name,
          class_year: year,
          school_unit: unit,
          bio,
          contact_method: primaryMethod({ instagram: null, email: contacts.email.trim() || null }),
          contact_email: contacts.email.trim() || null,
          notify_prefs: prefs,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Could not save. Try again.');
      }
      await store.refreshMe();
      router.push('/profile');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save. Try again.');
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
          {/* An uploaded photo keeps a solid ring (a dashed one reads as an empty
              slot); the empty state stays dashed to invite a tap. */}
          <button type="button" onClick={() => fileRef.current?.click()} aria-label="Change profile photo" style={{ width: 72, height: 72, borderRadius: '50%', border: avatarPreview ? '1.5px solid var(--rule-strong)' : '1.5px dashed var(--rule-strong)', background: 'var(--surface)', overflow: 'hidden', cursor: 'pointer', padding: 0, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {avatarPreview ? (
              <img src={avatarPreview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <span style={{ fontSize: 24, color: 'var(--muted)', fontWeight: 300 }}>+</span>
            )}
          </button>
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>Change photo</div>
        </div>

        <div>
          <label className="field-label">Name<span style={{ color: 'var(--accent)' }}> *</span></label>
          <input className="field" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label className="field-label">Class year</label>
            <Select
              label="Class year"
              placeholder="Class year"
              // Keep an existing off-list value selectable so saving can't drop it.
              options={year && !YEARS.includes(year) ? [...YEARS, year] : YEARS}
              value={year}
              onChange={setYear}
            />
          </div>
          <div>
            <label className="field-label">School / major</label>
            <Select
              label="School or major"
              placeholder="None"
              options={unit && !UNITS.includes(unit) ? [...UNITS, unit] : UNITS}
              value={unit}
              onChange={setUnit}
            />
          </div>
        </div>
        <div>
          <label className="field-label">Bio</label>
          <textarea className="field" rows={3} value={bio} onChange={(e) => setBio(e.target.value.slice(0, 300))} placeholder="A line about you" style={{ resize: 'vertical' }} />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {METHODS.map((m) => {
            // Email is fixed to the verified account and is the only contact
            // method, so this field is always read-only.
            const locked = m.id === 'email';
            return (
              <div key={m.id}>
                <label className="field-label">{m.valueLabel}</label>
                <input
                  className="field"
                  value={contacts[m.id]}
                  onChange={locked ? undefined : (e) => setContacts((c) => ({ ...c, [m.id]: e.target.value }))}
                  placeholder={m.placeholder}
                  readOnly={locked}
                  aria-readonly={locked || undefined}
                  style={locked ? { background: 'var(--surface)', color: 'var(--muted)', cursor: 'not-allowed' } : undefined}
                />
                {locked && (
                  <p style={{ fontSize: 12, color: 'var(--muted)', margin: '6px 0 0', lineHeight: 1.5 }}>
                    Tied to your verified account, so it cannot be changed here.
                  </p>
                )}
              </div>
            );
          })}
        </div>

        <div>
          <label className="field-label">Notifications</label>
          <div style={{ border: '1px solid var(--rule)', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 64px 64px', padding: '10px 16px', background: 'var(--surface)', fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>
              <span />
              <span style={{ textAlign: 'center' }}>In app</span>
              <span style={{ textAlign: 'center' }}>Email</span>
            </div>
            {NOTIFY_EVENTS.map((ev, i) => (
              <div key={ev.id} style={{ display: 'grid', gridTemplateColumns: '1fr 64px 64px', alignItems: 'center', padding: '12px 16px', borderTop: i > 0 ? '1px solid var(--rule)' : 0 }}>
                <span style={{ fontSize: 13.5, color: 'var(--ink-2)' }}>{ev.label}</span>
                <span style={{ textAlign: 'center' }}>
                  <input
                    type="checkbox"
                    checked={prefs[ev.id]?.app !== false}
                    onChange={(e2) => setPrefs((p) => ({ ...p, [ev.id]: { ...p[ev.id], app: e2.target.checked } }))}
                    aria-label={`In-app for: ${ev.label}`}
                  />
                </span>
                <span style={{ textAlign: 'center' }}>
                  <input
                    type="checkbox"
                    checked={prefs[ev.id]?.email !== false}
                    onChange={(e2) => setPrefs((p) => ({ ...p, [ev.id]: { ...p[ev.id], email: e2.target.checked } }))}
                    aria-label={`Email for: ${ev.label}`}
                  />
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
