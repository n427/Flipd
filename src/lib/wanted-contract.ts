export type WantedPostStatus = 'active' | 'fulfilled' | 'expired' | 'deleted';
export type WantedOfferStatus = 'pending' | 'accepted' | 'declined' | 'withdrawn' | 'expired';

export function effectiveWantedStatus(status: WantedPostStatus, neededBy: string, now = new Date()): WantedPostStatus {
  return status === 'active' && new Date(neededBy).getTime() <= now.getTime() ? 'expired' : status;
}

export function isWantedCategory(category: string): boolean {
  return ['goods', 'services', 'housing'].includes(category);
}
