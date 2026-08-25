# Wanted Marketplace Design

## Summary

Flipd will add a reverse-marketplace flow across web and mobile. A buyer posts what they want, sellers submit private offers, the buyer accepts one offer, and Flipd opens a private conversation. The new flow reuses Flipd's identity, safety, messaging, notifications, completion, and ratings systems without changing the meaning of existing sale listings.

The feature ships on web and mobile together. Database and backend support deploy first behind an inactive UI; clients activate only after end-to-end verification.

## Product decisions

- Wanted is a first-class marketplace destination on both platforms.
- A Wanted post is created from the shared post action by choosing **Sell something** or **Request something**.
- A seller responds with a private offer rather than linking an existing listing.
- Every offer requires at least one photo, price, condition/description, and a message.
- The buyer must accept an offer before a conversation opens.
- Accepting one offer fulfills the post, declines all competing offers, removes the post from the public feed, and creates one chat.
- Wanted transactions support completion and anonymous ratings for both parties.
- Wanted posts expire automatically at their needed-by date.
- Buyers may edit an active Wanted post after offers arrive. Material edits notify affected sellers.
- Deleting a Wanted post closes all pending offers. An existing accepted conversation remains available.
- Existing notification preferences apply to Wanted events.

## Navigation and information architecture

### Mobile

The bottom bar becomes:

1. Home
2. Wanted
3. Post (raised center action)
4. Requests
5. Profile

Notifications move out of the bottom bar and into a bell action in the Home and Wanted headers. The bell retains its unread indicator and opens the existing Notifications screen.

The center Post action opens a two-choice sheet:

- Sell something
- Request something

### Web

Wanted becomes a first-class item in the authenticated main navigation. The existing create/post entry opens the same Sell something / Request something choice before routing to the relevant form.

### Requests inbox

The Requests screen uses three primary destinations on both platforms:

- Conversations
- Sale requests
- Wanted offers

Sale requests and Wanted offers each provide Received and Sent views. This preserves all existing sale-request behavior while avoiding five cramped peer-level tabs.

## User flows

### Post a Wanted request

The buyer selects **Request something** and completes:

- Title (required)
- Category (required; reuse the non-event marketplace catalog)
- Maximum budget in whole dollars (required, greater than zero)
- Meetup area (required, using the existing campus-place picker)
- Description (required)
- Needed-by date (required, future date)
- Up to six optional reference photos

The post begins in `active` state and becomes visible in the Wanted feed. A buyer cannot submit an offer to their own post.

### Browse Wanted posts

The feed supports text search and filters for category, maximum budget, meetup area, and needed-by date. Cards show title, maximum budget, category, meetup area, deadline, offer count, and the first reference photo when available.

The public feed returns active, unexpired posts only. It excludes posts owned by or offered on by blocked users according to Flipd's existing bidirectional block rules.

A **My Wanted posts** view exposes the buyer's active, fulfilled, expired, and deleted history. Deleted records may be represented as soft-deleted summaries for history and safety retention but are never public.

### Submit an offer

The Wanted detail page shows the request, buyer public profile and safety summary, deadline, and reference photos. Non-owners see **Make an offer**.

An offer requires:

- At least one photo
- Offered price in whole dollars, greater than zero
- Condition/description
- Message to the buyer

Offer photos and full offer contents are private to the buyer and seller. The public Wanted post exposes only an aggregate offer count.

One seller may have one live offer per Wanted post. A pending offer can be edited or withdrawn. A withdrawn, declined, accepted, expired, deleted, or fulfilled offer cannot be edited. A seller may resubmit after withdrawing only while the post remains active; the implementation reuses the same offer record/history rather than creating unlimited rows.

### Review and resolve offers

The buyer reviews offers in Requests → Wanted offers → Received. Each pending offer supports:

- Accept & open chat
- Decline

Accepting is a single atomic server operation that:

1. Locks/rechecks the Wanted post and selected offer.
2. Rejects stale, expired, deleted, fulfilled, blocked, unauthorized, or non-pending state.
3. Marks the selected offer accepted.
4. Marks every competing pending offer declined.
5. Marks the Wanted post fulfilled.
6. Creates exactly one message thread for the accepted offer.
7. Returns the thread ID for navigation.

