import { describe, it, expect } from 'vitest';
import { shouldCapture, MIN_CAPTURE_LENGTH, CAPTURE_DEBOUNCE_MS } from './capture';

describe('shouldCapture', () => {
  it('records a real query when nothing has been recorded yet', () => {
    expect(shouldCapture('desk lamp', null)).toBe(true);
  });

  it('rejects a single character — a debounce landing mid-word, not a search', () => {
    expect(shouldCapture('d', null)).toBe(false);
  });

  it('rejects whitespace-only input', () => {
    expect(shouldCapture('   ', null)).toBe(false);
    expect(shouldCapture('', null)).toBe(false);
  });

  it('rejects an exact repeat of the last capture', () => {
    expect(shouldCapture('desk lamp', 'desk lamp')).toBe(false);
  });

  it('treats a capitalisation-only change as the same search, not a new one', () => {
    expect(shouldCapture('Desk Lamp', 'desk lamp')).toBe(false);
  });

  it('ignores surrounding whitespace when comparing against the last capture', () => {
    expect(shouldCapture('  desk lamp  ', 'desk lamp')).toBe(false);
  });

  it('records a genuinely different query after a previous one', () => {
    expect(shouldCapture('mini fridge', 'desk lamp')).toBe(true);
  });

  it('records a query that extends the previous one — refining is a real signal', () => {
    expect(shouldCapture('desk lamp warm', 'desk lamp')).toBe(true);
  });

  it('pins the tuning constants so a careless edit fails loudly', () => {
    expect(MIN_CAPTURE_LENGTH).toBe(2);
    expect(CAPTURE_DEBOUNCE_MS).toBe(900);
  });
});
