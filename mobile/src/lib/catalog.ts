// Copied from the web app to keep mobile self-contained (no cross-package import).
export const CATEGORIES: ReadonlyArray<{ id: string; label: string }> = [
  { id: 'services', label: 'Services' },
  { id: 'food', label: 'Food' },
  { id: 'housing', label: 'Housing' },
  { id: 'goods', label: 'Goods' },
  { id: 'event', label: 'Popups' },
];

export const CAMPUS_SPOTS: ReadonlyArray<{ name: string; lat: number; lng: number }> = [
  { name: 'USC Village', lat: 34.0259, lng: -118.2851 },
  { name: 'Leavey Library', lat: 34.0217, lng: -118.2828 },
  { name: 'Tutor Campus Center', lat: 34.0205, lng: -118.2860 },
];
