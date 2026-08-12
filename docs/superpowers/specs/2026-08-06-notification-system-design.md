# Notification System

## Summary

Three notification subsystems sharing one scheduled sweep and one delivery layer:

1. **Listing match digest** — a once-daily "listings you'd probably like," scored by AI from what each user saved, messaged about, and searched for.
2. **Two-stage popup reminders** — 24 hours and 1 hour before an event the user opted into.
3. **SMS channel** — a third delivery rail alongside email and push, gated behind phone verification and explicit consent.

Nothing here adds a second cron job. One hourly sweep runs every producer, and every producer sends through `notify.ts`.

## Architecture

```
              Supabase pg_cron (hourly, ONE job)
                            │
                            ▼
              /api/cron/sweep  ── secret-guarded, idempotent
                            │
        ┌───────────────────┴───────────────────┐
        ▼                                       ▼
  popup reminders                        listing digest
  due 24h / due 1h                    once/day per user
        │                                       │
        └───────────────────┬───────────────────┘
                            ▼
                        notify.ts
                            │
          ┌─────────────────┼─────────────────┐
          ▼                 ▼                 ▼
        email             push               sms
       (Resend)          (Expo)      (provider swappable)
```

The sweep asks **what is due**, never **what time is it**. That makes it safe to run at any frequency, twice in an hour, or after a missed window — and it means a late run still delivers rather than silently dropping.

Scheduling lives in Supabase `pg_cron` + `pg_net`, calling the route with `Authorization: Bearer $CRON_SECRET`. Vercel's Hobby plan caps crons at daily, which cannot support a 1-hour lead time; pg_cron is free at any frequency and needs no plan change.

### Route migration

The existing `/api/cron/popup-reminders` is **renamed** to `/api/cron/sweep` and extended with the digest producer, rather than a second route being added. Its secret guard and reminder logic carry over unchanged.

The `crons` entry in `vercel.json` must be **removed in the same change**. Leaving it would run the daily Vercel schedule alongside the hourly pg_cron schedule — two schedulers driving the same endpoint. The sent-flags make that harmless rather than duplicative, but it is confusing to operate and hides which scheduler is actually live.

## Shared Layer — `src/lib/notify.ts`

Additions only. Nothing existing changes shape.

```ts
export type NotifyEvent =
  | 'new_request' | 'approval' | 'reminder' | 'expiry'
  | 'new_message' | 'popup_reminder'
  | 'listing_match';                                    // new

export function wantsSms(prefs: unknown, event: NotifyEvent): boolean;
export async function sendSms(to: string, body: string): Promise<void>;
```

`wantsSms` defaults **OFF**, deliberately unlike `wantsEmail` and `wantsPush`, which default ON. A text message the user did not ask for is the fastest way to get a sender filtered by carriers, and defaulting it on contradicts what consent means.

`sendSms` logs instead of sending when no provider key is set, mirroring how `sendEmail` already behaves without `RESEND_API_KEY`. The whole system is therefore testable before a provider account exists.

New email/push/SMS templates for `listing_match` follow the existing `*Email()` helper pattern.

## Schema Changes

| Table | Change | Reason |
|---|---|---|
| `profiles` | `+ phone_verified_at timestamptz` | Proof the user owns the number |
| `profiles` | `+ sms_consent_at timestamptz` | Explicit opt-in, distinct from ownership |
| `profiles` | `+ last_digest_at timestamptz` | Makes the digest idempotent per user |
| `popup_reminders` | rename `reminded_at` → `reminded_24h_at` | Preserves every reminder already sent |
| `popup_reminders` | `+ reminded_1h_at timestamptz` | One flag cannot record two sends |
| `search_events` | **new**: `user_id, query, created_at` | Searches are not persisted today |

`search_events` needs an index on `(user_id, created_at desc)` and own-row RLS matching the `saves` policies. The digest reads only the **last 30 days** of searches — old enough to capture a semester's intent, recent enough that a search for a winter coat stops driving matches in April. Rows older than that can be pruned on any schedule without affecting correctness.

