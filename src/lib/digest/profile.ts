export type Signals = { saved: string[]; messaged: string[]; searched: string[] };

// Caps per category: a heavy user's whole history would dominate the prompt
// and cost more without matching better. Most-recent-first is applied by the
// caller's query ordering, so slicing here keeps the freshest signals.
const PER_CATEGORY_CAP = 20;

function clean(items: string[]): string[] {
  return [...new Set(items.map((s) => s.trim()).filter(Boolean))].slice(0, PER_CATEGORY_CAP);
}

export function buildProfile(signals: Signals): string | null {
  const saved = clean(signals.saved);
  const messaged = clean(signals.messaged);
  const searched = clean(signals.searched);

  const lines: string[] = [];
  // Labels are load-bearing: the model treats a save as a stronger signal than
  // a search, and it can only do that if it can tell them apart.
  if (saved.length) lines.push(`Saved: ${saved.join(', ')}`);
  if (messaged.length) lines.push(`Messaged about: ${messaged.join(', ')}`);
  if (searched.length) lines.push(`Searched: ${searched.join(', ')}`);

  // No signals at all is the cold-start case: the caller must send nothing
  // rather than fall back to generic listings.
  return lines.length ? lines.join('\n') : null;
}
