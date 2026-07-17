import { NextRequest, NextResponse } from 'next/server';
import { admin } from '@/lib/supabase/admin';
import { getSessionUser } from '@/lib/supabase/server';

// Mark notifications seen or dismissed for the caller's role on each row.
// Body: { mark: 'seen' | 'dismiss', ids?: string[] } — no ids means all.
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { mark, ids } = await req.json().catch(() => ({}));
  if (mark !== 'seen' && mark !== 'dismiss') {
    return NextResponse.json({ error: "mark must be 'seen' or 'dismiss'" }, { status: 400 });
  }
  const now = new Date().toISOString();
  const sellerCol = mark === 'seen' ? 'seller_seen_at' : 'seller_dismissed_at';
  const buyerCol = mark === 'seen' ? 'buyer_seen_at' : 'buyer_dismissed_at';

  let asSeller = admin.from('reveal_requests').update({ [sellerCol]: now }).eq('seller_id', user.id);
  let asBuyer = admin.from('reveal_requests').update({ [buyerCol]: now }).eq('buyer_id', user.id);
  if (Array.isArray(ids) && ids.length > 0) {
    asSeller = asSeller.in('id', ids);
    asBuyer = asBuyer.in('id', ids);
  }
  const [{ error: e1 }, { error: e2 }] = await Promise.all([asSeller, asBuyer]);
  if (e1 || e2) return NextResponse.json({ error: (e1 || e2)!.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