## Subsystem 1 — Listing Match Digest

### Interest profile

Assembled per user at sweep time from three signals:

| Signal | Source | Weight |
|---|---|---|
| Saved | `saves` → `listings.title, category, price` | Strong — a deliberate act |
| Messaged | `reveal_requests` where `buyer_id = user` | Strongest — intent to buy |
| Searched | `search_events`, recent window | Broad — intent with no matching listing |

Searches are load-bearing, not filler: they are the only signal that captures *what someone wanted and did not find*. A user who searches "monitor" three times and saves nothing is the highest-intent person on the platform, and would be invisible to saves and requests alone.

### Scoring

One batched Claude call per user per day: interest profile plus the day's new listings in, ranked matches with a short reason out.

Chosen over embeddings + pgvector because:

- No vector infrastructure, embedding pipeline, or backfill is required.
- It works at low volume. Cosine similarity over five saved items is noise; a model reasoning about "saved a mini fridge, searched 'desk' three times" is correct on day one.
- It returns a reason, so the digest can say *"because you saved a mini fridge"* rather than presenting an unexplained list.
- Cost is trivial at campus scale — one call per **active** user per day on Haiku. Users with no new signals and no new candidate listings are skipped before any call is made.

The matcher is a single function — `(profile, candidates) => scored ids` — so switching to embeddings past roughly five figures of daily active users is a body change, not a redesign.

Requires `ANTHROPIC_API_KEY`. It is absent from `.env.local` today and must be confirmed present in the Vercel environment before build.

### Rules

- At most **5 listings** per digest, best-scoring first.
- **No matches means no notification.** Silence is a valid outcome and is the primary defense against notifying on every post.
- One digest per user per day, gated by `last_digest_at` being null or older than **20 hours**. Twenty rather than twenty-four so a digest sent at 09:10 one day is eligible again at 09:00 the next, instead of drifting an hour later every day until it lands at midnight.
- Digests send only between **09:00 and 21:00 America/Los_Angeles**. The sweep runs hourly around the clock for reminders, but a "listings you might like" push at 3am is a notification-permissions revocation waiting to happen. Every user is USC, so a single fixed timezone is correct here and no per-user timezone column is needed.
- Delivery independently honors `wantsPush`, `wantsEmail`, and `wantsSms` for `listing_match`.

Popup reminders are deliberately **not** subject to the quiet-hours window. A 1-hour reminder is useless if withheld, and the user explicitly asked for that specific event.

### Cold start

A user with no saves, no requests, and no searches has an empty profile and therefore **receives no digest** until they interact with something. This is intentional. Sending strangers arbitrary listings to fill the silence is the exact spam this feature exists to avoid, and it trains users to ignore the notification. Accepted product consequence: for the first months, a meaningful share of users will get nothing.

## Subsystem 2 — Two-Stage Popup Reminders

### Due logic

A reminder is due when all three hold:

```
event_start > now                    -- has not started
event_start - now <= lead            -- inside the 24h or 1h window
matching sent-flag is null           -- not already sent
```

Self-healing by construction: if the sweep misses hours, a 1h reminder that should have fired at T-60m still fires at T-20m. Late, but never lost.

### Edge cases

| Case | Behavior |
|---|---|
| User opts in less than 24h before start | Sweep marks `reminded_24h_at` as suppressed **without sending**; only the 1h fires. A "tomorrow" message about something six hours away is worse than silence |
| Listing archived or deleted | Skip, send nothing |
| Event already started | Excluded by `event_start > now` |
| Seller moves the event time | Sent flags stay sent; unsent flags recompute against the new time. No re-notification on a move in v1 |
| Sweep runs twice in one hour | Sent flags make it a no-op |

Suppression lives **in the sweep, not the client**. The in-progress mobile "remind me" button inserts `(user_id, listing_id)` and nothing more; web can add the same button later with no shared timing logic.

## Subsystem 3 — SMS Channel

