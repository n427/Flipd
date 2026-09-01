import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { WantedDetailSkeleton, WantedEditorSkeleton, WantedOfferSkeleton } from './WantedSkeletons';

describe('Wanted skeletons', () => {
  it('renders the detail shape without visible loading copy', () => {
    const html = renderToStaticMarkup(React.createElement(WantedDetailSkeleton));
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('wanted-detail-skeleton');
    expect(html).not.toMatch(/Loading|Checking/i);
  });

  it('renders form and offer placeholders without visible loading copy', () => {
    const html = renderToStaticMarkup(React.createElement(React.Fragment, null,
      React.createElement(WantedEditorSkeleton),
      React.createElement(WantedOfferSkeleton),
    ));
    expect(html).toContain('wanted-editor-skeleton');
    expect(html).toContain('wanted-offer-skeleton');
    expect(html).not.toMatch(/Loading|Checking/i);
  });
});
