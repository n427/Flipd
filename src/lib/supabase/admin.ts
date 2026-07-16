import { createClient } from '@supabase/supabase-js';

// Service-role client — server only. Bypasses RLS; every route using it must
// enforce ownership itself.
export const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);