The operation is idempotent for a repeated acceptance of the same winning offer and cannot create two winning offers or duplicate threads.

Sellers track their submissions in Requests → Wanted offers → Sent. Pending offers can be edited or withdrawn; resolved offers show their final status.

### Conversation, completion, and ratings

An accepted Wanted offer opens the existing private messaging experience. The thread header shows the Wanted title, accepted price, and counterpart. Existing attachment, unread, blocking, reporting, and conversation-deletion behavior applies.

Either participant can mark the transaction complete using the same rule as an approved sale transaction. Completion unlocks one anonymous rating per participant. Trust summaries include both sale transactions and Wanted transactions.

### Edit, delete, and expire

An owner can edit an active Wanted post, including after offers arrive. Changes to budget, description, meetup area, or needed-by date notify sellers with live offers. Cosmetic/reference-photo-only edits do not require a notification.

Deleting any owned Wanted post that is not already deleted removes it from the owner's normal history and from discovery, then marks all still-pending offers declined. If the post was already fulfilled, its accepted offer and thread remain available as transaction history. Deletion is irreversible in the UI.

At the needed-by timestamp, an active post becomes expired and stops accepting offers. Pending offers become expired/closed. A scheduled server sweep performs this transition, and every read/write endpoint also evaluates effective expiry so a delayed sweep cannot permit stale actions.

## Data model

### `wanted_posts`

- `id uuid primary key`
- `buyer_id uuid not null references profiles(id)`
- `title text not null`
- `category text not null`
- `max_budget integer not null check (max_budget > 0)`
- `description text not null`
- `location text not null`
- optional place coordinates/name matching listings
- `photo_urls text[] not null default '{}'`
- `needed_by timestamptz not null`
- `status text not null` constrained to `active`, `fulfilled`, `expired`, `deleted`; accepted offer/thread records preserve transaction history if a fulfilled post later becomes deleted
- `created_at`, `updated_at`, and `resolved_at`

Indexes cover active recency, category, buyer history, budget, and deadline. RLS allows public authenticated reads of active rows subject to block filtering, owner reads of their history, and owner create/update operations. State transitions with cross-row effects occur only through server APIs/database functions.

### `wanted_offers`

- `id uuid primary key`
- `wanted_post_id uuid not null references wanted_posts(id)`
- `seller_id uuid not null references profiles(id)`
- `buyer_id uuid not null references profiles(id)` (denormalized for policy/index efficiency)
- `price integer not null check (price > 0)`
- `description text not null`
- `message text not null`
- `photo_paths text[] not null`
- `status text not null` constrained to `pending`, `accepted`, `declined`, `withdrawn`, `expired`
- `created_at`, `updated_at`, and `resolved_at`
- `completed_at` nullable timestamp; an accepted offer is a completed transaction when this is set, without adding a conflicting offer-resolution status

A uniqueness constraint prevents multiple live offers by one seller on one post. Policies expose an offer only to its buyer and seller. Public queries never return private offer media or text.

### Shared conversations and ratings

`message_threads.request_id` becomes nullable and `message_threads.wanted_offer_id` is added as a nullable unique foreign key. A check constraint requires exactly one source. Existing sale threads continue to carry `request_id`; Wanted threads carry `wanted_offer_id`.

Ratings receive the same source generalization: each rating references exactly one sale request or Wanted offer. Existing rating rows and APIs remain compatible. Source-specific helper functions normalize participant, title, price, completion status, and counterpart data for shared UI/API consumers.

## APIs and service boundaries

Authenticated web-cookie and mobile-Bearer access remain supported through the existing request-auth helper.

- `GET/POST /api/wanted` — search/feed and create
- `GET/PATCH/DELETE /api/wanted/[id]` — detail and owner management
- `GET/POST /api/wanted/[id]/offers` — participant-scoped offer list and submit
- `PATCH/DELETE /api/wanted-offers/[id]` — edit, withdraw, or decline
- `POST /api/wanted-offers/[id]/accept` — atomic acceptance and thread creation
- Existing thread, report, complete, rating, notification, and unread APIs are generalized to accept either source type.

Server route modules remain thin. Domain services own validation and transitions; database functions own multi-row atomic transitions. DTO mappers ensure private fields never leak into public feed responses.

