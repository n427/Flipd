import { describe, expect, it } from 'vitest';
import { effectiveRevealStatus, isUscEmail, timeLeftLabel, resolveSharedContact, primaryMethod } from './validation';

describe('isUscEmail', () => {
  it('accepts usc.edu addresses case-insensitively', () => {
    expect(isUscEmail('trojan@usc.edu')).toBe(true);
    expect(isUscEmail('Trojan@USC.EDU')).toBe(true);
    expect(isUscEmail('  trojan@usc.edu  ')).toBe(true);
  });
  it('rejects other domains and malformed input', () => {
    expect(isUscEmail('trojan@gmail.com')).toBe(false);
    expect(isUscEmail('trojan@notusc.edu')).toBe(false);
    expect(isUscEmail('@usc.edu')).toBe(false);
    expect(isUscEmail('')).toBe(false);
  });
});

describe('effectiveRevealStatus', () => {
  const now = new Date('2026-07-16T12:00:00Z');
  it('expires pending requests past expires_at', () => {
    expect(effectiveRevealStatus('pending', '2026-07-16T11:00:00Z', now)).toBe('expired');
  });
  it('keeps pending requests before expires_at', () => {
    expect(effectiveRevealStatus('pending', '2026-07-16T13:00:00Z', now)).toBe('pending');
  });
  it('never changes resolved statuses', () => {
    expect(effectiveRevealStatus('approved', '2026-07-16T11:00:00Z', now)).toBe('approved');
    expect(effectiveRevealStatus('declined', '2026-07-16T11:00:00Z', now)).toBe('declined');
  });
});

describe('timeLeftLabel', () => {
  const now = new Date('2026-07-17T12:00:00Z');
  it('shows whole hours remaining', () => {
    expect(timeLeftLabel('2026-07-20T11:00:00Z', now)).toBe('71h left');
    expect(timeLeftLabel('2026-07-17T14:30:00Z', now)).toBe('2h left');
  });
  it('shows minutes under an hour', () => {
    expect(timeLeftLabel('2026-07-17T12:40:00Z', now)).toBe('40m left');
  });
  it('is empty at or past expiry', () => {
    expect(timeLeftLabel('2026-07-17T12:00:00Z', now)).toBe('');
    expect(timeLeftLabel('2026-07-17T11:00:00Z', now)).toBe('');
  });
});

describe('resolveSharedContact', () => {
  const values = { instagram: '@trojan', phone: '2135550100', email: 't@usc.edu' };
  it('returns only chosen methods that have a stored value', () => {
    expect(resolveSharedContact(['instagram', 'email'], values)).toEqual({ instagram: '@trojan', email: 't@usc.edu' });
  });
  it('drops chosen methods with no stored value', () => {
    expect(resolveSharedContact(['phone'], { instagram: '@t', phone: null, email: null })).toEqual({});
  });
  it('ignores stored values not chosen', () => {
    expect(resolveSharedContact(['instagram'], values)).toEqual({ instagram: '@trojan' });
  });
  it('returns empty for empty chosen list', () => {
    expect(resolveSharedContact([], values)).toEqual({});
  });
});

describe('primaryMethod', () => {
  it('prefers instagram, then phone, then email', () => {
    expect(primaryMethod({ instagram: '@t', phone: '1', email: 'e' })).toBe('instagram');
    expect(primaryMethod({ instagram: null, phone: '1', email: 'e' })).toBe('phone');
    expect(primaryMethod({ instagram: null, phone: null, email: 'e' })).toBe('email');
    expect(primaryMethod({ instagram: null, phone: null, email: null })).toBe(null);
  });
});
