import Anthropic from '@anthropic-ai/sdk';

// One constant, one place to change the cost/quality tradeoff.
//
// Haiku for two reasons, latency first: the digest runs inside a serverless
// cron tick with a ~10-15s budget and loops over users sequentially, so a
// slow per-user call does not merely cost more, it means the tick is killed
// and nobody gets mail. Ranking ~100 short listings against a short profile
// is well inside Haiku's range. Cost is the secondary win.
//
// Switching back to an Opus- or Sonnet-tier model is a real change, not a
// one-word edit: those models run adaptive thinking (so max_tokens must cover
// thinking too), they accept `output_config.effort` where Haiku 4.5 rejects
// it with a 400, and their minimum cacheable prefix differs. Read the call in
// matchListings before changing this line.
export const DIGEST_MODEL = 'claude-haiku-4-5';
export const MAX_MATCHES = 5;

export type Candidate = { id: string; title: string; price: number; category: string };
export type Match = { id: string; reason: string };

const SCHEMA = {
  type: 'object',
  properties: {
    matches: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          reason: { type: 'string' },
        },
        required: ['id', 'reason'],
        additionalProperties: false,
      },
    },
  },
  required: ['matches'],
  additionalProperties: false,
} as const;

// Stable across every user in a run, so it sits first and can be cached.
const SYSTEM = `You match secondhand campus-marketplace listings to one student's demonstrated interests.

Return only listings that student would plausibly want. Returning nothing is the correct answer when nothing fits — an empty list costs nobody anything, and a bad match teaches them to ignore the emails.

Weight the signals: a saved item is the strongest, a listing they messaged about is nearly as strong, a search is weaker and may be stale. Prefer the same category or a close substitute over a loose thematic link.

Give at most ${MAX_MATCHES} matches. Each reason is one short clause naming the specific prior interest it echoes, written to the student ("similar to the desk lamp you saved").`;

// Never throws: the digest is best-effort, and a malformed response should
// cost one user one email, not break the sweep.
export function parseMatches(text: string, valid: Set<string>): Match[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return [];
  }
  const raw = (parsed as { matches?: unknown })?.matches;
  if (!Array.isArray(raw)) return [];

  const seen = new Set<string>();
  const out: Match[] = [];
  for (const m of raw) {
    const id = (m as Match)?.id;
    const reason = (m as Match)?.reason;
    if (typeof id !== 'string' || typeof reason !== 'string') continue;
    // A model-invented id would render a dead link in a real email.
    if (!valid.has(id) || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, reason });
    if (out.length >= MAX_MATCHES) break;
  }
  return out;
}

export async function matchListings(profile: string, listings: Candidate[]): Promise<Match[]> {
  if (!listings.length) return [];
  const client = new Anthropic();

  const res = await client.messages.create({
    model: DIGEST_MODEL,
    // Haiku 4.5 does not run thinking unless explicitly configured, so
    // max_tokens bounds the visible answer only — a few hundred tokens of
    // JSON. 2000 is generous headroom for MAX_MATCHES entries.
    max_tokens: 2000,
    // No cache_control marker: Haiku 4.5's minimum cacheable prefix is 4096
    // tokens and this system block is ~170, so a breakpoint here would be a
    // silent no-op (cache_creation_input_tokens stays 0, no error raised).
    system: SYSTEM,
    output_config: {
      // No `effort` here — it is unsupported on Haiku 4.5 and sending it is
      // a 400. Depth control on this model is the prompt, not a parameter.
      format: { type: 'json_schema', schema: SCHEMA },
    },
    messages: [
      {
        role: 'user',
        content: `This student's activity:\n${profile}\n\nNew listings:\n${JSON.stringify(listings)}`,
      },
    ],
  });

  const text = res.content.find((b) => b.type === 'text');
  if (!text || text.type !== 'text') return [];
  return parseMatches(text.text, new Set(listings.map((l) => l.id)));
}