## Photos and storage

Wanted reference photos use an owner-scoped storage prefix and public/signed behavior consistent with listing photos. Private offer photos use a private bucket or private prefix and are returned only as short-lived signed URLs after participant authorization.

Upload validation reuses existing supported image types, count limits, and size limits. Failed form submissions remove newly uploaded objects. Replaced, withdrawn, and deleted media are cleaned up by server-side ownership-aware routines without removing media still referenced by accepted transaction history.

## Notifications

Existing in-app, push, and email preference channels apply.

- Buyer: new offer received
- Seller: offer accepted
- Seller: offer declined, expired, or closed by post deletion
- Sellers with live offers: material Wanted post edited
- Buyer: Wanted post expires in 24 hours
- Both participants: accepted offer opened a conversation (without duplicate delivery if acceptance is retried)

Notification events use stable idempotency keys based on event type and source record. Unread counts include Wanted-offer attention without double-counting conversations.

## Safety and privacy

- Bidirectional blocks hide Wanted posts and prohibit new offers or acceptance between blocked parties.
- A user can report a Wanted post, private offer, or conversation.
- Public feed DTOs never include seller identities, offer messages, descriptions, or offer photos.
- Participant authorization is rechecked server-side for every private offer and thread operation because the service-role database client bypasses RLS.
- Expired/deleted source state is checked during every mutation, not only by the scheduled sweep.
- Delete-account cleanup covers Wanted posts, pending offers, media, notifications, and private profile references while retaining only the minimum anonymized safety/transaction history required by existing policy.

## Error handling and concurrency

- Forms preserve local entries when network or upload operations fail.
- Mutations return explicit authorization, validation, stale-state, and conflict errors.
- Offer acceptance is atomic and concurrency-safe.
- Create/accept endpoints support idempotent retries.
- Lists reload after successful mutations and retain the prior view with an inline retry state after failed reloads.
- Late offers and late acceptances are rejected using effective deadline evaluation even when the expiry sweep is delayed.
- Upload cleanup is explicit because database and object storage cannot share one transaction.

## Testing

### Database and domain

- Constraints, indexes, RLS, private-offer visibility, and block filtering
- Automatic/effective expiry and 24-hour reminder selection
- Single live offer per seller/post
- Concurrent acceptance produces one winner, one fulfilled post, and one thread
- Deleting/editing a post resolves or notifies exactly the intended offers
- Thread and rating source XOR constraints preserve existing rows

### APIs

- Cookie and Bearer authentication
- Owner, participant, stranger, and blocked-user authorization
- Public DTO privacy
- Create/edit/delete/offer/edit/withdraw/accept/decline/complete/rate flows
- Idempotent retry and stale-state behavior
- Media rollback and signed-URL authorization

### Web and mobile

- Navigation and shared post chooser
- Wanted feed filters, empty/loading/error states, and pagination
- Posting and offer validation
- Received/Sent offer inboxes and badges
- Accept-to-chat navigation
- Edit/delete/expire state rendering
- Accessibility labels, keyboard behavior, and small-screen layouts
- Regression coverage for sale posting, reveal requests, conversations, completion, ratings, notification badges, and account deletion

### Release verification

- Full web and mobile unit/integration suites
- TypeScript and lint checks
- Web production build
- Mobile export, store-package validation, and Expo Doctor
- End-to-end staging flow on both platforms
- Repeatable screenshot seed containing Wanted posts, received offers, sent offers, and an accepted conversation

## Rollout

1. Deploy additive migrations and generalized backend support with no navigation exposure.
2. Backfill/validate thread and rating source constraints without changing existing sale behavior.
3. Deploy web Wanted UI behind an inactive release flag and ship the mobile build with the same flag inactive.
4. Run seeded and manual end-to-end verification against production-like data.
5. Activate web and mobile together.
6. Monitor API errors, acceptance conflicts, orphaned uploads, notification duplication, and expiry sweep results.

## Out of scope

- Auctions, bidding wars, public seller comments, and counteroffers
- Linking an existing sale listing as an offer
- Shipping, payments, escrow, or off-campus delivery logistics
- Multiple accepted sellers for one Wanted post
- Video attachments in Wanted reference photos or offer creation
