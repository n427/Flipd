import { describe, expect, it } from 'vitest';
import {
  CURRENT_PRIVACY_VERSION,
  CURRENT_TERMS_VERSION,
  hasCurrentLegalAcceptance,
  legalAcceptanceState,
} from './legalAcceptance';

describe('hasCurrentLegalAcceptance', () => {
  it('requires acceptance of both current document versions', () => {
    expect(hasCurrentLegalAcceptance(null)).toBe(false);
    expect(
      hasCurrentLegalAcceptance({
        terms_version: CURRENT_TERMS_VERSION,
        privacy_version: '2026-01-01',
      }),
    ).toBe(false);
    expect(
      hasCurrentLegalAcceptance({
        terms_version: CURRENT_TERMS_VERSION,
        privacy_version: CURRENT_PRIVACY_VERSION,
      }),
    ).toBe(true);
  });

  it('never treats a missing, stale, or failed read as consent', () => {
    expect(legalAcceptanceState(null, false)).toBe('no');
    expect(
      legalAcceptanceState(
        { terms_version: CURRENT_TERMS_VERSION, privacy_version: '2026-01-01' },
        false,
      ),
    ).toBe('no');
    expect(
      legalAcceptanceState(
        {
          terms_version: CURRENT_TERMS_VERSION,
          privacy_version: CURRENT_PRIVACY_VERSION,
        },
        true,
      ),
    ).toBe('no');
    expect(
      legalAcceptanceState(
        {
          terms_version: CURRENT_TERMS_VERSION,
          privacy_version: CURRENT_PRIVACY_VERSION,
        },
        false,
      ),
    ).toBe('yes');
  });
});
