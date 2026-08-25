import type { WantedOfferStatus } from './wanted-contract';

export interface WantedOfferInput {
  price: number;
  description: string;
  message: string;
  photo_paths: string[];
}

export interface WantedOfferDTO {
  id: string;
  wanted_post_id: string;
  buyer_id: string;
  seller_id: string;
  price: number;
  description: string;
  message: string;
  photo_urls: string[];
  /** Participant-only storage identities used to retain/remove photos on edit. */
  photo_paths: string[];
  status: WantedOfferStatus;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  completed_at: string | null;
  role: 'buyer' | 'seller';
  counterpart_id: string;
  wanted_post?: {
    id: string;
    title: string;
    max_budget: number;
    location: string;
    needed_by: string;
    status: string;
  };
}

export type WantedOfferParseResult =
  | { ok: true; value: WantedOfferInput }
  | { ok: false; error: string };

export type WantedOfferRow = {
  id: string;
  wanted_post_id: string;
  buyer_id: string;
  seller_id: string;
  price: number;
  description: string;
  message: string;
  photo_paths: string[] | null;
  status: WantedOfferStatus;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  completed_at: string | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PRIVATE_PHOTO_BUCKET = 'wanted-offer-photos';
const SIGNED_URL_TTL_SECONDS = 60 * 60;

type PrivateOfferStorage = {
  from(bucket: string): {
    createSignedUrls(paths: string[], expiresIn: number): Promise<{
      data: Array<{ path: string | null; signedUrl: string | null }> | null;
      error: unknown | null;
    }>;
  };
};

function invalid(error: string): WantedOfferParseResult {
  return { ok: false, error };
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' ? value.trim() : null;
}

export function isWantedOfferId(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}

/** PostgreSQL UUID values are canonical lowercase; use that form for paths too. */
export function canonicalizeWantedOfferId(value: unknown): string | null {
  return isWantedOfferId(value) ? value.toLowerCase() : null;
}

export function wantedOfferRpcErrorStatus(error: { code?: string } | null): number {
  if (error?.code === 'P0002') return 404;
  if (error?.code === '42501') return 403;
  if (error?.code === 'P0001' || error?.code === '23514' || error?.code === '40001' || error?.code === '40P01') return 409;
  if (error?.code === '55P03') return 503;
  return 500;
}

/** A pending offer is the only offer state the seller can change or withdraw. */
export function canMutateWantedOffer(status: WantedOfferStatus): boolean {
  return status === 'pending';
}

export function mergeWantedOfferPhotoPaths(existing: string[], removed: string[], uploaded: string[]): string[] | null {
  const removedSet = new Set(removed);
  const merged = [...existing.filter((path) => !removedSet.has(path)), ...uploaded];
  return merged.length >= 1 && merged.length <= 6 && new Set(merged).size === merged.length ? merged : null;
}

export function supersededWantedOfferPhotoPaths(previous: string[], next: string[]): string[] {
  const retained = new Set(next);
  return previous.filter((path) => !retained.has(path));
}

/**
 * Storage paths are part of the authorization boundary. The suffix must be a
 * real nested object name; accepting another offer ID (or path traversal-ish
 * segments) would let a seller attach objects they do not own to this offer.
 */
export function hasWantedOfferPhotoPrefix(paths: string[], sellerId: string, offerId: string): boolean {
  const prefix = `${sellerId}/${offerId}/`;
  return paths.length > 0 && paths.every((path) => {
    if (!path.startsWith(prefix)) return false;
    const suffix = path.slice(prefix.length);
    return suffix.length > 0
      && suffix.split('/').every((segment) => segment.length > 0 && segment !== '.' && segment !== '..');
  });
}

export function parseWantedOfferInput(input: unknown): WantedOfferParseResult {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return invalid('invalid wanted offer');
  const record = input as Record<string, unknown>;
  const description = stringValue(record.description);
  const message = stringValue(record.message);
  const { price } = record;
  const photoPaths = record.photo_paths;

  if (typeof price !== 'number' || !Number.isSafeInteger(price) || price <= 0) {
    return invalid('price must be a positive whole-dollar amount');
  }
  if (!description || description.length > 2000) return invalid('description must be 1-2000 characters');
  if (!message || message.length > 1000) return invalid('message must be 1-1000 characters');
  if (!Array.isArray(photoPaths) || photoPaths.length < 1 || photoPaths.length > 6) {
    return invalid('photo_paths must contain one to six private paths');
  }
  const paths = photoPaths.map(stringValue);
  if (paths.some((path) => !path)) return invalid('photo_paths must contain non-empty paths');

  return {
    ok: true,
    value: {
      price,
      description,
      message,
      photo_paths: paths as string[],
    },
  };
}

/** Explicit mapping keeps storage paths and arbitrary database columns private. */
export function toParticipantWantedOffer(
  row: WantedOfferRow,
  actorId: string,
  photoUrls: string[],
): WantedOfferDTO | null {
  const role = row.buyer_id === actorId ? 'buyer' : row.seller_id === actorId ? 'seller' : null;
  if (!role) return null;
  return {
    id: row.id,
    wanted_post_id: row.wanted_post_id,
    buyer_id: row.buyer_id,
    seller_id: row.seller_id,
    price: row.price,
    description: row.description,
    message: row.message,
    photo_urls: photoUrls,
    photo_paths: [...(row.photo_paths ?? [])],
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
    resolved_at: row.resolved_at,
    completed_at: row.completed_at,
    role,
    counterpart_id: role === 'buyer' ? row.seller_id : row.buyer_id,
  };
}

/** Call only after the route has established participant authorization. */
export async function signWantedOfferPhotos(storage: PrivateOfferStorage, paths: string[]): Promise<string[]> {
  if (paths.length === 0) return [];
  const { data, error } = await storage
    .from(PRIVATE_PHOTO_BUCKET)
    .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);
  if (error) throw new Error('unable to sign wanted offer photos');

  const urlsByPath = new Map(
    (data ?? [])
      .filter((item): item is { path: string; signedUrl: string } => Boolean(item.path && item.signedUrl))
      .map((item) => [item.path, item.signedUrl]),
  );
  const urls = paths.map((path) => urlsByPath.get(path) ?? null);
  if (urls.some((url) => !url)) throw new Error('unable to sign wanted offer photos');
  return urls as string[];
}
