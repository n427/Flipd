import { describe, expect, it } from 'vitest';
import { dueWantedTransitions, type WantedLifecycleRow } from './wanted-lifecycle';

describe('dueWantedTransitions', () => {
  it('selects a 24-hour reminder once and expires overdue active posts', () => {
    const rows: WantedLifecycleRow[] = [
      { id: 'due-tomorrow', status: 'active', needed_by: '2026-08-26T11:00:00Z', reminder_sent_at: null },
      { id: 'past-due', status: 'active', needed_by: '2026-08-25T11:59:59Z', reminder_sent_at: null },
      { id: 'already-reminded', status: 'active', needed_by: '2026-08-26T10:00:00Z', reminder_sent_at: '2026-08-25T09:00:00Z' },
      { id: 'too-early', status: 'active', needed_by: '2026-08-26T12:00:01Z', reminder_sent_at: null },
      { id: 'closed', status: 'fulfilled', needed_by: '2026-08-25T11:00:00Z', reminder_sent_at: null },
    ];

    const result = dueWantedTransitions(rows, new Date('2026-08-25T12:00:00Z'));

    expect(result.remind.map((row) => row.id)).toEqual(['due-tomorrow']);
    expect(result.expire.map((row) => row.id)).toEqual(['past-due']);
  });

  it('treats an exact deadline as expired rather than reminder eligible', () => {
    const row: WantedLifecycleRow = {
      id: 'exact', status: 'active', needed_by: '2026-08-25T12:00:00Z', reminder_sent_at: null,
    };
    expect(dueWantedTransitions([row], new Date('2026-08-25T12:00:00Z'))).toEqual({
      remind: [],
      expire: [row],
    });
  });
});
