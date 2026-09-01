'use client';

import React from 'react';
import { Icon } from './Icon';

export type WantedPhoto = { url: string; alt?: string };

export function WantedPhotoPicker({
  photos,
  disabled,
  onFiles,
  onRemove,
}: {
  photos: WantedPhoto[];
  disabled: boolean;
  onFiles: (files: File[]) => void;
  onRemove: (index: number) => void;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const openPicker = () => { if (!disabled) inputRef.current?.click(); };

  return (
    <div className="wanted-photo-picker">
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
        multiple
        disabled={disabled}
        style={{ display: 'none' }}
        onChange={(event) => {
          onFiles(Array.from(event.target.files ?? []));
          event.target.value = '';
        }}
      />

      {photos[0] ? (
        <div className="wanted-photo-picker__hero">
          <img src={photos[0].url} alt={photos[0].alt ?? 'Reference photo 1'} />
          <button type="button" className="wanted-photo-picker__remove" aria-label="Remove reference photo 1" onClick={() => onRemove(0)}><Icon name="x" size={11} /></button>
          {!disabled && <button type="button" className="wanted-photo-picker__add-more" onClick={openPicker}><Icon name="plus" size={14} /> Add photos</button>}
        </div>
      ) : (
        <button type="button" className="wanted-photo-picker__empty" aria-label="Add reference photos" onClick={openPicker} disabled={disabled}>
          <span><Icon name="plus" size={18} /></span>
          <strong>Add reference photos</strong>
          <small>Show sellers what would be a good match · up to 6</small>
        </button>
      )}

      <div className="wanted-photo-picker__thumbs">
        {Array.from({ length: photos.length > 4 ? 8 : 4 }).map((_, index) => photos[index] ? (
          <div className="wanted-photo-picker__thumb" key={`${photos[index].url}-${index}`}>
            <img src={photos[index].url} alt={photos[index].alt ?? `Reference photo ${index + 1}`} />
            {index > 0 && <button type="button" aria-label={`Remove reference photo ${index + 1}`} onClick={() => onRemove(index)}><Icon name="x" size={9} /></button>}
          </div>
        ) : (
          <button key={index} type="button" className="wanted-photo-picker__slot" aria-label="Add reference photo" onClick={openPicker} disabled={disabled}><Icon name="plus" size={15} /></button>
        ))}
      </div>
    </div>
  );
}
