import { describe, expect, it } from 'vitest';
import { notificationCursorFilter, parseNotificationCursor, serializeNotificationCursor } from './notification-events';

describe('notification event cursor', () => {
  const cursor = { created_at: '2026-08-25T12:00:00.123456+00:00', id: '11111111-1111-4111-8111-111111111111' };

  it('round trips an exact timestamp and UUID tie breaker', () => {
    expect(parseNotificationCursor(serializeNotificationCursor(cursor))).toEqual(cursor);
  });

  it('rejects malformed cursors and produces a descending compound filter', () => {
    expect(parseNotificationCursor('bad')).toBeNull();
    expect(notificationCursorFilter(cursor)).toBe(
      'created_at.lt.2026-08-25T12:00:00.123456+00:00,and(created_at.eq.2026-08-25T12:00:00.123456+00:00,id.lt.11111111-1111-4111-8111-111111111111)',
    );
  });
});
