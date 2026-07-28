# Web-App RLS Safety Audit

**Date:** 2026-07-28
**Question:** Will enabling the `019_rls_policies` RLS policies (which govern the anon/authenticated Supabase key) break the existing web app?
**Answer:** No. The web app never accesses Supabase tables from the browser with the anon key. All data access is server-side via the service-role client (bypasses RLS) or the cookie-session client. The new policies only affect the anon/authenticated key, which the web app does not use for table access.

## Evidence

**All Supabase client creation is server-side:**
```
src/middleware.ts        createServerClient  (session refresh, server-side)
src/lib/supabase/server.ts  createServerClient  (cookie-bound session client, server components/routes)
src/lib/supabase/admin.ts   createClient        (service-role, bypasses RLS)
```
No `createBrowserClient` anywhere in `src/`. The browser never holds a Supabase client that reads/writes tables.

**Anon key usage** — 2 references, both server-side, both `createServerClient` (cookie auth), never a raw browser table query:
```
src/middleware.ts:10       process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
src/lib/supabase/server.ts:10  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
```

**Service-role usage** — 16 API routes import `@/lib/supabase/admin` (service-role, RLS-exempt). This is where all reads/writes happen. Unaffected by RLS.

## Conclusion

- The web app's data path (service-role + cookie-session, all server-side) is **orthogonal** to the RLS policies added in `019`.
- The policies open access for the anon/authenticated key that a future **mobile** client will use; they do not alter what the web app can do.
- **Residual risk:** none identified from code. The Task 4 post-apply smoke check (load site, sign in, load feed against production) is the final confirmation.
