import { describe, expect, it } from 'vitest';
import { canAttachWantedUpload, canClaimWantedUploadCleanup } from './wanted-upload-registry';

describe('Wanted upload registry state contract', () => {
  it('makes cleanup claims irreversible and mutually exclusive with attachment', () => {
    expect(canClaimWantedUploadCleanup('uploaded')).toBe(true);
    expect(canAttachWantedUpload('uploaded', null, 'offer-1')).toBe(true);
    expect(canAttachWantedUpload('attached', 'offer-1', 'offer-1')).toBe(true);
    expect(canClaimWantedUploadCleanup('attached')).toBe(false);
    expect(canAttachWantedUpload('cleanup_claimed', null, 'offer-1')).toBe(false);
    expect(canClaimWantedUploadCleanup('cleanup_claimed')).toBe(true);
  });
});
