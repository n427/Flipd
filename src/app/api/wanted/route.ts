import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/supabase/authAny';
import { admin as supabase } from '@/lib/supabase/admin';
import {
  blockedUserIdsFromLookup,
  parseWantedCursor,
  parseWantedPostInput,
  serializeWantedCursor,
  toPublicWantedPost,
  wantedCursorFilter,
} from '@/lib/wanted';
import { effectiveWantedStatus, isWantedCategory, type WantedPostStatus } from '@/lib/wanted-contract';

const WANTED_SELECT = 'id,buyer_id,title,category,max_budget,description,location,photo_urls,needed_by,status,created_at,reposted_at,feed_at,offers:wanted_offers(count)';
const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 20;
const STATUSES: WantedPostStatus[] = ['active', 'fulfilled', 'expired', 'deleted'];
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;

function parseLimit(value: string | null): number | null {
  if (value === null) return DEFAULT_LIMIT;
  if (!/^\d+$/.test(value)) return null;
  const limit = Number(value);
  return Number.isSafeInteger(limit) && limit >= 1 && limit <= MAX_LIMIT ? limit : null;
}

function parsePositiveInteger(value: string | null): number | null | undefined {
  if (value === null) return undefined;
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function parseTimestamp(value: string | null): string | null | undefined {
  if (value === null) return undefined;
  if (!ISO_TIMESTAMP.test(value)) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}

async function blockedUserIds(userId: string) {
  const { data, error } = await supabase
    .from('blocks')
    .select('blocker_id,blocked_id')
    .or(`blocker_id.eq.${userId},blocked_id.eq.${userId}`);
  return blockedUserIdsFromLookup(userId, { data, error });
}

export async function GET(req: NextRequest) {
  const user = await getRequestUser(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const mine = searchParams.get('mine') === '1';
  const q = searchParams.get('q')?.trim();
  const category = searchParams.get('category');
  const location = searchParams.get('location')?.trim();
  const limit = parseLimit(searchParams.get('limit'));
  const budget = parsePositiveInteger(searchParams.get('budget'));
  const neededBefore = parseTimestamp(searchParams.get('needed_before'));
  const cursor = parseWantedCursor(searchParams.get('cursor'));
  const requestedStatus = searchParams.get('status');

  if (limit === null || budget === null || neededBefore === null || cursor === null
    || (q !== undefined && q.length > 100)
    || (location !== undefined && location.length > 160)
    || (category !== null && category !== 'all' && !isWantedCategory(category))
    || (requestedStatus !== null && !STATUSES.includes(requestedStatus as WantedPostStatus))
    || (!mine && requestedStatus !== null && requestedStatus !== 'active')) {
    return NextResponse.json({ error: 'invalid filters' }, { status: 400 });
  }

  const now = new Date();
  let query = supabase
    .from('wanted_posts')
    .select(WANTED_SELECT)
    .order('feed_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit);

  if (mine) {
    query = query.eq('buyer_id', user.id);
  } else {
    // Public visibility never includes an elapsed deadline, even if the sweep
    // has not persisted the derived expired status yet.
    query = query.eq('status', 'active').gt('needed_by', now.toISOString());
  }
  if (category && category !== 'all') query = query.eq('category', category);
  if (q) query = query.ilike('title', `%${escapeLike(q)}%`);
  if (budget !== undefined) query = query.lte('max_budget', budget);
  if (location) query = query.ilike('location', `%${escapeLike(location)}%`);
  if (neededBefore !== undefined) query = query.lte('needed_by', neededBefore);
  if (cursor !== undefined) {
    query = query.or(wantedCursorFilter(cursor));
  }

  if (mine && requestedStatus) {
    if (requestedStatus === 'expired') {
      query = query.eq('status', 'active').lte('needed_by', now.toISOString());
    } else {
      query = query.eq('status', requestedStatus);
    }
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = data ?? [];
  const blockLookup = mine ? { ok: true as const, value: new Set<string>() } : await blockedUserIds(user.id);
  if (!blockLookup.ok) return NextResponse.json({ error: blockLookup.error }, { status: 500 });
  const visibleRows = rows.filter((row) => !blockLookup.value.has(row.buyer_id));
  const wantedPosts = visibleRows
    .map((row) => toPublicWantedPost(row, now))
    .filter((post) => mine || effectiveWantedStatus(post.status, post.needed_by, now) === 'active');
  // Use the scanned page for the cursor. A page containing only blocked users
  // must still advance, otherwise callers would be trapped on that page.
  const lastScanned = rows[rows.length - 1];

  return NextResponse.json({
    wanted_posts: wantedPosts,
    next_cursor: rows.length === limit && lastScanned
      ? serializeWantedCursor({ created_at: lastScanned.feed_at, id: lastScanned.id })
      : null,
  });
}

export async function POST(req: NextRequest) {
  const user = await getRequestUser(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = parseWantedPostInput(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const { data: postId, error: createError } = await supabase.rpc('create_wanted_post_with_uploads', {
    actor_id: user.id, post_title: parsed.value.title, post_category: parsed.value.category,
    post_max_budget: parsed.value.max_budget, post_description: parsed.value.description,
    post_location: parsed.value.location, post_photo_urls: parsed.value.photo_urls, post_needed_by: parsed.value.needed_by,
  });
  if (createError || !postId) return NextResponse.json({ error: createError?.message || 'unable to create wanted post' }, { status: 500 });
  const { data, error } = await supabase.from('wanted_posts').select(WANTED_SELECT).eq('id', postId).single();
  if (error || !data) return NextResponse.json({ error: error?.message || 'unable to create wanted post' }, { status: 500 });

  return NextResponse.json({ wanted_post: toPublicWantedPost(data) }, { status: 201 });
}
