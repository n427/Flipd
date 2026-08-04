import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/supabase/authAny';
import { reviewCounterparty } from '@/lib/safety';

// GET /api/safety?user=<id>&role=seller|buyer
//
// AI review of the person on the other side of a request. A buyer calls this
// with role=seller before sending; a seller calls it with role=buyer before
// approving. Web (cookie) and mobile (bearer) both reach it.
export async function GET(req: NextRequest) {
  const user = await getRequestUser(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const target = req.nextUrl.searchParams.get('user');
  const role = req.nextUrl.searchParams.get('role');
  if (!target) return NextResponse.json({ error: 'user required' }, { status: 400 });
  if (role !== 'seller' && role !== 'buyer') {
    return NextResponse.json({ error: 'role must be seller or buyer' }, { status: 400 });
  }
  // Reviewing yourself would only ever be a way to probe the grader.
  if (target === user.id) {
    return NextResponse.json({ error: 'cannot review yourself' }, { status: 400 });
  }

  const review = await reviewCounterparty(target, role);
  if (!review) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ review });
}
