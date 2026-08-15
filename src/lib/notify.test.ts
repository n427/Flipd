import { describe, expect, it } from 'vitest';
import { wantsEmail, wantsPush, popupReminderEmail, titleCase, digestEmailBody } from './notify';

describe('email and push keep defaulting ON for the new event', () => {
  it('treats listing_match like every other event', () => {
    expect(wantsEmail({}, 'listing_match')).toBe(true);
    expect(wantsPush({}, 'listing_match')).toBe(true);
  });
});

describe('popupReminderEmail', () => {
  it('frames the 24h notice as upcoming, not imminent', () => {
    const { subject, html } = popupReminderEmail('Taco popup', 'Sat 2-4pm', '24h');
    expect(subject).toMatch(/tomorrow/i);
    expect(subject).not.toMatch(/hour/i);
    expect(html).toContain('Taco popup');
    expect(html).toContain('Sat 2-4pm');
  });

  it('frames the 1h notice as imminent', () => {
    const { subject, html } = popupReminderEmail('Taco popup', 'Sat 2-4pm', '1h');
    expect(subject).toMatch(/hour|soon|starting/i);
    expect(subject).not.toMatch(/tomorrow/i);
    expect(html).toContain('Taco popup');
  });

  it('gives the two stages different subjects', () => {
    const a = popupReminderEmail('Taco popup', 'Sat 2-4pm', '24h').subject;
    const b = popupReminderEmail('Taco popup', 'Sat 2-4pm', '1h').subject;
    expect(a).not.toEqual(b);
  });
});

describe('titleCase', () => {
  it('capitalises each lowercase word', () => {
    expect(titleCase('banana')).toBe('Banana');
    expect(titleCase('math tutoring')).toBe('Math Tutoring');
  });

  // The whole reason this is not `.toLowerCase()` first: users type real
  // acronyms into titles and lowercasing them reads as a typo.
  it('leaves existing capitals alone', () => {
    expect(titleCase('GMAT tutoring — 720+ scorer')).toBe('GMAT Tutoring — 720+ Scorer');
    expect(titleCase('iPhone charger')).toBe('IPhone Charger');
  });

  it('handles punctuation and digits as word boundaries', () => {
    expect(titleCase('pre-order by thursday')).toBe('Pre-Order By Thursday');
    expect(titleCase('')).toBe('');
  });
});

describe('digestEmailBody', () => {
  const withPhoto = {
    id: 'a1',
    title: 'desk lamp',
    price: 12,
    category: 'goods',
    photo_urls: ['https://cdn.test/lamp.jpg'],
  };
  const noPhoto = { id: 'b2', title: 'banana', price: 1, category: 'food', photo_urls: null };
  const pool = [withPhoto, noPhoto];

  it('title-cases the listing title', () => {
    const { html } = digestEmailBody([{ id: 'a1', reason: 'internal only' }], pool);
    expect(html).toContain('Desk Lamp');
    expect(html).not.toContain('>desk lamp<');
  });

  it('renders the first photo with the title as alt text', () => {
    const { html } = digestEmailBody([{ id: 'a1', reason: 'x' }], pool);
    expect(html).toContain('https://cdn.test/lamp.jpg');
    expect(html).toContain('alt="Desk Lamp"');
  });

  it('omits the image entirely when a listing has no photo', () => {
    const { html } = digestEmailBody([{ id: 'b2', reason: 'x' }], pool);
    expect(html).not.toContain('<img');
    expect(html).toContain('Banana');
  });

  // The reason is a model-internal rationale that keeps matches honest. It is
  // never shown: surfacing "matches your search for banana" tells the student
  // their typing is logged, which reads worse than it works.
  it('never renders the model reason', () => {
    const { html } = digestEmailBody([{ id: 'a1', reason: 'matches your search for lamps' }], pool);
    expect(html).not.toContain('matches your search');
    expect(html).not.toContain('lamps');
  });

  it('pluralises the subject on count', () => {
    expect(digestEmailBody([{ id: 'a1', reason: 'x' }], pool).subject).toContain('1 listing you');
    expect(
      digestEmailBody([{ id: 'a1', reason: 'x' }, { id: 'b2', reason: 'x' }], pool).subject,
    ).toContain('2 listings you');
  });

  it('skips a match whose id is not in the pool rather than rendering a dead row', () => {
    const { html } = digestEmailBody([{ id: 'ghost', reason: 'x' }], pool);
    expect(html).not.toContain('ghost');
  });
});
