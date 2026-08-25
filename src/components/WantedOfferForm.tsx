'use client';

import React from 'react';
import { Button } from './ui';
import { wantedClient } from '@/lib/wanted-client';
import { wantedRequiredFieldHints } from '@/lib/wanted-presentation';
import type { WantedOfferDTO } from '@/lib/wanted-offers';

export function WantedOfferForm({ postId, initial, onSaved, onCancel }: {
  postId: string; initial?: WantedOfferDTO; onSaved: (offer: WantedOfferDTO) => void; onCancel?: () => void;
}) {
  const [price, setPrice] = React.useState(initial ? String(initial.price) : '');
  const [description, setDescription] = React.useState(initial?.description ?? '');
  const [message, setMessage] = React.useState(initial?.message ?? '');
  const [files, setFiles] = React.useState<File[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const offerId = React.useRef(initial?.id ?? crypto.randomUUID()).current;

  async function submit(event: React.FormEvent) {
    event.preventDefault(); setError('');
    const amount = Number(price);
    if (!Number.isSafeInteger(amount) || amount <= 0 || !description.trim() || !message.trim() || files.length < 1) {
      setError(`Add ${wantedRequiredFieldHints('offer').join(', ')}.`); return;
    }
    setBusy(true);
    let upload: { paths: string[] } | null = null;
    try {
      upload = await wantedClient.uploadPhotos(files, 'offer', offerId);
      const input = { price: amount, description, message, photo_paths: upload.paths };
      const result = initial?.status === 'pending'
        ? await wantedClient.updateOffer(initial.id, input)
        : await wantedClient.createOffer(postId, offerId, input);
      onSaved(result.wanted_offer);
    } catch (cause) {
      if (upload?.paths.length) await wantedClient.cleanupPhotos(upload.paths, 'offer').catch(() => {});
      setError(cause instanceof Error ? cause.message : 'Could not save your offer.');
    } finally { setBusy(false); }
  }

  return (
    <form className="wanted-offer-form" onSubmit={submit}>
      <h2>{initial?.status === 'pending' ? 'Edit your offer' : initial ? 'Send another offer' : 'Make an offer'}</h2>
      <label>Your price ($)<input className="field" type="number" min="1" step="1" value={price} onChange={(e) => setPrice(e.target.value)} /></label>
      <label>Condition or description<textarea className="field wanted-textarea" maxLength={2000} value={description} onChange={(e) => setDescription(e.target.value)} /></label>
      <label>Message to the buyer<textarea className="field wanted-textarea" maxLength={1000} value={message} onChange={(e) => setMessage(e.target.value)} /></label>
      <label>Photos <span className="wanted-optional">required, up to 6</span><input className="field" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" multiple onChange={(e) => setFiles(Array.from(e.target.files ?? []).slice(0, 6))} /></label>
      {error && <div className="wanted-error" role="alert">{error}</div>}
      <div className="wanted-form__actions">{onCancel && <Button type="button" kind="ghost" onClick={onCancel}>Cancel</Button>}<Button type="submit" disabled={busy}>{busy ? 'Saving…' : initial?.status === 'pending' ? 'Save offer' : 'Send private offer'}</Button></div>
    </form>
  );
}
