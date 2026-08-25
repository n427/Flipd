export type NotificationCursor = { created_at: string; id: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;

export function serializeNotificationCursor(cursor: NotificationCursor): string {
  if (!TIMESTAMP.test(cursor.created_at) || Number.isNaN(Date.parse(cursor.created_at)) || !UUID.test(cursor.id)) {
    throw new Error('invalid notification cursor');
  }
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

export function parseNotificationCursor(value: string | null): NotificationCursor | null | undefined {
  if (value === null) return undefined;
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    const row = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as Record<string, unknown>;
    if (!row || Object.keys(row).length !== 2 || typeof row.created_at !== 'string' || typeof row.id !== 'string') return null;
    const cursor = { created_at: row.created_at, id: row.id };
    return serializeNotificationCursor(cursor) === value ? cursor : null;
  } catch {
    return null;
  }
}

export function notificationCursorFilter(cursor: NotificationCursor): string {
  return `created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.lt.${cursor.id})`;
}
