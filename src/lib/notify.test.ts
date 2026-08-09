import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { wantsSms, canSms, wantsEmail, wantsPush, sendSms, popupReminderEmail } from './notify';

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

describe('sendSms', () => {
  const realKey = process.env.SMS_API_KEY;
  const realUrl = process.env.SMS_API_URL;

  beforeEach(() => {
    vi.restoreAllMocks();
    delete process.env.SMS_API_KEY;
    delete process.env.SMS_API_URL;
  });
  afterEach(() => {
    if (realKey === undefined) delete process.env.SMS_API_KEY;
    else process.env.SMS_API_KEY = realKey;
    if (realUrl === undefined) delete process.env.SMS_API_URL;
    else process.env.SMS_API_URL = realUrl;
  });

  it('logs and does not call the network when no key is set', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    await sendSms('+13105550123', 'Your popup starts in an hour.');

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(expect.stringContaining('no SMS_API_KEY'));
  });

  it('logs and does not call the network when a key is set but no URL is', async () => {
    process.env.SMS_API_KEY = 'test-key';
    delete process.env.SMS_API_URL;
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    await sendSms('+13105550123', 'hi');

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(expect.stringContaining('no SMS provider configured'));
  });

  it('posts to the configured URL when both are set', async () => {
    process.env.SMS_API_KEY = 'test-key';
    process.env.SMS_API_URL = 'https://sms.test/v1/send';
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{}', { status: 200 }));

    await sendSms('+13105550123', 'hi');

    expect(fetchSpy).toHaveBeenCalledWith('https://sms.test/v1/send', expect.anything());
  });

  it('never throws when the provider call fails', async () => {
    process.env.SMS_API_KEY = 'test-key';
    process.env.SMS_API_URL = 'https://sms.test/v1/send';
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'));

    await expect(sendSms('+13105550123', 'hi')).resolves.toBeUndefined();
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

describe('canSms', () => {
  const ok = {
    phone_verified_at: '2026-08-01T00:00:00.000Z',
    sms_consent_at: '2026-08-01T00:00:00.000Z',
    notify_prefs: { popup_reminder: { sms: true } },
  };

  it('allows only when all three gates pass', () => {
    expect(canSms(ok, 'popup_reminder')).toBe(true);
  });

  it('blocks an unverified number even with consent and preference', () => {
    expect(canSms({ ...ok, phone_verified_at: null }, 'popup_reminder')).toBe(false);
  });

  it('blocks without consent even when verified and preferred', () => {
    expect(canSms({ ...ok, sms_consent_at: null }, 'popup_reminder')).toBe(false);
  });

  it('blocks an event the user did not opt into, even when verified and consented', () => {
    expect(canSms(ok, 'listing_match')).toBe(false);
  });

  it('blocks a missing profile rather than defaulting open', () => {
    expect(canSms(null, 'popup_reminder')).toBe(false);
    expect(canSms(undefined, 'popup_reminder')).toBe(false);
  });

  it('blocks when every gate is closed', () => {
    expect(canSms({ phone_verified_at: null, sms_consent_at: null, notify_prefs: {} }, 'popup_reminder')).toBe(false);
  });
});
