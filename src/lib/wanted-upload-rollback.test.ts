import { describe, expect, it } from 'vitest';
import { rollbackRemovalCandidates } from './wanted-upload-rollback';

describe('Wanted upload rollback safety', () => {
  it('removes only definitely unregistered or confirmed cleanup-claimed objects', () => {
    expect(rollbackRemovalCandidates({
      uploaded: ['registered', 'missing', 'ambiguous'],
      registered: new Set(['registered']),
      confirmedClaimed: new Set(['registered']),
      definitelyMissing: new Set(['missing']),
      lookupFailed: new Set(['ambiguous']),
    })).toEqual(['registered', 'missing']);
  });

  it('favors an orphan over deleting an ambiguous or unclaimed registered object', () => {
    expect(rollbackRemovalCandidates({
      uploaded: ['registered', 'ambiguous'], registered: new Set(['registered']),
      confirmedClaimed: new Set(), definitelyMissing: new Set(), lookupFailed: new Set(['ambiguous']),
    })).toEqual([]);
  });
});
