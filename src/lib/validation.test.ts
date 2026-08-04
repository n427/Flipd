import { describe, expect, it } from 'vitest';
import { effectiveRevealStatus, isUscEmail, timeLeftLabel, resolveSharedContact, primaryMethod, parseCoords, parseEventWindow, formatEventWindow, shouldHintZoom, fillZoom, CAMPUS_SPOTS, findContactInfo, containsContactInfo, attachmentKind, attachmentError, isSendableMessage, swapCountLabel } from './validation';

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

describe('parseCoords', () => {
  it('accepts a valid in-range pair (numbers or numeric strings)', () => {
    expect(parseCoords(34.0224, -118.2851)).toEqual({ lat: 34.0224, lng: -118.2851 });
    expect(parseCoords('34.0224', '-118.2851')).toEqual({ lat: 34.0224, lng: -118.2851 });
  });
  it('rejects out-of-range values', () => {
    expect(parseCoords(91, 0)).toBeNull();
    expect(parseCoords(0, 181)).toBeNull();
    expect(parseCoords(-91, 0)).toBeNull();
  });
  it('rejects when either is missing or non-numeric', () => {
    expect(parseCoords(34.02, null)).toBeNull();
    expect(parseCoords(undefined, -118.28)).toBeNull();
    expect(parseCoords('abc', '-118.28')).toBeNull();
    expect(parseCoords('', '')).toBeNull();
    expect(parseCoords(' ', ' ')).toBeNull(); // whitespace-only is not Null Island
    expect(parseCoords('  ', '-118.28')).toBeNull();
  });
  it('rejects NaN/Infinity', () => {
    expect(parseCoords(NaN, 0)).toBeNull();
    expect(parseCoords(0, Infinity)).toBeNull();
  });
});

describe('parseEventWindow', () => {
  it('combines date + start/end into ISO strings', () => {
    const w = parseEventWindow('2026-07-24', '19:00', '23:00');
    expect(w).not.toBeNull();
    expect(new Date(w!.start).getHours()).toBe(19);
    expect(new Date(w!.end).getHours()).toBe(23);
  });
  it('returns null when a part is blank', () => {
    expect(parseEventWindow('', '19:00', '23:00')).toBeNull();
    expect(parseEventWindow('2026-07-24', '', '23:00')).toBeNull();
    expect(parseEventWindow('2026-07-24', '19:00', '')).toBeNull();
  });
  it('returns null when end is not after start', () => {
    expect(parseEventWindow('2026-07-24', '23:00', '19:00')).toBeNull();
    expect(parseEventWindow('2026-07-24', '19:00', '19:00')).toBeNull();
  });
});

describe('formatEventWindow', () => {
  it('shows one date and a time range for a same-day window', () => {
    const w = parseEventWindow('2026-07-24', '19:00', '23:00')!;
    const label = formatEventWindow(w.start, w.end);
    expect(label).toContain('Jul 24');
    expect(label).toMatch(/7.*11/); // 7 … 11
  });
});

describe('CAMPUS_SPOTS', () => {
  it('has the known campus meetup spots with valid coordinates', () => {
    const names = CAMPUS_SPOTS.map((s) => s.name);
    expect(names).toEqual(['USC Village', 'Leavey Library', 'Tutor Campus Center']);
    for (const s of CAMPUS_SPOTS) {
      expect(parseCoords(s.lat, s.lng)).toEqual({ lat: s.lat, lng: s.lng });
    }
  });
});

