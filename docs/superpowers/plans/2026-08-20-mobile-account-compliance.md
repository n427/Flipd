# Mobile Account Compliance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add versioned legal acceptance and safe, in-app account deletion for Flipd mobile.

**Architecture:** Store legal acceptance in a user-owned database row and include it in the session onboarding gate. Account deletion is an authenticated Next.js API operation backed by the server-only Supabase admin client; the mobile UI calls it with the current bearer token and confirms the destructive action locally.

**Tech Stack:** Expo SDK 54, React Native, Next.js API routes, Supabase/Postgres, Vitest, TypeScript.

**Spec:** `docs/superpowers/specs/2026-08-20-mobile-app-store-readiness-design.md`

## Global Constraints

- Never expose a Supabase service-role key to mobile.
- Deletion must be idempotent and must not report success before the server confirms completion.
- Retained safety records must no longer expose direct personal identifiers.
- All behavior changes use red-green TDD.
- Web UI is out of scope except for the shared authenticated API route.

---

### Task 1: Versioned legal acceptance data contract

**Files:**
- Create: `supabase/migrations/036_legal_acceptance.sql`
- Create: `mobile/src/lib/legalAcceptance.test.ts`
- Create: `mobile/src/lib/legalAcceptance.ts`
- Modify: `vitest.config.ts`

**Interfaces:**
- Produces: `CURRENT_TERMS_VERSION`, `CURRENT_PRIVACY_VERSION`, `hasCurrentLegalAcceptance(row)`, `fetchLegalAcceptance(userId)`, `acceptCurrentLegalDocuments(userId)`.
- Database: `public.legal_acceptances(user_id uuid primary key, terms_version text, privacy_version text, accepted_at timestamptz)` with own-row RLS.

- [ ] **Step 1: Write the failing version-policy test**

```ts
import { describe, expect, it } from 'vitest';
import { CURRENT_PRIVACY_VERSION, CURRENT_TERMS_VERSION, hasCurrentLegalAcceptance } from './legalAcceptance';

describe('hasCurrentLegalAcceptance', () => {
  it('requires both current document versions', () => {
    expect(hasCurrentLegalAcceptance(null)).toBe(false);
    expect(hasCurrentLegalAcceptance({ terms_version: CURRENT_TERMS_VERSION, privacy_version: 'old' })).toBe(false);
    expect(hasCurrentLegalAcceptance({ terms_version: CURRENT_TERMS_VERSION, privacy_version: CURRENT_PRIVACY_VERSION })).toBe(true);
  });
});
```

- [ ] **Step 2: Run `npx vitest run mobile/src/lib/legalAcceptance.test.ts` and verify failure because the module does not exist**

- [ ] **Step 3: Implement the constants and pure predicate, then add Supabase read/upsert functions using `accepted_at: new Date().toISOString()` only as a client fallback while the migration overwrites it with `now()`**

- [ ] **Step 4: Create the migration with RLS policies limited to `auth.uid() = user_id`, revoke arbitrary timestamp writes through a trigger that sets `accepted_at = now()`, and grant authenticated select/insert/update only**

