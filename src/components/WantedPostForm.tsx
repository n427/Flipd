'use client';

import React from 'react';
import { LocationPicker } from './LocationPicker';
import { WantedPhotoPicker } from './WantedPhotoPicker';
import { Button } from './ui';
import { wantedClient } from '@/lib/wanted-client';
import { losAngelesEndOfDayUtc, minimumWantedDate, wantedDateInput, wantedRequiredFieldHints } from '@/lib/wanted-presentation';
import type { WantedPostDTO, WantedPostInput } from '@/lib/types';

export function WantedPostForm({ initial, submitLabel = 'Post request', onSubmit, onCancel }: {
  initial?: WantedPostDTO;
  submitLabel?: string;
  onSubmit: (input: WantedPostInput) => Promise<void>;
  onCancel: () => void;
}) {
  const [title, setTitle] = React.useState(initial?.title ?? '');
  const [category, setCategory] = React.useState<WantedPostInput['category']>(initial?.category ?? 'goods');
  const [budget, setBudget] = React.useState(initial ? String(initial.max_budget) : '');
  const [description, setDescription] = React.useState(initial?.description ?? '');
  const [location, setLocation] = React.useState({ name: initial?.location ?? '', lat: null as number | null, lng: null as number | null });
  const [date, setDate] = React.useState(initial ? wantedDateInput(initial.needed_by) : '');
  const [files, setFiles] = React.useState<File[]>([]);
  const [existingPhotos, setExistingPhotos] = React.useState(initial?.photo_urls ?? []);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const [minimumDate] = React.useState(() => minimumWantedDate());
  const previews = React.useMemo(() => files.map((file) => URL.createObjectURL(file)), [files]);
  React.useEffect(() => () => previews.forEach(URL.revokeObjectURL), [previews]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    const neededBy = losAngelesEndOfDayUtc(date);
    const parsedBudget = Number(budget);
    if (!title.trim() || !location.name.trim() || !description.trim() || !neededBy || !Number.isSafeInteger(parsedBudget) || parsedBudget <= 0) {
      setError(`Add ${wantedRequiredFieldHints('post').join(', ')}.`); return;
    }
    setBusy(true);
    let uploaded: { paths: string[]; urls?: string[] } | null = null;
    try {
      if (files.length) uploaded = await wantedClient.uploadPhotos(files, 'reference');
      await onSubmit({
        title, category, max_budget: parsedBudget, description, location: location.name,
        photo_urls: [...existingPhotos, ...(uploaded?.urls ?? [])], needed_by: neededBy,
      });
    } catch (cause) {
      if (uploaded?.paths.length) await wantedClient.cleanupPhotos(uploaded.paths, 'reference').catch(() => {});
      setError(cause instanceof Error ? cause.message : 'Could not save your request.');
    } finally { setBusy(false); }
  }

  const totalPhotos = existingPhotos.length + files.length;
  const photoItems = [
    ...existingPhotos.map((url, index) => ({ url, alt: `Existing reference photo ${index + 1}` })),
    ...previews.map((url, index) => ({ url, alt: `New reference photo ${index + 1}` })),
  ];
  const addFiles = (incoming: File[]) => {
    setFiles((current) => [
      ...current,
      ...incoming.filter((file) => file.type.startsWith('image/')),
    ].slice(0, 6 - existingPhotos.length));
  };
  const removePhoto = (index: number) => {
    if (index < existingPhotos.length) {
      setExistingPhotos((current) => current.filter((_, photoIndex) => photoIndex !== index));
      return;
    }
    const fileIndex = index - existingPhotos.length;
    setFiles((current) => current.filter((_, photoIndex) => photoIndex !== fileIndex));
  };
  return (
    <form className="wanted-form" onSubmit={submit}>
      <div className="wanted-form__head">
        <h1>{initial ? 'Edit your request' : 'What are you looking for?'}</h1>
        <Button type="button" kind="secondary" size="sm" onClick={onCancel}>Exit</Button>
      </div>

      <div className="wanted-form__grid">
        <section>
          <label className="field-label">Reference photos <span className="wanted-optional">optional</span></label>
          <WantedPhotoPicker photos={photoItems} disabled={totalPhotos >= 6} onFiles={addFiles} onRemove={removePhoto} />
          <p className="wanted-photo-tip">A photo helps sellers understand the size, style, or condition you want.</p>
        </section>

        <section className="wanted-form__details">
          <label className="field-label">It’s in the category of…<span className="wanted-required"> *</span></label>
          <div className="wanted-form__categories">
            {(['goods', 'services', 'housing'] as const).map((value) => <button key={value} type="button" className={category === value ? 'is-active' : ''} aria-pressed={category === value} onClick={() => setCategory(value)}>{value[0].toUpperCase() + value.slice(1)}</button>)}
          </div>

          <div className="wanted-form__label-row"><label className="field-label">Give it a title<span className="wanted-required"> *</span></label><span>{title.length}/60</span></div>
          <input className="field" value={title} maxLength={60} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Mini fridge for an apartment" />

          <div className="wanted-form__label-row"><label className="field-label">Describe what you need<span className="wanted-required"> *</span></label><span>{description.length}/2000</span></div>
          <textarea className="field wanted-textarea" value={description} maxLength={2000} onChange={(e) => setDescription(e.target.value)} placeholder="Size, condition, timing, or anything else sellers should know." />

          <div className="wanted-form__split">
            <label>Maximum budget ($)<input className="field" type="number" min="1" step="1" inputMode="numeric" value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="100" /></label>
            <label>Needed by<input className="field" type="date" min={minimumDate} value={date} onChange={(e) => setDate(e.target.value)} /></label>
          </div>
          <label>Where you’ll meet<LocationPicker value={location} onChange={setLocation} /></label>
        </section>
      </div>
      {error && <div className="wanted-error" role="alert">{error}</div>}
      <hr className="rule" />
      <div className="wanted-form__actions"><Button type="submit" size="lg" disabled={busy} progress={busy ? 'indeterminate' : undefined}>{busy ? 'Almost there…' : submitLabel}</Button></div>
    </form>
  );
}