describe('shouldHintZoom', () => {
  it('hints for a 16:9 screenshot at zoom 1 (the letterbox case)', () => {
    expect(shouldHintZoom(16 / 9, 1)).toBe(true);
  });

  it('hints for a tall 9:16 photo too (portrait mirror)', () => {
    expect(shouldHintZoom(9 / 16, 1)).toBe(true);
  });

  it('does not hint for a near-square photo — no bars to fix', () => {
    expect(shouldHintZoom(1.05, 1)).toBe(false);
    expect(shouldHintZoom(1.08, 1)).toBe(false); // within tolerance of the frame
    expect(shouldHintZoom(4 / 3, 1)).toBe(true); // 4:3 is off enough to flag
  });

  it('stops hinting once zoomed enough to fill the frame', () => {
    const wide = 16 / 9; // ~1.78; fillScale ≈ 1.78/1.05 ≈ 1.69
    expect(shouldHintZoom(wide, 1)).toBe(true);
    expect(shouldHintZoom(wide, 1.7)).toBe(false);
  });

  it('is safe when aspect is unknown or garbage', () => {
    expect(shouldHintZoom(undefined, 1)).toBe(false);
    expect(shouldHintZoom(null, 1)).toBe(false);
    expect(shouldHintZoom(0, 1)).toBe(false);
    expect(shouldHintZoom(NaN, 1)).toBe(false);
  });
});

describe('fillZoom', () => {
  it('auto-zooms a 16:9 photo to fill the frame', () => {
    // Eased 60% of the way to fill (~1.69), so ~1.4 — trims bars without
    // over-cropping. Should be a meaningful zoom, but well under full fill.
    const z = fillZoom(16 / 9);
    expect(z).toBeGreaterThan(1.2);
    expect(z).toBeLessThan(1.6);
  });

  it('leaves near-square photos at 1 (no zoom)', () => {
    expect(fillZoom(1.05)).toBe(1);
    expect(fillZoom(1.08)).toBe(1); // within tolerance of the frame
  });

  it('auto-zooms a 4:3 photo (the common screenshot case)', () => {
    expect(fillZoom(4 / 3)).toBeGreaterThan(1); // ~1.25
  });

  it('caps at the slider max for extreme panoramas', () => {
    expect(fillZoom(5)).toBe(2.5);
  });

  it('snaps to the slider step (0.05)', () => {
    const z = fillZoom(16 / 9);
    expect(Math.round(z * 20) / 20).toBe(z);
  });

  it('gentle auto-zoom leaves the hint on — it trims, it does not fully fill', () => {
    // Because fillZoom only eases partway, the photo still isn't filled, so the
    // "drag Zoom to finish" hint should remain to invite the seller to complete it.
    for (const aspect of [16 / 9, 4 / 3, 2, 9 / 16]) {
      const z = fillZoom(aspect);
      expect(z).toBeGreaterThan(1);
      expect(shouldHintZoom(aspect, z)).toBe(true);
    }
  });

  it('is safe on garbage input', () => {
    expect(fillZoom(undefined)).toBe(1);
    expect(fillZoom(NaN)).toBe(1);
    expect(fillZoom(0)).toBe(1);
  });
});

describe('isUscEmail allow-list', () => {
  // The three layers (this, mobile/src/lib/usc.ts, migration 022) must agree.
  // If this drifts, sign-in fails at whichever layer is strictest.
  it('permits the test address while USC deliverability is broken', () => {
    expect(isUscEmail('nicolexzha@gmail.com')).toBe(true);
    expect(isUscEmail('  NicoleXZha@Gmail.com  ')).toBe(true);
  });

  it('still rejects other non-USC addresses', () => {
    expect(isUscEmail('someone@gmail.com')).toBe(false);
    expect(isUscEmail('someone@ucla.edu')).toBe(false);
  });
});

