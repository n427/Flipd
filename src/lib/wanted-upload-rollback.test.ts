import { describe, expect, it } from 'vitest';
import { rollbackRemovalCandidates } from './wanted-upload-rollback';

describe('Wanted upload rollback safety', () => {
  it('removes attempted registrations only after a confirmed cleanup claim', () => {
    expect(rollbackRemovalCandidates({
      uploaded: ['registered', 'missing', 'ambiguous'],
      registrationAttempted: new Set(['registered', 'missing', 'ambiguous']),
      confirmedClaimed: new Set(['registered']),
    })).toEqual(['registered']);
  });

  it('treats lookup-missing after an ambiguous registration attempt as an orphan', () => {
    expect(rollbackRemovalCandidates({
      uploaded: ['ambiguous-missing'], registrationAttempted: new Set(['ambiguous-missing']),
      confirmedClaimed: new Set(),
    })).toEqual([]);
  });

  it('allows direct removal only when registration was provably never attempted', () => {
    expect(rollbackRemovalCandidates({
      uploaded: ['local-only'], registrationAttempted: new Set(), confirmedClaimed: new Set(),
    })).toEqual(['local-only']);
  });
});
