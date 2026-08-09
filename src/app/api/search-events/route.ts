import { NextRequest, NextResponse } from 'next/server';
// Relative, not '@/lib/...': vitest.config.ts has no path-alias resolution
// configured (only tsconfig.json's "paths" does, which Next's build reads but
// Vitest does not), so an aliased import here would make this module
// unloadable from route.test.ts. getRequestUser is still the real helper —
// same one src/app/api/me/route.ts uses — just imported by relative path.
import { getRequestUser } from '../../../lib/supabase/authAny';
import { admin } from '../../../lib/supabase/admin';

// Queries feed a prompt, so bound them. 200 chars is far past any real search
// and short enough that 30 days of them stay a reasonable prompt size.
// Takes unknown, not string: the value comes straight off a parsed JSON body,
// so `{"query": 123}` would otherwise reach .trim() and 500 the route.
export function normalizeQuery(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const q = raw.trim().replace(/\s+/g, ' ');
  if (!q) return null;
  return q.slice(0, 200);
}

// Called by both the web and mobile search paths (fire-and-forget) to record
// what a user searched for, so the digest producer can tell "listings we
// have" from "listings this person would want". getRequestUser accepts
// either a web cookie session or a mobile bearer token, matching /api/me.
export async function POST(req: NextRequest) {
  const user = await getRequestUser(req);
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const query = normalizeQuery(body?.query);
  // A blank search is not an error the client should retry — it is just not
  // a signal. Return ok so the fire-and-forget caller stays silent.
  if (!query) return NextResponse.json({ ok: true });

  await admin.from('search_events').insert({ user_id: user.id, query });
  return NextResponse.json({ ok: true });
}
