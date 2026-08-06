import { describe, expect, it } from 'vitest';
import { wantsSms, wantsEmail, wantsPush } from './notify';

describe('wantsSms', () => {
  it('defaults OFF when no preference is stored', () => {
    expect(wantsSms({}, 'listing_match')).toBe(false);
    expect(wantsSms(undefined, 'listing_match')).toBe(false);
    expect(wantsSms(null, 'popup_reminder')).toBe(false);
  });

  it('is on only when explicitly set to true', () => {
    expect(wantsSms({ listing_match: { sms: true } }, 'listing_match')).toBe(true);
    expect(wantsSms({ listing_match: { sms: false } }, 'listing_match')).toBe(false);
  });

  it('is per-event, not global', () => {
    const prefs = { popup_reminder: { sms: true } };
    expect(wantsSms(prefs, 'popup_reminder')).toBe(true);
    expect(wantsSms(prefs, 'listing_match')).toBe(false);
  });

  it('ignores unrelated channel keys', () => {
    expect(wantsSms({ listing_match: { email: true, app: true } }, 'listing_match')).toBe(false);
  });
});

describe('email and push keep defaulting ON for the new event', () => {
  it('treats listing_match like every other event', () => {
    expect(wantsEmail({}, 'listing_match')).toBe(true);
    expect(wantsPush({}, 'listing_match')).toBe(true);
  });
});
