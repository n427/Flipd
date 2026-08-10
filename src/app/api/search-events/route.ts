import { NextRequest, NextResponse } from 'next/server';
// Relative, not '@/lib/...': vitest.config.ts has no path-alias resolution
// configured (only tsconfig.json's "paths" does, which Next's build reads but
// Vitest does not), so an aliased import here would make this module
// unloadable from route.test.ts. getRequestUser is still the real helper —
// same one src/app/api/me/route.ts uses — just imported by relative path.
import { getRequestUser } from '../../../lib/supabase/authAny';
import { admin } from '../../../lib/supabase/admin';
// normalizeQuery lives in lib, not here: a route module may only export HTTP
// handlers and Next's config fields, so exporting a helper breaks the build.
import { normalizeQuery } from '../../../lib/digest/query';

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