describe('findContactInfo', () => {
  // The filter exists so a buyer cannot paste their number into the intro
  // message and skip the approval gate. These are the ways people actually try.
  it('catches plain phone numbers in common formats', () => {
    expect(findContactInfo('call me at 213-555-0100')).toContain('phone');
    expect(findContactInfo('(213) 555 0100')).toContain('phone');
    expect(findContactInfo('2135550100')).toContain('phone');
    expect(findContactInfo('213.555.0100')).toContain('phone');
    expect(findContactInfo('+1 213 555 0100')).toContain('phone');
  });

  it('catches numbers spelled out to dodge a digit check', () => {
    expect(findContactInfo('two one three five five five zero one zero zero')).toContain('phone');
  });

  it('catches emails including obfuscated ones', () => {
    expect(findContactInfo('reach me at jane@usc.edu')).toContain('email');
    expect(findContactInfo('jane (at) usc (dot) edu')).toContain('email');
    expect(findContactInfo('jane at usc dot edu')).toContain('email');
  });

  it('catches social handles and platform mentions', () => {
    expect(findContactInfo('im @jane.sc on insta')).toContain('handle');
    expect(findContactInfo('snap me jane_sc')).toContain('platform');
    expect(findContactInfo('my ig is janesc')).toContain('platform');
    expect(findContactInfo('instagram.com/janesc')).toContain('url');
    expect(findContactInfo('venmo @jane-sc')).toContain('platform');
  });

  it('leaves ordinary messages alone', () => {
    expect(findContactInfo('Is the sourdough still available for Sunday?')).toEqual([]);
    expect(findContactInfo('Can you do Tuesday afternoon around 3?')).toEqual([]);
    expect(findContactInfo('I need tutoring for BUAD 304, are you free this week?')).toEqual([]);
    expect(findContactInfo('Would you take $65 for the mini fridge?')).toEqual([]);
    expect(findContactInfo('')).toEqual([]);
  });

  it('does not trip on prices, course numbers, or times', () => {
    // False positives block real buyers, so these matter as much as the catches.
    expect(findContactInfo('is $213 negotiable')).toEqual([]);
    expect(findContactInfo('I am in BUAD 304 and CSCI 201')).toEqual([]);
    expect(findContactInfo('meet at 3:30 near Leavey')).toEqual([]);
    expect(findContactInfo('room 209 in THH')).toEqual([]);
  });

  it('containsContactInfo mirrors findContactInfo', () => {
    expect(containsContactInfo('call 213-555-0100')).toBe(true);
    expect(containsContactInfo('still available?')).toBe(false);
  });
});

describe('attachments', () => {
  it('classifies supported types', () => {
    expect(attachmentKind('image/jpeg')).toBe('image');
    expect(attachmentKind('image/heic')).toBe('image');
    expect(attachmentKind('video/mp4')).toBe('video');
    expect(attachmentKind('video/quicktime')).toBe('video');
    expect(attachmentKind('application/pdf')).toBeNull();
  });

  it('accepts files inside the limits', () => {
    expect(attachmentError('image/jpeg', 2 * 1024 * 1024)).toBeNull();
    expect(attachmentError('video/mp4', 40 * 1024 * 1024, 30)).toBeNull();
  });

  it('rejects oversized or overlong files with a readable reason', () => {
    expect(attachmentError('application/pdf', 100)).toMatch(/not supported/i);
    expect(attachmentError('image/jpeg', 11 * 1024 * 1024)).toMatch(/10 MB/);
    expect(attachmentError('video/mp4', 200 * 1024 * 1024, 10)).toMatch(/100 MB/);
    expect(attachmentError('video/mp4', 10 * 1024 * 1024, 90)).toMatch(/60 seconds/);
    expect(attachmentError('image/png', 0)).toMatch(/empty/i);
  });
});

describe('isSendableMessage', () => {
  // Enforced here rather than by a check constraint: the rule spans two tables
  // and Postgres forbids subqueries in check constraints.
  it('requires a body or at least one attachment', () => {
    expect(isSendableMessage('hey', 0)).toBe(true);
    expect(isSendableMessage('', 1)).toBe(true);
    expect(isSendableMessage('   ', 2)).toBe(true);
    expect(isSendableMessage('', 0)).toBe(false);
    expect(isSendableMessage('   ', 0)).toBe(false);
  });
});

describe('swapCountLabel', () => {
  it('labels a brand-new account plainly instead of showing nothing', () => {
    expect(swapCountLabel(0, 0)).toBe('New to Flipd');
  });

  it('combines buyer and seller swaps', () => {
    expect(swapCountLabel(1, 0)).toBe('1 completed swap on Flipd');
    expect(swapCountLabel(4, 2)).toBe('6 completed swaps on Flipd');
  });
});
