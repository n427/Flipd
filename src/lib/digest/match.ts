import Anthropic from '@anthropic-ai/sdk';

// One constant, one place to change the cost/quality tradeoff. The approved
// spec suggested Haiku for cost; opus-5 is the default because model choice
// belongs to the operator, not to a silent default buried in a prompt.
export const DIGEST_MODEL = 'claude-opus-5';
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
    // Adaptive thinking is on by default on opus-5 and max_tokens caps
    // thinking + output together, so this is sized for both, not just the
    // few hundred tokens of JSON we actually want back.
    max_tokens: 8000,
    system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
    output_config: {
      // A ranking task, not a research task. Low effort keeps a per-user
      // daily job affordable without hurting match quality.
      effort: 'low',
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
