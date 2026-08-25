export type WantedUploadState = 'uploaded' | 'attached' | 'cleanup_claimed';

export function canClaimWantedUploadCleanup(state: WantedUploadState): boolean {
  return state === 'uploaded' || state === 'cleanup_claimed';
}

export function canAttachWantedUpload(state: WantedUploadState, attachedId: string | null, targetId: string): boolean {
  return state === 'uploaded' || (state === 'attached' && attachedId === targetId);
}
