import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { wantsSms, wantsEmail, wantsPush, sendSms } from './notify';

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
