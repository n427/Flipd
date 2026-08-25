import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/supabase/authAny';
import { admin as supabase } from '@/lib/supabase/admin';
import { toPublicWantedPost, parseWantedPostInput } from '@/lib/wanted';
import { effectiveWantedStatus, isWantedCategory, type WantedPostStatus } from '@/lib/wanted-contract';

const WANTED_SELECT = 'id,buyer_id,title,category,max_budget,description,location,photo_urls,needed_by,status,created_at,offers:wanted_offers(count)';
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

async function blockedUserIds(userId: string): Promise<Set<string>> {
  const { data } = await supabase
    .from('blocks')
    .select('blocker_id,blocked_id')
    .or(`blocker_id.eq.${userId},blocked_id.eq.${userId}`);
  const blocked = new Set<string>();
  for (const block of data ?? []) {
    blocked.add(block.blocker_id === userId ? block.blocked_id : block.blocker_id);
  }
  return blocked;
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
  const cursor = parseTimestamp(searchParams.get('cursor'));
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
    .order('created_at', { ascending: false })
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
  if (cursor !== undefined) query = query.lt('created_at', cursor);

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
  const blocked = mine ? new Set<string>() : await blockedUserIds(user.id);
  const visibleRows = mine ? rows : rows.filter((row) => !blocked.has(row.buyer_id));
  const wantedPosts = visibleRows
    .map((row) => toPublicWantedPost(row, now))
    .filter((post) => mine || effectiveWantedStatus(post.status, post.needed_by, now) === 'active');
  // Use the scanned page for the cursor. A page containing only blocked users
  // must still advance, otherwise callers would be trapped on that page.
  const lastScanned = rows[rows.length - 1];

  return NextResponse.json({
    wanted_posts: wantedPosts,
    next_cursor: rows.length === limit && lastScanned ? lastScanned.created_at : null,
  });
}

export async function POST(req: NextRequest) {
  const user = await getRequestUser(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = parseWantedPostInput(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const { data, error } = await supabase
    .from('wanted_posts')
    .insert({ ...parsed.value, buyer_id: user.id })
    .select(WANTED_SELECT)
    .single();
  if (error || !data) return NextResponse.json({ error: error?.message || 'unable to create wanted post' }, { status: 500 });

  return NextResponse.json({ wanted_post: toPublicWantedPost(data) }, { status: 201 });
}
