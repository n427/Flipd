'use client';

import React from 'react';
import { LocationPicker } from './LocationPicker';
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
  return (
    <form className="wanted-form" onSubmit={submit}>
      <div className="wanted-form__head"><div><h1>{initial ? 'Edit request' : 'What are you looking for?'}</h1><p>Tell nearby sellers what would be a good fit.</p></div></div>
      <label>Title<input className="field" value={title} maxLength={60} onChange={(e) => setTitle(e.target.value)} placeholder="Standing desk, moving help…" /></label>
      <div className="wanted-form__split">
        <label>Category<select className="field" value={category} onChange={(e) => setCategory(e.target.value as WantedPostInput['category'])}><option value="goods">Goods</option><option value="services">Services</option><option value="housing">Housing</option></select></label>
        <label>Maximum budget ($)<input className="field" type="number" min="1" step="1" inputMode="numeric" value={budget} onChange={(e) => setBudget(e.target.value)} /></label>
      </div>
      <label>Meetup area<LocationPicker value={location} onChange={setLocation} /></label>
      <label>Description<textarea className="field wanted-textarea" value={description} maxLength={2000} onChange={(e) => setDescription(e.target.value)} placeholder="Size, condition, timing, or anything else sellers should know." /></label>
      <label>Needed by<input className="field" type="date" min={minimumDate} value={date} onChange={(e) => setDate(e.target.value)} /></label>
      <label>Reference photos <span className="wanted-optional">optional, up to 6</span><input className="field" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" multiple disabled={totalPhotos >= 6} onChange={(e) => setFiles((current) => [...current, ...Array.from(e.target.files ?? [])].slice(0, 6 - existingPhotos.length))} /></label>
      {totalPhotos > 0 && <div className="wanted-photo-grid">{existingPhotos.map((url) => <button type="button" key={url} aria-label="Remove photo" onClick={() => setExistingPhotos((all) => all.filter((item) => item !== url))}><img src={url} alt="" /></button>)}{previews.map((url, index) => <button type="button" key={url} aria-label="Remove photo" onClick={() => setFiles((all) => all.filter((_, i) => i !== index))}><img src={url} alt="" /></button>)}</div>}
      {error && <div className="wanted-error" role="alert">{error}</div>}
      <div className="wanted-form__actions"><Button type="button" kind="ghost" onClick={onCancel}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? 'Saving…' : submitLabel}</Button></div>
    </form>
  );
}
