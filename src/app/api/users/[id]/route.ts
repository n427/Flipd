import { NextRequest, NextResponse } from 'next/server';
import { admin } from '@/lib/supabase/admin';
import { getSessionUser } from '@/lib/supabase/server';
import { fetchSwapCounts } from '@/lib/trust';

// GET /api/users/<id> — public profile: identity, active listings, ratings,
// and completed-swap counts.
// Deliberately excludes contact fields. Phone and email are notification
// destinations now and are never shown to another user, so this endpoint must
// never become a way to read them.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { data: profile, error } = await admin
    .from('profiles')
    .select('id, display_name, handle, school_unit, class_year, bio, avatar_url, is_demo, created_at')
    .eq('id', params.id)
    .single();
  if (error || !profile) return NextResponse.json({ error: 'not found' }, { status: 404 });

  // Archived listings are the seller's own history — only active ones are public.
  const { data: listings } = await admin
    .from('listings')
    .select('*, seller:profiles!listings_seller_id_fkey(id, display_name, handle, school_unit, class_year, is_demo, avatar_url)')
    .eq('seller_id', params.id)
    .eq('archived', false)
    .order('created_at', { ascending: false });

  const { data: ratings } = await admin
    .from('ratings')
    // Ratings are anonymous — never select the rater's profile.
    .select('score, text, created_at')
    .eq('ratee_id', params.id)
    .order('created_at', { ascending: false });

  const rows = ratings ?? [];
  const count = rows.length;
  const average = count > 0 ? rows.reduce((s, r) => s + r.score, 0) / count : null;

  // Completed swaps read more honestly than a star average early on: 4.5 from
  // two ratings is noise. Surfaces show these together, never the rating alone.
  const swaps = await fetchSwapCounts(params.id);

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
