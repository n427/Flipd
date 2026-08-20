// Copied from the web app to keep mobile self-contained (no cross-package import).
// Order and membership mirror the marketing site's Categories section.
// 'food' was retired: food sellers post under Services or Popups now. The
// column has no CHECK constraint, so the handful of existing category='food'
// rows stay valid and still open — they just aren't filterable from the chip
// row. Re-add the entry here if they ever need surfacing again.
export const CATEGORIES: readonly { id: string; label: string }[] = [
  { id: 'services', label: 'Services' },
  { id: 'event', label: 'Popups' },
  { id: 'goods', label: 'Goods' },
  { id: 'housing', label: 'Housing' },
];

export const CAMPUS_SPOTS: readonly { name: string; lat: number; lng: number }[] = [
  { name: 'USC Village', lat: 34.0259, lng: -118.2851 },
  { name: 'Leavey Library', lat: 34.0217, lng: -118.2828 },
  { name: 'Tutor Campus Center', lat: 34.0205, lng: -118.2860 },
];
