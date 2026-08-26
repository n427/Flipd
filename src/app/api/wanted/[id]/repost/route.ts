import { NextRequest, NextResponse } from 'next/server';
import { repostErrorResponse } from '@/lib/repost';
import { admin } from '@/lib/supabase/admin';
import { getRequestUser } from '@/lib/supabase/authAny';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getRequestUser(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await params;
  const { data, error } = await admin.rpc('repost_wanted_post', { p_post_id: id, p_user_id: user.id });
  if (error) {
    const response = repostErrorResponse(error);
    return NextResponse.json(response, { status: response.status });
  }
  const row = Array.isArray(data) ? data[0] : data;
  return NextResponse.json({ posted_at: row?.feed_at ?? row?.reposted_at });
}
