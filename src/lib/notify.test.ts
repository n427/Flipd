import { describe, expect, it } from 'vitest';
import { wantsEmail, wantsPush, popupReminderEmail } from './notify';

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
