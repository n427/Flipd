import { describe, expect, it } from 'vitest';
import { validateWantedCleanupPaths } from './wanted-upload-cleanup';

describe('Wanted upload cleanup', () => {
  it('accepts only owned, unreferenced paths and fails closed on lookup errors', () => {
    expect(validateWantedCleanupPaths(['user/offer/a.jpg'], 'user', new Set(), null)).toEqual(['user/offer/a.jpg']);
    expect(validateWantedCleanupPaths(['other/offer/a.jpg'], 'user', new Set(), null)).toBeNull();
    expect(validateWantedCleanupPaths(['user/offer/a.jpg'], 'user', new Set(['user/offer/a.jpg']), null)).toBeNull();
    expect(validateWantedCleanupPaths(['user/offer/a.jpg'], 'user', new Set(), new Error('db'))).toBeNull();
  });
});
