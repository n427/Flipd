import { describe, expect, it } from 'vitest';
import { dueReminders, stampColumn, type ReminderListing, type ReminderRow } from './due-reminders';

const NOW = new Date('2026-08-09T12:00:00.000Z');
const H = 60 * 60 * 1000;

/** A listing starting `hours` from NOW. */
function listingAt(hours: number, over: Partial<ReminderListing> = {}): ReminderListing {
  return {
    id: 'L1',
    title: 'Taco popup',
    event_start: new Date(NOW.getTime() + hours * H).toISOString(),
    event_end: new Date(NOW.getTime() + (hours + 2) * H).toISOString(),
    archived: false,
    ...over,
  };
}

/** Opted in a week ago by default, i.e. well before the 24h window opened. */
function row(over: Partial<ReminderRow> = {}): ReminderRow {
  return {
    user_id: 'U1',
    listing_id: 'L1',
    created_at: new Date(NOW.getTime() - 7 * 24 * H).toISOString(),
    reminded_24h_at: null,
    reminded_1h_at: null,
    ...over,
  };
}

/**
 * Opted in `hoursBeforeStart` before the event begins, for an event that is
 * `eventInHours` from NOW. `hoursBeforeStart` MUST exceed `eventInHours`, or
 * the result is a created_at in the future — which no real row can have.
 */
function optedInAt(hoursBeforeStart: number, eventInHours: number): string {
  if (hoursBeforeStart <= eventInHours) throw new Error('opt-in would be in the future');
  return new Date(NOW.getTime() + (eventInHours - hoursBeforeStart) * H).toISOString();
}

const map = (l: ReminderListing) => new Map([[l.id, l]]);

describe('dueReminders', () => {
  it('sends nothing when the event is beyond the 24h window', () => {
    expect(dueReminders([row()], map(listingAt(30)), NOW)).toEqual([]);
  });

  it('sends the 24h notice inside the (1h, 24h] window', () => {
    expect(dueReminders([row()], map(listingAt(20)), NOW)).toEqual([
      { user_id: 'U1', listing_id: 'L1', stage: '24h', suppress: false },
    ]);
  });

  it('does not resend the 24h notice once stamped', () => {
    const r = row({ reminded_24h_at: '2026-08-08T12:00:00.000Z' });
    expect(dueReminders([r], map(listingAt(20)), NOW)).toEqual([]);
  });

  it('sends the 1h notice inside the (0, 1h] window', () => {
    const r = row({ reminded_24h_at: '2026-08-08T12:00:00.000Z' });
    expect(dueReminders([r], map(listingAt(0.5)), NOW)).toEqual([
      { user_id: 'U1', listing_id: 'L1', stage: '1h', suppress: false },
    ]);
  });

  it('SUPPRESSES an unsent 24h notice once inside the 1h window, and still sends the 1h', () => {
    // Covers both causes: opting in late, and the sweep missing runs.
    const out = dueReminders([row()], map(listingAt(0.5)), NOW);
    expect(out).toContainEqual({ user_id: 'U1', listing_id: 'L1', stage: '24h', suppress: true });
    expect(out).toContainEqual({ user_id: 'U1', listing_id: 'L1', stage: '1h', suppress: false });
    expect(out).toHaveLength(2);
  });

  it('SUPPRESSES the 24h notice when the user opted in inside the 24h window', () => {
    // Event is 20h out; they opted in an hour ago, i.e. 21h before it starts —
    // already inside the 24h window. They just looked at the listing, so a
    // "tomorrow" email now is noise. Only the 1h notice should reach them.
    const r = row({ created_at: optedInAt(21, 20) });
    expect(dueReminders([r], map(listingAt(20)), NOW)).toEqual([
      { user_id: 'U1', listing_id: 'L1', stage: '24h', suppress: true },
    ]);
  });

  it('still sends the 24h notice when they opted in before the window opened', () => {
    const r = row({ created_at: optedInAt(48, 20) });
    expect(dueReminders([r], map(listingAt(20)), NOW)).toEqual([
      { user_id: 'U1', listing_id: 'L1', stage: '24h', suppress: false },
    ]);
  });

  it('sends nothing once both flags are stamped', () => {
    const r = row({ reminded_24h_at: 'x', reminded_1h_at: 'y' });
    expect(dueReminders([r], map(listingAt(0.5)), NOW)).toEqual([]);
  });

  it('sends nothing for an event that already started', () => {
    expect(dueReminders([row()], map(listingAt(-1)), NOW)).toEqual([]);
  });

  it('sends nothing for an archived listing', () => {
    expect(dueReminders([row()], map(listingAt(20, { archived: true })), NOW)).toEqual([]);
  });

  it('sends nothing when the listing is missing entirely', () => {
    expect(dueReminders([row()], new Map(), NOW)).toEqual([]);
  });

  it('treats the window edges as inclusive of the nearer stage', () => {
    // Exactly 1h out belongs to the 1h stage, not the 24h stage.
    const at1h = dueReminders([row({ reminded_24h_at: 'x' })], map(listingAt(1)), NOW);
    expect(at1h).toEqual([{ user_id: 'U1', listing_id: 'L1', stage: '1h', suppress: false }]);
    // Exactly 24h out is still the 24h stage.
    const at24h = dueReminders([row()], map(listingAt(24)), NOW);
    expect(at24h).toEqual([{ user_id: 'U1', listing_id: 'L1', stage: '24h', suppress: false }]);
  });

  it('handles several rows and listings independently', () => {
    const a = listingAt(20, { id: 'LA' });
    const b = listingAt(0.5, { id: 'LB' });
    const listings = new Map([[a.id, a], [b.id, b]]);
    const out = dueReminders(
      [row({ user_id: 'UA', listing_id: 'LA' }), row({ user_id: 'UB', listing_id: 'LB', reminded_24h_at: 'x' })],
      listings,
      NOW,
    );
    expect(out).toEqual([
      { user_id: 'UA', listing_id: 'LA', stage: '24h', suppress: false },
      { user_id: 'UB', listing_id: 'LB', stage: '1h', suppress: false },
    ]);
  });
});

describe('stampColumn', () => {
  it('maps 24h to reminded_24h_at', () => {
    expect(stampColumn('24h')).toBe('reminded_24h_at');
  });

  it('maps 1h to reminded_1h_at', () => {
    expect(stampColumn('1h')).toBe('reminded_1h_at');
  });
});
