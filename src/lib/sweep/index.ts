// The sweep harness. One scheduled job runs every producer, and each producer
// is isolated: a failing digest must never stop popup reminders from going out.
// Producers are injected rather than imported here so the isolation guarantee
// is unit-testable without touching the database.

export type Producer = {
  name: string;
  run: () => Promise<Record<string, number>>;
};

export type SweepResult = {
  ok: true;
  counts: Record<string, number>;
  errors: { producer: string; message: string }[];
};

export async function runSweep(producers: Producer[]): Promise<SweepResult> {
  const counts: Record<string, number> = {};
  const errors: { producer: string; message: string }[] = [];

  // Sequential, not Promise.all: these all hit the same Postgres and the
  // volume is small. Ordering also keeps the logs readable when one fails.
  for (const p of producers) {
    try {
      Object.assign(counts, await p.run());
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[sweep] producer "${p.name}" failed`, err);
      errors.push({ producer: p.name, message });
    }
  }

  // Always ok:true. A partial failure is reported in `errors` but must not
  // return non-2xx — pg_net would treat that as a failed call and the real
  // signal (which producer broke) would be buried in scheduler noise.
  return { ok: true, counts, errors };
}
