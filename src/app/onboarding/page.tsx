'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { primaryMethod } from '@/lib/validation';
import { Select } from '@/components/Select';

const YEARS = ['Freshman', 'Sophomore', 'Junior', 'Senior', 'Grad'];
const UNITS = ['Marshall', 'Annenberg', 'Viterbi', 'Dornsife', 'SCA', 'Roski', 'Thornton', 'Price', 'Other'];
// Where Flipd sends notifications. These are NOT shared with other users —
// conversations happen in the app.
const CONTACT_FIELDS = [
  { id: 'email', valueLabel: 'Email', placeholder: 'you@usc.edu' },
] as const;

// Delivery channels the user can opt into, per the notify_prefs jsonb shape.
const CHANNEL_OPTIONS = [
  { id: 'app', label: 'In the app', hint: 'Push notifications' },
  { id: 'email', label: 'Email', hint: '' },
] as const;
type ChannelId = (typeof CHANNEL_OPTIONS)[number]['id'];

// Events these channels apply to. Keeping one setting across all of them is
// deliberate: a per-event matrix at signup is more configuration than anyone
// wants before they have used the product once.
const ALL_EVENTS = ['new_request', 'approval', 'reminder', 'expiry', 'new_message'] as const;

// Signup attribution. `id` is what lands in the database and must match the
// CHECK constraint in migration 022 and HEARD_FROM in src/app/api/me/route.ts;
// `label` is display copy and can change freely. `detailPrompt` opts a channel
// into the follow-up text box — omit it for channels where a free-text answer
// would be meaningless ("Instagram").
const CHANNELS: readonly { id: string; label: string; detailPrompt?: string }[] = [
  { id: 'instagram', label: 'Instagram' },
  { id: 'friend', label: 'Friend / word of mouth', detailPrompt: 'Who told you about Flipd? (optional)' },
  { id: 'flyer', label: 'Flyer or poster' },
  { id: 'class_club', label: 'Class or club', detailPrompt: 'Which one? (optional)' },
  { id: 'other', label: 'Other', detailPrompt: "How'd you find us? (optional)" },
];
const CHANNEL_LABELS = CHANNELS.map((c) => c.label);

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = React.useState<1 | 2>(1);
  const [name, setName] = React.useState('');
  const [year, setYear] = React.useState('');
  const [unit, setUnit] = React.useState('');
  const [heardLabel, setHeardLabel] = React.useState('');
  const [heardDetail, setHeardDetail] = React.useState('');
  const [photo, setPhoto] = React.useState<{ file: File; url: string } | null>(null);
  const [contacts, setContacts] = React.useState<{ email: string }>({ email: '' });
  // In-app on by default: it's the channel that always works and costs nothing.
  const [channels, setChannels] = React.useState<ChannelId[]>(['app', 'email']);
  const [error, setError] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);

  // Returning users who already finished onboarding go straight to the feed.
  React.useEffect(() => {
    fetch('/api/me')
      .then((r) => (r.ok ? r.json() : { profile: null }))
      .then(({ profile }) => {
        // Instagram no longer counts: it can't receive a notification.
        const hasContact = Boolean(profile?.contact_email);
        if (profile?.display_name && hasContact) { router.replace('/feed'); return; }
        if (profile?.contact_email) {
          setContacts((c) => ({ ...c, email: profile.contact_email }));
        }
        if (profile?.display_name) setName(profile.display_name);
      })
      .catch(() => {});
  }, [router]);

  const heardChannel = CHANNELS.find((c) => c.label === heardLabel);

  // Switching to a channel with no detail box would otherwise submit an
  // orphaned answer ("Sarah" filed under Instagram), so drop it on change.
  const pickChannel = (label: string) => {
    setHeardLabel(label);
    if (!CHANNELS.find((c) => c.label === label)?.detailPrompt) setHeardDetail('');
  };

  const finish = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contacts.email.trim()) { setError('Add an email so we can reach you.'); return; }
    if (channels.length === 0) { setError('Pick at least one place to get notifications.'); return; }
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
          heard_from: heardChannel?.id,
          heard_from_detail: heardDetail.trim() || null,
          contact_method: primaryMethod({ instagram: null, email: contacts.email.trim() || null }),
          contact_email: contacts.email.trim() || null,
          notify_prefs: Object.fromEntries(
            ALL_EVENTS.map((ev) => [ev, {
              app: channels.includes('app'),
              email: channels.includes('email'),
            }]),
          ),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Could not save. Try again.');
      }
      router.push('/feed');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save. Try again.');
      setSaving(false);
    }
  };

  const next = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setError('Your name is required.'); return; }
    if (!year) { setError('Pick your class year.'); return; }
    if (!heardChannel) { setError('Let us know how you heard about Flipd.'); return; }
    setError('');
    setStep(2);
  };

  return (
    <div style={{ maxWidth: 440, margin: '0 auto', padding: '72px 24px' }}>
      <div style={{ fontWeight: 800, fontSize: 22, letterSpacing: '-0.04em', color: 'var(--ink)' }}>
        Flipd<span style={{ color: 'var(--accent)' }}>.</span>
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
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
              <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) setPhoto({ file: f, url: URL.createObjectURL(f) });
                e.target.value = '';
              }} />
              {/* Solid ring once a photo is set (a dashed one reads as an empty
                  slot); dashed while empty to invite a tap. */}
              <button type="button" onClick={() => fileRef.current?.click()} aria-label="Add profile photo" style={{ width: 64, height: 64, borderRadius: '50%', border: photo ? '1.5px solid var(--rule-strong)' : '1.5px dashed var(--rule-strong)', background: 'var(--surface)', overflow: 'hidden', cursor: 'pointer', padding: 0, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {photo ? (
                  <img src={photo.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <span style={{ fontSize: 22, color: 'var(--muted)', fontWeight: 300 }}>+</span>
                )}
              </button>
              <div style={{ fontSize: 13, color: 'var(--muted)' }}>Photo (optional)</div>
            </div>
            <input className="field" placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} />
            <Select label="Class year" placeholder="Class year" options={YEARS} value={year} onChange={setYear} />
            <Select label="School or major" placeholder="School / major (optional)" options={UNITS} value={unit} onChange={setUnit} />
            <Select label="How you heard about Flipd" placeholder="How'd you hear about Flipd?" options={CHANNEL_LABELS} value={heardLabel} onChange={pickChannel} />
            {heardChannel?.detailPrompt && (
              <input
                className="field"
                value={heardDetail}
                onChange={(e) => setHeardDetail(e.target.value)}
                placeholder={heardChannel.detailPrompt}
              />
            )}
            {error && <div style={{ fontSize: 13, color: 'var(--accent)' }}>{error}</div>}
            <button type="submit" className="btn btn-primary" style={{ padding: '13px 22px' }}>Continue</button>
          </form>
        </>
      ) : (
        <>
          <h1 style={{ fontWeight: 800, fontSize: 28, letterSpacing: '-0.03em', color: 'var(--ink)', margin: '28px 0 6px' }}>
            Where should we reach you?
          </h1>
          <p style={{ fontSize: 14, color: 'var(--muted)', margin: '0 0 28px' }}>
            For sign-in codes and alerts about your listings. Buyers never see these. Messages stay in Flipd.
          </p>
          <form onSubmit={finish} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {CONTACT_FIELDS.map((m) => (
              <div key={m.id}>
                <label className="field-label">{m.valueLabel}</label>
                <input
                  className="field"
                  value={contacts[m.id]}
                  onChange={(e) => setContacts((c) => ({ ...c, [m.id]: e.target.value }))}
                  placeholder={m.placeholder}
                />
              </div>
            ))}
            <div>
              <label className="field-label">Where should notifications go?</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {CHANNEL_OPTIONS.map((c) => {
                  const on = channels.includes(c.id);
                  return (
                    <label
                      key={c.id}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        border: '1.5px solid ' + (on ? 'var(--ink)' : 'var(--rule)'),
                        borderRadius: 12, padding: '11px 14px',
                        cursor: 'pointer', fontSize: 14.5,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={(e) => setChannels((prev) =>
                          e.target.checked ? [...prev, c.id] : prev.filter((x) => x !== c.id))}
                        style={{ width: 16, height: 16 }}
                      />
                      <span style={{ fontWeight: 600 }}>{c.label}</span>
                      {c.hint && <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--muted)' }}>{c.hint}</span>}
                    </label>
                  );
                })}
              </div>
            </div>
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
