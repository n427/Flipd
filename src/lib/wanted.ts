import { effectiveWantedStatus, isWantedCategory, type WantedPostStatus } from './wanted-contract';
import type { WantedPostDTO, WantedPostInput } from './types';

type WantedPostRow = {
  [key: string]: unknown;
  id: string;
  buyer_id: string;
  title: string;
  category: string;
  max_budget: number;
  description: string;
  location: string;
  photo_urls: string[] | null;
  needed_by: string;
  status: WantedPostStatus;
  created_at: string;
  offers?: Array<{ count?: number | null; [key: string]: unknown }> | null;
};

export type WantedPostParseResult =
  | { ok: true; value: WantedPostInput }
  | { ok: false; error: string };

export type WantedCursor = { created_at: string; id: string };
export type BlockLookup = {
  data: Array<{ blocker_id: string; blocked_id: string }> | null;
  error: unknown | null;
};

const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;
const POSTGRES_TIMESTAMP = /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(?:\.\d{1,6})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function invalid(error: string): WantedPostParseResult {
  return { ok: false, error };
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' ? value.trim() : null;
}

function isPostgresTimestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = POSTGRES_TIMESTAMP.exec(value);
  if (!match || Number.isNaN(new Date(value).getTime())) return false;
  const [, year, month, day] = match;
  const calendarDay = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  return calendarDay.getUTCFullYear() === Number(year)
    && calendarDay.getUTCMonth() === Number(month) - 1
    && calendarDay.getUTCDate() === Number(day);
}

/** Encodes the exact database timestamp so microseconds never pass through JS Date. */
export function serializeWantedCursor(cursor: WantedCursor): string {
  if (!isPostgresTimestamp(cursor.created_at) || !UUID.test(cursor.id)) {
    throw new Error('invalid wanted cursor');
  }
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

export function parseWantedCursor(value: string | null): WantedCursor | null | undefined {
  if (value === null) return undefined;
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    const decoded = Buffer.from(value, 'base64url').toString('utf8');
    const cursor: unknown = JSON.parse(decoded);
    if (!cursor || typeof cursor !== 'object' || Array.isArray(cursor)) return null;
    const record = cursor as Record<string, unknown>;
    if (Object.keys(record).length !== 2 || !isPostgresTimestamp(record.created_at) || !UUID.test(String(record.id))) {
      return null;
    }
    const parsed = { created_at: record.created_at, id: record.id as string };
    return serializeWantedCursor(parsed) === value ? parsed : null;
  } catch {
    return null;
  }
}

// Mirrors `(created_at < ts) OR (created_at = ts AND id < cursorId)` for the
// descending feed. The database remains the source of truth for the query.
export function wantedPostComesAfterCursor(row: WantedCursor, cursor: WantedCursor): boolean {
  return row.created_at < cursor.created_at
    || (row.created_at === cursor.created_at && row.id < cursor.id);
}

export function wantedCursorFilter(cursor: WantedCursor): string {
  return `created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.lt.${cursor.id})`;
}

/** Block lookups must fail closed: callers must not treat an error as no blocks. */
export function blockedUserIdsFromLookup(userId: string, lookup: BlockLookup):
  | { ok: true; value: Set<string> }
  | { ok: false; error: 'unable to verify blocks' } {
  if (lookup.error) return { ok: false, error: 'unable to verify blocks' };
  const blocked = new Set<string>();
  for (const block of lookup.data ?? []) {
    blocked.add(block.blocker_id === userId ? block.blocked_id : block.blocker_id);
  }
  return { ok: true, value: blocked };
}

/**
 * Validates the UTC ISO deadline already produced at the client boundary. The
 * browser/mobile client owns converting its America/Los_Angeles end-of-day
 * choice to that timestamp; this API refuses date-only or non-future values.
 */
export function parseWantedPostInput(input: unknown, now = new Date()): WantedPostParseResult {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return invalid('invalid wanted post');
  const record = input as Record<string, unknown>;
  const title = stringValue(record.title);
  const category = stringValue(record.category);
  const description = stringValue(record.description);
  const location = stringValue(record.location);
  const neededBy = stringValue(record.needed_by);
  const maxBudget = record.max_budget;
  const photos = record.photo_urls === undefined ? [] : record.photo_urls;

  if (!title || title.length > 60) return invalid('title must be 1-60 characters');
  if (!category || !isWantedCategory(category)) return invalid('invalid category');
  if (typeof maxBudget !== 'number' || !Number.isSafeInteger(maxBudget) || maxBudget <= 0) {
    return invalid('max_budget must be a positive whole-dollar amount');
  }
  if (!description || description.length > 2000) return invalid('description must be 1-2000 characters');
  if (!location || location.length > 160) return invalid('location must be 1-160 characters');
  if (!neededBy || !ISO_TIMESTAMP.test(neededBy)) return invalid('needed_by must be an ISO timestamp');
  const deadline = new Date(neededBy);
  if (Number.isNaN(deadline.getTime()) || deadline.getTime() <= now.getTime()) {
    return invalid('needed_by must be in the future');
  }
  if (!Array.isArray(photos) || photos.length > 6 || photos.some((url) => {
    if (typeof url !== 'string') return true;
    try {
      return new URL(url).protocol !== 'https:';
    } catch {
      return true;
    }
  })) return invalid('photo_urls must contain at most six HTTPS URLs');

  return {
    ok: true,
    value: {
      title,
      category: category as WantedPostInput['category'],
      max_budget: maxBudget,
      description,
      location,
      photo_urls: photos.map((url) => (url as string).trim()),
      needed_by: deadline.toISOString(),
    },
  };
}

// Do not spread rows here. `wanted_offers` includes seller data and private
// offer text; the only public representation is an aggregate count.
export function toPublicWantedPost(row: WantedPostRow, now = new Date()): WantedPostDTO {
  return {
    id: row.id,
    title: row.title,
    category: row.category as WantedPostDTO['category'],
    max_budget: row.max_budget,
    description: row.description,
    location: row.location,
    photo_urls: row.photo_urls ?? [],
    needed_by: row.needed_by,
    status: effectiveWantedStatus(row.status, row.needed_by, now),
    created_at: row.created_at,
    offer_count: Number(row.offers?.[0]?.count ?? 0),
  };
}