- [ ] **Step 5: Run the focused test and `npx tsc --noEmit -p mobile/tsconfig.json`; verify both exit 0**

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/036_legal_acceptance.sql mobile/src/lib/legalAcceptance.ts mobile/src/lib/legalAcceptance.test.ts vitest.config.ts
git commit -m "feat(mobile): record versioned legal acceptance"
```

### Task 2: Legal acceptance onboarding gate

**Files:**
- Modify: `mobile/src/lib/session.tsx`
- Modify: `mobile/src/app/(onboarding)/setup.tsx`
- Modify: `mobile/src/app/terms.tsx`
- Modify: `mobile/src/app/privacy.tsx`

**Interfaces:**
- Consumes: `fetchLegalAcceptance`, `acceptCurrentLegalDocuments`, `hasCurrentLegalAcceptance` from Task 1.
- Produces: `useSession().legalAccepted: 'unknown' | 'yes' | 'no'` and a disabled-until-checked onboarding completion control.

- [ ] **Step 1: Extend the existing acceptance test with a state-decision table covering missing, stale, current, and read-error rows; verify RED**

- [ ] **Step 2: Add `legalAccepted` to the session context, fetch it alongside the profile gate, and route a stale/missing acceptance back through onboarding without treating a network failure as accepted**

- [ ] **Step 3: Add an unchecked consent row to onboarding with links to `/terms` and `/privacy`; keep “Enter Flipd” disabled until checked and until `acceptCurrentLegalDocuments` succeeds**

- [ ] **Step 4: Display the exact current version date on both legal screens so stored versions correspond to visible documents**

- [ ] **Step 5: Run the focused test, full Vitest suite, mobile typecheck, and mobile lint; verify exit 0**

- [ ] **Step 6: Commit**

```bash
git add mobile/src/lib/session.tsx 'mobile/src/app/(onboarding)/setup.tsx' mobile/src/app/terms.tsx mobile/src/app/privacy.tsx mobile/src/lib/legalAcceptance.test.ts
git commit -m "feat(mobile): require current terms and privacy consent"
```

### Task 3: Server-side deletion service

**Files:**
- Create: `src/lib/account-deletion.ts`
- Create: `src/lib/account-deletion.test.ts`
- Create: `src/app/api/me/delete/route.ts`
- Create: `supabase/migrations/037_account_deletion.sql`

**Interfaces:**
- Produces: `deleteAccount(admin, userId): Promise<void>` and authenticated `DELETE /api/me/delete`.
- The route consumes the existing bearer-session validation pattern used by `/api/reports` and the existing server-only Supabase admin client.

- [ ] **Step 1: Write a failing orchestration test with a recording admin adapter; assert cleanup order is storage objects, push/search/acceptance/public content, profile anonymization, auth identity deletion**

```ts
it('removes public identity before deleting auth access', async () => {
  const calls: string[] = [];
  await deleteAccount(recordingAdmin(calls), 'user-1');
  expect(calls.at(-2)).toBe('anonymize-profile:user-1');
  expect(calls.at(-1)).toBe('delete-auth-user:user-1');
});
```

- [ ] **Step 2: Run the focused test and verify RED because `deleteAccount` does not exist**

- [ ] **Step 3: Implement a narrow adapter-backed deletion service so ordering and idempotent not-found handling are unit-testable without a live database**

- [ ] **Step 4: Add migration `037_account_deletion.sql` with a SECURITY DEFINER cleanup function owned by postgres, revoked from anon/authenticated, that deletes public content and anonymizes retained messages/reports without deleting their safety history**

- [ ] **Step 5: Implement `DELETE /api/me/delete`: validate bearer token with the anon client, invoke the privileged cleanup RPC, remove user-owned objects in `avatars`, `listing-photos`, and `message-attachments`, invoke `auth.admin.deleteUser`, and return `{ ok: true }`; return 401 for invalid sessions and a non-sensitive 500 body on failure**

- [ ] **Step 6: Run focused tests, full tests, TypeScript, lint, and `git diff --check`; verify all exit 0**

- [ ] **Step 7: Commit**

```bash
git add src/lib/account-deletion.ts src/lib/account-deletion.test.ts src/app/api/me/delete/route.ts supabase/migrations/037_account_deletion.sql
git commit -m "feat: add authenticated account deletion service"
```

### Task 4: Mobile deletion flow

**Files:**
- Create: `mobile/src/lib/accountDeletion.test.ts`
- Create: `mobile/src/lib/accountDeletion.ts`
- Create: `mobile/src/app/delete-account.tsx`
- Modify: `mobile/src/app/(tabs)/profile.tsx`
- Modify: `mobile/src/app/_layout.tsx`

**Interfaces:**
- Produces: `canConfirmDeletion(text: string): boolean`, `requestAccountDeletion(): Promise<void>`, route `/delete-account`.
- Consumes: current Supabase access token and `DELETE /api/me/delete`.

- [ ] **Step 1: Write failing tests proving only trimmed, case-sensitive `DELETE` enables confirmation and that the API helper rejects missing sessions and non-2xx responses**

- [ ] **Step 2: Run the focused test and verify RED because the module does not exist**

- [ ] **Step 3: Implement the pure confirmation predicate and authenticated request helper using the existing `API_BASE` convention**

- [ ] **Step 4: Build the deletion screen with consequences, retained-safety-record disclosure, confirmation input, disabled/submitting states, error retry, and success-only local sign-out**

- [ ] **Step 5: Add a destructive Profile row and register the stack route without exposing it as a tab**

- [ ] **Step 6: Run focused tests, full tests, mobile typecheck, mobile lint, and an iOS Expo export; verify all exit 0**

- [ ] **Step 7: Commit**

```bash
git add mobile/src/lib/accountDeletion.ts mobile/src/lib/accountDeletion.test.ts mobile/src/app/delete-account.tsx 'mobile/src/app/(tabs)/profile.tsx' mobile/src/app/_layout.tsx
git commit -m "feat(mobile): add in-app account deletion"
```

