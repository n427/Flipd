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

const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;

function invalid(error: string): WantedPostParseResult {
  return { ok: false, error };
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' ? value.trim() : null;
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
