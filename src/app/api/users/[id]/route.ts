import { NextRequest, NextResponse } from 'next/server';
import { admin } from '@/lib/supabase/admin';
import { getSessionUser } from '@/lib/supabase/server';
import { fetchSwapCounts } from '@/lib/trust';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// GET /api/users/<id> — public profile: identity, active listings, ratings,
// and completed-swap counts. The segment is either a handle (what our links
// use, so URLs read as /u/flipd.team) or a raw UUID, which still resolves so
// older links and profiles without a handle keep working.
// Deliberately excludes contact fields. Email is a notification destination
// now and is never shown to another user, so this endpoint must never become
// a way to read it.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: routeId } = await params;
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const key = decodeURIComponent(routeId);
  const base = admin
    .from('profiles')
    .select('id, display_name, handle, school_unit, class_year, bio, avatar_url, is_demo, created_at');
  const { data: profile, error } = await (UUID_RE.test(key)
    ? base.eq('id', key)
    : base.eq('handle', key)
  ).single();
  if (error || !profile) return NextResponse.json({ error: 'not found' }, { status: 404 });
  // Everything below keys off the resolved row, never the URL segment.
  const id = profile.id;

  // Archived listings are the seller's own history — only active ones are public.
  const { data: listings } = await admin
    .from('listings')
    .select('*, seller:profiles!listings_seller_id_fkey(id, display_name, handle, school_unit, class_year, is_demo, avatar_url)')
    .eq('seller_id', id)
    .eq('archived', false)
    .order('created_at', { ascending: false });

  const { data: ratings } = await admin
    .from('ratings')
    // Ratings are anonymous — never select the rater's profile.
    .select('score, text, created_at')
    .eq('ratee_id', id)
    .order('created_at', { ascending: false });

  const rows = ratings ?? [];
  const count = rows.length;
  const average = count > 0 ? rows.reduce((s, r) => s + r.score, 0) / count : null;

  // Completed swaps read more honestly than a star average early on: 4.5 from
  // two ratings is noise. Surfaces show these together, never the rating alone.
  const swaps = await fetchSwapCounts(id);

  return NextResponse.json({
    profile,
    listings: listings ?? [],
    swaps,
    ratings: {
      average,
      count,
      reviews: rows.slice(0, 10).map((r) => ({
        score: r.score,
        text: r.text,
        created_at: r.created_at,
      })),
    },
  });
}
