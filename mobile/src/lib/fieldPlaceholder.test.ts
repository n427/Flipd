import { describe, expect, it } from 'vitest';
import { shouldShowFieldPlaceholder } from './fieldPlaceholder';

describe('shouldShowFieldPlaceholder', () => {
  it('shows only for an empty unfocused field', () => {
    expect(shouldShowFieldPlaceholder('', false)).toBe(true);
    expect(shouldShowFieldPlaceholder('', true)).toBe(false);
    expect(shouldShowFieldPlaceholder('Desk lamp', false)).toBe(false);
  });
});
