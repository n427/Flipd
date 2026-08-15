// Relative imports throughout, not '@/lib/...': vitest.config.ts has no
// path-alias resolution configured, and this module is loaded transitively
// by src/lib/sweep/index.test.ts once digestProducer is registered there.
// An aliased import would make that test suite fail to resolve modules.
import type { Producer } from '../sweep';
import { admin } from '../supabase/admin';
import { isInSendWindow, isDue } from './window';
import { buildProfile } from './profile';
import { matchListings, type Candidate } from './match';
import { wantsEmail, digestEmail, verifiedEmailFor } from '../notify';

// Bounds. CANDIDATE_CAP keeps the prompt affordable; USER_CAP keeps one sweep
// tick from running for an hour. Both are well under PostgREST's 1000-row
// default, so neither query is silently truncated.
const CANDIDATE_CAP = 100;
const USER_CAP = 25;
const SIGNAL_CAP = 20;

export const digestProducer: Producer = {
  name: 'digest',
  // Explicit return type: without it, TS infers the union of each individual
  // return statement's object shape, and — because they have different key
  // sets — that union's per-property types include `undefined`, which fails
  // the Record<string, number> index signature Producer.run promises. Every
  // individual return literal below is already a valid Record<string,
  // number> on its own; only the union inference needed steering.
  async run(): Promise<Record<string, number>> {
    const now = new Date();
    // Cheapest gate first: outside the window there is nothing to do, and no
    // row should be read or stamped.
    if (!isInSendWindow(now)) return { digests: 0, skipped_window: 1 };

    const dayAgo = new Date(now.getTime() - 24 * 3600_000).toISOString();
    const dueBefore = new Date(now.getTime() - 20 * 3600_000).toISOString();

    // One candidate set shared by every user this tick — the listings are the
    // same for everyone, only the ranking differs.
    const { data: listings, error: listErr } = await admin
      .from('listings')
      .select('id, title, price, category, seller_id, photo_urls')
      .eq('archived', false)
      .gte('created_at', dayAgo)
      .order('created_at', { ascending: false })
      .limit(CANDIDATE_CAP);
    if (listErr) throw new Error(`candidate query failed: ${listErr.message}`);
    if (!listings?.length) return { digests: 0, no_candidates: 1 };

    // seller_id is fetched to filter own-listings, then stripped before the
    // prompt — the model has no use for it and it is not ours to hand over.
    // photo_urls rides along the same way: the email renders a thumbnail from
    // it, while the model ranks on title/price/category and would only be
    // spending tokens on image URLs it cannot see.
    const candidates = listings as (Candidate & {
      seller_id: string;
      photo_urls: string[] | null;
    })[];

    // profiles has no `email` column — only `contact_email`, which is
    // user-editable. Like every sibling notifier, the address comes from
    // verifiedEmailFor(), which reads the verified auth account.
    // Longest-waiting first: with USER_CAP capping the batch, an unordered
    // limit would let Postgres return the same arbitrary slice every tick and
    // starve everyone outside it.
    const { data: users, error: userErr } = await admin
      .from('profiles')
      .select('id, notify_prefs, last_digest_at')
      .or(`last_digest_at.is.null,last_digest_at.lt.${dueBefore}`)
      .order('last_digest_at', { ascending: true, nullsFirst: true })
      .limit(USER_CAP);
    if (userErr) throw new Error(`user query failed: ${userErr.message}`);

    let sent = 0;
    let failed = 0;
    let skipped = 0;

    for (const user of users ?? []) {
      // Per-user try/catch is the whole failure story: one user's bad row,
      // model hiccup, or mail failure must not suppress everyone else's digest.
      try {
        if (!isDue(user.last_digest_at, now)) { skipped++; continue; }
        if (!wantsEmail(user.notify_prefs, 'listing_match')) { skipped++; continue; }

        // Stamp on every ATTEMPT that gets past the gates, not only on a send
        // — the same choice popup-reminders makes, for the same reason. A user
        // with signals but no good match is never a send; if that left them
        // unstamped they would be re-evaluated every hour of the 12-hour
        // window, costing 12 model calls a day, forever, and crowding
        // genuinely-due users out of the USER_CAP batch. Stamping first means
        // at most one model call per user per day. The cost is that a mail
        // failure loses that user one day's digest, which is the cheaper bug.
        await admin.from('profiles')
          .update({ last_digest_at: now.toISOString() })
          .eq('id', user.id);

        const to = await verifiedEmailFor(user.id);
        if (!to) { skipped++; continue; }

        // Three signals. Deliberately three round-trips rather than one
        // batched join: a batched query turns a per-user failure into an
        // all-user failure, which is exactly the bug that bit the reminder
        // producer.
        const [saved, messaged, searched] = await Promise.all([
          admin.from('saves').select('listings(title)')
            .eq('user_id', user.id).limit(SIGNAL_CAP),
          admin.from('reveal_requests').select('listings(title)')
            .eq('buyer_id', user.id)
            .order('created_at', { ascending: false }).limit(SIGNAL_CAP),
          admin.from('search_events').select('query')
            .eq('user_id', user.id)
            .gte('created_at', new Date(now.getTime() - 30 * 86400_000).toISOString())
            .order('created_at', { ascending: false }).limit(SIGNAL_CAP),
        ]);

        const profile = buildProfile({
          saved: (saved.data ?? []).map((r: any) => r.listings?.title).filter(Boolean),
          messaged: (messaged.data ?? []).map((r: any) => r.listings?.title).filter(Boolean),
          searched: (searched.data ?? []).map((r: any) => r.query).filter(Boolean),
        });
        // Cold start: no signals means no digest, ever. Never fall back to
        // "here are some listings" — an unasked-for email is how people learn
        // to ignore all of them.
        if (!profile) { skipped++; continue; }

        // Never show someone their own listing back to them.
        const theirs = candidates.filter((c) => c.seller_id !== user.id);
        if (!theirs.length) { skipped++; continue; }

        // Two views of the same listings: `pool` is the prompt's, stripped to
        // what the model ranks on; `theirs` keeps photo_urls for the email.
        const pool: Candidate[] = theirs.map(({ id, title, price, category }) => ({
          id, title, price, category,
        }));

        const matches = await matchListings(profile, pool);
        // No matches is a successful run that sends nothing.
        if (!matches.length) { skipped++; continue; }

        await digestEmail(to, matches, theirs);
        sent++;
      } catch (err) {
        // user.id only — never the email, never the search text.
        console.error('[digest] user failed', user.id, (err as Error).message);
        failed++;
      }
    }

    return { digests: sent, skipped, errors: failed };
  },
};
