// Relative imports throughout, not '@/lib/...': vitest.config.ts has no
// path-alias resolution configured, and this module is loaded transitively
// by src/lib/sweep/index.test.ts once digestProducer is registered there.
// An aliased import would make that test suite fail to resolve modules.
import type { Producer } from '../sweep';
import { admin } from '../supabase/admin';
import { isInSendWindow, isDue } from './window';
import { buildProfile } from './profile';
import { matchListings, type Candidate } from './match';
import { wantsEmail, digestEmail } from '../notify';

// Bounds. CANDIDATE_CAP keeps the prompt affordable; USER_CAP keeps one sweep
// tick from running for an hour. Both are well under PostgREST's 1000-row
// default, so neither query is silently truncated.
const CANDIDATE_CAP = 100;
const USER_CAP = 200;
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
      .select('id, title, price, category, seller_id')
      .eq('archived', false)
      .gte('created_at', dayAgo)
      .order('created_at', { ascending: false })
      .limit(CANDIDATE_CAP);
    if (listErr) throw new Error(`candidate query failed: ${listErr.message}`);
    if (!listings?.length) return { digests: 0, no_candidates: 1 };

    // seller_id is fetched to filter own-listings, then stripped before the
    // prompt — the model has no use for it and it is not ours to hand over.
    const candidates = listings as (Candidate & { seller_id: string })[];

    const { data: users, error: userErr } = await admin
      .from('profiles')
      .select('id, email, notify_prefs, last_digest_at')
      .or(`last_digest_at.is.null,last_digest_at.lt.${dueBefore}`)
      .limit(USER_CAP);
    if (userErr) throw new Error(`user query failed: ${userErr.message}`);

    let sent = 0;
    let failed = 0;
    let skipped = 0;

    for (const user of users ?? []) {
      // Per-user try/catch is the whole failure story: one user's bad row,
      // model hiccup, or mail bounce must not suppress everyone else's digest
      // — and must not stamp, so tomorrow's run retries instead of silently
      // dropping that user forever.
      try {
        if (!isDue(user.last_digest_at, now)) { skipped++; continue; }
        if (!wantsEmail(user.notify_prefs, 'listing_match')) { skipped++; continue; }
        if (!user.email) { skipped++; continue; }

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

        // Never show someone their own listing back to them, and strip
        // seller_id on the way into the prompt.
        const pool: Candidate[] = candidates
          .filter((c) => c.seller_id !== user.id)
          .map(({ id, title, price, category }) => ({ id, title, price, category }));
        if (!pool.length) { skipped++; continue; }

        const matches = await matchListings(profile, pool);
        // No matches is a successful run that sends nothing.
        if (!matches.length) { skipped++; continue; }

        await digestEmail(user.email, matches, pool);

        // Stamp LAST, and only on a real send. Stamping before the send would
        // mean a mail failure costs the user a full day.
        await admin.from('profiles')
          .update({ last_digest_at: now.toISOString() })
          .eq('id', user.id);
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
