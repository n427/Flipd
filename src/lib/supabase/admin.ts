import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Service-role client — server only. Bypasses RLS; every route using it must
// enforce ownership itself.
//
// Constructed LAZILY on first use, not at module import. Eager top-level
// creation crashes `next build`'s data-collection pass ("supabaseUrl is
// required") whenever the env vars aren't injected at build time, which takes
// down the whole deploy. A Proxy defers createClient() to the first property
// access so importing this module is always side-effect-free.
let client: SupabaseClient | null = null;

function getAdmin(): SupabaseClient {
  if (!client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error(
        'Supabase admin client is misconfigured: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.',
      );
    }
    client = createClient(url, key, { auth: { persistSession: false } });
  }
  return client;
}

export const admin: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    const value = getAdmin()[prop as keyof SupabaseClient];
    return typeof value === 'function' ? value.bind(getAdmin()) : value;
  },
});
