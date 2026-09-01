import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { WantedPhotoPicker } from './WantedPhotoPicker';

describe('WantedPhotoPicker', () => {
  it('uses a photo tile trigger instead of exposing the browser file control', () => {
    const html = renderToStaticMarkup(React.createElement(WantedPhotoPicker, {
      photos: [],
      disabled: false,
      onFiles: () => {},
      onRemove: () => {},
    }));
    expect(html).toContain('aria-label="Add reference photos"');
    expect(html).toContain('Add reference photos');
    expect(html).toMatch(/type="file"[^>]*style="display:none"/);
  });
});
