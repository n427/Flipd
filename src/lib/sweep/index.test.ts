import { describe, expect, it, vi } from 'vitest';
import { runSweep, type Producer } from './index';

const ok = (name: string, counts: Record<string, number>): Producer => ({
  name,
  run: async () => counts,
});
const boom = (name: string, message: string): Producer => ({
  name,
  run: async () => { throw new Error(message); },
});

describe('runSweep', () => {
  it('merges counts from every producer', async () => {
    const res = await runSweep([ok('reminders', { reminders: 3 }), ok('digest', { digests: 2 })]);
    expect(res.counts).toEqual({ reminders: 3, digests: 2 });
    expect(res.errors).toEqual([]);
  });

  it('a throwing producer does not stop the others', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await runSweep([
      boom('digest', 'model timeout'),
      ok('reminders', { reminders: 5 }),
    ]);
    expect(res.counts).toEqual({ reminders: 5 });
    expect(res.errors).toEqual([{ producer: 'digest', message: 'model timeout' }]);
  });

  it('reports every failure rather than only the first', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await runSweep([boom('a', 'x'), boom('b', 'y')]);
    expect(res.errors.map((e) => e.producer)).toEqual(['a', 'b']);
    expect(res.counts).toEqual({});
  });

  it('is ok:true even when a producer failed, so the scheduler does not retry-storm', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await runSweep([boom('a', 'x')]);
    expect(res.ok).toBe(true);
  });

  it('handles an empty producer list', async () => {
    expect(await runSweep([])).toEqual({ ok: true, counts: {}, errors: [] });
  });
});
