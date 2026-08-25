import { NextRequest, NextResponse } from 'next/server';
import { admin } from '@/lib/supabase/admin';
import { getRequestUser } from '@/lib/supabase/authAny';
import { counterpartId, loadTransactionForUser, parseTransactionSourceIds } from '@/lib/transaction';

// GET /api/ratings?user=<id> — aggregate + recent reviews for a profile.
export async function GET(req: NextRequest) {
  // Web cookie session OR mobile Bearer token.
  const user = await getRequestUser(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const rateeId = new URL(req.url).searchParams.get('user') || user.id;
  const { data, error } = await admin
    .from('ratings')
    // Ratings are anonymous — never select the rater's profile.
    .select('score, text, created_at')
    .eq('ratee_id', rateeId)
    .order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = data ?? [];
  const count = rows.length;
  const average = count > 0 ? rows.reduce((s, r) => s + r.score, 0) / count : null;
  // Star-only ratings (no written text) are still shown — otherwise the tab
  // badge counts them but the list renders empty.
  const reviews = rows
    .slice(0, 10)
    .map((r) => ({
      score: r.score,
      text: r.text,
      created_at: r.created_at,
    }));
  return NextResponse.json({ average, count, reviews });
}

// POST — leave one rating for the other party of a Completed transaction.
export async function POST(req: NextRequest) {
  const user = await getRequestUser(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { request_id, wanted_offer_id, score, text } = await req.json().catch(() => ({}));
  const scoreNum = Number(score);
  const source = parseTransactionSourceIds({ request_id, wanted_offer_id });
  if (!source || !Number.isInteger(scoreNum) || scoreNum < 1 || scoreNum > 5) {
    return NextResponse.json(
      { error: 'exactly one transaction source and a score of 1-5 are required' },
      { status: 400 },
    );
  }

  const transaction = await loadTransactionForUser(source, user.id);
  if (!transaction) return NextResponse.json({ error: 'transaction not found' }, { status: 404 });
  if (transaction.status !== 'completed') {
    return NextResponse.json({ error: 'you can only rate a completed transaction' }, { status: 409 });
  }
  const rateeId = counterpartId(transaction, user.id);
  if (!rateeId) return NextResponse.json({ error: 'transaction not found' }, { status: 404 });

  const { error } = await admin.from('ratings').insert({
    request_id: source.kind === 'sale' ? source.id : null,
    wanted_offer_id: source.kind === 'wanted' ? source.id : null,
    rater_id: user.id,
    ratee_id: rateeId,
    score: scoreNum,
    text: typeof text === 'string' && text.trim() ? text.trim().slice(0, 500) : null,
  });
  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'you already rated this transaction' }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