> **REMOVED 2026-08-11.** Built in phase 3, never switched on, deleted before it
> ever sent a message. See
> [2026-08-11-remove-sms-channel-design.md](2026-08-11-remove-sms-channel-design.md).
> The section below is kept as a record of what was built, not as a description
> of the system.

### Three gates

```ts
canSms(profile, event) =
     profile.phone_verified_at != null   // owns the number
  && profile.sms_consent_at    != null   // agreed to texts
  && wantsSms(profile.notify_prefs, ev)  // wants this event
```

Independent by design: verifying a number is not consent to be texted, and consenting to texts is not consent to every event. Existing rows have neither timestamp, so **no user receives SMS on deploy**. The rollout is safe by construction rather than by care.

### Verification flow

```
enter number → 6-digit code via SMS → submit code
             → phone_verified_at = now()
             → separate "Text me notifications" toggle
             → sms_consent_at = now()
```

Reuses the existing `contact_phone` column. Consequence, accepted: **changing the contact number clears both timestamps** and stops SMS until re-verified. The alternative is texting whoever now owns the old number.

### Provider and compliance

`sendSms()` wraps the provider the way `sendEmail()` wraps Resend, so the choice is deferrable and swappable.

In scope for this spec:

- **STOP/HELP webhook** that clears `sms_consent_at` on STOP. This is a compliance requirement, not a feature, and belongs in the initial build rather than a follow-up.

Out of scope, operational: **10DLC brand and campaign registration** for US A2P traffic, which takes days and gates real sending.

## Failure Handling

The sweep runs multiple producers in one route, so isolation is mandatory:

- Each producer is wrapped independently. A digest failure **cannot** prevent popup reminders from sending.
- AI call fails or returns malformed output → skip that user, leave `last_digest_at` unset, retry next hour.
- Listing ids returned by the model are validated against the actual candidate set; unknown ids are dropped rather than trusted.
- Send failures (Resend, Expo, SMS provider) are logged and swallowed per recipient, never propagated to abort the sweep.
- The route returns a per-producer summary (`{ reminders: n, digests: n, errors: [...] }`) so a partial failure is visible rather than silent.

## Testing

- **Due logic** — unit tests over a fixed `now`: inside window, outside window, already sent, already started, late run. No database required.
- **Suppression** — opting in at 30h, 20h, and 30m before start produces the correct sent-flag combinations.
- **Gates** — `canSms` truth table across all eight combinations of the three conditions.
- **Matcher** — given a fixed profile and candidate set, a stubbed model response produces the expected ids; a malformed response produces an empty result rather than a throw.
- **Idempotency** — running the sweep twice over the same fixture sends exactly once.
- **Isolation** — a producer that throws does not prevent the other from completing.

## Implementation Sequencing

Three subsystems in one spec is correct for design — they share a sweep, a delivery layer, and a preferences model, and designing them apart would have produced three incompatible schedulers. It is too much for one implementation pass. Build in this order, each independently shippable:

1. **Shared layer and route migration** — `wantsSms`/`sendSms` stubs, `listing_match` event, rename to `/api/cron/sweep`, remove the `vercel.json` cron, stand up pg_cron. Ships with no behavior change; existing reminders keep working on the new schedule.
2. **Two-stage popup reminders** — the flag migration and due logic. Smallest surface, immediate user-visible value, and it pairs with the mobile "remind me" button already in progress.
3. **SMS channel** — verification, consent, STOP webhook. Independent of the digest, and testable end to end once the provider account exists.
4. **Listing match digest** — `search_events`, search capture on both clients, interest profile, matcher. Largest and most speculative; benefits from the other three being stable underneath it.

Each step gets its own implementation plan.

## Out of Scope

- Multiple cron jobs. One sweep, by explicit decision.
- Embeddings and pgvector. Revisit past roughly five figures of daily active users.
- Instant "strong match" notifications. Digest-only in v1.
- Re-notification when a seller moves an event's time.
- Cold-start fallback content for users with no signals.
- 10DLC registration (operational, not code).
